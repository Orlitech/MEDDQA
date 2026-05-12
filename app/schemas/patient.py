from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal

class PatientInfo(BaseModel):
    hospital_number: str
    first_name: str
    surname: str
    sex: str
    date_of_birth: date
    date_enrolled: Optional[date] = None
    facility_name: Optional[str] = None
    state: Optional[str] = None
    person_uuid: Optional[str] = None

class DrugRefill(BaseModel):
    regimen: str
    pickup_date: date
    duration: int
    next_appointment: Optional[date] = None
    mmd_type: Optional[str] = None
    dsd_model: Optional[str] = None

class ViralLoad(BaseModel):
    sample_collection_date: Optional[date] = None
    viral_load_result: Optional[str] = None
    result_date: Optional[date] = None
    verification_status: Optional[str] = None

class PatientDetailedResponse(BaseModel):
    patient_info: PatientInfo
    refill_history: List[DrugRefill]
    viral_load_history: List[ViralLoad]
    current_regimen: Optional[str] = None
    current_regimen_line: Optional[str] = None
    art_start_date: Optional[date] = None
    current_status: Optional[str] = None

class EMRUpdateRequest(BaseModel):
    field_name: str
    field_value: str
    record_type: str  # "patient", "refill", "viral_load"
    record_id: Optional[int] = None