"""
singlereport.py  —  MedDQA
GET /api/reports/dqa-verification/{hospital_number}

One definitive file.  All layout, data-fetch, and shared helpers live here.
batchreport.py imports DISC_LABELS, get_status, _make_page_number_canvas,
build_corrections, compute_stats, and build_record_elements from this module.
"""

from __future__ import annotations
import io, os, logging
from datetime import datetime
from urllib.parse import unquote

from fastapi import Request
from fastapi.responses import StreamingResponse, JSONResponse

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# SHARED CONSTANTS & HELPERS
# ─────────────────────────────────────────────────────────────────────────────

DISC_LABELS: dict = {
    "incorrect_value":    "Incorrect Value",
    "missing_emr":        "Missing in EMR",
    "missing_carecard":   "Missing on Care Card",
    "not_documented":     "Not Documented",
    "unavailable":        "Info Unavailable",
    "unable_verify":      "Unable to Verify",
    "lab_pending":        "Lab Result Pending",
    "incomplete_records": "Incomplete Records",
    "other":              "Other",
}

_VISIT_DISC = frozenset({
    "missing_emr", "missing_carecard", "not_documented",
    "incomplete_records", "lab_pending", "unavailable", "unable_verify",
})

# Batch-step field labels that ONLY come from drug_pickups / viral_loads.
# Skip them when they arrive from latest_refill_verification (which also
# stores a copy) to prevent every batch field appearing twice.
_BATCH_LABELS = frozenset({
    "refill — pickup dates",  "refill — durations",
    "refill — regimens",      "refill — next appointments",
    "refill - pickup dates",  "refill - durations",
    "refill - regimens",      "refill - next appointments",
    "pickup dates",           "refill durations",
    "refill durations",       "regimens",
    "next appointments",      "pickup date",
    "refill duration",        "regimen",
    "vl — sample dates",      "vl — results",      "vl — result dates",
    "vl - sample dates",      "vl - results",      "vl - result dates",
    "vl sample dates",        "vl results",        "vl result dates",
    "vl sample date",         "vl result",         "vl result date",
})

ART_SOURCE_MAP = {
    "Died":              "Cross-Document Triangulation",
    "Transferred Out":   "Transfer Register / Phone Call",
    "Stopped Treatment": "Data Triangulation",
    "IIT":               "Treatment Support Contacted",
}


def _esc(v) -> str:
    """HTML-escape a raw value for safe use inside a ReportLab Paragraph."""
    s = str(v) if v is not None else ""
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return s or "—"


def get_status(is_match, corrected_on,
               discrepancy_type=None, discrepancy_note=None,
               original_emr_value=None, care_card_value=None,
               affected_visits=None):
    """Return (status, action, source, detail) with zero redundancy."""
    if is_match:
        return "MATCH", "—", "—", ""

    co = corrected_on or ""
    if   co == "emr":       action, source = "EMR Updated",    "Care Card"
    elif co == "care_card": action, source = "Care Card Noted", "EMR"
    elif co == "both":      action, source = "Both Updated",   "Both Sources"
    else:                   action, source = "—",              "—"

    dt   = discrepancy_type or ""
    note = (discrepancy_note or "").strip()
    parts = []

    disc_lbl = DISC_LABELS.get(dt, "")
    if disc_lbl:
        parts.append(disc_lbl)

    if affected_visits and isinstance(affected_visits, list) and affected_visits:
        vs = ", ".join(str(v) for v in affected_visits[:6])
        if len(affected_visits) > 6:
            vs += f" +{len(affected_visits)-6} more"
        parts.append(f"Visits: {vs}")

    if original_emr_value and co in ("emr", "both"):
        parts.append(f"Was: {original_emr_value}")

    if note:
        parts.append(f"Note: {note}")

    return "MISMATCH", action, source, " | ".join(parts)


def _make_page_number_canvas(buffer, **kwargs):
    """Canvas subclass: top teal accent + bottom confidentiality bar + page stamp."""
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4

    class _Canvas(rl_canvas.Canvas):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self._saved_pages = []

        def showPage(self):
            self._saved_pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            n = len(self._saved_pages)
            for state in self._saved_pages:
                self.__dict__.update(state)
                pw, ph = A4
                self.setStrokeColorRGB(0.035, 0.569, 0.698)
                self.setLineWidth(2)
                self.line(0, ph - 2, pw, ph - 2)
                self.setFillColorRGB(0.973, 0.976, 0.988)
                self.rect(0, 0, pw, 16, fill=1, stroke=0)
                self.setFillColorRGB(0.58, 0.64, 0.69)
                self.setFont("Helvetica", 5.5)
                self.drawString(12, 5, "CONFIDENTIAL — MedDQA Clinical Data Quality Assurance")
                self.drawRightString(pw - 12, 5, f"Page {self._pageNumber} of {n}")
                super().showPage()
            super().save()

    return _Canvas(buffer, **kwargs)


def _find_logo():
    for p in [
        os.path.join(os.path.dirname(__file__), "..", "static", "logo2.png"),
        os.path.join(os.path.dirname(__file__), "static", "logo2.png"),
        "static/logo2.png", "app/static/logo2.png",
    ]:
        if os.path.exists(p):
            return p
    return None


# ─────────────────────────────────────────────────────────────────────────────
# CORRECTIONS BUILDER  (shared between single and batch routes)
# ─────────────────────────────────────────────────────────────────────────────

def build_corrections(record, emr_refills: list, emr_vls: list) -> list:
    """
    Merge biodata + latest_refill_verification + drug_pickups + viral_loads
    into a single deduplicated list of correction dicts.

    Deduplication rules
    -------------------
    1. Batch-label fields are skipped when they arrive from
       latest_refill_verification; drug_pickups / viral_loads carry the
       richer batch-summary version.
    2. The first occurrence of any label wins; later duplicates from any
       source are silently dropped.
    """
    ed = record.enrollment_data or {}

    REFILL_MAP = {
        "refill_dates":      ("Refill — Pickup Dates",      "date"),
        "refill_durations":  ("Refill — Durations",         "duration"),
        "refill_regimens":   ("Refill — Regimens",          "regimen"),
        "refill_next_appts": ("Refill — Next Appointments", "next_appt"),
    }
    VL_MAP = {
        "vl_sample_dates": ("VL — Sample Dates", "sample_date"),
        "vl_results":      ("VL — Results",      "result"),
        "vl_result_dates": ("VL — Result Dates", "result_date"),
    }

    def _join(items, attr):
        return " | ".join(_esc(str(r.get(attr, "N/A"))) for r in items) if items else "N/A"

    results = []
    seen = set()

    def _push(label, emr_raw, item, src="other"):
        key = label.strip().lower()
        if src == "lrv" and key in _BATCH_LABELS:
            return          # skip — drug_pickups has the batch version
        if key in seen:
            return          # no duplicates
        seen.add(key)

        dt       = item.get("discrepancy_type") or ""
        care_raw = (item.get("care_card_value") or
                    item.get("carecard_value")  or
                    item.get("cc_value"))
        affected = item.get("affected_visits") or []
        original = item.get("original_emr_value") or item.get("original_value")

        if dt in _VISIT_DISC and care_raw:
            cc_val = str(care_raw)
        elif care_raw and str(care_raw).strip():
            cc_val = str(care_raw)
        elif dt in _VISIT_DISC:
            cc_val = f"{len(affected)} visit(s) flagged" if affected else "—"
        else:
            cc_val = emr_raw

        status, action, source, detail = get_status(
            item.get("match"), item.get("corrected_on"),
            dt, item.get("discrepancy_note"),
            original_emr_value=original, affected_visits=affected,
        )

        results.append({
            "field":    label,
            "emr":      _esc(emr_raw),
            "cc":       _esc(cc_val),
            "status":   status,
            "action":   action,
            "source":   source,
            "detail":   detail,
            "disc":     dt,
            "affected": affected,
        })

    for item in ed.get("biodata_verification", []):
        _push(item.get("label",""), _esc(str(item.get("emr_value","—"))), item, "bio")

    for item in ed.get("latest_refill_verification", []):
        _push(item.get("label",""), _esc(str(item.get("emr_value","—"))), item, "lrv")

    for dp in record.drug_pickups or []:
        fk = dp.get("field","")
        lbl, attr = REFILL_MAP.get(fk, (fk,""))
        emr_raw = _join(emr_refills, attr) if (attr and emr_refills) else _esc(str(dp.get("emr_summary","—")))
        dp2 = {**dp,
               "care_card_value":    dp.get("care_card_value") or dp.get("carecard_value") or dp.get("cc_value"),
               "original_emr_value": dp.get("original_emr_value") or dp.get("original_value"),
               "affected_visits":    dp.get("affected_visits") or []}
        _push(lbl, emr_raw, dp2, "dp")

    for vl in record.viral_loads or []:
        fk = vl.get("field","")
        lbl, attr = VL_MAP.get(fk, (fk,""))
        emr_raw = _join(emr_vls, attr) if (attr and emr_vls) else _esc(str(vl.get("emr_summary","—")))
        vl2 = {**vl,
               "care_card_value":    vl.get("care_card_value") or vl.get("carecard_value") or vl.get("cc_value"),
               "original_emr_value": vl.get("original_emr_value") or vl.get("original_value"),
               "affected_visits":    vl.get("affected_visits") or []}
        _push(lbl, emr_raw, vl2, "vl")

    return results


def compute_stats(corrections: list) -> dict:
    total    = len(corrections) or 1
    matched  = sum(1 for c in corrections if c["status"] == "MATCH")
    mismatch = total - matched
    c_emr    = sum(1 for c in corrections if c["action"] == "EMR Updated")
    c_cc     = sum(1 for c in corrections if c["action"] == "Care Card Noted")
    c_both   = sum(1 for c in corrections if c["action"] == "Both Updated")
    resolved = mismatch
    rate     = round(mismatch / total * 100, 1)
    disc_bd  = {k: sum(1 for c in corrections if c.get("disc")==k) for k in DISC_LABELS}
    return dict(total=total, matched=matched, mismatch=mismatch,
                c_emr=c_emr, c_cc=c_cc, c_both=c_both,
                resolved=resolved, rate=rate, disc_bd=disc_bd)


# ─────────────────────────────────────────────────────────────────────────────
# PDF RENDERER
# ─────────────────────────────────────────────────────────────────────────────

def build_record_elements(record, patient, corrections, stats,
                           art_status, veri_outcome, page_idx):
    from reportlab.platypus import (
        Paragraph, Spacer, Table, TableStyle,
        HRFlowable, PageBreak, KeepTogether,
    )
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.graphics.shapes import Drawing, Rect, String

    PAGE_W, _ = A4
    M = 22
    W = PAGE_W - 2*M

    NAV  = "#0C2461"; BLUE = "#1D4ED8"; TEAL = "#0891B2"
    GRN  = "#059669"; RED  = "#DC2626"; AMB  = "#D97706"
    SLT  = "#475569"; MUT  = "#94A3B8"; BG   = "#F8FAFC"; LINE = "#E2E8F0"

    cNAV  = colors.HexColor(NAV);  cTEAL = colors.HexColor(TEAL)
    cGRN  = colors.HexColor(GRN);  cRED  = colors.HexColor(RED)
    cSLT  = colors.HexColor(SLT);  cMUT  = colors.HexColor(MUT)
    cBG   = colors.HexColor(BG);   cLINE = colors.HexColor(LINE)

    def PS(n, **k): return ParagraphStyle(n, **k)
    S = {
        "h2"  : PS("h2",  fontSize=7,   fontName="Helvetica-Bold", textColor=cNAV,
                    spaceBefore=5, spaceAfter=2, leading=9),
        "lbl" : PS("lbl", fontSize=6.5, fontName="Helvetica-Bold", textColor=cNAV, leading=8),
        "val" : PS("val", fontSize=6.5, textColor=cSLT, leading=8),
        "tc"  : PS("tc",  fontSize=5.8, textColor=cNAV, leading=7.2, wordWrap="LTR"),
        "ok"  : PS("ok",  fontSize=6,   fontName="Helvetica-Bold", textColor=cGRN,
                    alignment=TA_CENTER, leading=7.5),
        "err" : PS("err", fontSize=6,   fontName="Helvetica-Bold", textColor=cRED,
                    alignment=TA_CENTER, leading=7.5),
        "foot": PS("foot",fontSize=5.5, textColor=cMUT, alignment=TA_CENTER, leading=6.5),
        "decl": PS("decl",fontSize=6.5, textColor=cSLT, leading=8.8),
        "sig" : PS("sig", fontSize=6.5, fontName="Helvetica-Bold",
                    alignment=TA_CENTER, textColor=cNAV, leading=9),
        "rid" : PS("rid", fontSize=6.5, textColor=cMUT, alignment=TA_RIGHT, leading=8),
        "kn"  : PS("kn",  fontSize=11,  fontName="Helvetica-Bold",
                    alignment=TA_CENTER, leading=13),
        "kl"  : PS("kl",  fontSize=5.2, textColor=cSLT, alignment=TA_CENTER, leading=6.5),
    }

    hn       = record.hospital_number or "N/A"
    safe_hn  = hn.replace("/","-").replace("\\","-")
    assessor = record.verified_by or record.created_by or "N/A"
    rev_date = str(record.verified_at)[:10] if record.verified_at else "N/A"
    veri_src = ART_SOURCE_MAP.get(art_status, "Phone Call / Direct Contact")

    els = []
    if page_idx > 0:
        els.append(PageBreak())

    # 1. MASTHEAD
    logo = _find_logo()
    if logo:
        from reportlab.platypus import Image
        img = Image(logo, width=300, height=30); img.hAlign = "CENTER"
        els.append(img)
    else:
        d = Drawing(W, 50)
        d.add(Rect(0, 0, W, 50, fillColor=cNAV, strokeWidth=0))
        d.add(Rect(0, 0, 4, 50, fillColor=cTEAL, strokeWidth=0))
        d.add(String(12, 30, "MedDQA", fontName="Helvetica-Bold", fontSize=17,
                     fillColor=colors.white))
        d.add(String(12, 16, "CLINICAL DATA QUALITY ASSURANCE",
                     fontName="Helvetica", fontSize=5.8,
                     fillColor=colors.HexColor("#7BB3F0")))
        d.add(String(12, 7, "HIV Care & Treatment Programme",
                     fontName="Helvetica", fontSize=5,
                     fillColor=colors.HexColor("#5B8DB8")))
        d.add(String(W-2, 32, "DQA VERIFICATION REPORT",
                     fontName="Helvetica-Bold", fontSize=10, fillColor=colors.white))
        d.add(String(W-2, 19, "Care Card & EMR Reconciliation",
                     fontName="Helvetica", fontSize=6.5,
                     fillColor=colors.HexColor("#7BB3F0")))
        d.add(String(W-2, 9, "Confidential — Authorised Use Only",
                     fontName="Helvetica", fontSize=5,
                     fillColor=colors.HexColor("#5B8DB8")))
        els.append(d)

    els.append(Spacer(1, 3))
    rid = Table([[
        Paragraph(f"<b>Report ID:</b>  DQA-{datetime.now().strftime('%Y%m%d')}-{safe_hn[-8:].upper()}", S["lbl"]),
        Paragraph(f"<b>Generated:</b>  {datetime.now().strftime('%d %B %Y   %I:%M %p')}", S["rid"]),
    ]], colWidths=[W*0.55, W*0.45])
    rid.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE"),
                              ("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2),
                              ("LINEBELOW",(0,0),(-1,0),0.4,cLINE)]))
    els.append(rid); els.append(Spacer(1, 5))

    # 2. PATIENT + ASSESSOR
    els.append(Paragraph("PATIENT &amp; REVIEW INFORMATION", S["h2"]))

    def kv(rows, lw=110):
        data = [[Paragraph(_esc(r[0]), S["lbl"]),
                 Paragraph(_esc(r[1]) if r[1] else "N/A", S["val"])] for r in rows]
        t = Table(data, colWidths=[lw, W/2-lw-8])
        t.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(0,-1),cBG),("GRID",(0,0),(-1,-1),0.3,cLINE),
            ("TOPPADDING",(0,0),(-1,-1),2.5),("BOTTOMPADDING",(0,0),(-1,-1),2.5),
            ("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),4),
            ("VALIGN",(0,0),(-1,-1),"TOP"),
        ]))
        return t

    info = Table([[
        kv([("Hospital Number",        patient.get("hospital_no",hn)),
            ("Patient Name",           patient.get("patient_name","N/A")),
            ("Date of Birth",          patient.get("dob","N/A")),
            ("Sex",                    patient.get("sex","N/A")),
            ("Facility",               patient.get("facility","N/A")),
            ("State",                  patient.get("state","N/A")),
            ("ART Start Date",         patient.get("art_start_date","N/A")),
            ("Current ART Status",     art_status),
            ("ROC Verification",       veri_outcome or "N/A"),
            ("Source of Verification", veri_src)], 115),
        kv([("Assessor Name",   assessor),
            ("Role / Position", "DQA Officer"),
            ("Review Date",     rev_date),
            ("Review Status",   "Completed"),
            ("Review Type",     "Care Card & EMR Reconciliation")], 105),
    ]], colWidths=[W/2-3, W/2-3])
    info.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),
                               ("LEFTPADDING",(0,0),(-1,-1),0),
                               ("RIGHTPADDING",(0,0),(0,-1),5),
                               ("LEFTPADDING",(1,0),(1,-1),5)]))
    els.append(info); els.append(Spacer(1, 6))

    # 3. KPI STRIP
    els.append(Paragraph("REVIEW SUMMARY", S["h2"]))
    st = stats
    rate_bg  = "#DCFCE7" if st["rate"]>=90 else "#FEF3C7" if st["rate"]>=70 else "#FEE2E2"
    rate_col = GRN       if st["rate"]>=90 else AMB        if st["rate"]>=70 else RED
    all_res  = st["mismatch"] > 0 and st["resolved"] >= st["mismatch"]

    def kpi(val, lbl, col):
        return Table([
            [Paragraph(f'<font color="{col}"><b>{_esc(str(val))}</b></font>', S["kn"])],
            [Paragraph(_esc(lbl), S["kl"])],
        ], colWidths=[W/8])

    kpi_strip = Table([[
        kpi(st["total"],                         "Total Reviewed", NAV),
        kpi(st["matched"],                        "Matched",        GRN),
        kpi(st["mismatch"],                       "Discrepancies",  RED if st["mismatch"] else GRN),
        kpi(f"{st['resolved']}/{st['mismatch']}", "Total Resolved", GRN if all_res else BLUE),
        kpi(st["c_emr"],                          "EMR Fixed",      BLUE),
        kpi(st["c_cc"],                           "CC Noted",       AMB),
        kpi(st["c_both"],                         "Both Fixed",     TEAL),
        kpi(f"{st['rate']}%",                     "Error rate",     rate_col),
    ]], colWidths=[W/8]*8)
    kpi_strip.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1),colors.HexColor(rate_bg)),
        ("BOX",(0,0),(-1,-1),0.5,cLINE),("LINEAFTER",(0,0),(6,0),0.4,cLINE),
        ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
        ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ]))
    els.append(kpi_strip); els.append(Spacer(1, 6))

    # 4. CORRECTIONS TABLE
    els.append(Paragraph("DISCREPANCIES &amp; CORRECTIONS", S["h2"]))
    C1,C2,C3,C4 = 90, 135, 135, 44
    C5 = W - C1 - C2 - C3 - C4
    rows = [["Field / Category", "EMR Value", "Care Card Value", "Status", "Details"]]

    for c in corrections:
        is_match = c["status"] == "MATCH"
        detail_parts = []
        if not is_match:
            if c["action"] not in ("—",""):
                detail_parts.append(f'<b>{_esc(c["action"])}</b>')
            disc_lbl = DISC_LABELS.get(c["disc"],"")
            if disc_lbl:
                detail_parts.append(f'<font color="{BLUE}">[{_esc(disc_lbl)}]</font>')
            if c["detail"]:
                for part in c["detail"].split(" | "):
                    part = part.strip()
                    if part and part.lower() != disc_lbl.lower():
                        detail_parts.append(f'<font color="{SLT}">{_esc(part)}</font>')
        detail_html = "<br/>".join(detail_parts) if detail_parts else "—"

        rows.append([
            Paragraph(_esc(c["field"]), S["tc"]),
            Paragraph(c["emr"],         S["tc"]),
            Paragraph(c["cc"],          S["tc"]),
            Paragraph(c["status"],      S["ok"] if is_match else S["err"]),
            Paragraph(detail_html,      S["tc"]),
        ])

    ctbl = Table(rows, repeatRows=1, colWidths=[C1,C2,C3,C4,C5])
    cst = TableStyle([
        ("BACKGROUND",(0,0),(-1,0),cNAV),("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,0),6.5),
        ("ALIGN",(0,0),(-1,0),"CENTER"),
        ("TOPPADDING",(0,0),(-1,0),4),("BOTTOMPADDING",(0,0),(-1,0),4),
        ("GRID",(0,0),(-1,-1),0.3,cLINE),
        ("TOPPADDING",(0,1),(-1,-1),2.5),("BOTTOMPADDING",(0,1),(-1,-1),2.5),
        ("LEFTPADDING",(0,0),(-1,-1),4),("RIGHTPADDING",(0,0),(-1,-1),4),
        ("VALIGN",(0,0),(-1,-1),"TOP"),("ALIGN",(3,0),(3,-1),"CENTER"),
    ])
    for i, c in enumerate(corrections, 1):
        if c["status"] == "MATCH":
            cst.add("BACKGROUND",(0,i),(2,i),colors.HexColor("#F0FDF4"))
            cst.add("BACKGROUND",(4,i),(4,i),colors.HexColor("#F0FDF4"))
            cst.add("BACKGROUND",(3,i),(3,i),colors.HexColor("#DCFCE7"))
        else:
            cst.add("BACKGROUND",(0,i),(2,i),colors.HexColor("#FFF7F7"))
            cst.add("BACKGROUND",(4,i),(4,i),colors.HexColor("#FFF7F7"))
            cst.add("BACKGROUND",(3,i),(3,i),colors.HexColor("#FEE2E2"))
    ctbl.setStyle(cst)
    els.append(ctbl); els.append(Spacer(1, 6))

    # 5. FINDINGS SUMMARY + DECLARATION
    els.append(Paragraph("FINDINGS SUMMARY &amp; ASSESSOR DECLARATION", S["h2"]))

    dt_rows = [[Paragraph("<b>Discrepancy Type</b>",S["lbl"]),Paragraph("<b>#</b>",S["lbl"])]]
    has_disc = False
    for k, lbl in DISC_LABELS.items():
        cnt = st["disc_bd"].get(k,0)
        if cnt:
            dt_rows.append([Paragraph(_esc(lbl),S["val"]),Paragraph(str(cnt),S["val"])])
            has_disc = True
    if not has_disc:
        dt_rows.append([Paragraph("No discrepancies",S["val"]),Paragraph("0",S["val"])])

    dt = Table(dt_rows, colWidths=[132, 22])
    dt.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),cNAV),("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,0),6.5),
        ("BACKGROUND",(0,1),(0,-1),cBG),("GRID",(0,0),(-1,-1),0.3,cLINE),
        ("TOPPADDING",(0,0),(-1,-1),2.5),("BOTTOMPADDING",(0,0),(-1,-1),2.5),
        ("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),4),
        ("VALIGN",(0,0),(-1,-1),"TOP"),("ALIGN",(1,0),(1,-1),"CENTER"),
    ]))

    decl = Paragraph(
        "I confirm that I have reviewed the care card and EMR records for the above "
        "patient and documented all identified discrepancies. Corrections were made "
        "based on available source documents during this DQA exercise.<br/><br/>"
        f"<b>Verified by:</b>  {_esc(assessor)}<br/>"
        "<b>Role:</b>  DQA Officer<br/>"
        f"<b>Date:</b>  {_esc(rev_date)}", S["decl"])

    sd = Table([[dt, decl]], colWidths=[158, W-158])
    sd.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),
                             ("LEFTPADDING",(0,0),(-1,-1),0),
                             ("RIGHTPADDING",(0,0),(0,-1),8)]))
    els.append(KeepTogether([sd])); els.append(Spacer(1, 10))

    # 6. SIGNATURES
    els.append(HRFlowable(width="100%", thickness=0.5, color=cLINE, spaceAfter=5))
    els.append(Paragraph("SIGNATURES", S["h2"]))

    sig_tbl = Table([[
        Paragraph(f"<b>Assessor / DQA Officer</b><br/><br/><br/>"
                  "________________________________<br/>"
                  f"<font size='5.5'>{_esc(assessor)}<br/>Date: {_esc(rev_date)}</font>",
                  S["sig"]),
        Paragraph("<b>Supervisor / Team Lead</b><br/><br/><br/>"
                  "________________________________<br/>"
                  "<font size='5.5'>Name: ________________________<br/>"
                  "Date: ________________________</font>", S["sig"]),
        Paragraph("<b>Data Manager/M&E</b><br/><br/><br/>"
                  "________________________________<br/>"
                  "<font size='5.5'>Name: ________________________<br/>"
                  "Date: ________________________</font>", S["sig"]),
    ]], colWidths=[W/3, W/3, W/3])
    sig_tbl.setStyle(TableStyle([
        ("ALIGN",(0,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"TOP"),
        ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("LINEAFTER",(0,0),(1,0),0.4,cLINE),
    ]))
    els.append(sig_tbl); els.append(Spacer(1, 4))

    # 7. FOOTER
    els.append(HRFlowable(width="100%", thickness=1, color=cTEAL, spaceAfter=2))
    els.append(Paragraph(
        "<b>MedDQA</b> Clinical Data Quality Assurance System  |  "
        "System-generated &amp; audit-tracked  |  Confidential", S["foot"]))

    return els


# ─────────────────────────────────────────────────────────────────────────────
# SINGLE-PATIENT ROUTE
# ─────────────────────────────────────────────────────────────────────────────

async def generate_dqa_verification_pdf(hospital_number: str, request: Request):
    """GET /api/reports/dqa-verification/{hospital_number}"""
    from reportlab.platypus import SimpleDocTemplate
    from reportlab.lib.pagesizes import A4
    from sqlalchemy import text
    from sqlalchemy.orm import Session

    try:
        from app.database import dqa_engine, emr_engine
        from app.models.dqa_models import CareCardRecord

        hospital_number = unquote(hospital_number)
        logger.info(f"Single DQA PDF: {hospital_number}")

        with Session(dqa_engine) as s:
            record = (s.query(CareCardRecord)
                       .filter(CareCardRecord.hospital_number==hospital_number,
                               CareCardRecord.is_verified==True)
                       .order_by(CareCardRecord.verified_at.desc()).first())
        if not record:
            return JSONResponse(status_code=404,
                                content={"success":False,"detail":"No verified record found"})

        patient = {"hospital_no":hospital_number,"patient_name":"N/A",
                   "dob":"N/A","sex":"N/A","facility":"N/A",
                   "state":"N/A","art_start_date":"N/A"}
        person_uuid = None
        try:
            with emr_engine.connect() as conn:
                row = conn.execute(text("""
                    SELECT p.first_name, p.surname, p.date_of_birth,
                           INITCAP(p.sex), p.uuid
                    FROM patient_person p
                    WHERE p.hospital_number=:hn AND p.archived=0 LIMIT 1
                """), {"hn":hospital_number}).fetchone()
                if row:
                    patient["patient_name"] = f"{row[0] or ''} {row[1] or ''}".strip() or "N/A"
                    patient["dob"]  = str(row[2])[:10] if row[2] else "N/A"
                    patient["sex"]  = row[3] or "N/A"
                    person_uuid     = row[4]
                    e = conn.execute(text("""
                        SELECT h.date_of_registration, f.name, COALESCE(fs.name,'N/A')
                        FROM hiv_enrollment h
                        INNER JOIN base_organisation_unit f ON f.id=h.facility_id
                        LEFT  JOIN base_organisation_unit fl ON fl.id=f.parent_organisation_unit_id
                        LEFT  JOIN base_organisation_unit fs ON fs.id=fl.parent_organisation_unit_id
                        WHERE h.person_uuid=:u AND h.archived=0 LIMIT 1
                    """), {"u":person_uuid}).fetchone()
                    if e:
                        patient["art_start_date"] = str(e[0])[:10] if e[0] else "N/A"
                        patient["facility"] = e[1] or "N/A"
                        patient["state"]    = e[2] or "N/A"
        except Exception as exc:
            logger.warning(f"Demographics: {exc}")

        art_status = "Active"; veri_outcome = ""
        if person_uuid:
            try:
                with emr_engine.connect() as conn:
                    row = conn.execute(text("""
                        SELECT CASE
                            WHEN hst.hiv_status ILIKE '%Died%' OR hst.hiv_status ILIKE '%Death%' THEN 'Died'
                            WHEN hst.hiv_status ILIKE '%out%'     THEN 'Transferred Out'
                            WHEN hst.hiv_status ILIKE '%stop%' OR hst.hiv_status ILIKE '%Invalid%' THEN 'Stopped Treatment'
                            WHEN hst.hiv_status ILIKE '%IIT%'     THEN 'IIT'
                            ELSE 'Active' END
                        FROM patient_person p
                        LEFT JOIN LATERAL (SELECT hiv_status FROM hiv_status_tracker
                            WHERE person_id=p.uuid AND archived=0
                            ORDER BY status_date DESC LIMIT 1) hst ON TRUE
                        WHERE p.uuid=:u AND p.archived=0 LIMIT 1
                    """), {"u":person_uuid}).fetchone()
                    if row: art_status = row[0] or "Active"
                    row = conn.execute(text("""
                        SELECT data->'attempt'->0->>'outcome'
                        FROM hiv_observation
                        WHERE type='Client Verification' AND person_uuid=:u AND archived=0
                        ORDER BY CAST(data->'attempt'->0->>'dateOfAttempt' AS DATE) DESC LIMIT 1
                    """), {"u":person_uuid}).fetchone()
                    if row and row[0]: veri_outcome = row[0]
            except Exception as exc:
                logger.warning(f"ART/ROC: {exc}")

        emr_refills = []; emr_vls = []
        if person_uuid:
            try:
                with emr_engine.connect() as conn:
                    emr_refills = [
                        {"date":str(r[0])[:10] if r[0] else "N/A",
                         "duration":f"{int(r[1] or 0)} days",
                         "regimen":r[2] or "N/A",
                         "next_appt":str(r[3])[:10] if r[3] else "N/A"}
                        for r in conn.execute(text("""
                            SELECT hap.visit_date,
                                   COALESCE((elem.value->>'duration')::INTEGER,hap.refill_period,0),
                                   elem.value->>'regimenName', hap.next_appointment
                            FROM hiv_art_pharmacy hap
                            CROSS JOIN LATERAL jsonb_array_elements(hap.extra->'regimens')
                                WITH ORDINALITY AS elem(value,ordinality)
                            WHERE hap.person_uuid=:u AND hap.archived=0 AND elem.ordinality=1
                            ORDER BY hap.visit_date ASC
                        """), {"u":person_uuid}).fetchall()
                    ]
                    emr_vls = [
                        {"sample_date":str(v[0])[:10] if v[0] else "N/A",
                         "result":v[1] or "N/A",
                         "result_date":str(v[2])[:10] if v[2] else "N/A"}
                        for v in conn.execute(text("""
                            SELECT CAST(ls.date_sample_collected AS DATE), sm.result_reported,
                                   CAST(sm.date_result_reported AS DATE)
                            FROM laboratory_result sm
                            INNER JOIN laboratory_test lt ON lt.id=sm.test_id
                            INNER JOIN laboratory_sample ls ON ls.test_id=lt.id
                            WHERE lt.lab_test_id=16 AND sm.patient_uuid=:u
                              AND sm.result_reported IS NOT NULL AND sm.archived=0
                            ORDER BY ls.date_sample_collected ASC
                        """), {"u":person_uuid}).fetchall()
                    ]
            except Exception as exc:
                logger.warning(f"Refill/VL: {exc}")

        corrections = build_corrections(record, emr_refills, emr_vls)
        stats       = compute_stats(corrections)

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                rightMargin=22, leftMargin=22,
                                topMargin=10,   bottomMargin=22)
        doc.build(build_record_elements(record, patient, corrections,
                                         stats, art_status, veri_outcome, 0),
                  canvasmaker=_make_page_number_canvas)
        buf.seek(0)
        safe = hospital_number.replace("/","_").replace("\\","_")
        return StreamingResponse(buf, media_type="application/pdf",
            headers={"Content-Disposition":f'inline; filename="DQA_{safe}.pdf"'})

    except Exception as exc:
        logger.error(f"Single PDF: {exc}", exc_info=True)
        return JSONResponse(status_code=500, content={"success":False,"detail":str(exc)})
