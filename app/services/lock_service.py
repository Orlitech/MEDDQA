"""Simple lock service for record locking"""

class LockService:
    def __init__(self):
        self.locks = {}
    
    def acquire_lock(self, hospital_number: str, user: str, timeout_seconds: int = 300) -> bool:
        """Try to acquire a lock"""
        lock_key = f"lock:{hospital_number}"
        if lock_key not in self.locks:
            self.locks[lock_key] = {"user": user, "locked": True}
            return True
        return False
    
    def release_lock(self, hospital_number: str, user: str) -> bool:
        """Release a lock"""
        lock_key = f"lock:{hospital_number}"
        if lock_key in self.locks:
            del self.locks[lock_key]
            return True
        return False
    
    def check_lock(self, hospital_number: str):
        """Check if a record is locked"""
        lock_key = f"lock:{hospital_number}"
        if lock_key in self.locks:
            return {
                "locked": True,
                "locked_by": self.locks[lock_key]["user"],
                "message": "Record is being edited by another user"
            }
        return {"locked": False}