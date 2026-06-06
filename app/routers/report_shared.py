"""
report_shared.py  —  MedDQA PDF layout engine
────────────────────────────────────────────────────────────────────────
All PDF rendering for single and batch DQA verification reports.
Layout: 1 page per patient (2 max for patients with large histories).
────────────────────────────────────────────────────────────────────────
"""

import io, os, logging
from datetime import datetime

logger = logging.getLogger(__name__)

# ── Discrepancy label map ────────────────────────────────────────────

DISC_LABELS = {
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

VISIT_DISC = {
    "missing_emr", "missing_carecard", "not_documented",
    "incomplete_records", "lab_pending", "unavailable", "unable_verify",
}


# ── HTML escaping (critical — EMR values contain < > & e.g. "<LDL") ─

def _esc(text):
    """Escape a raw string for safe use inside a ReportLab Paragraph."""
    if not text:
        return "—"
    return (str(text)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))


# ── Status resolver ──────────────────────────────────────────────────

def get_status(is_match, corrected_on, discrepancy_type=None,
               discrepancy_note=None, original_emr_value=None,
               care_card_value=None, affected_visits=None):
    """Return (status, action, source, reason) for one reviewed field."""
    if is_match:
        return "MATCH", "—", "—", ""

    co = corrected_on or ""
    if   co == "emr":       action, source = "EMR Updated",     "Care Card"
    elif co == "care_card": action, source = "Care Card Noted",  "EMR"
    elif co == "both":      action, source = "Both Updated",     "Verified Source"
    else:                   action, source = "—", "—"

    dt   = discrepancy_type or ""
    note = discrepancy_note or ""
    parts = []

    # Disc label (shown once — not repeated in action)
    if dt:
        parts.append(DISC_LABELS.get(dt, dt))

    # Affected visits
    if affected_visits and isinstance(affected_visits, list) and affected_visits:
        parts.append("Visits: " + ", ".join(str(v) for v in affected_visits))

    # Original value (genuinely new information)
    if original_emr_value and co in ("emr", "both"):
        parts.append(f"Was: {original_emr_value}")

    # Note
    if note:
        parts.append(f"Note: {note}")

    return "MISMATCH", action, source, " | ".join(parts)


# ── Page-stamp canvas ────────────────────────────────────────────────

def make_page_number_canvas(buffer, **kwargs):
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4

    class StampedCanvas(rl_canvas.Canvas):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            n = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self._stamp(n)
                super().showPage()
            super().save()

        def _stamp(self, total):
            pw, ph = A4
            # Teal top accent
            self.setStrokeColorRGB(0.035, 0.569, 0.698)
            self.setLineWidth(2.5)
            self.line(0, ph - 2, pw, ph - 2)
            # Footer bar
            self.setFillColorRGB(0.973, 0.976, 0.988)
            self.rect(0, 0, pw, 18, fill=1, stroke=0)
            self.setFillColorRGB(0.58, 0.64, 0.69)
            self.setFont("Helvetica", 5.5)
            self.drawString(25, 6,
                "CONFIDENTIAL — MedDQA Clinical Data Quality Assurance System")
            self.drawRightString(pw - 25, 6,
                f"Page {self._pageNumber} of {total}")

    return StampedCanvas(buffer, **kwargs)

_make_page_number_canvas = make_page_number_canvas   # backward-compat alias


# ── Logo resolver ────────────────────────────────────────────────────

def _find_logo():
    for p in [
        os.path.join(os.path.dirname(__file__), "..", "static", "logo2.png"),
        os.path.join(os.path.dirname(__file__), "static", "logo2.png"),
        "static/logo2.png", "app/static/logo2.png",
    ]:
        if os.path.exists(p):
            return p
    return None


# ── Main per-record renderer ─────────────────────────────────────────

def render_record_elements(record, patient: dict, ref_list: list,
                            vl_list: list, art_status: str,
                            veri_outcome: str, page_idx: int) -> list:
    """
    Return a list of ReportLab flowables for one DQA record.
    Call once per record; pass page_idx=0 for single reports,
    0/1/2/... for batch (inserts PageBreak before each page after 0).
    """
    from reportlab.platypus import (
        Paragraph, Spacer, Table, TableStyle,
        HRFlowable, PageBreak, KeepTogether,
    )
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.graphics.shapes import Drawing, Rect, String

    PAGE_W, PAGE_H = A4
    M = 25                  # ~8.8 mm side margins
    W = PAGE_W - 2 * M      # usable width ≈ 545 pt

    # ── Colours ──────────────────────────────────────────────────────
    NAV  = "#0C2461"        # dark navy  — headers, masthead
    BLUE = "#1D4ED8"        # primary blue
    TEAL = "#0891B2"        # accent
    GRN  = "#059669"        # success / match
    RED  = "#DC2626"        # error / mismatch
    AMB  = "#D97706"        # warning / amber
    SLT  = "#475569"        # secondary text (slate)
    MUT  = "#94A3B8"        # muted / tertiary
    BG   = "#F8FAFC"        # cell background
    LINE = "#E2E8F0"        # grid / border

    cNAV  = colors.HexColor(NAV)
    cTEAL = colors.HexColor(TEAL)
    cGRN  = colors.HexColor(GRN)
    cRED  = colors.HexColor(RED)
    cAMB  = colors.HexColor(AMB)
    cSLT  = colors.HexColor(SLT)
    cMUT  = colors.HexColor(MUT)
    cBG   = colors.HexColor(BG)
    cLINE = colors.HexColor(LINE)

    def PS(n, **k): return ParagraphStyle(n, **k)

    S = {
        "h2"  : PS("h2",  fontSize=7,   leading=8.5, fontName="Helvetica-Bold",
                    textColor=cNAV, spaceBefore=5, spaceAfter=2),
        "lbl" : PS("lbl", fontSize=6.5, leading=8,   fontName="Helvetica-Bold",
                    textColor=cNAV),
        "val" : PS("val", fontSize=6.5, leading=8,   textColor=cSLT),
        "tc"  : PS("tc",  fontSize=5.8, leading=7.2, textColor=cNAV,
                    wordWrap="LTR"),
        "ok"  : PS("ok",  fontSize=6,   leading=7.5, fontName="Helvetica-Bold",
                    textColor=cGRN,  alignment=TA_CENTER),
        "err" : PS("err", fontSize=6,   leading=7.5, fontName="Helvetica-Bold",
                    textColor=cRED,  alignment=TA_CENTER),
        "foot": PS("foot",fontSize=5.5, leading=6.5, textColor=cMUT,
                    alignment=TA_CENTER),
        "decl": PS("decl",fontSize=6.5, leading=8.8, textColor=cSLT),
        "sig" : PS("sig", fontSize=6.5, leading=9,   fontName="Helvetica-Bold",
                    alignment=TA_CENTER, textColor=cNAV),
        "rid" : PS("rid", fontSize=6.5, leading=8,   textColor=cMUT,
                    alignment=TA_RIGHT),
        "kn"  : PS("kn",  fontSize=12,  leading=14,  fontName="Helvetica-Bold",
                    alignment=TA_CENTER),
        "kl"  : PS("kl",  fontSize=5.5, leading=7,   textColor=cSLT,
                    alignment=TA_CENTER),
    }

    # ── Helpers ───────────────────────────────────────────────────────

    def kv_block(rows, lw=108):
        """Two-column key/value info table."""
        data = [
            [Paragraph(_esc(r[0]), S["lbl"]),
             Paragraph(_esc(r[1]) if r[1] else "N/A", S["val"])]
            for r in rows
        ]
        t = Table(data, colWidths=[lw, W / 2 - lw - 8])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(0,-1), cBG),
            ("GRID",          (0,0),(-1,-1), 0.3, cLINE),
            ("TOPPADDING",    (0,0),(-1,-1), 2.5),
            ("BOTTOMPADDING", (0,0),(-1,-1), 2.5),
            ("LEFTPADDING",   (0,0),(-1,-1), 5),
            ("RIGHTPADDING",  (0,0),(-1,-1), 4),
            ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ]))
        return t

    def kpi_cell(val, lbl, col, cell_w=None):
        cw = cell_w or (W / 8)
        return Table([
            [Paragraph(f'<font color="{col}"><b>{_esc(val)}</b></font>', S["kn"])],
            [Paragraph(_esc(lbl), S["kl"])],
        ], colWidths=[cw])

    def _join(items, attr):
        """Join EMR list values with separator, html-escaped."""
        return "  |  ".join(
            _esc(str(r.get(attr, "N/A"))) for r in items
        ) if items else "N/A"

    # ── Build corrections list ────────────────────────────────────────
    ed = record.enrollment_data or {}
    corrections = []
    _seen_fields = set()   # deduplicate by normalised label

    refill_map = {
        "refill_dates":      ("Pickup Dates",      "date"),
        "refill_durations":  ("Refill Durations",  "duration"),
        "refill_regimens":   ("Regimens",          "regimen"),
        "refill_next_appts": ("Next Appointments", "next_appt"),
    }
    vl_map = {
        "vl_sample_dates": ("VL Sample Dates", "sample_date"),
        "vl_results":      ("VL Results",      "result"),
        "vl_result_dates": ("VL Result Dates", "result_date"),
    }

    # Batch field labels — when we encounter these from latest_refill_verification
    # skip them because drug_pickups/viral_loads will provide the richer batch version
    _batch_labels = {
        "Refill Duration", "Refill Durations", "Regimen", "Regimens",
        "Pickup Date", "Pickup Dates", "Next Appointment", "Next Appointments",
        "VL Sample Date", "VL Sample Dates", "VL Result", "VL Results",
        "VL Result Date", "VL Result Dates",
    }

    def _push(label, emr_raw, item, source_type="other"):
        key = label.strip().lower()

        # Skip if this label came from latest_refill_verification but a batch
        # version will be (or already was) added from drug_pickups/viral_loads
        if source_type == "latest_refill":
            if label in _batch_labels:
                return

        # Skip exact duplicates (same label already added)
        if key in _seen_fields:
            return
        _seen_fields.add(key)

        dt       = item.get("discrepancy_type") or ""
        care_raw = (item.get("care_card_value") or
                    item.get("carecard_value")  or
                    item.get("cc_value"))
        affected = item.get("affected_visits") or []
        original = (item.get("original_emr_value") or
                    item.get("original_value"))

        if dt in VISIT_DISC and care_raw:
            cc_val = str(care_raw)
        elif care_raw and str(care_raw).strip():
            cc_val = str(care_raw)
        elif dt in VISIT_DISC:
            cc_val = (f"{len(affected)} visit(s) flagged"
                      if affected else "—")
        else:
            cc_val = emr_raw

        status, action, source, reason = get_status(
            item.get("match"), item.get("corrected_on"),
            dt, item.get("discrepancy_note"),
            original_emr_value=original,
            care_card_value=cc_val,
            affected_visits=affected,
        )
        corrections.append({
            "field":    label,
            "emr":      emr_raw,
            "cc":       cc_val,
            "status":   status,
            "action":   action,
            "reason":   reason,
            "disc":     dt,
            "affected": affected,
        })

    for item in ed.get("biodata_verification", []):
        _push(item.get("label",""), str(item.get("emr_value","—")), item,
              source_type="biodata")

    for item in ed.get("latest_refill_verification", []):
        _push(item.get("label",""), str(item.get("emr_value","—")), item,
              source_type="latest_refill")

    for dp in record.drug_pickups or []:
        fk = dp.get("field","")
        lbl, attr = refill_map.get(fk, (fk,""))
        emr_raw = (
            _join(ref_list, attr) if (attr and ref_list)
            else _esc(str(dp.get("emr_summary","—")))
        )
        dp2 = dict(dp)
        dp2.setdefault("care_card_value",
                       dp.get("carecard_value") or dp.get("cc_value"))
        dp2.setdefault("original_emr_value",
                       dp.get("original_emr_value") or dp.get("original_value"))
        dp2.setdefault("affected_visits", dp.get("affected_visits") or [])
        _push(lbl, emr_raw, dp2, source_type="drug_pickups")

    for vl in record.viral_loads or []:
        fk = vl.get("field","")
        lbl, attr = vl_map.get(fk, (fk,""))
        emr_raw = (
            _join(vl_list, attr) if (attr and vl_list)
            else _esc(str(vl.get("emr_summary","—")))
        )
        vl2 = dict(vl)
        vl2.setdefault("care_card_value",
                       vl.get("carecard_value") or vl.get("cc_value"))
        vl2.setdefault("original_emr_value",
                       vl.get("original_emr_value") or vl.get("original_value"))
        vl2.setdefault("affected_visits", vl.get("affected_visits") or [])
        _push(lbl, emr_raw, vl2, source_type="viral_loads")

    # ── Summary stats ─────────────────────────────────────────────────
    total    = len(corrections) or 1
    matched  = sum(1 for c in corrections if c["status"] == "MATCH")
    mismatch = total - matched
    c_emr    = sum(1 for c in corrections if c["action"] == "EMR Updated")
    c_cc     = sum(1 for c in corrections if c["action"] == "Care Card Noted")
    c_both   = sum(1 for c in corrections if c["action"] == "Both Updated")
    rate     = round(matched / total * 100, 1)
    rate_bg  = "#DCFCE7" if rate>=90 else "#FEF3C7" if rate>=70 else "#FEE2E2"
    rate_col = GRN       if rate>=90 else AMB        if rate>=70 else RED

    disc_bd = {k: sum(1 for c in corrections if c.get("disc")==k)
               for k in DISC_LABELS}

    hn            = record.hospital_number or "N/A"
    safe_hn       = hn.replace("/","-").replace("\\","-")
    assessor_name = record.verified_by or record.created_by or "N/A"
    review_date   = str(record.verified_at)[:10] if record.verified_at else "N/A"

    source_map = {
        "Died":              "Cross-Document Triangulation",
        "Transferred Out":   "Transfer Register / Phone Call",
        "Stopped Treatment": "Data Triangulation",
        "IIT":               "Treatment Support Contacted",
    }
    veri_source = source_map.get(art_status, "Phone Call / Direct Contact")

    # ════════════════════════════════════════════════════════════════════
    # BUILD FLOWABLES
    # ════════════════════════════════════════════════════════════════════
    elements = []

    if page_idx > 0:
        elements.append(PageBreak())

    # ── 1. MASTHEAD ───────────────────────────────────────────────────
    logo_path = _find_logo()
    if logo_path:
        from reportlab.platypus import Image
        img = Image(logo_path, width=W, height=52)
        img.hAlign = "CENTER"
        elements.append(img)
    else:
        mast = Drawing(W, 52)
        mast.add(Rect(0, 0, W,  52, fillColor=cNAV,              strokeWidth=0))
        mast.add(Rect(0, 0, 5,  52, fillColor=cTEAL,             strokeWidth=0))
        mast.add(String(14, 31, "MedDQA",
                        fontName="Helvetica-Bold", fontSize=18,
                        fillColor=colors.white))
        mast.add(String(14, 17, "CLINICAL DATA QUALITY ASSURANCE",
                        fontName="Helvetica", fontSize=6,
                        fillColor=colors.HexColor("#7BB3F0")))
        mast.add(String(14,  8, "HIV Care & Treatment Programme",
                        fontName="Helvetica", fontSize=5.5,
                        fillColor=colors.HexColor("#5B8DB8")))
        mast.add(String(W - 3, 34, "DQA VERIFICATION REPORT",
                        fontName="Helvetica-Bold", fontSize=11,
                        fillColor=colors.white))
        mast.add(String(W - 3, 21, "Care Card & EMR Reconciliation",
                        fontName="Helvetica", fontSize=7,
                        fillColor=colors.HexColor("#7BB3F0")))
        mast.add(String(W - 3, 10, "Confidential — Authorised Use Only",
                        fontName="Helvetica", fontSize=5.5,
                        fillColor=colors.HexColor("#5B8DB8")))
        elements.append(mast)

    elements.append(Spacer(1, 3))

    # Report ID / timestamp row
    rid_row = Table([[
        Paragraph(
            f"<b>Report ID:</b>  DQA-{datetime.now().strftime('%Y%m%d')}"
            f"-{safe_hn[-8:].upper()}", S["lbl"]),
        Paragraph(
            f"<b>Generated:</b>  {datetime.now().strftime('%d %B %Y   %I:%M %p')}",
            S["rid"]),
    ]], colWidths=[W * 0.55, W * 0.45])
    rid_row.setStyle(TableStyle([
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0),(-1,-1), 2),
        ("BOTTOMPADDING", (0,0),(-1,-1), 2),
        ("LINEBELOW",     (0,0),(-1,0),  0.4, cLINE),
    ]))
    elements.append(rid_row)
    elements.append(Spacer(1, 5))

    # ── 2. PATIENT + ASSESSOR ─────────────────────────────────────────
    elements.append(Paragraph("PATIENT &amp; REVIEW INFORMATION", S["h2"]))

    p_rows = [
        ("Hospital Number",        patient.get("hospital_no", hn)),
        ("Patient Name",           patient.get("patient_name", "N/A")),
        ("Date of Birth",          patient.get("dob", "N/A")),
        ("Sex",                    patient.get("sex", "N/A")),
        ("Facility",               patient.get("facility", "N/A")),
        ("State",                  patient.get("state", "N/A")),
        ("ART Start Date",         patient.get("art_start_date", "N/A")),
        ("Current ART Status",     art_status),
        ("ROC Verification",       veri_outcome or "N/A"),
        ("Source of Verification", veri_source),
    ]
    a_rows = [
        ("Assessor Name",   assessor_name),
        ("Role / Position", "DQA Officer"),
        ("Review Date",     review_date),
        ("Review Status",   "Completed"),
        ("Review Type",     "Care Card & EMR Reconciliation"),
    ]

    info_outer = Table(
        [[kv_block(p_rows, 115), kv_block(a_rows, 105)]],
        colWidths=[W / 2 - 3, W / 2 - 3],
    )
    info_outer.setStyle(TableStyle([
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(0,-1),  5),
        ("LEFTPADDING",  (1,0),(1,-1),  5),
    ]))
    elements.append(info_outer)
    elements.append(Spacer(1, 6))

    # ── 3. KPI STRIP ──────────────────────────────────────────────────
    elements.append(Paragraph("REVIEW SUMMARY", S["h2"]))

    c_total  = c_emr + c_cc + c_both   # total fields where a correction was recorded

    kpi_items = [
        (str(total),     "Total Reviewed",  NAV),
        (str(matched),   "Matched",         GRN),
        (str(mismatch),  "Discrepancies",   RED if mismatch else GRN),
        (str(c_total),   "Total Corrected", BLUE if c_total else GRN),
        (str(c_emr),     "EMR Fixed",       BLUE),
        (str(c_cc),      "CC Noted",        AMB),
        (str(c_both),    "Both Fixed",      TEAL),
        (f"{rate}%",     "Match Rate",      rate_col),
    ]
    kpi_strip = Table(
        [[kpi_cell(v, l, c) for v, l, c in kpi_items]],
        colWidths=[W / len(kpi_items)] * len(kpi_items),
    )
    kpi_strip.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), colors.HexColor(rate_bg)),
        ("BOX",           (0,0),(-1,-1), 0.5, cLINE),
        ("LINEAFTER",     (0,0),(5,0),   0.4, cLINE),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
        ("LEFTPADDING",   (0,0),(-1,-1), 0),
        ("RIGHTPADDING",  (0,0),(-1,-1), 0),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))
    elements.append(kpi_strip)
    elements.append(Spacer(1, 6))

    # ── 4. CORRECTIONS TABLE ──────────────────────────────────────────
    elements.append(Paragraph("DISCREPANCIES &amp; CORRECTIONS", S["h2"]))

    #  5 columns:  Field | EMR | Care Card | Status | Details
    #  Column widths sum to W
    C1, C2, C3, C4 = 90, 95, 95, 46
    C5 = W - C1 - C2 - C3 - C4
    COLS = [C1, C2, C3, C4, C5]

    tbl_data = [["Field / Category", "EMR Value", "Care Card Value",
                 "Status", "Details"]]

    for c in corrections:
        is_match   = c["status"] == "MATCH"
        disc_lbl   = DISC_LABELS.get(c["disc"], "") if c["disc"] else ""

        # ── Details cell ────────────────────────────────────────────
        # Rule: each piece of information appears EXACTLY ONCE.
        #   Line 1 (bold)  : action  — only if not a match and action is set
        #   Line 2 (blue)  : disc label — only if set and NOT already implied by action
        #   Line 3+        : reason parts — visits, original value, note
        #                    but SKIP any part that merely restates line 1 or 2
        is_match   = c["status"] == "MATCH"
        disc_lbl   = DISC_LABELS.get(c["disc"], "") if c["disc"] else ""
        detail_parts = []

        if not is_match:
            # Action line
            if c["action"] not in ("—", ""):
                detail_parts.append(f'<b>{_esc(c["action"])}</b>')

            # Disc label — skip if it's purely a restatement of the action
            action_lower = c["action"].lower()
            disc_already_in_action = (
                ("emr" in action_lower and "missing" in disc_lbl.lower() and "emr" in disc_lbl.lower()) or
                ("care card" in action_lower and "missing" in disc_lbl.lower() and "care card" in disc_lbl.lower())
            )
            if disc_lbl and not disc_already_in_action:
                detail_parts.append(
                    f'<font color="{BLUE}"><b>[{_esc(disc_lbl)}]</b></font>'
                )

            # Reason parts — each pipe-separated chunk; skip if redundant
            if c["reason"]:
                for part in c["reason"].split(" | "):
                    part = part.strip()
                    if not part:
                        continue
                    part_lower = part.lower()
                    # Skip if this part just restates the disc label or action
                    if disc_lbl and part_lower == disc_lbl.lower():
                        continue
                    if c["action"] != "—" and part_lower in c["action"].lower():
                        continue
                    detail_parts.append(
                        f'<font color="{SLT}">{_esc(part)}</font>'
                    )

        detail_html = "<br/>".join(detail_parts) if detail_parts else "—"

        tbl_data.append([
            Paragraph(_esc(c["field"]),   S["tc"]),
            Paragraph(_esc(c["emr"]),     S["tc"]),
            Paragraph(_esc(c["cc"]),      S["tc"]),
            Paragraph(c["status"],
                      S["ok"] if is_match else S["err"]),
            Paragraph(detail_html,        S["tc"]),
        ])

    corr_tbl = Table(tbl_data, repeatRows=1, colWidths=COLS)
    cst = TableStyle([
        # Header
        ("BACKGROUND",    (0,0),(-1,0),  cNAV),
        ("TEXTCOLOR",     (0,0),(-1,0),  colors.white),
        ("FONTNAME",      (0,0),(-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0,0),(-1,0),  6.5),
        ("ALIGN",         (0,0),(-1,0),  "CENTER"),
        ("TOPPADDING",    (0,0),(-1,0),  4),
        ("BOTTOMPADDING", (0,0),(-1,0),  4),
        # Body
        ("GRID",          (0,0),(-1,-1), 0.3, cLINE),
        ("TOPPADDING",    (0,1),(-1,-1), 2.5),
        ("BOTTOMPADDING", (0,1),(-1,-1), 2.5),
        ("LEFTPADDING",   (0,0),(-1,-1), 4),
        ("RIGHTPADDING",  (0,0),(-1,-1), 4),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("ALIGN",         (3,0),(3,-1),  "CENTER"),
    ])
    for i, c in enumerate(corrections, 1):
        if c["status"] == "MATCH":
            cst.add("BACKGROUND", (0,i),(2,i), colors.HexColor("#F0FDF4"))
            cst.add("BACKGROUND", (4,i),(4,i), colors.HexColor("#F0FDF4"))
            cst.add("BACKGROUND", (3,i),(3,i), colors.HexColor("#DCFCE7"))
        else:
            cst.add("BACKGROUND", (0,i),(2,i), colors.HexColor("#FFF7F7"))
            cst.add("BACKGROUND", (4,i),(4,i), colors.HexColor("#FFF7F7"))
            cst.add("BACKGROUND", (3,i),(3,i), colors.HexColor("#FEE2E2"))
    corr_tbl.setStyle(cst)
    elements.append(corr_tbl)
    elements.append(Spacer(1, 6))

    # ── 5. DISCREPANCY BREAKDOWN + DECLARATION ────────────────────────
    elements.append(Paragraph(
        "FINDINGS SUMMARY &amp; ASSESSOR DECLARATION", S["h2"]
    ))

    # Disc breakdown table
    dt_data = [[Paragraph("<b>Discrepancy Type</b>", S["lbl"]),
                Paragraph("<b>#</b>",  S["lbl"])]]
    has_any = False
    for k, lbl in DISC_LABELS.items():
        cnt = disc_bd.get(k, 0)
        if cnt:
            dt_data.append([Paragraph(_esc(lbl), S["val"]),
                             Paragraph(str(cnt),  S["val"])])
            has_any = True
    if not has_any:
        dt_data.append([Paragraph("No discrepancies found", S["val"]),
                         Paragraph("0", S["val"])])

    dt = Table(dt_data, colWidths=[132, 22])
    dt.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0),  cNAV),
        ("TEXTCOLOR",     (0,0),(-1,0),  colors.white),
        ("FONTNAME",      (0,0),(-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0,0),(-1,0),  6.5),
        ("BACKGROUND",    (0,1),(0,-1),  cBG),
        ("GRID",          (0,0),(-1,-1), 0.3, cLINE),
        ("TOPPADDING",    (0,0),(-1,-1), 2.5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 2.5),
        ("LEFTPADDING",   (0,0),(-1,-1), 5),
        ("RIGHTPADDING",  (0,0),(-1,-1), 4),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("ALIGN",         (1,0),(1,-1),  "CENTER"),
    ]))

    # Declaration text
    decl = Paragraph(
        "I confirm that I have reviewed the care card and EMR records for the "
        "above patient and documented all identified discrepancies. All corrections "
        "were made based on available source documents during this DQA exercise."
        "<br/><br/>"
        f"<b>Verified by:</b>  {_esc(assessor_name)}<br/>"
        "<b>Role:</b>  DQA Officer<br/>"
        f"<b>Date:</b>  {_esc(review_date)}",
        S["decl"],
    )

    summary_decl = Table(
        [[dt, decl]],
        colWidths=[158, W - 158],
    )
    summary_decl.setStyle(TableStyle([
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(0,-1),  8),
    ]))
    elements.append(KeepTogether([summary_decl]))
    elements.append(Spacer(1, 10))

    # ── 6. SIGNATURE BLOCK ────────────────────────────────────────────
    # Full-width, clearly separated at the very bottom of the content.
    elements.append(HRFlowable(
        width="100%", thickness=0.5,
        color=cLINE, spaceAfter=6,
    ))
    elements.append(Paragraph("SIGNATURES", S["h2"]))

    sig_data = [[
        Paragraph(
            "<b>Assessor / DQA Officer</b><br/><br/><br/>"
            "________________________________<br/>"
            f"<font size='6'>{_esc(assessor_name)}<br/>"
            f"Date: {_esc(review_date)}</font>",
            S["sig"],
        ),
        Paragraph(
            "<b>Supervisor / Team Lead</b><br/><br/><br/>"
            "________________________________<br/>"
            "<font size='6'>Name: ________________________<br/>"
            "Date: ________________________</font>",
            S["sig"],
        ),
        Paragraph(
            "<b>Data Manager</b><br/><br/><br/>"
            "________________________________<br/>"
            "<font size='6'>Name: ________________________<br/>"
            "Date: ________________________</font>",
            S["sig"],
        ),
    ]]
    sig_tbl = Table(sig_data, colWidths=[W / 3, W / 3, W / 3])
    sig_tbl.setStyle(TableStyle([
        ("ALIGN",         (0,0),(-1,-1), "CENTER"),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 6),
        ("LINEAFTER",     (0,0),(1,0),   0.4, cLINE),
    ]))
    elements.append(sig_tbl)
    elements.append(Spacer(1, 4))

    # ── 7. FOOTER ─────────────────────────────────────────────────────
    elements.append(HRFlowable(
        width="100%", thickness=1, color=cTEAL, spaceAfter=2,
    ))
    elements.append(Paragraph(
        "<b>MedDQA</b> Clinical Data Quality Assurance System  |  "
        "System-generated &amp; audit-tracked  |  Confidential",
        S["foot"],
    ))

    return elements
