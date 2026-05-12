import pandas as pd
from io import BytesIO
from datetime import datetime
from typing import Dict, List, Any
from sqlalchemy.orm import Session
from app.models.dqa_models import DQAAuditLog, CorrectionLog
import logging

logger = logging.getLogger(__name__)

class ReportService:
    """Service for generating Excel reports"""
    
    def __init__(self, dqa_db: Session):
        self.dqa_db = dqa_db
    
    def generate_excel_report(self, filters: Dict[str, Any] = None) -> BytesIO:
        """Generate multi-sheet Excel report"""
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # Sheet 1: Patient Summary
            self._create_patient_summary(writer, filters)
            
            # Sheet 2: ROC History
            self._create_roc_history(writer, filters)
            
            # Sheet 3: Viral Load History
            self._create_vl_history(writer, filters)
            
            # Sheet 4: DQA Summary
            self._create_dqa_summary(writer, filters)
            
            # Sheet 5: Correction Log
            self._create_correction_log(writer, filters)
        
        output.seek(0)
        return output
    
    def _create_patient_summary(self, writer, filters):
        """Create Patient Summary sheet"""
        query = self.dqa_db.query(DQAAuditLog)
        
        if filters:
            if filters.get('start_date'):
                query = query.filter(DQAAuditLog.created_at >= filters['start_date'])
            if filters.get('end_date'):
                query = query.filter(DQAAuditLog.created_at <= filters['end_date'])
            if filters.get('facility_name'):
                query = query.filter(DQAAuditLog.facility_name == filters['facility_name'])
        
        audit_logs = query.all()
        
        data = []
        for log in audit_logs:
            data.append({
                'Hospital Number': log.hospital_number,
                'Person UUID': log.person_uuid,
                'First Name': log.first_name,
                'Surname': log.surname,
                'Facility': log.facility_name,
                'State': log.state,
                'Overall Status': log.validation_status,
                'Discrepancy Found': 'Yes' if log.discrepancies_found else 'No',
                'Number of Issues Fixed': log.issues_fixed,
                'Date Reviewed': log.created_at.strftime('%Y-%m-%d'),
                'Reviewed By': log.user_name
            })
        
        df = pd.DataFrame(data)
        df.to_excel(writer, sheet_name='Patient Summary', index=False)
    
    def _create_roc_history(self, writer, filters):
        """Create ROC History sheet with all refills"""
        # This would extract ROC data from audit logs
        # Simplified implementation
        data = []
        df = pd.DataFrame(data)
        df.to_excel(writer, sheet_name='ROC History', index=False)
    
    def _create_vl_history(self, writer, filters):
        """Create Viral Load History sheet"""
        data = []
        df = pd.DataFrame(data)
        df.to_excel(writer, sheet_name='VL History', index=False)
    
    def _create_dqa_summary(self, writer, filters):
        """Create DQA Summary sheet for Power BI"""
        query = self.dqa_db.query(DQAAuditLog)
        
        if filters:
            if filters.get('facility_name'):
                query = query.filter(DQAAuditLog.facility_name == filters['facility_name'])
            if filters.get('state'):
                query = query.filter(DQAAuditLog.state == filters['state'])
        
        audit_logs = query.all()
        
        # Aggregate by facility
        facility_data = {}
        for log in audit_logs:
            key = (log.facility_name, log.state)
            if key not in facility_data:
                facility_data[key] = {
                    'facility': log.facility_name,
                    'state': log.state,
                    'total': 0,
                    'matches': 0,
                    'mismatches': 0,
                    'corrections': 0
                }
            
            facility_data[key]['total'] += 1
            if log.validation_status == 'Matched':
                facility_data[key]['matches'] += 1
            elif log.validation_status == 'Corrected':
                facility_data[key]['corrections'] += 1
            else:
                facility_data[key]['mismatches'] += 1
        
        summary_data = []
        for data in facility_data.values():
            completion_rate = ((data['matches'] + data['corrections']) / data['total'] * 100) if data['total'] > 0 else 0
            summary_data.append({
                'Facility': data['facility'],
                'State': data['state'],
                'Total Clients Reviewed': data['total'],
                'Total Matches': data['matches'],
                'Total Mismatches': data['mismatches'],
                'Total Corrections': data['corrections'],
                'Completion Rate (%)': round(completion_rate, 2)
            })
        
        df = pd.DataFrame(summary_data)
        df.to_excel(writer, sheet_name='DQA Summary', index=False)
    
    def _create_correction_log(self, writer, filters):
        """Create Correction Log sheet"""
        query = self.dqa_db.query(CorrectionLog)
        
        if filters:
            if filters.get('start_date'):
                query = query.filter(CorrectionLog.created_at >= filters['start_date'])
            if filters.get('end_date'):
                query = query.filter(CorrectionLog.created_at <= filters['end_date'])
        
        corrections = query.all()
        
        data = []
        for correction in corrections:
            data.append({
                'Hospital Number': correction.hospital_number,
                'Person UUID': correction.person_uuid,
                'Field Corrected': correction.field_corrected,
                'Old Value': correction.old_value,
                'New Value': correction.new_value,
                'Date Corrected': correction.created_at.strftime('%Y-%m-%d %H:%M'),
                'Corrected By': correction.corrected_by
            })
        
        df = pd.DataFrame(data)
        df.to_excel(writer, sheet_name='Correction Log', index=False)