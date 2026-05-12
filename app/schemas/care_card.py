from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import date, datetime

class CareCardEnrollment(BaseModel):
    date_enrolled: Optional[date] = None
    art_start_date: Optional[date] = None

class CareCardDrugPickup(BaseModel):
    regimen: str
    pickup_date: date
    duration: int
    
    @validator('pickup_date')
    def validate_pickup_date(cls, v):
        if v > date.today():
            raise ValueError('Pickup date cannot be in the future')
        return v
    
    @validator('duration')
    def validate_duration(cls, v):
        if v <= 0 or v > 365:
            raise ValueError('Duration must be between 1 and 365 days')
        return v

class CareCardViralLoad(BaseModel):
    sample_collection_date: Optional[date] = None
    viral_load_result: Optional[str] = None
    result_date: Optional[date] = None
    
    @validator('sample_collection_date')
    def validate_sample_date(cls, v):
        if v and v > date.today():
            raise ValueError('Sample collection date cannot be in the future')
        return v

class CareCardInput(BaseModel):
    hospital_number: str
    enrollment: Optional[CareCardEnrollment] = None
    drug_pickups: List[CareCardDrugPickup] = Field(default_factory=list)
    viral_loads: List[CareCardViralLoad] = Field(default_factory=list)
    
    @validator('hospital_number')
    def validate_hospital_number(cls, v):
        if not v or not v.strip():
            raise ValueError('Hospital number is required')
        return v.strip()