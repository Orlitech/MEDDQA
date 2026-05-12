"""
Patient Service - Handles patient data retrieval from EMR database
Enhanced to properly extract ALL drugs from the regimens JSONB array
"""

from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List
import logging
import json

logger = logging.getLogger(__name__)

class PatientService:
    def __init__(self, emr_db: Session):
        self.emr_db = emr_db
    
    def search_patient(self, hospital_number: str) -> Optional[Dict[str, Any]]:
        """
        Search for a patient by hospital number.
        Returns ALL drugs dispensed at each visit.
        """
        logger.info(f"Searching for patient: {hospital_number}")
        
        # Find patient
        patient = self._find_patient(hospital_number)
        
        if not patient:
            logger.warning(f"No patient found for: {hospital_number}")
            return None
        
        person_uuid = patient.get('person_uuid') or patient.get('uuid')
        logger.info(f"Patient found: {patient.get('first_name')} {patient.get('surname')} (UUID: {person_uuid})")
        
        # Get ALL refills with proper drug extraction
        refill_history = self._get_refill_history_all_drugs(person_uuid) if person_uuid else []
        
        # Get viral load history
        viral_load_history = self._get_viral_load_history(person_uuid) if person_uuid else []
        
        # Get current regimen
        current_regimen = self._get_current_regimen(person_uuid) if person_uuid else {}
        
        return {
            "patient_info": {
                "hospital_number": patient.get('hospital_number', hospital_number),
                "person_uuid": person_uuid,
                "first_name": patient.get('first_name', ''),
                "surname": patient.get('surname', ''),
                "other_name": patient.get('other_name', ''),
                "sex": patient.get('sex') or patient.get('gender', ''),
                "date_of_birth": str(patient.get('date_of_birth')) if patient.get('date_of_birth') else None,
                "date_enrolled": str(patient.get('date_enrolled')) if patient.get('date_enrolled') else None,
                "facility_name": patient.get('facility_name', ''),
                "state": patient.get('state', ''),
                "lga": patient.get('lga', ''),
                "unique_id": patient.get('unique_id', ''),
                "art_start_date": str(patient.get('art_start_date')) if patient.get('art_start_date') else None,
                "current_status": patient.get('current_status', 'Active')
            },
            "refill_history": refill_history,
            "viral_load_history": viral_load_history,
            "current_regimen": current_regimen
        }
    
    def _find_patient(self, hospital_number: str) -> Optional[Dict[str, Any]]:
        """Find patient with multiple search strategies"""
        try:
            # Strategy 1: Exact match
            query = text("""
                SELECT 
                    p.uuid AS person_uuid,
                    p.hospital_number,
                    p.first_name,
                    p.surname,
                    p.other_name,
                    INITCAP(p.sex) AS sex,
                    p.date_of_birth,
                    p.date_of_registration AS date_enrolled,
                    h.date_of_registration AS art_start_date,
                    facility.name AS facility_name,
                    facility_lga.name AS lga,
                    facility_state.name AS state,
                    h.unique_id
                FROM patient_person p
                INNER JOIN hiv_enrollment h ON h.person_uuid = p.uuid AND h.archived = 0
                INNER JOIN base_organisation_unit facility ON facility.id = h.facility_id
                INNER JOIN base_organisation_unit facility_lga ON facility_lga.id = facility.parent_organisation_unit_id
                INNER JOIN base_organisation_unit facility_state ON facility_state.id = facility_lga.parent_organisation_unit_id
                WHERE p.hospital_number = :hospital_number
                AND p.archived = 0
                LIMIT 1
            """)
            
            result = self.emr_db.execute(query, {"hospital_number": hospital_number})
            row = result.fetchone()
            
            if row:
                return dict(row._mapping)
            
            # Strategy 2: Case-insensitive
            query2 = text("""
                SELECT 
                    p.uuid AS person_uuid,
                    p.hospital_number,
                    p.first_name,
                    p.surname,
                    p.other_name,
                    INITCAP(p.sex) AS sex,
                    p.date_of_birth,
                    p.date_of_registration AS date_enrolled,
                    h.date_of_registration AS art_start_date,
                    facility.name AS facility_name,
                    facility_lga.name AS lga,
                    facility_state.name AS state,
                    h.unique_id
                FROM patient_person p
                INNER JOIN hiv_enrollment h ON h.person_uuid = p.uuid AND h.archived = 0
                INNER JOIN base_organisation_unit facility ON facility.id = h.facility_id
                INNER JOIN base_organisation_unit facility_lga ON facility_lga.id = facility.parent_organisation_unit_id
                INNER JOIN base_organisation_unit facility_state ON facility_state.id = facility_lga.parent_organisation_unit_id
                WHERE p.hospital_number ILIKE :hospital_number
                AND p.archived = 0
                LIMIT 1
            """)
            
            result2 = self.emr_db.execute(query2, {"hospital_number": hospital_number})
            row2 = result2.fetchone()
            
            if row2:
                return dict(row2._mapping)
            
            # Strategy 3: Trimmed match
            query3 = text("""
                SELECT 
                    p.uuid AS person_uuid,
                    p.hospital_number,
                    p.first_name,
                    p.surname,
                    p.other_name,
                    INITCAP(p.sex) AS sex,
                    p.date_of_birth,
                    p.date_of_registration AS date_enrolled,
                    h.date_of_registration AS art_start_date,
                    facility.name AS facility_name,
                    facility_lga.name AS lga,
                    facility_state.name AS state,
                    h.unique_id
                FROM patient_person p
                INNER JOIN hiv_enrollment h ON h.person_uuid = p.uuid AND h.archived = 0
                INNER JOIN base_organisation_unit facility ON facility.id = h.facility_id
                INNER JOIN base_organisation_unit facility_lga ON facility_lga.id = facility.parent_organisation_unit_id
                INNER JOIN base_organisation_unit facility_state ON facility_state.id = facility_lga.parent_organisation_unit_id
                WHERE TRIM(p.hospital_number) ILIKE TRIM(:hospital_number)
                AND p.archived = 0
                LIMIT 1
            """)
            
            result3 = self.emr_db.execute(query3, {"hospital_number": hospital_number})
            row3 = result3.fetchone()
            
            if row3:
                return dict(row3._mapping)
            
            return None
            
        except Exception as e:
            logger.error(f"Search error: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
    
    def _get_refill_history_all_drugs(self, person_uuid: str) -> List[Dict[str, Any]]:
        """
        CRITICAL: Get ALL drugs from each pharmacy visit.
        Uses CROSS JOIN on jsonb_array_elements to extract EVERY drug in the regimens array.
        This is the key query that shows all drugs (e.g., TDF/3TC/DTG + INH together).
        """
        try:
            # This query extracts EVERY drug from the regimens JSONB array
            # For a visit with TDF/3TC/DTG + INH 300mg, it will return 2 rows
            # which we then group by visit_date in the frontend
            query = text("""
                SELECT 
                    hap.id,
                    hap.person_uuid,
                    hap.visit_date AS pickup_date,
                    hap.next_appointment,
                    hap.mmd_type,
                    (pharmacy_object ->> 'duration')::INTEGER AS duration,
                    pharmacy_object ->> 'regimenName' AS regimen_name,
                    (pharmacy_object ->> 'regimenId')::BIGINT AS regimen_id,
                    hr.description AS regimen_full_name,
                    hrt.description AS regimen_line,
                    COALESCE(dsd.dsd_model, '') AS dsd_model
                FROM hiv_art_pharmacy hap
                CROSS JOIN jsonb_array_elements(hap.extra -> 'regimens') AS pharmacy_object
                LEFT JOIN hiv_regimen hr ON hr.id = (pharmacy_object ->> 'regimenId')::BIGINT
                LEFT JOIN hiv_regimen_type hrt ON hrt.id = hr.regimen_type_id
                LEFT JOIN (
                    SELECT DISTINCT ON (person_uuid) 
                        person_uuid,
                        dsd_model
                    FROM dsd_devolvement
                    WHERE archived = 0
                    ORDER BY person_uuid, date_devolved DESC
                ) dsd ON dsd.person_uuid = hap.person_uuid
                WHERE hap.person_uuid = :uuid
                  AND hap.archived = 0
                  AND hap.visit_date IS NOT NULL
                  AND hrt.id IN (1,2,3,4,14,16)
                  AND pharmacy_object ->> 'regimenName' IS NOT NULL
                ORDER BY hap.visit_date DESC, hap.id, pharmacy_object ->> 'regimenName'
            """)
            
            result = self.emr_db.execute(query, {"uuid": person_uuid})
            refills = []
            
            for row in result:
                refill = dict(row._mapping)
                
                # Convert dates to strings
                if refill.get('pickup_date'):
                    refill['pickup_date'] = str(refill['pickup_date'])
                if refill.get('next_appointment'):
                    refill['next_appointment'] = str(refill['next_appointment'])
                
                # Use regimen_name from JSONB, fallback to regimen_full_name
                if not refill.get('regimen_name'):
                    refill['regimen_name'] = refill.get('regimen_full_name', '')
                
                refills.append(refill)
            
            logger.info(f"Found {len(refills)} drug dispensing records (all drugs extracted)")
            
            # Log what we found for debugging
            if refills:
                unique_dates = set(r.get('pickup_date', '') for r in refills)
                logger.info(f"Across {len(unique_dates)} unique visit dates")
                
                # Show sample of drugs found
                sample_drugs = [r.get('regimen_name', '') for r in refills[:5]]
                logger.info(f"Sample drugs: {sample_drugs}")
            
            return refills
            
        except Exception as e:
            logger.error(f"Error fetching ALL drugs refill history: {str(e)}")
            import traceback
            traceback.print_exc()
            
            # Try the alternative query that also extracts all drugs
            return self._get_refill_history_alternative(person_uuid)
    
    def _get_refill_history_alternative(self, person_uuid: str) -> List[Dict[str, Any]]:
        """
        Alternative query that also uses CROSS JOIN to get all drugs.
        This version doesn't filter by regimen type, catching all drugs including INH.
        """
        try:
            query = text("""
                SELECT 
                    hap.id,
                    hap.visit_date AS pickup_date,
                    hap.next_appointment,
                    hap.mmd_type,
                    COALESCE((pharmacy_object ->> 'duration')::INTEGER, hap.refill_period, 0) AS duration,
                    pharmacy_object ->> 'regimenName' AS regimen_name,
                    (pharmacy_object ->> 'regimenId')::BIGINT AS regimen_id,
                    COALESCE(hr.description, pharmacy_object ->> 'regimenName') AS regimen_full_name,
                    COALESCE(hrt.description, 'Other') AS regimen_line,
                    COALESCE(dsd.dsd_model, '') AS dsd_model
                FROM hiv_art_pharmacy hap
                CROSS JOIN jsonb_array_elements(hap.extra -> 'regimens') AS pharmacy_object
                LEFT JOIN hiv_regimen hr ON hr.id = (pharmacy_object ->> 'regimenId')::BIGINT
                LEFT JOIN hiv_regimen_type hrt ON hrt.id = hr.regimen_type_id
                LEFT JOIN (
                    SELECT DISTINCT ON (person_uuid) 
                        person_uuid,
                        dsd_model
                    FROM dsd_devolvement
                    WHERE archived = 0
                    ORDER BY person_uuid, date_devolved DESC
                ) dsd ON dsd.person_uuid = hap.person_uuid
                WHERE hap.person_uuid = :uuid
                  AND hap.archived = 0
                  AND hap.visit_date IS NOT NULL
                ORDER BY hap.visit_date DESC, pharmacy_object ->> 'regimenName'
            """)
            
            result = self.emr_db.execute(query, {"uuid": person_uuid})
            refills = []
            
            for row in result:
                refill = dict(row._mapping)
                
                if refill.get('pickup_date'):
                    refill['pickup_date'] = str(refill['pickup_date'])
                if refill.get('next_appointment'):
                    refill['next_appointment'] = str(refill['next_appointment'])
                
                # Ensure regimen_name is set
                if not refill.get('regimen_name'):
                    refill['regimen_name'] = refill.get('regimen_full_name', 'Unknown')
                
                refills.append(refill)
            
            logger.info(f"Found {len(refills)} drug records (alternative query - all drugs)")
            return refills
            
        except Exception as e:
            logger.error(f"Alternative refill query also failed: {str(e)}")
            
            # Last resort: try the simplest query possible
            return self._get_refill_history_simple_fallback(person_uuid)
    
    def _get_refill_history_simple_fallback(self, person_uuid: str) -> List[Dict[str, Any]]:
        """
        Simplest possible fallback - just get basic refill data.
        Uses the original query structure you provided.
        """
        try:
            query = text("""
                SELECT 
                    result.visit_date AS pickup_date,
                    result.regimen_name,
                    hrt.description AS regimen_line,
                    result.duration,
                    result.mmd_type,
                    result.next_appointment,
                    COALESCE(dsd.dsd_model, '') AS dsd_model,
                    result.id
                FROM (
                    SELECT
                        h.id,
                        h.person_uuid,
                        h.mmd_type,
                        h.next_appointment,
                        h.visit_date,
                        (pharmacy_object ->> 'duration')::INTEGER AS duration,
                        pharmacy_object ->> 'regimenName' AS regimen_name,
                        (pharmacy_object ->> 'regimenId')::BIGINT AS regimen_id
                    FROM hiv_art_pharmacy h
                    CROSS JOIN jsonb_array_elements(h.extra -> 'regimens') AS pharmacy_object
                    WHERE h.archived = 0
                      AND h.visit_date IS NOT NULL
                      AND h.person_uuid = :uuid
                ) AS result
                INNER JOIN hiv_regimen hr ON hr.id = result.regimen_id
                INNER JOIN hiv_regimen_type hrt ON hrt.id = hr.regimen_type_id
                LEFT JOIN (
                    SELECT DISTINCT ON (person_uuid) 
                        person_uuid,
                        dsd_model
                    FROM dsd_devolvement
                    WHERE archived = 0
                    ORDER BY person_uuid, date_devolved DESC
                ) dsd ON dsd.person_uuid = result.person_uuid
                WHERE hrt.id IN (1,2,3,4,14,16)
                  AND result.regimen_name IS NOT NULL
                ORDER BY result.visit_date DESC, result.next_appointment DESC
            """)
            
            result = self.emr_db.execute(query, {"uuid": person_uuid})
            refills = []
            
            for row in result:
                refill = dict(row._mapping)
                if refill.get('pickup_date'):
                    refill['pickup_date'] = str(refill['pickup_date'])
                if refill.get('next_appointment'):
                    refill['next_appointment'] = str(refill['next_appointment'])
                refills.append(refill)
            
            logger.info(f"Found {len(refills)} refill records (fallback query)")
            return refills
            
        except Exception as e:
            logger.error(f"All refill queries failed: {str(e)}")
            return []
    
    def _get_viral_load_history(self, person_uuid: str) -> List[Dict[str, Any]]:
        """Get viral load history"""
        try:
            query = text("""
                SELECT 
                    CAST(ls.date_sample_collected AS DATE) AS sample_collection_date,
                    sm.result_reported AS viral_load_result,
                    CAST(sm.date_result_reported AS DATE) AS result_date,
                    sm.id
                FROM laboratory_result sm
                INNER JOIN laboratory_test lt ON lt.id = sm.test_id
                INNER JOIN laboratory_sample ls ON ls.test_id = lt.id
                WHERE lt.lab_test_id = 16
                AND sm.patient_uuid = :uuid
                AND sm.result_reported IS NOT NULL
                AND sm.archived = 0
                ORDER BY ls.date_sample_collected DESC
            """)
            
            result = self.emr_db.execute(query, {"uuid": person_uuid})
            vl_history = []
            
            for row in result:
                vl = dict(row._mapping)
                if vl.get('sample_collection_date'):
                    vl['sample_collection_date'] = str(vl['sample_collection_date'])
                if vl.get('result_date'):
                    vl['result_date'] = str(vl['result_date'])
                vl_history.append(vl)
            
            logger.info(f"Found {len(vl_history)} viral load records")
            return vl_history
            
        except Exception as e:
            logger.error(f"Error fetching VL history: {str(e)}")
            return []
    
    def _get_current_regimen(self, person_uuid: str) -> Dict[str, Any]:
        """Get current (most recent) regimen"""
        try:
            query = text("""
                SELECT 
                    result.regimen_name AS current_regimen,
                    hrt.description AS current_regimen_line,
                    result.visit_date AS last_pickup_date,
                    result.next_appointment
                FROM (
                    SELECT
                        h.person_uuid,
                        h.next_appointment,
                        h.visit_date,
                        pharmacy_object ->> 'regimenName' AS regimen_name,
                        (pharmacy_object ->> 'regimenId')::BIGINT AS regimen_id
                    FROM hiv_art_pharmacy h
                    CROSS JOIN jsonb_array_elements(h.extra -> 'regimens') AS pharmacy_object
                    WHERE h.archived = 0
                      AND h.person_uuid = :uuid
                    ORDER BY h.visit_date DESC
                    LIMIT 1
                ) AS result
                INNER JOIN hiv_regimen hr ON hr.id = result.regimen_id
                INNER JOIN hiv_regimen_type hrt ON hrt.id = hr.regimen_type_id
            """)
            
            result = self.emr_db.execute(query, {"uuid": person_uuid})
            row = result.fetchone()
            
            if row:
                data = dict(row._mapping)
                if data.get('last_pickup_date'):
                    data['last_pickup_date'] = str(data['last_pickup_date'])
                if data.get('next_appointment'):
                    data['next_appointment'] = str(data['next_appointment'])
                return data
            
            return {}
            
        except Exception as e:
            logger.error(f"Error fetching current regimen: {str(e)}")
            return {}