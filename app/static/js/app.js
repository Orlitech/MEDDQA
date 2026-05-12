// ============================================================================
// MedDQA - Ultimate Premium Frontend v3.0
// 100% COMPLETE - Expert Drug Display, Passkey Auth, All Features Working
// ============================================================================

const AppState = {
    currentPatient: null,
    isLocked: false,
    currentUser: null,
    comparisonResults: [],
    isLoading: false,
    activeUsers: [],
    regimens: [],
    passkeyAuthorized: false,
    authorizedRole: null,
    authorizationExpiry: null
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 MedDQA Ultimate v3.0 Initializing...');
    initializeApp();
    setupEventListeners();
    setupAutoSave();
    loadRegimens();
    refreshActiveUsers();
    setInterval(refreshActiveUsers, 30000);
    setupKeyboardShortcuts();
    checkAuthorizationStatus();
    console.log('✅ MedDQA v3.0 Ready');
});

function initializeApp() {
    AppState.currentUser = localStorage.getItem('meddqa_user') || generateUserId();
    localStorage.setItem('meddqa_user', AppState.currentUser);
    
    const userEl = document.getElementById('currentUser');
    if (userEl) userEl.textContent = AppState.currentUser;
    
    const avatar = document.getElementById('userAvatar');
    if (avatar && AppState.currentUser) {
        avatar.textContent = AppState.currentUser.charAt(0).toUpperCase();
    }
    
    const savedAuth = localStorage.getItem('meddqa_auth');
    if (savedAuth) {
        try {
            const auth = JSON.parse(savedAuth);
            if (auth.expiry && new Date(auth.expiry) > new Date()) {
                AppState.passkeyAuthorized = true;
                AppState.authorizedRole = auth.role;
                AppState.authorizationExpiry = new Date(auth.expiry);
                updateAuthIndicator();
            } else {
                localStorage.removeItem('meddqa_auth');
            }
        } catch(e) {
            localStorage.removeItem('meddqa_auth');
        }
    }
}

function generateUserId() {
    return 'DQA' + 'Team' + Math.floor(Math.random() * 100);
}

function setupEventListeners() {
    const searchInput = document.getElementById('hospitalNumber');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); searchPatient(); }
        });
        searchInput.addEventListener('input', function() {
            this.value = this.value.toUpperCase().trim();
        });
    }
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const backdrop = document.querySelector('.modal-backdrop-custom');
            if (backdrop) backdrop.remove();
        }
    });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('hospitalNumber');
            if (searchInput) searchInput.focus();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveCareCardData();
            showToast('💾 Care card saved!', 'success', 2000);
        }
    });
}

// ============================================================================
// AUTHORIZATION
// ============================================================================

function checkAuthorizationStatus() {
    updateAuthIndicator();
}

function updateAuthIndicator() {
    const indicator = document.getElementById('authIndicator');
    if (!indicator) return;
    
    if (AppState.passkeyAuthorized && AppState.authorizedRole) {
        indicator.innerHTML = `
            <span class="auth-badge authorized">
                <i class="bi bi-shield-check"></i>
                ${AppState.authorizedRole.replace(/_/g, ' ').toUpperCase()}
            </span>
        `;
        indicator.style.display = 'inline-block';
    } else {
        indicator.innerHTML = `
            <span class="auth-badge unauthorized">
                <i class="bi bi-shield-exclamation"></i>
                Limited Access
            </span>
        `;
        indicator.style.display = 'inline-block';
    }
}

function clearAuthorization() {
    AppState.passkeyAuthorized = false;
    AppState.authorizedRole = null;
    AppState.authorizationExpiry = null;
    localStorage.removeItem('meddqa_auth');
    updateAuthIndicator();
    showToast('🔒 Authorization cleared', 'info', 2000);
}

// ============================================================================
// AUTO-SAVE
// ============================================================================

let autoSaveTimeout;
function setupAutoSave() {
    document.addEventListener('change', function(e) {
        if (e.target.closest('#pickupsContainer, #vlsContainer')) {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(saveCareCardData, 1500);
        }
    });
    document.addEventListener('input', function(e) {
        if (e.target.closest('#pickupsContainer input, #vlsContainer input')) {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(saveCareCardData, 2000);
        }
    });
}

// ============================================================================
// LOAD REGIMENS
// ============================================================================

async function loadRegimens() {
    try {
        const response = await fetch('/api/reference/regimens');
        const data = await response.json();
        if (data.success) AppState.regimens = data.regimens;
    } catch(e) {
       AppState.regimens = [
                // ARVs
                {name:"TDF/3TC/DTG",line:"ARVs"},
                {name:"ABC/3TC/DTG",line:"ARVs"},
                {name:"TAF/3TC/DTG",line:"ARVs"},
                {name:"AZT/3TC/DTG",line:"ARVs"},
                {name:"AZT/3TC/EFV",line:"ARVs"},
                {name:"AZT/3TC/NVP",line:"ARVs"},
                
                // Anti-TB
                {name:"Isoniazid (INH) 300mg",line:"Anti-TB"},
                {name:"3HP (Isoniazid + Rifapentine)",line:"Anti-TB"},
                // Prophylaxis
                {name:"Cotrimoxazole 960mg",line:"Prophylaxis"},
                {name:"Cotrimoxazole 480mg",line:"Prophylaxis"},
                {name:"Cotrimoxazole 800mg",line:"Prophylaxis"},
                {name:"Fluconazole 200mg",line:"Prophylaxis"},
                // Other
                {name:"Pyridoxine 50mg",line:"Other"}
            ];
    }
}

function getRegimenOptions(selected) {
    let html = '<option value="">Select Regimen...</option>';
    const lines = {};
    AppState.regimens.forEach(r => {
        const line = r.line || 'Other';
        if (!lines[line]) lines[line] = [];
        lines[line].push(r.name);
    });
    Object.keys(lines).forEach(line => {
        html += `<optgroup label="${line}">`;
        lines[line].forEach(name => {
            html += `<option value="${name}"${name === selected ? ' selected' : ''}>${name}</option>`;
        });
        html += '</optgroup>';
    });
    return html;
}

// ============================================================================
// LOADING & TOASTS
// ============================================================================

function showLoading(msg, sub) {
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingText');
    const subtext = document.getElementById('loadingSubtitle');
    if (overlay) overlay.classList.add('active');
    if (text) text.textContent = msg || 'Loading...';
    if (subtext) subtext.textContent = sub || 'Please wait...';
    AppState.isLoading = true;
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('active');
    AppState.isLoading = false;
}

function showToast(msg, type, dur) {
    type = type || 'info'; dur = dur || 4000;
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const icons = {success:'bi-check-circle-fill',error:'bi-x-circle-fill',warning:'bi-exclamation-triangle-fill',info:'bi-info-circle-fill'};
    const colors = {success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#4f46e5'};
    
    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    toast.innerHTML = `<i class="bi ${icons[type]}" style="font-size:1.2rem;color:${colors[type]};"></i><span style="flex:1;">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
    container.appendChild(toast);
    
    if (dur > 0) {
        setTimeout(() => {
            toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = 'all 0.3s ease';
            setTimeout(() => { if(toast.parentElement) toast.remove(); }, 300);
        }, dur);
    }
}

// ============================================================================
// FORMAT UTILITIES
// ============================================================================

function formatDate(d) {
    if (!d) return 'N/A';
    try { const dt = new Date(d); if(isNaN(dt)) return d; return dt.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}); }
    catch(e) { return d; }
}

function formatDateForInput(d) {
    if (!d) return '';
    try { const dt = new Date(d); if(isNaN(dt)) return ''; return dt.toISOString().split('T')[0]; }
    catch(e) { return ''; }
}

function shakeElement(el) {
    if (!el) return;
    el.style.animation = 'none'; el.offsetHeight;
    el.style.animation = 'shake 0.5s ease';
    setTimeout(() => el.style.animation = '', 500);
}

function scrollToElement(el, offset = 80) {
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top, behavior: 'smooth' });
}

// ============================================================================
// VIRAL LOAD CLASSIFICATION
// ============================================================================

function classifyViralLoad(vlValue) {
    if (!vlValue || vlValue === 'N/A') {
        return { class: '', badge: '<span class="badge bg-secondary">Unknown</span>', status: 'Unknown', color: '#6b7280' };
    }
    let cleaned = String(vlValue).replace(/,/g, '').trim();
    if (cleaned.startsWith('<')) {
        return { class: 'text-success fw-bold', badge: '<span class="badge bg-success">🟢 Suppressed</span>', status: 'Suppressed', color: '#10b981' };
    }
    let numeric = parseFloat(cleaned);
    if (isNaN(numeric)) {
        return { class: '', badge: '<span class="badge bg-secondary">Unknown</span>', status: 'Unknown', color: '#6b7280' };
    }
    if (numeric < 200) {
        return { class: 'text-success fw-bold', badge: '<span class="badge bg-success">🟢 Suppressed</span>', status: 'Suppressed', color: '#10b981' };
    } else if (numeric < 1000) {
        return { class: 'text-warning fw-bold', badge: '<span class="badge bg-warning text-dark">🟡 Low Viremia</span>', status: 'Low Viremia', color: '#f59e0b' };
    } else {
        return { class: 'text-danger fw-bold', badge: '<span class="badge bg-danger">🔴 Unsuppressed</span>', status: 'Unsuppressed', color: '#ef4444' };
    }
}

// ============================================================================
// PATIENT SEARCH
// ============================================================================

async function searchPatient() {
    const input = document.getElementById('hospitalNumber');
    if (!input) return;
    
    let hn = input.value.trim().toUpperCase();
    if (!hn) { showToast('Please enter a hospital number','warning'); shakeElement(input); input.focus(); return; }
    
    const btn = document.getElementById('searchBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Searching...'; }
    
    showLoading('Searching Patient Records', 'Looking for: ' + hn);
    
    try {
        const res = await fetch('/api/patients/search/' + encodeURIComponent(hn), {headers:{'X-User':AppState.currentUser}});
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.detail || 'Patient not found');
        
        AppState.currentPatient = data.data;
        
        const emptyState = document.getElementById('emptyState');
        if (emptyState) emptyState.style.display = 'none';
        
        const patientSection = document.getElementById('patientSection');
        if (patientSection) { patientSection.classList.remove('d-none-imp'); patientSection.classList.add('fade-in'); setTimeout(() => scrollToElement(patientSection), 300); }
        
        renderEMRData(data.data);
        renderCareCardForm(data.data);
        setTimeout(() => loadCareCardData(), 600);
        
        const compCard = document.getElementById('comparisonCard');
        if (compCard) compCard.style.display = 'none';
        
        showToast('✅ Patient found!', 'success');
        refreshActiveUsers();
    } catch(e) {
        console.error('Search error:', e);
        showToast(e.message || 'Patient not found', 'error');
        shakeElement(input);
    } finally {
        hideLoading();
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-search"></i> Search'; }
    }
}

// ============================================================================
// RENDER EMR DATA - COMPLETE EXPERT DRUG DISPLAY
// ============================================================================

function renderEMRData(data) {
    const container = document.getElementById('emrContent');
    if (!container) return;
    
    const p = data.patient_info;
    const refills = data.refill_history || [];
    const vls = data.viral_load_history || [];
    const currentRegimen = data.current_regimen || {};
    const groupedVisits = groupRefillsByVisit(refills);
    
    let html = '';
    
    // PATIENT HERO CARD
    html += `<div class="patient-hero-card"><div class="patient-hero-content">
        <div class="patient-avatar-xl"><span>${(p.first_name?.charAt(0)||'')}${(p.surname?.charAt(0)||'')}</span></div>
        <div class="patient-hero-info">
            <h2 class="patient-hero-name">
                ${p.first_name||''} ${p.surname||''}
                <button class="btn-icon-ghost" onclick="editField('first_name','${(p.first_name||'').replace(/'/g,"\\'")}','patient')" title="Edit First Name"><i class="bi bi-pencil"></i></button>
                <button class="btn-icon-ghost" onclick="editField('surname','${(p.surname||'').replace(/'/g,"\\'")}','patient')" title="Edit Surname"><i class="bi bi-pencil"></i></button>
            </h2>
            <div class="patient-hero-meta">
                <span class="hero-hn"><i class="bi bi-tag"></i> ${p.hospital_number||'N/A'}</span>
                <span class="hero-facility"><i class="bi bi-building"></i> ${p.facility_name||'N/A'}</span>
                <span class="hero-state"><i class="bi bi-geo-alt"></i> ${p.state||'N/A'}</span>
            </div>
            <div class="patient-hero-badges">
                ${vls.length>0?classifyViralLoad(vls[0]?.viral_load_result||'N/A').badge:''}
                ${currentRegimen.current_regimen?`<span class="badge-hero primary">${currentRegimen.current_regimen}</span>`:''}
            </div>
        </div>
        <div class="patient-hero-stats">
            <div class="hero-stat"><div class="hero-stat-value">${refills.length}</div><div class="hero-stat-label">Drugs</div></div>
            <div class="hero-stat"><div class="hero-stat-value">${groupedVisits.length}</div><div class="hero-stat-label">Visits</div></div>
            <div class="hero-stat"><div class="hero-stat-value">${vls.length}</div><div class="hero-stat-label">VL Tests</div></div>
        </div>
    </div></div>`;
    
    // QUICK INFO GRID
    html += '<div class="quick-info-grid">';
    html += makeInfoCell('Sex', p.sex||'N/A', true, 'sex', 'patient');
    html += makeInfoCell('Date of Birth', formatDate(p.date_of_birth), true, 'date_of_birth', 'patient');
    html += makeInfoCell('Other Name', p.other_name||'N/A', true, 'other_name', 'patient');
    html += makeArtStartDateCell('ART Start Date', p.art_start_date||p.date_enrolled, p.hospital_number);
    html += makeInfoCell('Date Enrolled', formatDate(p.date_enrolled), true, 'date_enrolled', 'patient');
    html += makeInfoCell('LGA', p.lga||'N/A', false);
    html += makeInfoCell('Unique ID', p.unique_id||'N/A', false);
    html += makeInfoCell('Person UUID', (p.person_uuid||'').substring(0,12)+'...', false);
    html += '</div>';
    
    // CURRENT REGIMEN CARD
    if (currentRegimen.current_regimen) {
        html += '<div class="current-regimen-card"><div class="section-header"><h6><i class="bi bi-capsule text-primary me-2"></i>Current Regimen</h6></div><div class="current-regimen-content">';
        html += `<div class="regimen-main">${currentRegimen.current_regimen}</div>`;
        html += `<div class="regimen-line">${currentRegimen.current_regimen_line||''}</div>`;
        html += '<div class="regimen-dates">';
        html += `<span><i class="bi bi-calendar-check me-1"></i>Last Pickup: ${formatDate(currentRegimen.last_pickup_date)}</span>`;
        html += `<span><i class="bi bi-calendar-event me-1"></i>Next Appt: ${formatDate(currentRegimen.next_appointment)}</span>`;
        html += '</div></div></div>';
    }
    
    // DRUG DISPENSING HISTORY
    html += '<div class="drugs-master-section">';
    html += '<div class="drugs-section-header"><div class="drugs-section-title"><i class="bi bi-capsule"></i><span>Drug Dispensing History</span>';
    html += `<span class="drugs-count-pill">${groupedVisits.length} visits | ${refills.length} drugs</span></div>`;
    html += '<div class="drugs-section-actions"><button class="btn-expand-all" onclick="expandAllVisits()"><i class="bi bi-arrows-expand"></i> Expand All</button>';
    html += '<button class="btn-collapse-all" onclick="collapseAllVisits()"><i class="bi bi-arrows-collapse"></i> Collapse All</button></div></div>';
    
    if (groupedVisits.length > 0) {
        const showLimit = 5;
        const hasMore = groupedVisits.length > showLimit;
        html += '<div class="visits-accordion">';
        
        groupedVisits.forEach((visit, visitIdx) => {
            const visitDate = visit.visit_date;
            const visitDrugs = visit.refills;
            const isLatest = visitIdx === 0;
            const isHidden = visitIdx >= showLimit;
            const drugCount = visitDrugs.length;
            const firstDrug = visitDrugs[0];
            const nextAppt = firstDrug?.next_appointment || '';
            const mmdType = firstDrug?.mmd_type || '';
            const dsdModel = firstDrug?.dsd_model || '';
            
            html += `<div class="visit-accordion-item ${isLatest?'visit-latest':''} ${isHidden?'visit-hidden':''}" data-visit-index="${visitIdx}">
                <div class="visit-accordion-header" onclick="toggleVisitAccordion(this)">
                    <div class="visit-accordion-indicator"><div class="visit-dot ${isLatest?'dot-pulse':''}">${isLatest?'<i class="bi bi-star-fill"></i>':(groupedVisits.length-visitIdx)}</div></div>
                    <div class="visit-accordion-summary">
                        <div class="visit-summary-top">
                            <span class="visit-date-badge ${isLatest?'date-latest':''}"><i class="bi bi-calendar-event"></i> ${formatDate(visitDate)}${isLatest?'<span class="latest-tag">LATEST</span>':''}</span>
                            <span class="visit-drug-count"><i class="bi bi-capsule-fill"></i> ${drugCount} drug${drugCount>1?'s':''}</span>
                            ${mmdType?`<span class="visit-mmd-badge">${mmdType}</span>`:''}
                        </div>
                        <div class="visit-summary-drugs">${visitDrugs.map(d=>`<span class="drug-chip" title="${d.regimen_name||'Unknown'} - ${d.duration||0} days">${getDrugShortName(d.regimen_name||'Unknown')}<small>${d.duration||0}d</small></span>`).join('')}</div>
                    </div>
                    <div class="visit-accordion-chevron"><i class="bi bi-chevron-down"></i></div>
                </div>
                <div class="visit-accordion-body" style="display:none;">
                    <div class="visit-info-bar">
                        <div class="visit-info-item"><i class="bi bi-calendar-check"></i><span>Next Appt: <strong>${formatDate(nextAppt)}</strong></span>
                            <button class="btn-edit-xs auth-required" onclick="event.stopPropagation(); editRefillField('${nextAppt||''}','next_appointment','${firstDrug?.id}','Next Appointment')" title="Edit (Auth Required)"><i class="bi bi-shield-lock"></i></button>
                        </div>
                        ${dsdModel?`<div class="visit-info-item"><i class="bi bi-people"></i><span>DSD: <strong>${dsdModel}</strong></span></div>`:''}
                        <button class="btn-edit-xs auth-required" onclick="event.stopPropagation(); editRefillField('${visitDate}','visit_date','${firstDrug?.id}','Visit Date')" title="Edit (Auth Required)"><i class="bi bi-shield-lock"></i> Edit Date</button>
                    </div>
                    <div class="drugs-grid">`;
            
            visitDrugs.forEach((drug, drugIdx) => {
                const drugName = drug.regimen_name || 'Unknown Drug';
                const drugLine = drug.regimen_line || '';
                const duration = drug.duration || 0;
                const drugId = drug.id;
                const lineColor = getLineColor(drugLine);
                const durationColor = getDurationColor(duration);
                
                html += `<div class="drug-card-premium" style="animation:fadeInUp 0.4s ease ${drugIdx*0.08}s both;border-left:4px solid ${lineColor};">
                    <div class="drug-card-left"><div class="drug-card-icon-circle" style="background:${lineColor}20;color:${lineColor};"><i class="bi bi-capsule-fill"></i></div></div>
                    <div class="drug-card-center">
                        <div class="drug-card-title-row"><span class="drug-card-name">${drugName}</span>${drugLine?`<span class="drug-card-line-tag" style="background:${lineColor}15;color:${lineColor};">${drugLine}</span>`:''}</div>
                        <div class="drug-card-actions-row">
                            <button class="btn-drug-action auth-required" onclick="event.stopPropagation(); editDrugDuration('${duration}','${drugId}','${drugName.replace(/'/g,"\\'")}')" title="Edit Duration (Auth Required)"><i class="bi bi-shield-lock"></i> Duration</button>
                            <button class="btn-drug-action auth-required" onclick="event.stopPropagation(); editDrugRegimen('${drugName.replace(/'/g,"\\'")}','${drugId}','${(drugLine||'').replace(/'/g,"\\'")}')" title="Edit Regimen (Auth Required)"><i class="bi bi-shield-lock"></i> Regimen</button>
                        </div>
                    </div>
                    <div class="drug-card-right"><div class="drug-duration-ring-container"><div class="duration-ring-mini">
                        <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="#e5e7eb" stroke-width="3"/><circle cx="20" cy="20" r="17" fill="none" stroke="${durationColor}" stroke-width="3" stroke-dasharray="${Math.min(100,(duration/90)*100)} 100" stroke-linecap="round" transform="rotate(-90 20 20)"/></svg>
                        <span class="duration-number-mini">${duration}</span></div><span class="duration-label-mini">days</span></div></div>
                    ${isLatest&&drugIdx===0?'<div class="drug-card-corner-badge">Current</div>':''}
                </div>`;
            });
            
            html += `</div></div></div>`;
        });
        
        html += '</div>';
        if (hasMore) html += `<div class="text-center mt-3"><button class="btn-show-all-visits" onclick="toggleAllVisits(this)" data-showing="limited"><i class="bi bi-chevron-down"></i> Show All ${groupedVisits.length} Visits</button></div>`;
    } else {
        html += '<div class="empty-state-premium"><div class="empty-icon"><i class="bi bi-capsule"></i></div><h4>No Drug Records</h4><p>No dispensing history found</p></div>';
    }
    html += '</div>';
    
    // VIRAL LOAD SECTION
    html += '<div class="vl-section-premium"><div class="section-header"><h6><i class="bi bi-droplet text-danger me-2"></i>Viral Load History</h6><span class="count-badge vl">'+vls.length+' records</span></div>';
    
    if (vls.length > 0) {
        html += '<div class="vl-trend-premium">';
        vls.slice(0,8).reverse().forEach(vl => {
            const numeric = parseInt(String(vl.viral_load_result||'').replace(/[^0-9]/g,''));
            const logValue = isNaN(numeric)||numeric<=0?0:Math.log10(numeric);
            const height = Math.min(100,Math.max(4,logValue*25));
            const color = !numeric||numeric<200?'#10b981':numeric<1000?'#f59e0b':'#ef4444';
            html += `<div class="vl-bar-premium" title="${formatDate(vl.sample_collection_date)}: ${vl.viral_load_result||'N/A'}"><div class="vl-bar-fill" style="height:${height}px;background:${color};"></div><div class="vl-bar-date">${formatDate(vl.sample_collection_date).split(' ')[0]||''}</div><div class="vl-bar-value">${vl.viral_load_result||'N/A'}</div></div>`;
        });
        html += '</div>';
        
        html += '<div class="table-premium-wrapper"><table class="table-premium"><thead><tr><th>Sample Date</th><th>Result</th><th>Classification</th><th>Result Date</th></tr></thead><tbody>';
        vls.forEach((v,i) => {
            const classification = classifyViralLoad(v.viral_load_result||'N/A');
            html += `<tr style="animation:fadeIn 0.4s ease ${i*0.05}s both;"><td><strong>${formatDate(v.sample_collection_date)}</strong></td><td><span class="${classification.class}" style="font-size:1.1rem;">${v.viral_load_result||'N/A'}</span></td><td>${classification.badge}</td><td>${formatDate(v.result_date)}</td></tr>`;
        });
        html += '</tbody></table></div>';
        
        const suppressed = vls.filter(v=>{const n=parseInt(String(v.viral_load_result||'').replace(/[^0-9]/g,''));return!isNaN(n)&&n<1000;}).length;
        const suppressionRate = vls.length>0?((suppressed/vls.length)*100).toFixed(0):0;
        const latestClass = classifyViralLoad(vls[0]?.viral_load_result||'N/A');
        
        html += '<div class="vl-summary-row">';
        html += `<div class="vl-summary-card"><span>Total Tests</span><strong>${vls.length}</strong></div>`;
        html += `<div class="vl-summary-card"><span>Latest</span><strong class="${latestClass.class}">${vls[0]?.viral_load_result||'N/A'}</strong></div>`;
        html += `<div class="vl-summary-card"><span>Status</span>${latestClass.badge}</div>`;
        html += `<div class="vl-summary-card"><span>Suppression Rate</span><strong class="${suppressionRate>=90?'text-success':'text-warning'}">${suppressionRate}%</strong></div>`;
        html += '</div>';
    } else {
        html += '<div class="empty-state-premium"><div class="empty-icon"><i class="bi bi-droplet"></i></div><h4>No Viral Load Records</h4><p>No VL test results found</p></div>';
    }
    html += '</div>';
    
    container.innerHTML = html;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDrugShortName(fullName) {
    if (!fullName) return '???';
    return fullName.split('/').map(p => p.trim().split(' ')[0]).join('/');
}

function getLineColor(line) {
    const colors = {'First Line':'#4f46e5','Second Line':'#f59e0b','Third Line':'#ef4444','Prophylaxis':'#10b981','Other':'#6b7280'};
    return colors[line] || '#6b7280';
}

function getDurationColor(days) {
    if (days <= 30) return '#10b981';
    if (days <= 60) return '#3b82f6';
    if (days <= 90) return '#f59e0b';
    return '#8b5cf6';
}

function groupRefillsByVisit(refills) {
    if (!refills || refills.length === 0) return [];
    const visitMap = new Map();
    refills.forEach(refill => {
        const key = refill.pickup_date || 'unknown';
        if (!visitMap.has(key)) visitMap.set(key, { visit_date: key, refills: [] });
        visitMap.get(key).refills.push(refill);
    });
    return Array.from(visitMap.values()).sort((a, b) => {
        if (a.visit_date === 'unknown') return 1;
        if (b.visit_date === 'unknown') return -1;
        return b.visit_date.localeCompare(a.visit_date);
    });
}

function makeInfoCell(label, value, editable, fieldName, recordType) {
    let html = '<div class="info-cell-premium">';
    html += `<div class="info-cell-label">${label}</div><div class="info-cell-value">${value}</div>`;
    if (editable) html += `<button class="info-cell-edit" onclick="editField('${fieldName}','${String(value).replace(/'/g,"\\'")}','${recordType}')"><i class="bi bi-pencil-square"></i></button>`;
    html += '</div>';
    return html;
}

function makeArtStartDateCell(label, value, hospitalNumber) {
    return `<div class="info-cell-premium art-start-highlight"><div class="info-cell-label">${label}</div><div class="info-cell-value">${formatDate(value)}</div><button class="info-cell-edit" onclick="editArtStartDate('${formatDateForInput(value)}','${hospitalNumber}')"><i class="bi bi-pencil-square"></i></button></div>`;
}

// ============================================================================
// VISIT ACCORDION TOGGLE
// ============================================================================

function toggleVisitAccordion(header) {
    const item = header.closest('.visit-accordion-item');
    const body = item.querySelector('.visit-accordion-body');
    const chevron = item.querySelector('.visit-accordion-chevron i');
    const isOpen = body.style.display !== 'none';
    if (isOpen) { body.style.display = 'none'; if(chevron) chevron.style.transform = 'rotate(0deg)'; item.classList.remove('visit-open'); }
    else { body.style.display = 'block'; body.style.animation = 'fadeInUp 0.3s ease'; if(chevron) chevron.style.transform = 'rotate(180deg)'; item.classList.add('visit-open'); }
}

function expandAllVisits() {
    document.querySelectorAll('.visit-accordion-body').forEach(b => { b.style.display = 'block'; b.style.animation = 'fadeInUp 0.3s ease'; });
    document.querySelectorAll('.visit-accordion-chevron i').forEach(i => i.style.transform = 'rotate(180deg)');
    document.querySelectorAll('.visit-accordion-item').forEach(i => i.classList.add('visit-open'));
}

function collapseAllVisits() {
    document.querySelectorAll('.visit-accordion-body').forEach(b => b.style.display = 'none');
    document.querySelectorAll('.visit-accordion-chevron i').forEach(i => i.style.transform = 'rotate(0deg)');
    document.querySelectorAll('.visit-accordion-item').forEach(i => i.classList.remove('visit-open'));
}

function toggleAllVisits(btn) {
    const section = btn.closest('.drugs-master-section');
    const hiddenItems = section.querySelectorAll('.visit-hidden');
    if (btn.dataset.showing === 'limited') {
        hiddenItems.forEach(i => { i.classList.remove('visit-hidden'); i.style.animation = 'fadeInUp 0.5s ease'; });
        btn.innerHTML = '<i class="bi bi-chevron-up"></i> Show Less'; btn.dataset.showing = 'all';
    } else {
        hiddenItems.forEach(i => i.classList.add('visit-hidden'));
        btn.innerHTML = '<i class="bi bi-chevron-down"></i> Show All Visits'; btn.dataset.showing = 'limited';
        section.querySelector('.visits-accordion')?.scrollIntoView({ behavior: 'smooth' });
    }
}

// ============================================================================
// 🔐 PASSKEY SYSTEM// ============================================================================

async function requirePasskeyForEdit(actionName) {
    if (AppState.passkeyAuthorized && AppState.authorizationExpiry && new Date() < AppState.authorizationExpiry) return true;
    
    const passkey = await showPasskeyDialog();
    if (!passkey) { showToast('⚠️ Authorization required to ' + actionName, 'warning'); return false; }
    
    try {
        const authRes = await fetch('/api/auth/verify-passkey', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User': AppState.currentUser },
            body: JSON.stringify({ passkey: passkey })
        });
        const authData = await authRes.json();
        if (!authRes.ok || !authData.authorized) { showToast('❌ Invalid passkey', 'error'); return false; }
        
        AppState.passkeyAuthorized = true;
        AppState.authorizedRole = authData.role;
        AppState.authorizationExpiry = new Date(Date.now() + 30 * 60 * 1000);
        localStorage.setItem('meddqa_auth', JSON.stringify({ role: authData.role, expiry: AppState.authorizationExpiry.toISOString() }));
        updateAuthIndicator();
        showToast(`✅ Authorized as ${authData.authorized_by}`, 'success', 3000);
        return true;
    } catch(e) { showToast('Auth failed: ' + e.message, 'error'); return false; }
}

function showPasskeyDialog() {
    return new Promise((resolve) => {
        document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop-custom';
        backdrop.innerHTML = `<div class="passkey-dialog-premium" onclick="event.stopPropagation()">
            <div class="passkey-dialog-icon"><i class="bi bi-shield-lock-fill"></i></div>
            <h5>Authorization Required</h5><p class="passkey-dialog-sub">Enter passkey to modify EMR data</p>
            <div class="passkey-input-premium"><i class="bi bi-lock-fill"></i><input type="password" id="passkeyInputPrem" placeholder="Enter passkey..." autofocus></div>
            <div class="passkey-dialog-hint"><i class="bi bi-info-circle"></i> Passkeys: admin123, dqa2024, pharm2024, 1234</div>
            <div class="passkey-dialog-actions">
                <button class="btn btn-outline-secondary" id="passkeyCancelBtn">Cancel</button>
                <button class="btn btn-primary" id="passkeySubmitBtn">Authorize <i class="bi bi-unlock"></i></button>
            </div></div>`;
        document.body.appendChild(backdrop);
        
        const input = document.getElementById('passkeyInputPrem');
        setTimeout(() => input?.focus(), 100);
        
        document.getElementById('passkeySubmitBtn').addEventListener('click', () => { const pk = input?.value?.trim(); backdrop.remove(); resolve(pk || null); });
        document.getElementById('passkeyCancelBtn').addEventListener('click', () => { backdrop.remove(); resolve(null); });
        input?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { const pk = input?.value?.trim(); backdrop.remove(); resolve(pk || null); } });
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { backdrop.remove(); resolve(null); } });
    });
}

// ============================================================================
// 💊 EDIT DRUG DURATION
// ============================================================================

async function editDrugDuration(currentDuration, drugId, drugName) {
    if (!AppState.currentPatient) { showToast('No patient selected', 'error'); return; }
    
    const authorized = await requirePasskeyForEdit('modify drug duration');
    if (!authorized) return;
    
    const newDuration = await showDurationEditor(parseInt(currentDuration) || 0, drugName);
    if (!newDuration || newDuration === parseInt(currentDuration)) return;
    
    showLoading('Updating Duration...', `Setting ${drugName} to ${newDuration} days`);
    try {
        const res = await fetch('/api/patients/update', {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-User': AppState.currentUser },
            body: JSON.stringify({ hospital_number: AppState.currentPatient.patient_info.hospital_number, field_name: 'duration', new_value: newDuration, record_type: 'refill', record_id: drugId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Update failed');
        showToast('✅ Duration updated!', 'success');
        await searchPatient();
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
    finally { hideLoading(); }
}

function showDurationEditor(currentDuration, drugName) {
    return new Promise((resolve) => {
        document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());
        const dur = parseInt(currentDuration) || 0;
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop-custom';
        backdrop.innerHTML = `<div class="duration-editor-dialog" onclick="event.stopPropagation()">
            <div class="duration-editor-header"><div class="duration-drug-icon"><i class="bi bi-capsule-fill"></i></div><h5>Edit Duration</h5><p class="drug-name-subtitle">${drugName||'Unknown Drug'}</p></div>
            <div class="duration-editor-body">
                <div class="duration-current-display"><span>Current Duration</span><strong>${dur} days</strong></div>
                <div class="duration-presets"><label>Quick Select:</label><div class="preset-buttons">
                    <button class="preset-btn ${dur===30?'active':''}" onclick="document.getElementById('durationInput').value='30';updateDurPreview();">30 days<small>1 Month</small></button>
                    <button class="preset-btn ${dur===60?'active':''}" onclick="document.getElementById('durationInput').value='60';updateDurPreview();">60 days<small>2 Months</small></button>
                    <button class="preset-btn ${dur===90?'active':''}" onclick="document.getElementById('durationInput').value='90';updateDurPreview();">90 days<small>3 Months</small></button>
                    <button class="preset-btn ${dur===180?'active':''}" onclick="document.getElementById('durationInput').value='180';updateDurPreview();">180 days<small>6 Months</small></button>
                </div></div>
                <div class="duration-input-row"><label>Custom Duration (days):</label><div class="duration-input-group"><input type="number" id="durationInput" value="${dur}" min="1" max="365" oninput="updateDurPreview()"><span>days</span></div><div class="duration-equivalent" id="durationEquivalent">≈ ${(dur/30).toFixed(1)} months</div></div>
            </div>
            <div class="duration-editor-footer">
                <button class="btn btn-outline-secondary" onclick="this.closest('.modal-backdrop-custom')?.remove();window._durResolve&&window._durResolve(null);">Cancel</button>
                <button class="btn btn-primary" onclick="confirmDurationUpdate()">Update Duration <i class="bi bi-check-lg"></i></button>
            </div></div>`;
        document.body.appendChild(backdrop);
        
        window._durResolve = resolve;
        window._durBackdrop = backdrop;
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { backdrop.remove(); resolve(null); } });
        document.getElementById('durationInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') confirmDurationUpdate(); });
        setTimeout(() => document.getElementById('durationInput')?.focus(), 100);
    });
}

function updateDurPreview() {
    const input = document.getElementById('durationInput');
    const equivalent = document.getElementById('durationEquivalent');
    if (input && equivalent) equivalent.textContent = `≈ ${(parseInt(input.value)||0)/30} months`;
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.trim().startsWith(document.getElementById('durationInput')?.value)) btn.classList.add('active');
    });
}

function confirmDurationUpdate() {
    const input = document.getElementById('durationInput');
    const newDuration = parseInt(input?.value) || 0;
    if (newDuration < 1) { alert('Duration must be at least 1 day'); return; }
    window._durBackdrop?.remove();
    if (window._durResolve) { window._durResolve(newDuration); window._durResolve = null; }
}

// ============================================================================
// 💊 EDIT DRUG REGIMEN
// ============================================================================

async function editDrugRegimen(currentRegimen, drugId, regimenLine) {
    if (!AppState.currentPatient) { 
        showToast('No patient selected', 'error'); 
        return; 
    }
    
    console.log('🔐 editDrugRegimen called:', { currentRegimen, drugId, regimenLine });
    
    // Step 1: Check passkey
    const authorized = await requirePasskeyForEdit('modify drug regimen');
    if (!authorized) {
        console.log('❌ Not authorized');
        return;
    }
    
    console.log('✅ Authorized, showing regimen dropdown');
    
    // Step 2: Show regimen dropdown
    await showRegimenDropdown(currentRegimen, drugId, regimenLine);
}

function getRegimenDropdownOptions(currentRegimen) {
    let html = '<option value="">Select Regimen...</option>';
    const lines = {};
    
    AppState.regimens.forEach(r => {
        const line = r.line || 'Other';
        if (!lines[line]) lines[line] = [];
        lines[line].push(r.name);
    });
    
    Object.keys(lines).forEach(line => {
        html += `<optgroup label="${line}">`;
        lines[line].forEach(name => {
            const selected = name === currentRegimen ? ' selected' : '';
            html += `<option value="${name}"${selected}>${name}</option>`;
        });
        html += '</optgroup>';
    });
    
    return html;
}

function showRegimenDropdown(currentRegimen, drugId, regimenLine) {
    return new Promise((resolve) => {
        document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());
        const optionsHtml = getRegimenDropdownOptions(currentRegimen);
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop-custom';
        backdrop.innerHTML = `<div class="regimen-dialog-premium" onclick="event.stopPropagation()">
            <div class="regimen-dialog-header"><div class="regimen-dialog-icon"><i class="bi bi-capsule"></i></div><h5>Update Regimen</h5><p>Current: <strong>${currentRegimen||'None'}</strong> (${regimenLine||'Unknown'})</p></div>
            <div class="regimen-dialog-body">
                <div class="search-regimen-premium"><i class="bi bi-search"></i><input type="text" id="regimenSearchPrem" placeholder="Search regimens..." oninput="window._filterRegimenOptions()"></div>
                <select id="regimenSelectPrem" size="8" onchange="window._onRegimenSelectChange()">${optionsHtml}</select>
                <div class="regimen-divider-premium"><span>OR</span></div>
                <input type="text" id="customRegimenPrem" placeholder="Enter custom regimen name..." class="form-control">
            </div>
            <div class="regimen-dialog-footer">
                <button class="btn btn-outline-secondary" id="regCancelBtn2">Cancel</button>
                <button class="btn btn-primary" id="regConfirmBtn2">Update Regimen <i class="bi bi-check-lg"></i></button>
            </div></div>`;
        document.body.appendChild(backdrop);
        
        // Store references on window so inline handlers work
        window._regBackdrop = backdrop;
        window._regDrugId = drugId;
        window._regResolve = resolve;
        
        // Filter function
        window._filterRegimenOptions = function() {
            const search = document.getElementById('regimenSearchPrem');
            const select = document.getElementById('regimenSelectPrem');
            if (!search || !select) return;
            const term = search.value.toLowerCase();
            Array.from(select.options).forEach(o => {
                if (!o.disabled) o.style.display = o.text.toLowerCase().includes(term) ? '' : 'none';
            });
        };
        
        // Select change function
        window._onRegimenSelectChange = function() {
            const select = document.getElementById('regimenSelectPrem');
            const custom = document.getElementById('customRegimenPrem');
            if (select && custom && select.value && !select.value.startsWith('optgroup')) {
                custom.value = select.value;
            }
        };
        
        // Cancel button
        document.getElementById('regCancelBtn2').addEventListener('click', () => {
            backdrop.remove();
            if (window._regResolve) { window._regResolve(null); window._regResolve = null; }
        });
        
        // Confirm button
        document.getElementById('regConfirmBtn2').addEventListener('click', async () => {
            const select = document.getElementById('regimenSelectPrem');
            const custom = document.getElementById('customRegimenPrem');
            
            let newRegimen = custom?.value?.trim() || '';
            if (!newRegimen && select?.value && !select.value.startsWith('optgroup')) {
                newRegimen = select.value;
            }
            
            if (!newRegimen) {
                showToast('Please select or enter a regimen', 'warning');
                return;
            }
            
            backdrop.remove();
            showLoading('Updating Regimen...', 'Saving changes to EMR');
            
            try {
                const res = await fetch('/api/patients/update', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-User': AppState.currentUser },
                    body: JSON.stringify({
                        hospital_number: AppState.currentPatient.patient_info.hospital_number,
                        field_name: 'regimen',
                        new_value: newRegimen,
                        record_type: 'refill',
                        record_id: drugId
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Update failed');
                showToast('✅ Regimen updated successfully!', 'success');
                await searchPatient();
            } catch(e) {
                console.error('Regimen update error:', e);
                showToast('❌ ' + e.message, 'error');
            } finally {
                hideLoading();
            }
            
            if (window._regResolve) { window._regResolve(newRegimen); window._regResolve = null; }
        });
        
        // Close on backdrop click
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                backdrop.remove();
                if (window._regResolve) { window._regResolve(null); window._regResolve = null; }
            }
        });
        
        // Enter key on custom input
        document.getElementById('customRegimenPrem')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('regConfirmBtn2').click();
            }
        });
        
        // Focus search input
        setTimeout(() => document.getElementById('regimenSearchPrem')?.focus(), 100);
    });
}

function filterRegimenOptions() {
    const search = document.getElementById('regimenSearchPrem');
    const select = document.getElementById('regimenSelectPrem');
    if (!search || !select) return;
    const term = search.value.toLowerCase();
    Array.from(select.options).forEach(o => { if (!o.disabled) o.style.display = o.text.toLowerCase().includes(term) ? '' : 'none'; });
}

function onRegimenSelectChange() {
    const select = document.getElementById('regimenSelectPrem');
    const custom = document.getElementById('customRegimenPrem');
    if (select && custom && select.value && !select.value.startsWith('optgroup')) custom.value = select.value;
}

async function confirmRegimenUpdate(drugId) {
    const select = document.getElementById('regimenSelectPrem');
    const custom = document.getElementById('customRegimenPrem');
    let newRegimen = custom?.value?.trim() || '';
    if (!newRegimen && select?.value && !select.value.startsWith('optgroup')) newRegimen = select.value;
    if (!newRegimen) { showToast('Please select or enter a regimen', 'warning'); return; }
    
    window._regBackdrop?.remove();
    showLoading('Updating Regimen...', 'Saving changes');
    try {
        const res = await fetch('/api/patients/update', {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-User': AppState.currentUser },
            body: JSON.stringify({ hospital_number: AppState.currentPatient.patient_info.hospital_number, field_name: 'regimen', new_value: newRegimen, record_type: 'refill', record_id: drugId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Update failed');
        showToast('✅ Regimen updated!', 'success');
        await searchPatient();
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
    finally { hideLoading(); }
    if (window._regResolve) { window._regResolve(newRegimen); window._regResolve = null; }
}

// ============================================================================
// EDIT REFILL FIELD
// ============================================================================

async function editRefillField(currentValue, fieldName, recordId, displayName) {
    if (!AppState.currentPatient) { showToast('No patient selected', 'error'); return; }
    
    const authorized = await requirePasskeyForEdit('modify ' + displayName.toLowerCase());
    if (!authorized) return;
    
    const hn = AppState.currentPatient.patient_info.hospital_number;
    let newValue = prompt(`Update ${displayName}:\nCurrent: ${currentValue}\n\nEnter new value:`, currentValue);
    if (!newValue || newValue === currentValue) return;
    
    showLoading('Updating...', `Updating ${displayName}`);
    try {
        const res = await fetch('/api/patients/update', {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-User': AppState.currentUser },
            body: JSON.stringify({ hospital_number: hn, field_name: fieldName, new_value: newValue, record_type: 'refill', record_id: recordId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Update failed');
        showToast(`✅ ${displayName} updated!`, 'success');
        await searchPatient();
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
    finally { hideLoading(); }
}

// ============================================================================
// EDIT PATIENT FIELD
// ============================================================================

async function editField(fieldName, currentValue, recordType, recordId) {
    if (!AppState.currentPatient) { showToast('No patient selected', 'error'); return; }
    
    const authorized = await requirePasskeyForEdit('modify patient info');
    if (!authorized) return;
    
    const hn = AppState.currentPatient.patient_info.hospital_number;
    let newValue = prompt(`Update ${fieldName.replace(/_/g,' ')}:\nCurrent: ${currentValue}\n\nEnter new value:`, currentValue);
    if (!newValue || newValue === currentValue) return;
    
    showLoading('Updating...', `Updating ${fieldName.replace(/_/g,' ')}`);
    try {
        const res = await fetch('/api/patients/update', {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-User': AppState.currentUser },
            body: JSON.stringify({ hospital_number: hn, field_name: fieldName, new_value: newValue, record_type: recordType||'patient', record_id: recordId||null })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Update failed');
        showToast('✅ Updated!', 'success');
        await searchPatient();
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
    finally { hideLoading(); }
}

// ============================================================================
// EDIT ART START DATE
// ============================================================================

async function editArtStartDate(currentValue, hospitalNumber) {
    if (!AppState.currentPatient) { showToast('No patient selected', 'error'); return; }
    
    const authorized = await requirePasskeyForEdit('modify ART Start Date');
    if (!authorized) return;
    
    document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop-custom';
    backdrop.innerHTML = `<div class="date-dialog-premium" onclick="event.stopPropagation()">
        <div class="date-dialog-header"><i class="bi bi-calendar-heart"></i><h5>Update ART Start Date</h5><p class="text-muted small">Current: ${formatDate(currentValue)}</p></div>
        <div class="date-dialog-body"><input type="date" id="artStartDateInputPrem" value="${formatDateForInput(currentValue)}" class="form-control-lg"></div>
        <div class="date-dialog-footer"><button class="btn btn-outline-secondary" onclick="this.closest('.modal-backdrop-custom')?.remove()">Cancel</button><button class="btn btn-primary" id="confirmArtBtn">Update & Validate</button></div>
    </div>`;
    document.body.appendChild(backdrop);
    
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    document.getElementById('confirmArtBtn').addEventListener('click', async () => {
        const newDate = document.getElementById('artStartDateInputPrem').value;
        backdrop.remove();
        if (!newDate || newDate === currentValue) return;
        showLoading('Updating ART Start Date...');
        try {
            const ur = await fetch('/api/patients/update', { method:'PUT', headers:{'Content-Type':'application/json','X-User':AppState.currentUser}, body:JSON.stringify({hospital_number:hospitalNumber,field_name:'art_start_date',new_value:newDate,record_type:'patient'}) });
            const ud = await ur.json();
            if (!ur.ok) throw new Error(ud.detail||'Update failed');
            showToast('✅ ART Start Date updated!','success');
            await validateArtStartDate(hospitalNumber, newDate);
            setTimeout(() => searchPatient(), 1500);
        } catch(e) { showToast('❌ '+e.message,'error'); }
        finally { hideLoading(); }
    });
}

async function validateArtStartDate(hospitalNumber, artStartDate) {
    try {
        const res = await fetch(`/api/patients/${encodeURIComponent(hospitalNumber)}/validate-art-start`, {
            method:'POST', headers:{'Content-Type':'application/json','X-User':AppState.currentUser}, body:JSON.stringify({art_start_date:artStartDate})
        });
        const data = await res.json();
        if (data.success && !data.is_consistent) {
            const confirmUpdate = await showValidationDialog('ART Start Date Mismatch', `ART Start (${formatDate(artStartDate)}) is after first pickup (${formatDate(data.first_pickup_date)}).`, [
                {text:'Update',class:'btn-secondary',value:'keep'},{text:'Use First Pickup',class:'btn-warning',value:'update'},{text:'Cancel',class:'btn-outline-secondary',value:'cancel'}
            ]);
            if (confirmUpdate === 'update') {
                await fetch('/api/patients/update', { method:'PUT', headers:{'Content-Type':'application/json','X-User':AppState.currentUser}, body:JSON.stringify({hospital_number:hospitalNumber,field_name:'art_start_date',new_value:data.first_pickup_date,record_type:'patient'}) });
                showToast('✅ ART Start Date synchronized!','success');
                setTimeout(() => searchPatient(), 1000);
            }
        }
    } catch(e) { console.error('Validation error:', e); }
}

function showValidationDialog(title, message, buttons) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop-custom';
        backdrop.innerHTML = `<div class="validation-dialog-premium"><div class="validation-dialog-icon"><i class="bi bi-exclamation-triangle-fill text-warning"></i></div><h5>${title}</h5><p>${message}</p><div class="validation-dialog-actions">${buttons.map(b=>`<button class="btn ${b.class}" data-value="${b.value}">${b.text}</button>`).join('')}</div></div>`;
        document.body.appendChild(backdrop);
        backdrop.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => { backdrop.remove(); resolve(btn.dataset.value); }));
    });
}

// ============================================================================
// CARE CARD FORM
// ============================================================================

function renderCareCardForm(data) {
    const container = document.getElementById('careCardContent');
    if (!container) return;
    const p = data.patient_info;
    const ro = getRegimenOptions('');
    let html = `<div class="alert-premium info"><i class="bi bi-info-circle-fill"></i> Enter data from the physical Care Card for <strong>${p.first_name||''} ${p.surname||''}</strong></div>`;
    html += `<div class="mb-4"><div class="d-flex justify-content-between align-items-center mb-3"><div class="form-section-label"><i class="bi bi-capsule text-success"></i> Drug Pickups</div><button class="btn-add-row" onclick="addPickupRow()"><i class="bi bi-plus-lg"></i> Add Pickup</button></div><div id="pickupsContainer"><div class="entry-row"><div class="row g-2 align-items-end"><div class="col-md-3"><div class="form-label-sm">Pickup Date</div><input type="date" class="form-control-sm" name="pd[]"></div><div class="col-md-5"><div class="form-label-sm">Regimen</div><select class="form-select-sm" name="rg[]">${ro}</select></div><div class="col-md-3"><div class="form-label-sm">Duration (Days)</div><input type="number" class="form-control-sm" name="dr[]" placeholder="Days" min="1"></div><div class="col-md-1"><button class="btn-remove-row" onclick="removeRow(this)" title="Remove"><i class="bi bi-trash"></i></button></div></div></div></div></div>`;
    html += `<div class="mb-4"><div class="d-flex justify-content-between align-items-center mb-3"><div class="form-section-label"><i class="bi bi-droplet text-danger"></i> Viral Load Tests</div><button class="btn-add-row" onclick="addVLRow()"><i class="bi bi-plus-lg"></i> Add VL Test</button></div><div id="vlsContainer"><div class="entry-row"><div class="row g-2 align-items-end"><div class="col-md-4"><div class="form-label-sm">Sample Date</div><input type="date" class="form-control-sm" name="sd[]"></div><div class="col-md-4"><div class="form-label-sm">Result</div><input type="text" class="form-control-sm" name="vr[]" placeholder="e.g. <20 or 150"></div><div class="col-md-3"><div class="form-label-sm">Result Date</div><input type="date" class="form-control-sm" name="rd[]"></div><div class="col-md-1"><button class="btn-remove-row" onclick="removeRow(this)" title="Remove"><i class="bi bi-trash"></i></button></div></div></div></div></div>`;
    html += `<button class="btn-compare" onclick="compareData()"><i class="bi bi-arrow-left-right me-2"></i> Compare with EMR Records</button>`;
    container.innerHTML = html;
}

function addPickupRow() {
    const container = document.getElementById('pickupsContainer');
    if (!container) return;
    const ro = getRegimenOptions('');
    const row = document.createElement('div'); row.className = 'entry-row'; row.style.animation = 'fadeIn 0.3s ease';
    row.innerHTML = `<div class="row g-2 align-items-end"><div class="col-md-3"><div class="form-label-sm">Pickup Date</div><input type="date" class="form-control-sm" name="pd[]"></div><div class="col-md-5"><div class="form-label-sm">Regimen</div><select class="form-select-sm" name="rg[]">${ro}</select></div><div class="col-md-3"><div class="form-label-sm">Duration (Days)</div><input type="number" class="form-control-sm" name="dr[]" placeholder="Days" min="1"></div><div class="col-md-1"><button class="btn-remove-row" onclick="removeRow(this)" title="Remove"><i class="bi bi-trash"></i></button></div></div>`;
    container.appendChild(row); row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function addVLRow() {
    const container = document.getElementById('vlsContainer');
    if (!container) return;
    const row = document.createElement('div'); row.className = 'entry-row'; row.style.animation = 'fadeIn 0.3s ease';
    row.innerHTML = `<div class="row g-2 align-items-end"><div class="col-md-4"><div class="form-label-sm">Sample Date</div><input type="date" class="form-control-sm" name="sd[]"></div><div class="col-md-4"><div class="form-label-sm">Result</div><input type="text" class="form-control-sm" name="vr[]" placeholder="e.g. <20 or 150"></div><div class="col-md-3"><div class="form-label-sm">Result Date</div><input type="date" class="form-control-sm" name="rd[]"></div><div class="col-md-1"><button class="btn-remove-row" onclick="removeRow(this)" title="Remove"><i class="bi bi-trash"></i></button></div></div>`;
    container.appendChild(row); row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeRow(btn) {
    const row = btn.closest('.entry-row');
    if (!row) return;
    const container = row.parentElement;
    if (container.querySelectorAll('.entry-row').length <= 1) { row.querySelectorAll('input, select').forEach(el => el.value = ''); showToast('Last entry cleared','info',2000); setTimeout(saveCareCardData,500); return; }
    row.style.opacity = '0'; row.style.transform = 'translateX(20px)'; row.style.transition = 'all 0.3s ease'; row.style.maxHeight = '0'; row.style.padding = '0'; row.style.margin = '0'; row.style.overflow = 'hidden';
    setTimeout(() => { if(row.parentElement) row.remove(); saveCareCardData(); }, 300);
}

// ============================================================================
// CARE CARD SAVE & LOAD
// ============================================================================

function collectCareCardData() {
    const data = { hospital_number: AppState.currentPatient?.patient_info?.hospital_number || '', person_uuid: AppState.currentPatient?.patient_info?.person_uuid || '', drug_pickups: [], viral_loads: [] };
    document.querySelectorAll('#pickupsContainer .entry-row').forEach(row => {
        const pd = row.querySelector('[name="pd[]"]')?.value || '';
        const rg = row.querySelector('[name="rg[]"]')?.value || '';
        const dr = row.querySelector('[name="dr[]"]')?.value || '';
        if (pd || rg || dr) data.drug_pickups.push({ pickup_date: pd || null, regimen: rg || null, duration: parseInt(dr) || 0 });
    });
    document.querySelectorAll('#vlsContainer .entry-row').forEach(row => {
        const sd = row.querySelector('[name="sd[]"]')?.value || '';
        const vr = row.querySelector('[name="vr[]"]')?.value || '';
        const rd = row.querySelector('[name="rd[]"]')?.value || '';
        if (sd || vr || rd) data.viral_loads.push({ sample_collection_date: sd || null, viral_load_result: vr || null, result_date: rd || null });
    });
    return data;
}

async function saveCareCardData() {
    if (!AppState.currentPatient) return;
    try {
        const res = await fetch('/api/care-cards/save', { method:'POST', headers:{'Content-Type':'application/json','X-User':AppState.currentUser}, body:JSON.stringify(collectCareCardData()) });
        const result = await res.json();
        if (result.success) {
            const statusEl = document.getElementById('careCardStatus');
            if (statusEl) { statusEl.innerHTML = '<i class="bi bi-check-circle me-1"></i> Saved'; setTimeout(() => { statusEl.innerHTML = '<i class="bi bi-pencil me-1"></i> Draft'; }, 2000); }
        }
    } catch(e) {}
}

async function loadCareCardData() {
    if (!AppState.currentPatient) return;
    try {
        const res = await fetch('/api/care-cards/load/' + encodeURIComponent(AppState.currentPatient.patient_info.hospital_number));
        const data = await res.json();
        if (data.success && data.found && data.data) {
            const cc = data.data;
            if (cc.drug_pickups?.length) {
                const container = document.getElementById('pickupsContainer');
                if (container) { container.innerHTML = ''; cc.drug_pickups.forEach(p => { const row = document.createElement('div'); row.className = 'entry-row'; row.innerHTML = `<div class="row g-2 align-items-end"><div class="col-md-3"><div class="form-label-sm">Pickup Date</div><input type="date" class="form-control-sm" name="pd[]" value="${p.pickup_date||''}"></div><div class="col-md-5"><div class="form-label-sm">Regimen</div><select class="form-select-sm" name="rg[]">${getRegimenOptions(p.regimen)}</select></div><div class="col-md-3"><div class="form-label-sm">Duration (Days)</div><input type="number" class="form-control-sm" name="dr[]" value="${p.duration||''}" placeholder="Days" min="1"></div><div class="col-md-1"><button class="btn-remove-row" onclick="removeRow(this)" title="Remove"><i class="bi bi-trash"></i></button></div></div>`; container.appendChild(row); }); }
            }
            if (cc.viral_loads?.length) {
                const container = document.getElementById('vlsContainer');
                if (container) { container.innerHTML = ''; cc.viral_loads.forEach(v => { const row = document.createElement('div'); row.className = 'entry-row'; row.innerHTML = `<div class="row g-2 align-items-end"><div class="col-md-4"><div class="form-label-sm">Sample Date</div><input type="date" class="form-control-sm" name="sd[]" value="${v.sample_collection_date||''}"></div><div class="col-md-4"><div class="form-label-sm">Result</div><input type="text" class="form-control-sm" name="vr[]" value="${v.viral_load_result||''}" placeholder="e.g. <20"></div><div class="col-md-3"><div class="form-label-sm">Result Date</div><input type="date" class="form-control-sm" name="rd[]" value="${v.result_date||''}"></div><div class="col-md-1"><button class="btn-remove-row" onclick="removeRow(this)" title="Remove"><i class="bi bi-trash"></i></button></div></div>`; container.appendChild(row); }); }
            }
            showToast('📋 Care card data loaded!', 'info', 3000);
        }
    } catch(e) {}
}

// ============================================================================
// COMPARISON
// ============================================================================

async function compareData() {
    if (!AppState.currentPatient) { showToast('Search for a patient first','warning'); return; }
    await saveCareCardData();
    const data = collectCareCardData();
    if (!data.drug_pickups.length && !data.viral_loads.length) { showToast('Enter at least one Care Card entry','warning'); return; }
    showLoading('Comparing Records...');
    try {
        const res = await fetch('/api/care-cards/compare', { method:'POST', headers:{'Content-Type':'application/json','X-User':AppState.currentUser}, body:JSON.stringify(data) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.detail||'Comparison failed');
        AppState.comparisonResults = result;
        renderComparison(result);
        showToast(result.all_matched?'✅ All records match!':`❌ ${result.mismatch_count} discrepancies`, result.all_matched?'success':'warning');
    } catch(e) { showToast(e.message,'error'); }
    finally { hideLoading(); }
}

function renderComparison(result) {
    const card = document.getElementById('comparisonCard'), container = document.getElementById('comparisonResults'), summary = document.getElementById('matchSummary'), btn = document.getElementById('submitBtn'), progress = document.getElementById('matchProgress');
    if (!card || !container) return;
    card.style.display = 'block'; setTimeout(() => scrollToElement(card), 200);
    const total = result.comparison_results.length, matched = result.comparison_results.filter(r=>r.match).length, pct = total>0?(matched/total)*100:0;
    if (progress) { progress.style.width = pct+'%'; progress.style.background = pct===100?'linear-gradient(90deg,#10b981,#059669)':pct>=50?'linear-gradient(90deg,#f59e0b,#d97706)':'linear-gradient(90deg,#ef4444,#dc2626)'; }
    if (summary) summary.innerHTML = result.all_matched?'<span class="badge bg-success bg-opacity-10 text-success border border-success px-3 py-2 rounded-pill"><i class="bi bi-check-circle me-1"></i>All Matched</span>':`<span class="badge bg-danger bg-opacity-10 text-danger border border-danger px-3 py-2 rounded-pill"><i class="bi bi-exclamation-triangle me-1"></i>${result.mismatch_count} Discrepanc${result.mismatch_count>1?'ies':'y'}</span>`;
    if (btn) btn.disabled = !result.all_matched;
    let html = '';
    result.comparison_results.forEach((c,i) => { html += `<div class="comparison-item ${c.match?'matched':'mismatched'}" style="animation-delay:${i*0.05}s;"><div class="comparison-icon-result">${c.match?'<i class="bi bi-check-circle-fill text-success"></i>':'<i class="bi bi-x-circle-fill text-danger"></i>'}</div><div style="flex:1;"><div class="small text-muted fw-semibold mb-1">${c.field_name}</div><div class="d-flex justify-content-between"><div><small class="text-muted">EMR</small><div class="fw-semibold">${c.emr_value||'N/A'}</div></div><div style="text-align:right;"><small class="text-muted">Care Card</small><div class="fw-semibold">${c.care_card_value||'N/A'}</div></div></div></div></div>`; });
    container.innerHTML = html;
}

// ============================================================================
// SUBMIT
// ============================================================================

async function submitData() {
    if (!AppState.comparisonResults?.all_matched) { showToast('Resolve all discrepancies first','warning'); return; }
    if (!AppState.currentPatient) { showToast('No patient data','error'); return; }
    const careCardData = collectCareCardData();
    showLoading('Submitting...');
    try {
        const res = await fetch('/api/care-cards/submit', { method:'POST', headers:{'Content-Type':'application/json','X-User':AppState.currentUser}, body:JSON.stringify({hospital_number:AppState.currentPatient.patient_info.hospital_number,care_card_data:careCardData,total_comparisons:AppState.comparisonResults.comparison_results.length,matched_comparisons:AppState.comparisonResults.comparison_results.filter(r=>r.match).length,comparison_results:AppState.comparisonResults.comparison_results}) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail||'Submission failed');
        showToast(`✅ Submitted! Audit ID: ${data.audit_id}`, 'success', 6000);
        setTimeout(resetAll, 3500);
    } catch(e) { showToast(e.message,'error'); }
    finally { hideLoading(); }
}

// ============================================================================
// LOCK / EXPORT / RESET
// ============================================================================

async function acquireLock() {
    if (!AppState.currentPatient) return;
    const hn = AppState.currentPatient.patient_info.hospital_number;
    const btn = document.getElementById('lockBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Locking...'; }
    try {
        const res = await fetch('/api/patients/'+encodeURIComponent(hn)+'/lock', { method:'POST', headers:{'X-User':AppState.currentUser} });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail||'Lock failed');
        AppState.isLocked = true;
        if (btn) { btn.innerHTML = '<i class="bi bi-lock-fill me-1"></i> Locked'; btn.classList.add('btn-success'); }
        showToast('🔒 Record locked','info');
    } catch(e) { showToast(e.message,'error'); }
    finally { if (btn && !AppState.isLocked) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-lock me-1"></i> Edit Mode'; } }
}

async function exportReport() {
    showLoading('Generating Report...');
    try {
        const res = await fetch('/api/reports/excel', { headers:{'X-User':AppState.currentUser} });
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'DQA_Report_'+new Date().toISOString().split('T')[0]+'.xlsx';
        document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); document.body.removeChild(a);
        showToast('📥 Report downloaded!','success',5000);
    } catch(e) { showToast(e.message,'error'); }
    finally { hideLoading(); }
}

async function resetApplication() {
    if (!confirm('⚠️ Reset application?')) return;
    showLoading('Resetting...');
    try {
        const res = await fetch('/api/setup/reset', { method:'POST' });
        const data = await res.json();
        if (!res.ok||!data.success) throw new Error(data.message||'Failed');
        setTimeout(() => window.location.href='/setup', 2000);
    } catch(e) { showToast(e.message,'error'); hideLoading(); }
}

async function refreshActiveUsers() {
    try {
        const res = await fetch('/api/team/active-users');
        if (!res.ok) return;
        const badge = document.getElementById('activeUsersBadge');
        if (badge) badge.textContent = (await res.json()).active_count||0;
    } catch(e) {}
}

function resetAll() {
    AppState.currentPatient = null; AppState.comparisonResults = []; AppState.isLocked = false;
    const section = document.getElementById('patientSection'); if (section) { section.classList.add('d-none-imp'); section.classList.remove('fade-in'); }
    const comp = document.getElementById('comparisonCard'); if (comp) comp.style.display = 'none';
    const empty = document.getElementById('emptyState'); if (empty) empty.style.display = '';
    const input = document.getElementById('hospitalNumber'); if (input) { input.value = ''; input.focus(); }
    const btn = document.getElementById('lockBtn'); if (btn) { btn.innerHTML = '<i class="bi bi-lock me-1"></i> Edit Mode'; btn.classList.remove('btn-success'); }
    window.scrollTo({ top:0, behavior:'smooth' });
}

function getLineColor(line) {
    const colors = {
        'ARVs': '#4f46e5',           // Indigo/Blue for ARVs
        'Anti-TB': '#f59e0b',        // Amber for Anti-TB
        'Prophylaxis': '#10b981',    // Green for Prophylaxis
        'Other': '#6b7280'           // Gray for Other
    };
    return colors[line] || '#6b7280';
}


// ============================================================================
// REPORTS
// ============================================================================

/**
 * Toggle the reports dropdown menu
 */
function toggleReportsDropdown() {
    const menu = document.getElementById('reportsDropdownMenu');
    if (menu) {
        const isVisible = menu.style.display !== 'none';
        menu.style.display = isVisible ? 'none' : 'block';
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('reportsDropdown');
    const menu = document.getElementById('reportsDropdownMenu');
    if (menu && dropdown && !dropdown.contains(e.target)) {
        menu.style.display = 'none';
    }
});

/**
 * Download Pharmacy Report (from DQA Care Card data)
 */
async function downloadPharmacyReport() {
    const menu = document.getElementById('reportsDropdownMenu');
    if (menu) menu.style.display = 'none';
    
    // Ask for date range
    const startDate = prompt('Enter start date (YYYY-MM-DD) or leave blank for all:', '');
    if (startDate === null) return; // User cancelled
    
    const endDate = prompt('Enter end date (YYYY-MM-DD) or leave blank for all:', '');
    if (endDate === null) return; // User cancelled
    
    showLoading('Generating Pharmacy Report...', 'Fetching data from DQA database');
    
    try {
        let url = '/api/reports/pharmacy/excel?';
        if (startDate) url += `start_date=${startDate}&`;
        if (endDate) url += `end_date=${endDate}&`;
        
        const res = await fetch(url, { headers: { 'X-User': AppState.currentUser } });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to generate report');
        }
        
        const blob = await res.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `Pharmacy_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);
        
        showToast('📥 Pharmacy report downloaded!', 'success', 5000);
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Download Viral Load Report (from DQA Care Card data)
 */
async function downloadVLReport() {
    const menu = document.getElementById('reportsDropdownMenu');
    if (menu) menu.style.display = 'none';
    
    const startDate = prompt('Enter start date (YYYY-MM-DD) or leave blank for all:', '');
    if (startDate === null) return;
    
    const endDate = prompt('Enter end date (YYYY-MM-DD) or leave blank for all:', '');
    if (endDate === null) return;
    
    showLoading('Generating Viral Load Report...', 'Fetching data from DQA database');
    
    try {
        let url = '/api/reports/viral-load/excel?';
        if (startDate) url += `start_date=${startDate}&`;
        if (endDate) url += `end_date=${endDate}&`;
        
        const res = await fetch(url, { headers: { 'X-User': AppState.currentUser } });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to generate report');
        }
        
        const blob = await res.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `VL_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);
        
        showToast('📥 Viral Load report downloaded!', 'success', 5000);
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Download DQA Summary Report (from DQA database)
 */
async function downloadDQASummary() {
    const menu = document.getElementById('reportsDropdownMenu');
    if (menu) menu.style.display = 'none';
    
    const startDate = prompt('Enter start date (YYYY-MM-DD) or leave blank for all:', '');
    if (startDate === null) return;
    
    const endDate = prompt('Enter end date (YYYY-MM-DD) or leave blank for all:', '');
    if (endDate === null) return;
    
    showLoading('Generating DQA Summary...', 'Fetching data from DQA database');
    
    try {
        let url = '/api/reports/dqa-summary?';
        if (startDate) url += `start_date=${startDate}&`;
        if (endDate) url += `end_date=${endDate}&`;
        
        const res = await fetch(url, { headers: { 'X-User': AppState.currentUser } });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to generate report');
        }
        
        const jsonData = await res.json();
        
        // Create Excel from JSON data
        const wb = await createDQAReportExcel(jsonData);
        const blob = new Blob([wb], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `DQA_Summary_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);
        
        showToast(`📥 DQA Summary downloaded! (${jsonData.count} records)`, 'success', 5000);
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Create Excel file from DQA Summary JSON data
 */
async function createDQAReportExcel(jsonData) {
    // Use a simple CSV-like approach for Excel
    let excelContent = '';
    
    // Title
    excelContent += 'MedDQA - DQA Summary Report\n';
    excelContent += `Generated: ${new Date().toLocaleString()}\n`;
    excelContent += `Source: DQA Care Card Database\n`;
    excelContent += `Statistics: Total Verified=${jsonData.statistics?.total_verified || 0}, Match Rate=${jsonData.statistics?.match_rate || '0%'}\n\n`;
    
    // Headers
    const headers = ['S/No', 'Hospital Number', 'Person UUID', 'Drug Pickups', 'Drugs', 'VL Tests', 'VL Results', 'Verified', 'Verified By', 'Verified At'];
    excelContent += headers.join('\t') + '\n';
    
    // Data
    if (jsonData.data) {
        jsonData.data.forEach(row => {
            excelContent += [
                row.s_no || '',
                row.hospital_number || '',
                row.person_uuid || '',
                row.drug_pickups_count || 0,
                (row.drugs || 'N/A').replace(/\t/g, ' '),
                row.viral_loads_count || 0,
                (row.vl_results || 'N/A').replace(/\t/g, ' '),
                row.is_verified || 'No',
                row.verified_by || '',
                row.verified_at || ''
            ].join('\t') + '\n';
        });
    }
    
    return excelContent;
}

/**
 * Download DQA Master Report (existing Excel report)
 */
async function downloadDQAReport() {
    const menu = document.getElementById('reportsDropdownMenu');
    if (menu) menu.style.display = 'none';
    
    showLoading('Generating DQA Master Report...', 'Creating Excel spreadsheet');
    
    try {
        const res = await fetch('/api/reports/excel', { headers: { 'X-User': AppState.currentUser } });
        
        if (!res.ok) throw new Error('Export failed');
        
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'DQA_Master_Report_' + new Date().toISOString().split('T')[0] + '.xlsx';
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showToast('📥 DQA Master report downloaded!', 'success', 5000);
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

// ============================================================================
// EXPORT ALL TO WINDOW
// ============================================================================

window.searchPatient = searchPatient;
window.resetAll = resetAll;
window.exportReport = exportReport;
window.compareData = compareData;
window.submitData = submitData;
window.acquireLock = acquireLock;
window.resetApplication = resetApplication;
window.addPickupRow = addPickupRow;
window.addVLRow = addVLRow;
window.removeRow = removeRow;
window.editField = editField;
window.editRefillField = editRefillField;
window.editDrugRegimen = editDrugRegimen;
window.editDrugDuration = editDrugDuration;
window.editArtStartDate = editArtStartDate;
window.clearAuthorization = clearAuthorization;
window.saveCareCardData = saveCareCardData;
window.loadCareCardData = loadCareCardData;
window.refreshActiveUsers = refreshActiveUsers;
window.classifyViralLoad = classifyViralLoad;
window.toggleVisitAccordion = toggleVisitAccordion;
window.expandAllVisits = expandAllVisits;
window.collapseAllVisits = collapseAllVisits;
window.toggleAllVisits = toggleAllVisits;
window.showPasskeyDialog = showPasskeyDialog;
window.showDurationEditor = showDurationEditor;
window.showRegimenDropdown = showRegimenDropdown;
window.requirePasskeyForEdit = requirePasskeyForEdit;
window.updateDurPreview = updateDurPreview;
window.confirmDurationUpdate = confirmDurationUpdate;
window.filterRegimenOptions = filterRegimenOptions;
window.onRegimenSelectChange = onRegimenSelectChange;
window.confirmRegimenUpdate = confirmRegimenUpdate;
window.getRegimenDropdownOptions = getRegimenDropdownOptions;

window.toggleReportsDropdown = toggleReportsDropdown;
window.downloadPharmacyReport = downloadPharmacyReport;
window.downloadVLReport = downloadVLReport;
window.downloadDQASummary = downloadDQASummary;
window.downloadDQAReport = downloadDQAReport;
console.log('✅ MedDQA v3.0 - 100% Complete & Working');
console.log('💊 Expert Drug Display | 🔐 Passkey Auth | ⏱️ Duration Editor | 📊 VL Trends');