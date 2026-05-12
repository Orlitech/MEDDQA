from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.database import get_emr_db
from app.services.patient_service import PatientService
from app.services.lock_service import LockService
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/patients", tags=["patients"])
lock_service = LockService()

@router.get("/search/{hospital_number}")
async def search_patient(
    hospital_number: str,
    request: Request,
    emr_db: Session = Depends(get_emr_db)
):
    """Search for a patient by hospital number"""
    try:
        logger.info(f"Search request for: {hospital_number}")
        
        patient_service = PatientService(emr_db)
        patient_data = patient_service.search_patient(hospital_number)
        
        if not patient_data:
            raise HTTPException(
                status_code=404,
                detail=f"Patient not found: {hospital_number}"
            )
        
        return {
            "success": True,
            "data": patient_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))