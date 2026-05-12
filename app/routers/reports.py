from fastapi import APIRouter

router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get("/status")
async def reports_status():
    return {"status": "Reports module ready"}