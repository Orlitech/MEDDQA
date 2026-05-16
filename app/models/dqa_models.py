"""
DQA Database Models
Stores all DQA audit logs, care card data, and correction history
"""

from sqlalchemy import Column, Integer, String, DateTime, JSON, Boolean, Float, Text, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base
import uuid
from datetime import datetime

class DQAAuditLog(Base):
    __tablename__ = "dqa_audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True)
    hospital_number = Column(String(100), index=True, nullable=False)
    person_uuid = Column(String(100))
    first_name = Column(String(200))
    surname = Column(String(200))
    facility_name = Column(String(300))
    state = Column(String(100))
    
    # Care Card Data
    care_card_data = Column(JSON)  # Stores all care card entries
    emr_snapshot = Column(JSON)    # Stores EMR data at time of verification
    
    # Validation Results
    validation_status = Column(String(50))  # Matched, Corrected, Mismatch
    discrepancies_found = Column(Boolean, default=False)
    issues_fixed = Column(Integer, default=0)
    total_comparisons = Column(Integer, default=0)
    matched_comparisons = Column(Integer, default=0)
    
    # User Info
    user_name = Column(String(200))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<DQAAuditLog {self.hospital_number} - {self.validation_status}>"


class CorrectionLog(Base):
    __tablename__ = "correction_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True)
    hospital_number = Column(String(100), index=True)
    person_uuid = Column(String(100))
    field_corrected = Column(String(200))
    old_value = Column(Text)
    new_value = Column(Text)
    corrected_by = Column(String(200))
    record_type = Column(String(50))  # patient, refill, viral_load
    audit_log_id = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class LabSettings(Base):
    """Stores lab personnel and settings for VL result printing"""
    __tablename__ = "lab_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True)
    
    # Lab Info
    pcr_lab_name = Column(String(200), default="")
    facility_name = Column(String(200), default="")
    
    # Personnel
    clinician_name = Column(String(200), default="")
    assayed_by_name = Column(String(200), default="")
    approved_by_name = Column(String(200), default="")
    collected_by_name = Column(String(200), default="")  # ✅ ADD THIS
    
    # Tracking
    created_by = Column(String(200))
    updated_by = Column(String(200))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<LabSettings {self.pcr_lab_name}>"

class CareCardRecord(Base):
    """Stores care card data entered by users"""
    __tablename__ = "care_card_records"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True)
    hospital_number = Column(String(100), index=True, nullable=False)
    person_uuid = Column(String(100))
    
    # Care Card Data
    drug_pickups = Column(JSON)  # Array of drug pickup entries
    viral_loads = Column(JSON)   # Array of viral load entries
    enrollment_data = Column(JSON)  # Enrollment info from care card
    
    # Status
    is_verified = Column(Boolean, default=False)
    verified_by = Column(String(200))
    verified_at = Column(DateTime(timezone=True))
    
    # User tracking
    created_by = Column(String(200))
    updated_by = Column(String(200))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<CareCardRecord {self.hospital_number} - Pickups: {len(self.drug_pickups or [])}, VLs: {len(self.viral_loads or [])}>"