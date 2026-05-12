from typing import Dict, List, Any, Optional
from datetime import date
import logging

logger = logging.getLogger(__name__)

class ComparisonService:
    """Service for comparing EMR data with Care Card data"""
    
    @staticmethod
    def compare_records(emr_data: Dict[str, Any], 
                       care_card_data: Dict[str, Any]) -> Dict[str, Any]:
        """Compare EMR data with Care Card data field by field"""
        comparison_results = []
        mismatches = []
        
        # Compare enrollment data
        if care_card_data.get('enrollment'):
            enrollment_comparison = ComparisonService._compare_enrollment(
                emr_data['patient_info'],
                care_card_data['enrollment']
            )
            comparison_results.extend(enrollment_comparison)
        
        # Compare drug pickups
        if care_card_data.get('drug_pickups'):
            pickup_comparison = ComparisonService._compare_drug_pickups(
                emr_data['refill_history'],
                care_card_data['drug_pickups']
            )
            comparison_results.extend(pickup_comparison)
        
        # Compare viral loads
        if care_card_data.get('viral_loads'):
            vl_comparison = ComparisonService._compare_viral_loads(
                emr_data['viral_load_history'],
                care_card_data['viral_loads']
            )
            comparison_results.extend(vl_comparison)
        
        # Check for mismatches
        mismatches = [r for r in comparison_results if not r['match']]
        all_matched = len(mismatches) == 0
        
        return {
            "hospital_number": emr_data['patient_info']['hospital_number'],
            "comparison_results": comparison_results,
            "all_matched": all_matched,
            "can_submit": all_matched,
            "mismatches": mismatches,
            "message": "All records match" if all_matched else f"Found {len(mismatches)} discrepancies"
        }
    
    @staticmethod
    def _compare_enrollment(emr_patient: Dict, care_enrollment: Dict) -> List[Dict]:
        """Compare enrollment data"""
        results = []
        
        # Compare enrollment date
        if care_enrollment.get('date_enrolled'):
            emr_date = emr_patient.get('date_enrolled')
            cc_date = care_enrollment['date_enrolled']
            results.append({
                "field_name": "Date Enrolled",
                "emr_value": str(emr_date) if emr_date else None,
                "care_card_value": str(cc_date),
                "match": str(emr_date) == str(cc_date) if emr_date else False
            })
        
        return results
    
    @staticmethod
    def _compare_drug_pickups(emr_pickups: List[Dict], 
                             care_pickups: List[Dict]) -> List[Dict]:
        """Compare drug pickup records"""
        results = []
        
        # Sort both lists by pickup date
        emr_sorted = sorted(emr_pickups, key=lambda x: x.get('pickup_date', date.min))
        cc_sorted = sorted(care_pickups, key=lambda x: x.get('pickup_date', date.min))
        
        # Compare each pickup
        for i, cc_pickup in enumerate(cc_sorted):
            emr_pickup = emr_sorted[i] if i < len(emr_sorted) else None
            
            if not emr_pickup:
                results.append({
                    "field_name": f"Pickup #{i+1}",
                    "emr_value": "Not found",
                    "care_card_value": str(cc_pickup),
                    "match": False
                })
                continue
            
            # Compare individual fields
            for field in ['regimen', 'pickup_date', 'duration']:
                emr_val = str(emr_pickup.get(field, ''))
                cc_val = str(cc_pickup.get(field, ''))
                
                results.append({
                    "field_name": f"Pickup #{i+1} - {field}",
                    "emr_value": emr_val,
                    "care_card_value": cc_val,
                    "match": emr_val == cc_val
                })
        
        return results
    
    @staticmethod
    def _compare_viral_loads(emr_vls: List[Dict], 
                            care_vls: List[Dict]) -> List[Dict]:
        """Compare viral load records"""
        results = []
        
        # Sort by sample collection date
        emr_sorted = sorted(emr_vls, key=lambda x: x.get('sample_collection_date', date.min))
        cc_sorted = sorted(care_vls, key=lambda x: x.get('sample_collection_date', date.min))
        
        for i, cc_vl in enumerate(cc_sorted):
            emr_vl = emr_sorted[i] if i < len(emr_sorted) else None
            
            if not emr_vl:
                results.append({
                    "field_name": f"VL Test #{i+1}",
                    "emr_value": "Not found",
                    "care_card_value": str(cc_vl),
                    "match": False
                })
                continue
            
            # Compare VL fields
            for field in ['sample_collection_date', 'viral_load_result', 'result_date']:
                emr_val = str(emr_vl.get(field, ''))
                cc_val = str(cc_vl.get(field, ''))
                
                results.append({
                    "field_name": f"VL #{i+1} - {field}",
                    "emr_value": emr_val,
                    "care_card_value": cc_val,
                    "match": emr_val == cc_val
                })
        
        return results