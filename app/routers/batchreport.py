"""
batchreport.py  —  MedDQA
GET /api/reports/dqa-verification-batch

All layout is delegated to singlereport.py via build_record_elements().
This module handles only: auth check, bulk EMR prefetch, per-record loop.
"""

from __future__ import annotations
import io, logging
from datetime import datetime

from fastapi import Request
from fastapi.responses import StreamingResponse, JSONResponse

from app.routers.singlereport import (
    DISC_LABELS,
    get_status,
    _make_page_number_canvas,
    build_corrections,
    compute_stats,
    build_record_elements,
)

logger = logging.getLogger(__name__)


async def generate_batch_verification_pdf(
    request: Request,
    start_date: str = None,
    end_date:   str = None,
    username:   str = None,
):
    """GET /api/reports/dqa-verification-batch"""
    from reportlab.platypus import SimpleDocTemplate
    from reportlab.lib.pagesizes import A4
    from sqlalchemy import text, or_, cast, Date
    from sqlalchemy.orm import Session

    try:
        from app.database import dqa_engine, emr_engine
        from app.models.dqa_models import CareCardRecord, User

        # ── 1. Permission check ───────────────────────────────────────────────
        caller   = request.headers.get("X-User","").strip()
        is_admin = False
        try:
            with Session(dqa_engine) as s:
                if s.query(User).filter(
                    or_(User.username==caller, User.full_name==caller),
                    User.role=="admin", User.is_active==True
                ).first():
                    is_admin = True
        except Exception as exc:
            logger.warning(f"Admin check: {exc}")

        if not is_admin:
            username = caller or username

        logger.info(f"Batch PDF | admin={is_admin} | user={username or 'ALL'} | {start_date}→{end_date}")

        # ── 2. Fetch DQA records ──────────────────────────────────────────────
        with Session(dqa_engine) as s:
            q = s.query(CareCardRecord).filter(CareCardRecord.is_verified==True)
            if username:
                q = q.filter(or_(
                    CareCardRecord.verified_by.ilike(f"%{username}%"),
                    CareCardRecord.created_by.ilike(f"%{username}%"),
                ))
            if start_date and start_date.strip():
                q = q.filter(cast(CareCardRecord.verified_at,Date) >= start_date.strip())
            if end_date and end_date.strip():
                q = q.filter(cast(CareCardRecord.verified_at,Date) <= end_date.strip())
            records = q.order_by(CareCardRecord.verified_at.desc()).all()

        if not records:
            return JSONResponse(status_code=404,
                content={"success":False,"detail":"No verified records found."})

        logger.info(f"Batch PDF: {len(records)} records")

        # ── 3. Bulk EMR prefetch ──────────────────────────────────────────────
        hns = [r.hospital_number for r in records if r.hospital_number]
        emr_patients   = {}   # hn → patient dict
        emr_refills    = {}   # hn → list[dict]
        emr_vls        = {}   # hn → list[dict]
        emr_art_status = {}   # hn → str
        emr_veri       = {}   # hn → str

        if hns:
            try:
                with emr_engine.connect() as conn:
                    ph  = ", ".join(f":hn{i}" for i in range(len(hns)))
                    par = {f"hn{i}": h for i,h in enumerate(hns)}

                    # Demographics
                    for row in conn.execute(text(f"""
                        SELECT p.hospital_number, p.first_name, p.surname,
                               p.date_of_birth, INITCAP(p.sex), p.uuid,
                               f.name, COALESCE(fs.name,'N/A'),
                               h.date_of_registration
                        FROM patient_person p
                        INNER JOIN hiv_enrollment h ON h.person_uuid=p.uuid AND h.archived=0
                        INNER JOIN base_organisation_unit f ON f.id=h.facility_id
                        LEFT  JOIN base_organisation_unit fl ON fl.id=f.parent_organisation_unit_id
                        LEFT  JOIN base_organisation_unit fs ON fs.id=fl.parent_organisation_unit_id
                        WHERE p.hospital_number IN ({ph}) AND p.archived=0
                    """), par).fetchall():
                        hn = row[0]
                        emr_patients[hn] = {
                            "hospital_no":   hn,
                            "patient_name":  f"{row[1] or ''} {row[2] or ''}".strip() or "N/A",
                            "dob":           str(row[3])[:10] if row[3] else "N/A",
                            "sex":           row[4] or "N/A",
                            "facility":      row[6] or "N/A",
                            "state":         row[7] or "N/A",
                            "art_start_date":str(row[8])[:10] if row[8] else "N/A",
                        }
                        _uuid_map: dict = {}
                        _uuid_map[row[5]] = hn  # local; rebuilt below

                    # rebuild uuid_map properly
                    uuid_map = {}
                    for row in conn.execute(text(f"""
                        SELECT p.uuid, p.hospital_number
                        FROM patient_person p
                        WHERE p.hospital_number IN ({ph}) AND p.archived=0
                    """), par).fetchall():
                        uuid_map[row[0]] = row[1]

                    uuids = list(uuid_map)
                    if uuids:
                        up  = ", ".join(f":u{i}" for i in range(len(uuids)))
                        upr = {f"u{i}": u for i,u in enumerate(uuids)}

                        # Refills
                        for row in conn.execute(text(f"""
                            SELECT hap.person_uuid, hap.visit_date,
                                   COALESCE((elem.value->>'duration')::INTEGER,hap.refill_period,0),
                                   elem.value->>'regimenName', hap.next_appointment
                            FROM hiv_art_pharmacy hap
                            CROSS JOIN LATERAL jsonb_array_elements(hap.extra->'regimens')
                                WITH ORDINALITY AS elem(value,ordinality)
                            WHERE hap.person_uuid IN ({up}) AND hap.archived=0
                              AND elem.ordinality=1
                            ORDER BY hap.person_uuid, hap.visit_date ASC
                        """), upr).fetchall():
                            hn = uuid_map.get(row[0])
                            if hn:
                                emr_refills.setdefault(hn,[]).append({
                                    "date":str(row[1])[:10] if row[1] else "N/A",
                                    "duration":f"{int(row[2] or 0)} days",
                                    "regimen":row[3] or "N/A",
                                    "next_appt":str(row[4])[:10] if row[4] else "N/A",
                                })

                        # Viral loads
                        for row in conn.execute(text(f"""
                            SELECT sm.patient_uuid,
                                   CAST(ls.date_sample_collected AS DATE),
                                   sm.result_reported,
                                   CAST(sm.date_result_reported AS DATE)
                            FROM laboratory_result sm
                            INNER JOIN laboratory_test lt ON lt.id=sm.test_id
                            INNER JOIN laboratory_sample ls ON ls.test_id=lt.id
                            WHERE lt.lab_test_id=16 AND sm.patient_uuid IN ({up})
                              AND sm.result_reported IS NOT NULL AND sm.archived=0
                            ORDER BY sm.patient_uuid, ls.date_sample_collected ASC
                        """), upr).fetchall():
                            hn = uuid_map.get(row[0])
                            if hn:
                                emr_vls.setdefault(hn,[]).append({
                                    "sample_date":str(row[1])[:10] if row[1] else "N/A",
                                    "result":row[2] or "N/A",
                                    "result_date":str(row[3])[:10] if row[3] else "N/A",
                                })

                        # ART status
                        for row in conn.execute(text(f"""
                            SELECT p.uuid,
                                CASE
                                    WHEN hst.hiv_status ILIKE '%Died%' OR hst.hiv_status ILIKE '%Death%' THEN 'Died'
                                    WHEN hst.hiv_status ILIKE '%out%'     THEN 'Transferred Out'
                                    WHEN hst.hiv_status ILIKE '%stop%' OR hst.hiv_status ILIKE '%Invalid%' THEN 'Stopped Treatment'
                                    WHEN hst.hiv_status ILIKE '%IIT%'     THEN 'IIT'
                                    ELSE 'Active' END
                            FROM patient_person p
                            LEFT JOIN LATERAL (SELECT hiv_status FROM hiv_status_tracker
                                WHERE person_id=p.uuid AND archived=0
                                ORDER BY status_date DESC LIMIT 1) hst ON TRUE
                            WHERE p.uuid IN ({up}) AND p.archived=0
                        """), upr).fetchall():
                            hn = uuid_map.get(row[0])
                            if hn: emr_art_status[hn] = row[1] or "Active"

                        # Verification outcomes
                        for row in conn.execute(text(f"""
                            SELECT DISTINCT ON (person_uuid) person_uuid,
                                data->'attempt'->0->>'outcome'
                            FROM hiv_observation
                            WHERE type='Client Verification' AND person_uuid IN ({up}) AND archived=0
                            ORDER BY person_uuid,
                                CAST(data->'attempt'->0->>'dateOfAttempt' AS DATE) DESC
                        """), upr).fetchall():
                            hn = uuid_map.get(row[0])
                            if hn: emr_veri[hn] = row[1] or ""

            except Exception as exc:
                logger.error(f"Bulk EMR prefetch: {exc}", exc_info=True)

        # ── 4. Build PDF ──────────────────────────────────────────────────────
        BLANK = {"hospital_no":"N/A","patient_name":"N/A","dob":"N/A",
                 "sex":"N/A","facility":"N/A","state":"N/A","art_start_date":"N/A"}

        all_elements = []
        for idx, record in enumerate(records):
            hn = record.hospital_number or "N/A"
            patient     = emr_patients.get(hn, {**BLANK,"hospital_no":hn})
            ref_list    = emr_refills.get(hn, [])
            vl_list     = emr_vls.get(hn, [])
            art_status  = emr_art_status.get(hn,"Active")
            veri_outcome= emr_veri.get(hn,"")

            corrections = build_corrections(record, ref_list, vl_list)
            stats       = compute_stats(corrections)

            all_elements.extend(
                build_record_elements(record, patient, corrections, stats,
                                      art_status, veri_outcome, idx)
            )

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                rightMargin=22, leftMargin=22,
                                topMargin=10,   bottomMargin=22)
        doc.build(all_elements, canvasmaker=_make_page_number_canvas)
        buf.seek(0)

        safe_user = (username or "all").replace(" ","_")
        filename  = f"DQA_Batch_{safe_user}_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
        return StreamingResponse(buf, media_type="application/pdf",
            headers={"Content-Disposition":f'inline; filename="{filename}"'})

    except Exception as exc:
        logger.error(f"Batch PDF: {exc}", exc_info=True)
        return JSONResponse(status_code=500, content={"success":False,"detail":str(exc)})
