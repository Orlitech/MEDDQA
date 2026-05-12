from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class ComparisonResult(BaseModel):
    field_name: str
    emr_value: Any
    care_card_value: Any
    match: bool
    discrepancy: Optional[str] = None

class DQAResponse(BaseModel):
    hospital_number: str
    comparison_results: List[ComparisonResult]
    all_matched: bool
    can_submit: bool
    message: Optional[str] = None

class DQASubmissionResponse(BaseModel):
    success: bool
    message: str
    audit_id: Optional[int] = None
    corrections_made: int = 0

class ReportRequest(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    facility_name: Optional[str] = None
    state: Optional[str] = None