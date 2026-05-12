from fastapi import APIRouter

router = APIRouter(prefix="/api/care-cards", tags=["care_cards"])

@router.get("/status")
async def care_card_status():
    return {"status": "Care card module ready"}