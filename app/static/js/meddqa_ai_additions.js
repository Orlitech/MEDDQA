// ============================================================================
// MedDQA Clinical Alerts — Refill Due + VL Schedule
// Drop this file in /static/js/meddqa_alerts.js
// Add to index.html AFTER app.js:
//   <script src="/static/js/meddqa_alerts.js"></script>
//
// Then in searchPatient(), after renderEMRData(data.data); add:
//   MedAlerts.run(data.data);
// ============================================================================

const MedAlerts = (function () {

    // ── tiny helpers ──────────────────────────────────────────────────────
    function fmtDate(d) {
        if (!d) return '—';
        try {
            return new Date(d).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
        } catch (e) { return d; }
    }

    function insertAfterHero(el) {
        // The EMR content always starts with the blue patient hero div.
        // We insert our alerts right after it.
        var emr = document.getElementById('emrContent');
        if (!emr) return;
        // First real child = the hero banner
        var hero = emr.firstElementChild;
        if (hero && hero.nextSibling) {
            emr.insertBefore(el, hero.nextSibling);
        } else {
            emr.appendChild(el);
        }
    }

    function makeAlert(id, bg, border, color, icon, titleText, bodyHTML) {
        // Remove any existing alert with this id first
        var old = document.getElementById(id);
        if (old) old.remove();

        var el = document.createElement('div');
        el.id = id;
        el.style.cssText = [
            'background:'  + bg,
            'border:1.5px solid ' + border,
            'border-radius:12px',
            'padding:11px 14px',
            'margin-bottom:12px',
            'display:flex',
            'align-items:flex-start',
            'gap:12px',
            'position:relative',
            'animation:fadeInUp 0.4s ease both'
        ].join(';');

        el.innerHTML =
            '<div style="width:34px;height:34px;border-radius:50%;background:' + color + ';' +
                'display:flex;align-items:center;justify-content:center;' +
                'flex-shrink:0;color:#fff;font-size:0.9rem;">' +
                '<i class="bi ' + icon + '"></i>' +
            '</div>' +
            '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:0.7rem;font-weight:700;color:' + color + ';margin-bottom:3px;">' +
                    titleText +
                '</div>' +
                '<div style="font-size:0.77rem;color:#334155;line-height:1.5;">' +
                    bodyHTML +
                '</div>' +
            '</div>' +
            '<button onclick="document.getElementById(\'' + id + '\').remove()" ' +
                'style="position:absolute;top:8px;right:10px;width:20px;height:20px;' +
                'border-radius:50%;border:1px solid ' + border + ';background:transparent;' +
                'cursor:pointer;color:' + color + ';font-size:0.65rem;' +
                'display:flex;align-items:center;justify-content:center;">' +
                '<i class="bi bi-x"></i>' +
            '</button>';

        return el;
    }

    // ── 1. REFILL DUE ALERT ───────────────────────────────────────────────
    function refillAlert(patientData) {
        document.getElementById('mda-refill')?.remove();

        var reg     = patientData.current_regimen    || {};
        var refills = patientData.refill_history     || [];

        // Collect last pickup date and duration from every possible location
        var lastPickup = reg.last_pickup_date
                      || reg.pickup_date
                      || null;

        var duration = parseInt(reg.duration_days
                              || reg.days_of_supply
                              || reg.duration
                              || 0) || 0;

        // Fall back to most recent refill record
        if (refills.length > 0) {
            var sorted = refills.slice().sort(function (a, b) {
                return new Date(b.pickup_date || '1900') - new Date(a.pickup_date || '1900');
            });
            var latest = sorted[0];
            if (!lastPickup) lastPickup = latest.pickup_date || latest.date || null;
            if (!duration)   duration   = parseInt(latest.duration) || 0;
        }

        if (!lastPickup || !duration) return; // not enough data — stay silent

        var dueDate  = new Date(new Date(lastPickup).getTime() + duration * 86400000);
        var today    = new Date();
        var diffDays = Math.round((dueDate - today) / 86400000);

        if (diffDays > 14) return; // more than 14 days away — no alert

        var overdue = diffDays < 0;
        var color, bg, border, icon, title, body;

        if (overdue) {
            color  = '#dc2626'; bg = '#fef2f2'; border = '#fecaca';
            icon   = 'bi-exclamation-triangle-fill';
            title  = 'Refill Overdue';
            body   = 'Refill was due <strong>' + Math.abs(diffDays) +
                     ' day' + (Math.abs(diffDays) !== 1 ? 's' : '') + ' ago</strong>' +
                     ' (' + fmtDate(dueDate) + '). Patient may have missed pickup.';
        } else if (diffDays === 0) {
            color  = '#d97706'; bg = '#fffbeb'; border = '#fde68a';
            icon   = 'bi-bell-fill';
            title  = 'Refill Due Today';
            body   = 'This patient\'s <strong>' + duration + '-day supply</strong> runs out today.';
        } else {
            color  = '#2563eb'; bg = '#eff6ff'; border = '#bfdbfe';
            icon   = 'bi-bell';
            title  = 'Refill Due in ' + diffDays + ' Day' + (diffDays !== 1 ? 's' : '');
            body   = 'Pickup due <strong>' + fmtDate(dueDate) + '</strong>. ' +
                     duration + '-day supply from ' + fmtDate(lastPickup) + '.';
        }

        if (reg.current_regimen) {
            body += '<br><span style="font-size:0.68rem;color:#64748b;">' +
                    '<i class="bi bi-capsule me-1"></i>' + reg.current_regimen + '</span>';
        }

        insertAfterHero(makeAlert('mda-refill', bg, border, color, icon,
            '<i class="bi bi-capsule me-1"></i>' + title, body));
    }

    // ── 2. VL SCHEDULE ALERT ──────────────────────────────────────────────
    function vlAlert(patientData) {
        document.getElementById('mda-vl')?.remove();

        var info   = patientData.patient_info        || {};
        var vls    = patientData.viral_load_history  || [];
        var artRaw = info.art_start_date;
        if (!artRaw) return;

        var artDate     = new Date(artRaw);
        var today       = new Date();
        var monthsOnART = Math.round((today - artDate) / (1000 * 60 * 60 * 24 * 30.44));

        // Sort VLs oldest → newest
        var sorted = vls.slice().sort(function (a, b) {
            return new Date(a.sample_collection_date || '1900') -
                   new Date(b.sample_collection_date || '1900');
        });

        var vlCount    = sorted.length;
        var latestVL   = sorted[sorted.length - 1] || null;
        var latestRes  = latestVL ? (latestVL.viral_load_result || '') : '';
        var latestDate = latestVL && latestVL.sample_collection_date
                         ? new Date(latestVL.sample_collection_date) : null;

        // Parse latest numeric value
        var latestNum = parseInt(String(latestRes).replace(/[^0-9]/g, '')) || null;
        var unsuppressed = latestNum !== null && latestNum >= 1000;

        var color, bg, border, icon, title, body, nextDue;

        if (unsuppressed) {
            // EAC path
            nextDue = latestDate
                    ? new Date(latestDate.getTime() + 90 * 86400000)
                    : null;
            color  = '#dc2626'; bg = '#fef2f2'; border = '#fecaca';
            icon   = 'bi-exclamation-octagon-fill';
            title  = 'EAC Required — VL Unsuppressed';
            body   = 'Latest VL: <strong style="color:#dc2626;">' + latestRes + ' copies/mL</strong> ' +
                     '(≥1000 = Unsuppressed). Patient needs <strong>Enhanced Adherence Counselling</strong> ' +
                     'before repeat VL.' +
                     (nextDue ? ' Repeat VL due: <strong>' + fmtDate(nextDue) + '</strong>.' : '') +
                     '<br><span style="font-size:0.68rem;color:#64748b;">' +
                     monthsOnART + ' months on ART &nbsp;·&nbsp; ' + vlCount + ' VL test' +
                     (vlCount !== 1 ? 's' : '') + ' done</span>';

        } else if (vlCount === 0) {
            // No VL done yet
            nextDue = new Date(artDate.getTime() + 180 * 86400000);
            var daysUntilFirst = Math.round((nextDue - today) / 86400000);
            if (daysUntilFirst > 60) return; // too far away, no alert
            var overdue0 = daysUntilFirst < 0;
            color  = overdue0 ? '#d97706' : '#2563eb';
            bg     = overdue0 ? '#fffbeb' : '#eff6ff';
            border = overdue0 ? '#fde68a' : '#bfdbfe';
            icon   = overdue0 ? 'bi-clock-history' : 'bi-droplet';
            title  = overdue0 ? 'First VL Overdue' : 'First VL Due Soon';
            body   = 'This client started ART <strong>' + monthsOnART + ' months ago</strong>. ' +
                     'First VL was due at 6 months (' + fmtDate(nextDue) + ').' +
                     (overdue0
                         ? ' <strong style="color:#d97706;">No VL result recorded — action needed.</strong>'
                         : ' <strong>Due in ' + daysUntilFirst + ' days</strong> — schedule now.');

        } else if (vlCount === 1) {
            // Second VL due
            nextDue = new Date(artDate.getTime() + 365 * 86400000);
            var daysUntilSecond = Math.round((nextDue - today) / 86400000);
            if (daysUntilSecond > 60) return;
            var overdue1 = daysUntilSecond < 0;
            color  = overdue1 ? '#d97706' : '#2563eb';
            bg     = overdue1 ? '#fffbeb' : '#eff6ff';
            border = overdue1 ? '#fde68a' : '#bfdbfe';
            icon   = overdue1 ? 'bi-clock-history' : 'bi-droplet';
            title  = overdue1 ? 'Second VL Overdue' : 'Second VL Due Soon';
            body   = 'Second VL due at 12 months — <strong>' + fmtDate(nextDue) + '</strong>.' +
                     (overdue1 ? ' <strong style="color:#d97706;">Not yet recorded.</strong>' : '') +
                     '<br><span style="font-size:0.68rem;color:#64748b;">' +
                     'Last result: ' + latestRes + ' &nbsp;·&nbsp; ' +
                     monthsOnART + ' months on ART</span>';

        } else {
            // Routine annual
            nextDue = latestDate
                    ? new Date(latestDate.getTime() + 365 * 86400000)
                    : null;
            if (!nextDue) return;
            var daysUntilAnnual = Math.round((nextDue - today) / 86400000);
            if (daysUntilAnnual > 60) return;
            var overdueA = daysUntilAnnual < 0;
            color  = overdueA ? '#d97706' : '#2563eb';
            bg     = overdueA ? '#fffbeb' : '#eff6ff';
            border = overdueA ? '#fde68a' : '#bfdbfe';
            icon   = overdueA ? 'bi-clock-history' : 'bi-droplet';
            title  = overdueA ? 'Annual VL Overdue' : 'Annual VL Due Soon';
            body   = 'Next routine VL due <strong>' + fmtDate(nextDue) + '</strong>' +
                     (overdueA ? ' — <strong style="color:#d97706;">not yet done.</strong>' : '.') +
                     '<br><span style="font-size:0.68rem;color:#64748b;">' +
                     'Last result: <strong>' + latestRes + '</strong> &nbsp;·&nbsp; ' +
                     vlCount + ' tests done &nbsp;·&nbsp; ' + monthsOnART + ' months on ART</span>';
        }

        // Insert VL alert after refill alert (or after hero if no refill alert)
        var refillEl = document.getElementById('mda-refill');
        var vlEl     = makeAlert('mda-vl', bg, border, color, icon,
                           '<i class="bi bi-droplet-fill me-1"></i>' + title, body);

        var emr = document.getElementById('emrContent');
        if (!emr) return;

        if (refillEl && refillEl.nextSibling) {
            emr.insertBefore(vlEl, refillEl.nextSibling);
        } else if (refillEl) {
            emr.appendChild(vlEl);
        } else {
            insertAfterHero(vlEl);
        }
    }

    // ── Public entry point ────────────────────────────────────────────────
    function run(patientData) {
        if (!patientData) return;
        try { refillAlert(patientData); } catch (e) { console.warn('Refill alert error:', e); }
        try { vlAlert(patientData);     } catch (e) { console.warn('VL alert error:', e); }
    }

    return { run: run };

})();

console.log('✅ MedDQA Alerts loaded');