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
    console.log('🚀 MedDQA Initializing...');
    initializeApp();
    setupEventListeners();
    loadRegimens();
    refreshActiveUsers();
    setInterval(refreshActiveUsers, 30000);
    setupKeyboardShortcuts();
    checkAuthorizationStatus();
    injectAITriggerButton();   // ← ADD THIS
    console.log('✅ MedDQA Ready');
});

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

function initializeApp() {
    const userStr = localStorage.getItem('meddqa_user');
    const token = localStorage.getItem('meddqa_token');
    
    if (token && userStr) {
        try {
            const userData = JSON.parse(userStr);
            AppState.currentUser = userData.full_name || userData.username || 'User';
        } catch(e) {
            AppState.currentUser = userStr || generateUserId();
        }
    } else {
        AppState.currentUser = localStorage.getItem('meddqa_legacy_user') || generateUserId();
    }
    
    if (!localStorage.getItem('meddqa_legacy_user')) {
        localStorage.setItem('meddqa_legacy_user', AppState.currentUser);
    }
    
    const userEl = document.getElementById('currentUser');
    if (userEl) {
        userEl.textContent = AppState.currentUser;
    }
    
    const avatar = document.getElementById('userAvatar');
    if (avatar && AppState.currentUser) {
        const name = AppState.currentUser;
        const initials = name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().substring(0, 2);
        avatar.textContent = initials;
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
    
    if (!token && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/setup')) {
        window.location.href = '/login';
    }
}

function generateUserId() {
    return 'DQA' + 'Team' + Math.floor(Math.random() * 100);
}

// ============================================================================
// AUTHORIZATION
// ============================================================================

function checkAuthorizationStatus() {
    updateAuthIndicator();
}

function updateUIForRole() {
    const userStr = localStorage.getItem('meddqa_user');
    if (!userStr) return;
    
    try {
        const userData = JSON.parse(userStr);
        const role = userData.role || '';
        const isAdmin = (role === 'admin');
        
        // ✅ User Management - Admin only
        const userMgmtBtn = document.getElementById('userManagementBtn');
        if (userMgmtBtn) {
            userMgmtBtn.style.display = isAdmin ? 'inline-flex' : 'none';
        }
        
        // ✅ Admin-only dropdown items (MEDDQA Report, Dashboard, Divider)
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = isAdmin ? 'flex' : 'none';
        });
        
        // ✅ Lab Settings - Admin only
        const labSettingsBtn = document.getElementById('labSettingsBtn');
        if (labSettingsBtn) {
            labSettingsBtn.style.display = isAdmin ? 'inline-flex' : 'none';
        }
        
        // ✅ Reset Application - Admin only
        const resetAppBtn = document.getElementById('resetAppBtn');
        if (resetAppBtn) {
            resetAppBtn.style.display = isAdmin ? 'inline-flex' : 'none';
        }
        
        console.log('👤 Role:', role, '| Admin:', isAdmin);
        
    } catch(e) {
        console.error('Error checking role:', e);
    }
}
document.addEventListener('DOMContentLoaded', function() {
    updateUIForRole();
});

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
// LOAD REGIMENS
// ============================================================================

async function loadRegimens() {
    try {
        const data = await MedAPI.reference.regimens();
        if (data.success) AppState.regimens = data.regimens;
    } catch(e) {
        AppState.regimens = [
            {name:"TDF/3TC/DTG",line:"ARVs"},
            {name:"ABC/3TC/DTG",line:"ARVs"},
            {name:"TAF/3TC/DTG",line:"ARVs"},
            {name:"AZT/3TC/DTG",line:"ARVs"},
            {name:"AZT/3TC/EFV",line:"ARVs"},
            {name:"AZT/3TC/NVP",line:"ARVs"},
            {name:"Isoniazid (INH) 300mg",line:"Anti-TB"},
            {name:"3HP (Isoniazid + Rifapentine)",line:"Anti-TB"},
            {name:"Cotrimoxazole 960mg",line:"Prophylaxis"},
            {name:"Cotrimoxazole 480mg",line:"Prophylaxis"},
            {name:"Cotrimoxazole 800mg",line:"Prophylaxis"},
            {name:"Fluconazole 200mg",line:"Prophylaxis"},
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
        const data = await MedAPI.patients.search(hn);
        if (!data.success) throw new Error(data.detail || 'Patient not found');
        
        AppState.currentPatient = data.data;
        
        const emptyState = document.getElementById('emptyState');
        if (emptyState) emptyState.style.display = 'none';
        
        const patientSection = document.getElementById('patientSection');
        if (patientSection) { patientSection.classList.remove('d-none-imp'); patientSection.classList.add('fade-in'); setTimeout(() => scrollToElement(patientSection), 300); }
        
        renderEMRData(data.data);
        resetReviewUI();
        MedAlerts.run(data.data);
        
        // ✅ Check if this patient has been verified and show print button
        checkExistingVerification(hn);
        
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

function resetReviewUI() {
    const reviewContent = document.getElementById('reviewWorkflowContent');
    if (reviewContent) reviewContent.innerHTML = '';
    
    const careCardTitle = document.getElementById('careCardTitle');
    if (careCardTitle) careCardTitle.textContent = 'Care Card Verification';
    
    const careCardBadge = document.getElementById('careCardBadge');
    if (careCardBadge) {
        careCardBadge.innerHTML = '<span class="pulse-dot"></span>Ready';
        careCardBadge.className = 'card-badge live';
        careCardBadge.style.background = '#ecfdf5';
        careCardBadge.style.color = '#059669';
        careCardBadge.style.border = '1px solid #a7f3d0';
    }
    
    const startBtn = document.getElementById('btnStartReview');
    if (startBtn) startBtn.style.display = 'inline-flex';
    
    // ✅ Hide print button and reviewed badge
    const printBtn = document.getElementById('btnPrintReport');
    if (printBtn) printBtn.style.display = 'none';
    
    const reviewedBadge = document.getElementById('reviewedStatusBadge');
    if (reviewedBadge) reviewedBadge.style.display = 'none';
    
    const reviewedByText = document.getElementById('reviewedByText');
    if (reviewedByText) reviewedByText.textContent = '';
    
    // Show empty state
    const emptyState = document.getElementById('reviewEmptyState');
    if (emptyState) emptyState.style.display = 'block';
}

// ============================================================================
// RENDER EMR DATA
// ============================================================================

function renderEMRData(data) {
    const container = document.getElementById('emrContent');
    if (!container) return;

    const p             = data.patient_info;
    const refills       = data.refill_history     || [];
    const vls           = data.viral_load_history || [];
    const reg           = data.current_regimen    || {};
    const cv            = data.client_verification;
    const art           = data.current_art_status;
    const visits        = groupRefillsByVisit(refills);
    const latestVLCls   = vls.length ? classifyViralLoad(vls[0]?.viral_load_result || 'N/A') : null;

    // ── shared token ──────────────────────────────────────────────────────
    const T = {
        primary : '#3b4fd8',  pLight: '#eef0fd',  pBorder: '#bfc8f8',
        success : '#059669',  sLight: '#ecfdf5',  sBorder: '#86efac',
        warning : '#d97706',  wLight: '#fffbeb',  wBorder: '#fde68a',
        danger  : '#dc2626',  dLight: '#fef2f2',  dBorder: '#fecaca',
        text    : '#0d1117',  sub   : '#475569',  muted  : '#94a3b8',
        border  : '#e1e6ef',  bg    : '#f8f9fe',
        card    : (c,b) => `background:${c};border:1px solid ${b};border-radius:14px;`,
    };

    let h = '';

    // ════════════════════════════════════════════════════════════════════
    // 1 ▸ PATIENT HERO
    // ════════════════════════════════════════════════════════════════════
    const initials    = (p.first_name?.[0]||'')+(p.surname?.[0]||'');
    const fullName    = `${p.first_name||''} ${p.other_name||''} ${p.surname||''}`.replace(/\s+/g,' ').trim();
    const sex         = (p.sex||'').toLowerCase();
    const sexIcon     = sex==='female' ? 'bi-gender-female' : sex==='male' ? 'bi-gender-male' : 'bi-person';
    const sexColor    = sex==='female' ? '#db2777' : sex==='male' ? '#2563eb' : '#64748b';
    const artYears    = p.art_start_date
        ? Math.floor((Date.now() - new Date(p.art_start_date).getTime()) / (365.25*24*3600*1000))
        : null;

    h += `
    <div style="position:relative;border-radius:18px;overflow:hidden;margin-bottom:16px;
                box-shadow:0 4px 24px rgba(59,79,216,.12);">

        <!-- ░░ Background gradient mesh ░░ -->
        <div style="position:absolute;inset:0;background:linear-gradient(135deg,#1e2d8f 0%,#3b4fd8 45%,#0891b2 100%);opacity:1;"></div>

        <!-- ░░ Decorative circles ░░ -->
        <div style="position:absolute;top:-40px;right:-40px;width:200px;height:200px;
                    border-radius:50%;background:rgba(255,255,255,.06);pointer-events:none;"></div>
        <div style="position:absolute;bottom:-60px;left:-20px;width:160px;height:160px;
                    border-radius:50%;background:rgba(255,255,255,.04);pointer-events:none;"></div>
        <div style="position:absolute;top:20px;right:120px;width:80px;height:80px;
                    border-radius:50%;background:rgba(255,255,255,.03);pointer-events:none;"></div>

        <!-- ░░ Dot grid pattern ░░ -->
        <svg style="position:absolute;inset:0;width:100%;height:100%;opacity:.07;pointer-events:none;"
             xmlns="http://www.w3.org/2000/svg">
            <pattern id="ph-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.5" fill="white"/>
            </pattern>
            <rect width="100%" height="100%" fill="url(#ph-dots)"/>
        </svg>

        <!-- ░░ Content ░░ -->
        <div style="position:relative;z-index:1;padding:20px 22px;">

            <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">

                <!-- Avatar with hover-reveal edit ring -->
                <div style="flex-shrink:0;position:relative;" class="patient-avatar-wrap">

                    <!-- Avatar circle -->
                    <div style="width:70px;height:70px;border-radius:50%;
                                background:rgba(255,255,255,.18);
                                border:3px solid rgba(255,255,255,.35);
                                display:flex;align-items:center;justify-content:center;
                                font-size:1.6rem;font-weight:900;color:#fff;
                                letter-spacing:-.02em;
                                box-shadow:0 0 0 6px rgba(255,255,255,.08),
                                           0 8px 24px rgba(0,0,0,.2);">
                        ${initials}
                    </div>

                    <!-- Sex icon badge -->
                    <div style="position:absolute;bottom:-2px;right:-2px;
                                width:22px;height:22px;border-radius:50%;
                                background:${sexColor};border:2px solid #fff;
                                display:flex;align-items:center;justify-content:center;
                                font-size:.65rem;color:#fff;
                                box-shadow:0 2px 6px rgba(0,0,0,.2);">
                        <i class="bi ${sexIcon}"></i>
                    </div>
                </div>

                <!-- Name + meta -->
                <div style="flex:1;min-width:0;">

                    <!-- Name row — each part has its own hover-reveal edit button -->
                    <div class="patient-name-row" style="display:flex;align-items:center;gap:6px;
                                margin-bottom:6px;flex-wrap:wrap;">
                        <!-- First name -->
                        <span class="patient-name-part" style="position:relative;display:inline-flex;align-items:center;gap:4px;">
                            <h2 style="font-size:1.25rem;font-weight:800;letter-spacing:-.025em;
                                       color:#fff;margin:0;line-height:1.2;text-shadow:0 1px 4px rgba(0,0,0,.15);">
                                ${p.first_name||''}
                            </h2>
                            <button class="patient-edit-name-btn"
                                    onclick="editField('first_name','${(p.first_name||'').replace(/'/g,"\\'")}','patient')"
                                    title="Edit first name">
                                <i class="bi bi-pencil" style="font-size:.55rem;"></i>
                            </button>
                        </span>
                        <!-- Other name (middle) -->
                        ${p.other_name ? `
                        <span class="patient-name-part" style="position:relative;display:inline-flex;align-items:center;gap:4px;">
                            <h2 style="font-size:1.25rem;font-weight:800;letter-spacing:-.025em;
                                       color:rgba(255,255,255,.75);margin:0;line-height:1.2;">
                                ${p.other_name}
                            </h2>
                            <button class="patient-edit-name-btn"
                                    onclick="editField('other_name','${(p.other_name||'').replace(/'/g,"\\'")}','patient')"
                                    title="Edit middle name">
                                <i class="bi bi-pencil" style="font-size:.55rem;"></i>
                            </button>
                        </span>` : `
                        <span class="patient-name-part" style="position:relative;display:inline-flex;align-items:center;gap:4px;">
                            <span style="font-size:0.72rem;color:rgba(255,255,255,.35);font-style:italic;">
                                + middle name
                            </span>
                            <button class="patient-edit-name-btn"
                                    onclick="editField('other_name','','patient')"
                                    title="Add middle name">
                                <i class="bi bi-plus" style="font-size:.6rem;"></i>
                            </button>
                        </span>`}
                        <!-- Surname -->
                        <span class="patient-name-part" style="position:relative;display:inline-flex;align-items:center;gap:4px;">
                            <h2 style="font-size:1.25rem;font-weight:800;letter-spacing:-.025em;
                                       color:#fff;margin:0;line-height:1.2;text-shadow:0 1px 4px rgba(0,0,0,.15);">
                                ${p.surname||''}
                            </h2>
                            <button class="patient-edit-name-btn"
                                    onclick="editField('surname','${(p.surname||'').replace(/'/g,"\\'")}','patient')"
                                    title="Edit surname">
                                <i class="bi bi-pencil" style="font-size:.55rem;"></i>
                            </button>
                        </span>
                    </div>

                    <!-- Hospital number chip + meta row -->
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                        <span style="display:inline-flex;align-items:center;gap:5px;
                                     background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);
                                     padding:4px 12px;border-radius:50px;
                                     font-size:0.78rem;font-weight:700;color:#fff;
                                     font-family:monospace;letter-spacing:.04em;">
                            <i class="bi bi-hash" style="font-size:.7rem;opacity:.7;"></i>
                            ${p.hospital_number||'—'}
                        </span>
                        ${artYears!==null&&artYears>=0
                            ? `<span style="display:inline-flex;align-items:center;gap:4px;
                                           background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);
                                           padding:3px 10px;border-radius:50px;
                                           font-size:0.7rem;font-weight:600;color:rgba(255,255,255,.85);">
                                   <i class="bi bi-clock-history" style="font-size:.6rem;"></i>
                                   ${artYears}yr on ART
                               </span>` : ''}
                    </div>

                    <!-- Facility + location row -->
                    <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:0.73rem;
                                color:rgba(255,255,255,.7);">
                        <span><i class="bi bi-building me-1" style="opacity:.6;"></i>${p.facility_name||'—'}</span>
                        <span><i class="bi bi-geo-alt me-1" style="opacity:.6;"></i>${p.state||'—'}${p.lga?`, ${p.lga}`:''}</span>
                    </div>

                    <!-- VL badge + regimen pill -->
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
                        ${latestVLCls ? latestVLCls.badge : ''}
                        ${reg.current_regimen
                            ? `<span style="display:inline-flex;align-items:center;gap:4px;
                                           background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);
                                           padding:3px 10px;border-radius:50px;
                                           font-size:0.7rem;font-weight:600;color:#fff;">
                                   <i class="bi bi-capsule" style="font-size:.65rem;opacity:.75;"></i>
                                   ${reg.current_regimen}
                               </span>` : ''}
                    </div>
                </div>

                <!-- Stats panel — right side -->
                <div style="flex-shrink:0;display:flex;gap:0;
                            background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);
                            border-radius:14px;overflow:hidden;backdrop-filter:blur(8px);">
                    ${[
                        ['Visits',  visits.length,  'bi-calendar-event'],
                        ['Drugs',   refills.length, 'bi-capsule-fill'],
                        ['VL Tests',vls.length,     'bi-droplet-fill'],
                    ].map(([l,v,ic],idx,arr)=>`
                    <div style="padding:14px 18px;text-align:center;
                                ${idx<arr.length-1?'border-right:1px solid rgba(255,255,255,.15);':''}">
                        <div style="font-size:1.6rem;font-weight:900;color:#fff;
                                    line-height:1;text-shadow:0 2px 8px rgba(0,0,0,.15);">${v}</div>
                        <div style="font-size:0.58rem;font-weight:700;color:rgba(255,255,255,.6);
                                    text-transform:uppercase;letter-spacing:.06em;margin-top:3px;">
                            <i class="bi ${ic} me-1"></i>${l}
                        </div>
                    </div>`).join('')}
                </div>

            </div>
        </div>
    </div>`;

    // Inject hover-reveal CSS for the patient hero (once per render)
    if (!document.getElementById('patient-hero-hover-css')) {
        const style = document.createElement('style');
        style.id = 'patient-hero-hover-css';
        style.textContent = `
            .patient-name-part .patient-edit-name-btn {
                opacity: 0;
                transform: scale(0.7);
                transition: opacity .18s ease, transform .18s ease, background .15s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: rgba(255,255,255,.15);
                border: 1px solid rgba(255,255,255,.3);
                color: #fff;
                cursor: pointer;
                flex-shrink: 0;
            }
            .patient-name-part:hover .patient-edit-name-btn {
                opacity: 1;
                transform: scale(1);
            }
            .patient-edit-name-btn:hover {
                background: rgba(255,255,255,.32) !important;
                border-color: rgba(255,255,255,.6) !important;
            }
        `;
        document.head.appendChild(style);
    }

    // ════════════════════════════════════════════════════════════════════
    // 2 ▸ ROC VERIFICATION + ART STATUS
    // ════════════════════════════════════════════════════════════════════
    if (cv && cv.verification_outcome) {
        const ok     = cv.verification_status === 'Verified' || cv.verification_outcome === 'Verified';
        const c      = ok ? T.success : T.warning;
        const bg     = ok ? T.sLight  : T.wLight;
        const bdr    = ok ? T.sBorder : T.wBorder;
        const artC   = art?.status === 'Active' ? T.success : art?.status === 'IIT' ? T.danger : T.warning;
        const artBg  = art?.status === 'Active' ? T.sLight  : art?.status === 'IIT' ? T.dLight  : T.wLight;
        const artBdr = art?.status === 'Active' ? T.sBorder : art?.status === 'IIT' ? T.dBorder : T.wBorder;

        h += `
        <div style="background:${bg};border:1.5px solid ${bdr};border-radius:14px;
                    padding:14px 16px;margin-bottom:14px;
                    display:flex;align-items:center;gap:12px;flex-wrap:wrap;">

            <div style="flex-shrink:0;width:42px;height:42px;border-radius:50%;
                        background:linear-gradient(135deg,${c},${ok?'#047857':'#b45309'});
                        display:flex;align-items:center;justify-content:center;
                        font-size:1.2rem;color:#fff;
                        box-shadow:0 4px 12px ${ok?'rgba(5,150,105,.25)':'rgba(217,119,6,.25)'};">
                <i class="bi ${ok?'bi-person-check':'bi-person-exclamation'}"></i>
            </div>

            <div style="flex:1;min-width:150px;">
                <div style="font-size:0.7rem;font-weight:700;color:${c};text-transform:uppercase;
                            letter-spacing:.05em;margin-bottom:6px;">
                    <i class="bi ${ok?'bi-shield-check':'bi-shield-exclamation'} me-1"></i>
                    ROC Verification
                </div>
                <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:0.78rem;color:${T.sub};">
                    <span>
                        <span style="color:${T.muted};">Outcome </span>
                        <strong style="color:${c};">${cv.verification_outcome||'—'}</strong>
                    </span>
                    <span>
                        <span style="color:${T.muted};">Status </span>
                        <strong>${cv.verification_status||'—'}</strong>
                    </span>
                    <span>
                        <span style="color:${T.muted};">Date </span>
                        ${formatDate(cv.date_of_outcome)}
                    </span>
                </div>
            </div>

            ${art ? `
            <div style="flex-shrink:0;background:#fff;border:1.5px solid ${artBdr};border-radius:10px;
                        padding:10px 18px;text-align:center;min-width:100px;">
                <div style="font-size:0.58rem;font-weight:700;color:${T.muted};text-transform:uppercase;
                            letter-spacing:.06em;margin-bottom:3px;">ART Status</div>
                <div style="font-size:1rem;font-weight:800;color:${artC};">
                    <i class="bi ${art.status==='Active'?'bi-check-circle-fill':art.status==='IIT'?'bi-x-circle-fill':'bi-exclamation-circle-fill'} me-1"></i>
                    ${art.status||'—'}
                </div>
            </div>` : ''}
        </div>`;
    }

    // ════════════════════════════════════════════════════════════════════
    // 3 ▸ BIODATA GRID
    // ════════════════════════════════════════════════════════════════════
    h += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));
                      gap:8px;margin-bottom:14px;">`;
    h += makeInfoCell('Sex',           p.sex||'—',                              true, 'sex',          'patient');
    h += makeInfoCell('Date of Birth', formatDate(p.date_of_birth),             true, 'date_of_birth', 'patient');
    h += makeInfoCell('Other Name',    p.other_name||'—',                       true, 'other_name',   'patient');
    h += makeArtStartDateCell('ART Start',  p.art_start_date||p.date_enrolled,  p.hospital_number);
    h += makeInfoCell('Enrolled',      formatDate(p.date_enrolled),             true, 'date_enrolled','patient');
    h += makeInfoCell('LGA',           p.lga||'—',                              false);
    h += makeInfoCell('Unique ID',     p.unique_id||'—',                        false);
    h += makeInfoCell('Person UUID',   (p.person_uuid||'').slice(0,10)+'…',     false);
    h += '</div>';

    // ════════════════════════════════════════════════════════════════════
    // 4 ▸ CURRENT REGIMEN BANNER
    // ════════════════════════════════════════════════════════════════════
    if (reg.current_regimen) {
        h += `
        <div style="${T.card('#fff',T.border)} padding:14px 16px;margin-bottom:14px;
                    border-left:4px solid ${T.primary};">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <div>
                    <div style="font-size:0.62rem;font-weight:700;color:${T.muted};text-transform:uppercase;
                                letter-spacing:.06em;margin-bottom:4px;">
                        <i class="bi bi-capsule me-1"></i>Current Regimen
                    </div>
                    <div style="font-size:1rem;font-weight:800;color:${T.primary};margin-bottom:2px;">
                        ${reg.current_regimen}
                    </div>
                    ${reg.current_regimen_line
                        ? `<div style="font-size:0.72rem;color:${T.muted};font-weight:500;">
                               ${reg.current_regimen_line}
                           </div>` : ''}
                </div>
                <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.75rem;color:${T.sub};">
                    <span>
                        <i class="bi bi-calendar-check me-1" style="color:${T.primary};"></i>
                        Picked up <strong>${formatDate(reg.last_pickup_date)}</strong>
                    </span>
                    <span>
                        <i class="bi bi-calendar-event me-1" style="color:${T.primary};"></i>
                        Next appt <strong>${formatDate(reg.next_appointment)}</strong>
                    </span>
                </div>
            </div>
        </div>`;
    }

    // ════════════════════════════════════════════════════════════════════
    // 5 ▸ DRUG DISPENSING HISTORY
    // ════════════════════════════════════════════════════════════════════
    h += `
    <div class="drugs-master-section">
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:10px;flex-wrap:wrap;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
                <div style="width:28px;height:28px;border-radius:8px;
                            background:${T.pLight};color:${T.primary};
                            display:flex;align-items:center;justify-content:center;font-size:.85rem;">
                    <i class="bi bi-capsule-fill"></i>
                </div>
                <span style="font-weight:700;font-size:0.9rem;color:${T.text};">
                    Drug Dispensing History
                </span>
                <span style="background:${T.pLight};color:${T.primary};border:1px solid ${T.pBorder};
                             font-size:0.68rem;font-weight:600;padding:2px 9px;border-radius:50px;">
                    ${visits.length} visit${visits.length!==1?'s':''} · ${refills.length} drug${refills.length!==1?'s':''}
                </span>
            </div>
            <div style="display:flex;gap:6px;">
                <button onclick="expandAllVisits()"
                        style="padding:5px 12px;border-radius:50px;font-size:0.72rem;font-weight:600;
                               border:1px solid ${T.border};background:#fff;color:${T.sub};cursor:pointer;">
                    <i class="bi bi-arrows-expand me-1"></i>Expand
                </button>
                <button onclick="collapseAllVisits()"
                        style="padding:5px 12px;border-radius:50px;font-size:0.72rem;font-weight:600;
                               border:1px solid ${T.border};background:#fff;color:${T.sub};cursor:pointer;">
                    <i class="bi bi-arrows-collapse me-1"></i>Collapse
                </button>
            </div>
        </div>`;

    if (visits.length > 0) {
        const LIMIT = 5;
        h += '<div class="visits-accordion">';

        visits.forEach((visit, vi) => {
            const isLatest  = vi === 0;
            const isHidden  = vi >= LIMIT;
            const drugs     = visit.refills;
            const first     = drugs[0];
            const nextAppt  = first?.next_appointment || '';
            const mmd       = first?.mmd_type  || '';
            const dsd       = first?.dsd_model || '';

            h += `
            <div class="visit-accordion-item ${isLatest?'visit-latest':''} ${isHidden?'visit-hidden':''}"
                 data-visit-index="${vi}">

                <!-- ─ Accordion header ─────────────────────────────── -->
                <div class="visit-accordion-header" onclick="toggleVisitAccordion(this)"
                     style="display:flex;align-items:center;gap:10px;padding:11px 14px;
                            cursor:pointer;background:${isLatest?T.pLight:'#fff'};
                            border-radius:${isLatest?'12px 12px 0 0':'10px 10px 0 0'};
                            transition:background .15s;">

                    <!-- Visit number dot -->
                    <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;
                                background:${isLatest?`linear-gradient(135deg,${T.primary},#2a3ab5)`:'#f1f3fc'};
                                color:${isLatest?'#fff':T.muted};
                                display:flex;align-items:center;justify-content:center;
                                font-size:${isLatest?'.62rem':'.72rem'};font-weight:800;
                                ${isLatest?'box-shadow:0 3px 8px rgba(59,79,216,.28);':''}"
                         class="${isLatest?'dot-pulse':''}">
                        ${isLatest?'<i class="bi bi-star-fill" style="font-size:.55rem;"></i>':(visits.length-vi)}
                    </div>

                    <!-- Summary text -->
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px;">
                            <span style="font-weight:700;font-size:0.82rem;
                                         color:${isLatest?T.primary:T.text};">
                                <i class="bi bi-calendar-event me-1"></i>${formatDate(visit.visit_date)}
                            </span>
                            ${isLatest?`<span style="background:${T.primary};color:#fff;font-size:0.55rem;
                                               font-weight:700;padding:1px 7px;border-radius:4px;
                                               letter-spacing:.04em;">LATEST</span>`:''}
                            <span style="font-size:0.72rem;color:${T.muted};">
                                <i class="bi bi-capsule-fill me-1"></i>${drugs.length} drug${drugs.length!==1?'s':''}
                            </span>
                            ${mmd?`<span style="background:#ecfeff;color:#0e7490;border:1px solid #a5f3fc;
                                              font-size:0.65rem;font-weight:600;padding:1px 7px;border-radius:50px;">
                                       ${mmd}</span>`:''}
                        </div>
                        <div style="display:flex;gap:5px;flex-wrap:wrap;">
                            ${drugs.map(d=>`
                            <span style="background:${T.pLight};color:${T.primary};border:1px solid ${T.pBorder};
                                         font-size:0.65rem;font-weight:600;padding:1px 8px;border-radius:6px;
                                         display:flex;align-items:center;gap:3px;">
                                ${getDrugShortName(d.regimen_name||'?')}
                                <span style="opacity:.6;font-weight:400;">${d.duration||0}d</span>
                            </span>`).join('')}
                        </div>
                    </div>

                    <div class="visit-accordion-chevron">
                        <i class="bi bi-chevron-down" style="font-size:.75rem;color:${T.muted};
                                                              transition:transform .25s;"></i>
                    </div>
                </div>

                <!-- ─ Accordion body ───────────────────────────────── -->
                <div class="visit-accordion-body" style="display:none;border-top:1px solid ${T.border};">

                    <!-- Visit meta bar -->
                    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;
                                padding:10px 14px;background:${T.bg};font-size:0.75rem;color:${T.sub};
                                border-bottom:1px solid ${T.border};">
                        <span style="display:flex;align-items:center;gap:5px;">
                            <i class="bi bi-calendar-check" style="color:${T.primary};"></i>
                            Next appt: <strong>${formatDate(nextAppt)}</strong>
                            <button class="btn-edit-xs auth-required"
                                    onclick="event.stopPropagation();editRefillField('${nextAppt}','next_appointment','${first?.id}','Next Appointment')"
                                    title="Edit">
                                <i class="bi bi-shield-lock"></i>
                            </button>
                        </span>
                        ${dsd?`<span><i class="bi bi-people me-1" style="color:${T.muted};"></i>DSD: <strong>${dsd}</strong></span>`:''}
                        <button class="btn-edit-xs auth-required"
                                onclick="event.stopPropagation();editRefillField('${visit.visit_date}','visit_date','${first?.id}','Visit Date')"
                                title="Edit visit date"
                                style="margin-left:auto;">
                            <i class="bi bi-shield-lock"></i> Edit Date
                        </button>
                    </div>

                    <!-- Drug cards -->
                    <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
                        ${drugs.map((drug, di) => {
                            const dn   = drug.regimen_name || 'Unknown Drug';
                            const dl   = drug.regimen_line || '';
                            const dur  = drug.duration || 0;
                            const did  = drug.id;
                            const lc   = getLineColor(dl);
                            const dc   = getDurationColor(dur);
                            const w    = drug.weight_kg || '';
                            const ht   = drug.height_cm || '';
                            const bmi  = (w && ht) ? (parseFloat(w)/((parseFloat(ht)/100)**2)).toFixed(1) : null;
                            const bmiC = bmi ? (bmi<18.5?T.warning : bmi>30?T.danger : T.success) : T.muted;
                            const cls  = drug.refill_classification || '';
                            const clsC = {
                                'ART Initiation':T.primary,'On-Time Refill':T.success,
                                'Acceptable Early':'#7c3aed','Late Refill':T.warning,
                                'Excessively Early':T.danger,'Possible Overlap':'#b91c1c'
                            }[cls] || T.muted;
                            const arc  = Math.min(113, (dur/90)*113);

                            return `
                            <div style="${T.card('#fff',T.border)} border-left:4px solid ${lc};
                                        padding:12px 14px;position:relative;overflow:hidden;
                                        animation:fadeInUp .3s ease ${di*.06}s both;">
                                ${isLatest&&di===0
                                    ? `<div style="position:absolute;top:0;right:0;
                                                   background:linear-gradient(135deg,${T.primary},#0891b2);
                                                   color:#fff;font-size:0.55rem;font-weight:800;
                                                   padding:3px 10px;border-radius:0 13px 0 8px;
                                                   letter-spacing:.04em;">CURRENT</div>` : ''}

                                <div style="display:flex;align-items:flex-start;gap:12px;">

                                    <!-- Line colour icon -->
                                    <div style="flex-shrink:0;margin-top:2px;width:36px;height:36px;
                                                border-radius:10px;background:${lc}15;color:${lc};
                                                display:flex;align-items:center;justify-content:center;
                                                font-size:1rem;">
                                        <i class="bi bi-capsule-fill"></i>
                                    </div>

                                    <!-- Name + vitals + actions -->
                                    <div style="flex:1;min-width:0;">

                                        <!-- Drug name + line -->
                                        <div style="display:flex;align-items:center;gap:6px;
                                                    flex-wrap:wrap;margin-bottom:6px;">
                                            <span style="font-weight:700;font-size:0.88rem;
                                                         color:${T.text};">${dn}</span>
                                            ${dl ? `<span style="background:${lc}15;color:${lc};
                                                                   font-size:0.65rem;font-weight:600;
                                                                   padding:2px 8px;border-radius:50px;">
                                                        ${dl}</span>` : ''}
                                        </div>

                                        <!-- Vitals -->
                                        <div style="display:flex;gap:7px;flex-wrap:wrap;
                                                    font-size:0.72rem;color:${T.sub};margin-bottom:8px;">
                                            <span style="display:flex;align-items:center;gap:3px;
                                                         background:${T.bg};padding:3px 9px;
                                                         border-radius:6px;border:1px solid ${T.border};">
                                                <i class="bi bi-speedometer2" style="color:${T.muted};"></i>
                                                <strong>${w||'?'}</strong>&nbsp;kg
                                                <button class="btn-edit-xs auth-required"
                                                        onclick="event.stopPropagation();editVitalWeight('${w}','${did}')"
                                                        title="Edit weight">
                                                    <i class="bi bi-pencil"></i>
                                                </button>
                                            </span>
                                            <span style="display:flex;align-items:center;gap:3px;
                                                         background:${T.bg};padding:3px 9px;
                                                         border-radius:6px;border:1px solid ${T.border};">
                                                <i class="bi bi-arrows-vertical" style="color:${T.muted};"></i>
                                                <strong>${ht||'?'}</strong>&nbsp;cm
                                                <button class="btn-edit-xs auth-required"
                                                        onclick="event.stopPropagation();editVitalHeight('${ht}','${did}')"
                                                        title="Edit height">
                                                    <i class="bi bi-pencil"></i>
                                                </button>
                                            </span>
                                            ${bmi ? `<span style="font-weight:700;color:${bmiC};
                                                                    background:${bmiC}18;padding:3px 9px;
                                                                    border-radius:6px;font-size:0.7rem;">
                                                         BMI ${bmi}</span>` : ''}
                                        </div>

                                        <!-- Edit actions -->
                                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                                            <button class="btn-drug-action auth-required"
                                                    onclick="event.stopPropagation();editDrugDuration('${dur}','${did}','${dn.replace(/'/g,"\\'")}')">
                                                <i class="bi bi-shield-lock"></i> Duration
                                            </button>
                                            <button class="btn-drug-action auth-required"
                                                    onclick="event.stopPropagation();editDrugRegimen('${dn.replace(/'/g,"\\'")}','${did}','${(dl||'').replace(/'/g,"\\'")}')">
                                                <i class="bi bi-shield-lock"></i> Regimen
                                            </button>
                                        </div>
                                    </div>

                                    <!-- Duration ring -->
                                    <div style="flex-shrink:0;display:flex;flex-direction:column;
                                                align-items:center;gap:2px;">
                                        <div style="position:relative;width:46px;height:46px;">
                                            <svg viewBox="0 0 46 46" width="46" height="46">
                                                <circle cx="23" cy="23" r="19" fill="none"
                                                        stroke="${T.border}" stroke-width="3.5"/>
                                                <circle cx="23" cy="23" r="19" fill="none"
                                                        stroke="${dc}" stroke-width="3.5"
                                                        stroke-dasharray="${arc} 119"
                                                        stroke-linecap="round"
                                                        transform="rotate(-90 23 23)"/>
                                            </svg>
                                            <span style="position:absolute;inset:0;
                                                         display:flex;align-items:center;
                                                         justify-content:center;
                                                         font-size:0.64rem;font-weight:800;
                                                         color:${T.text};">${dur}</span>
                                        </div>
                                        <span style="font-size:0.58rem;color:${T.muted};font-weight:600;">days</span>
                                    </div>
                                </div>

                                <!-- Classification tag -->
                                ${cls ? `
                                <div style="margin-top:9px;padding:5px 10px 5px 12px;
                                            border-radius:7px;border-left:3px solid ${clsC};
                                            background:${clsC}0d;
                                            display:flex;align-items:center;justify-content:space-between;
                                            font-size:0.7rem;">
                                    <span style="font-weight:700;color:${clsC};">${cls}</span>
                                    ${drug.days_early_or_late
                                        ? `<span style="color:${T.muted};font-size:0.65rem;">
                                               ${Math.abs(drug.days_early_or_late)}d ${drug.days_early_or_late<0?'early':'late'}
                                           </span>` : ''}
                                </div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </div>`;
        });

        h += '</div>'; // visits-accordion

        if (visits.length > LIMIT) {
            h += `
            <div style="text-align:center;margin-top:10px;">
                <button onclick="toggleAllVisits(this)" data-showing="limited"
                        style="display:inline-flex;align-items:center;gap:6px;
                               padding:8px 20px;border-radius:50px;font-size:0.78rem;font-weight:600;
                               border:2px dashed ${T.border};background:#fff;color:${T.sub};cursor:pointer;
                               transition:all .2s;">
                    <i class="bi bi-chevron-down"></i> Show all ${visits.length} visits
                </button>
            </div>`;
        }
    } else {
        h += `
        <div style="text-align:center;padding:40px 20px;color:${T.muted};">
            <i class="bi bi-capsule" style="font-size:2.2rem;opacity:.25;"></i>
            <div style="font-weight:700;font-size:0.9rem;margin-top:10px;">No Drug Records</div>
            <div style="font-size:0.78rem;margin-top:4px;">No dispensing history found</div>
        </div>`;
    }
    h += '</div>'; // drugs-master-section

    // ════════════════════════════════════════════════════════════════════
    // 6 ▸ VIRAL LOAD SECTION
    // ════════════════════════════════════════════════════════════════════
    h += `<div style="margin-top:20px;">`;

    h += `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:30px;height:30px;border-radius:8px;
                        background:${T.dLight};color:${T.danger};
                        display:flex;align-items:center;justify-content:center;font-size:.85rem;">
                <i class="bi bi-droplet-fill"></i>
            </div>
            <div>
                <div style="font-weight:700;font-size:0.88rem;color:${T.text};">
                    Viral Load History
                </div>
                <div style="font-size:0.68rem;color:${T.muted};">
                    ${vls.length} result${vls.length!==1?'s':''}
                </div>
            </div>
        </div>
        <span style="background:${T.dLight};color:${T.danger};font-size:0.68rem;font-weight:600;
                     padding:4px 11px;border-radius:50px;border:1px solid ${T.dBorder};">
            <i class="bi bi-droplet me-1"></i>${vls.length}
        </span>
    </div>`;

    if (vls.length > 0) {
        /* Trend sparkline */
        h += `
        <div style="${T.card('#fff',T.border)} padding:14px 16px;margin-bottom:10px;">
            <div style="display:flex;align-items:flex-end;gap:5px;height:72px;">
                ${vls.slice(0,8).reverse().map(vl => {
                    const n   = parseInt(String(vl.viral_load_result||'').replace(/[^0-9]/g,''));
                    const log = isNaN(n)||n<=0 ? 0 : Math.log10(n);
                    const ht  = Math.min(72, Math.max(5, log*22));
                    const col = !n||n<200 ? T.success : n<1000 ? T.warning : T.danger;
                    const ds  = formatDate(vl.sample_collection_date).split(' ')[0]||'';
                    return `
                    <div style="flex:1;display:flex;flex-direction:column;align-items:center;
                                justify-content:flex-end;height:100%;">
                        <span style="font-size:0.48rem;color:${T.muted};font-weight:600;
                                     margin-bottom:3px;text-align:center;line-height:1.2;">
                            ${vl.viral_load_result||'?'}
                        </span>
                        <div style="width:100%;max-width:28px;height:${ht}px;background:${col};
                                    border-radius:4px 4px 2px 2px;cursor:pointer;
                                    transition:opacity .15s;"
                             title="${ds}: ${vl.viral_load_result||'N/A'}"
                             onmouseover="this.style.opacity='.7'" onmouseout="this.style.opacity='1'">
                        </div>
                        <span style="font-size:0.46rem;color:${T.muted};margin-top:3px;
                                     writing-mode:vertical-rl;">${ds}</span>
                    </div>`;
                }).join('')}
            </div>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:8px;
                        font-size:0.6rem;color:${T.sub};flex-wrap:wrap;">
                ${[[T.success,'<200 Suppressed'],[T.warning,'200–999 Low'],[T.danger,'≥1000 Unsuppressed']].map(([c,l])=>`
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;
                                   background:${c};margin-right:4px;vertical-align:middle;"></span>${l}</span>`).join('')}
            </div>
        </div>`;

        /* VL rows */
        const hn = p.hospital_number || '';
        h += `<div style="${T.card('#fff',T.border)} overflow:hidden;margin-bottom:10px;">`;
        vls.forEach((v, i) => {
            const cls = classifyViralLoad(v.viral_load_result||'N/A');
            const sd  = v.sample_collection_date || '';
            const bg  = i%2===0 ? '#fff' : T.bg;
            h += `
            <div style="padding:11px 14px;background:${bg};border-bottom:1px solid ${T.border};
                        transition:background .12s;"
                 onmouseover="this.style.background='#f0f2fb'" onmouseout="this.style.background='${bg}'">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">

                    <!-- Sample date -->
                    <div style="flex:1;min-width:80px;">
                        <div style="font-size:0.58rem;font-weight:700;color:${T.muted};
                                    text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;">
                            Sample Date
                        </div>
                        <div style="display:flex;align-items:center;gap:4px;">
                            <span style="font-weight:600;font-size:0.8rem;color:${T.text};">
                                ${formatDate(sd)}
                            </span>
                            <button class="btn-edit-xs auth-required"
                                    onclick="event.stopPropagation();editVLField('sample_collection_date','${sd}','${hn.replace(/'/g,"\\'")}','${sd}')"
                                    title="Edit">
                                <i class="bi bi-pencil"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Result -->
                    <div style="flex:1;min-width:60px;">
                        <div style="font-size:0.58rem;font-weight:700;color:${T.muted};
                                    text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;">
                            Result
                        </div>
                        <div style="display:flex;align-items:center;gap:4px;">
                            <span style="font-weight:800;font-size:0.95rem;color:${cls.color};">
                                ${v.viral_load_result||'N/A'}
                            </span>
                            <button class="btn-edit-xs auth-required"
                                    onclick="event.stopPropagation();editVLField('vl_result','${(v.viral_load_result||'').replace(/'/g,"\\'")}','${hn.replace(/'/g,"\\'")}','${sd}')"
                                    title="Edit">
                                <i class="bi bi-pencil"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Badge -->
                    <div style="flex:1;min-width:100px;">${cls.badge}</div>

                    <!-- Result date -->
                    <div style="flex:1;min-width:80px;">
                        <div style="font-size:0.58rem;font-weight:700;color:${T.muted};
                                    text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;">
                            Result Date
                        </div>
                        <div style="display:flex;align-items:center;gap:4px;">
                            <span style="font-size:0.78rem;color:${T.sub};">
                                ${formatDate(v.result_date)}
                            </span>
                            <button class="btn-edit-xs auth-required"
                                    onclick="event.stopPropagation();editVLField('result_date','${(v.result_date||'').replace(/'/g,"\\'")}','${hn.replace(/'/g,"\\'")}','${sd}')"
                                    title="Edit">
                                <i class="bi bi-pencil"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div style="flex-shrink:0;display:flex;gap:5px;">
                        <button onclick="event.stopPropagation();printVLResult('${hn.replace(/'/g,"\\'")}','${sd}')"
                                title="Print"
                                style="width:30px;height:30px;border-radius:8px;
                                       border:1px solid ${T.border};background:#fff;
                                       color:${T.primary};cursor:pointer;font-size:.75rem;
                                       display:flex;align-items:center;justify-content:center;
                                       transition:all .12s;"
                                onmouseover="this.style.background='${T.pLight}';this.style.borderColor='${T.primary}';"
                                onmouseout="this.style.background='#fff';this.style.borderColor='${T.border}';">
                            <i class="bi bi-printer"></i>
                        </button>
                        <button onclick="event.stopPropagation();deleteVLRecord('${hn.replace(/'/g,"\\'")}','${sd}')"
                                title="Delete"
                                style="width:30px;height:30px;border-radius:8px;
                                       border:1px solid ${T.dBorder};background:#fff;
                                       color:${T.danger};cursor:pointer;font-size:.75rem;
                                       display:flex;align-items:center;justify-content:center;
                                       transition:background .12s;"
                                onmouseover="this.style.background='${T.dLight}'"
                                onmouseout="this.style.background='#fff'">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>`;
        });
        h += '</div>'; // vl rows

        /* Summary stats */
        const latest   = vls[0]?.viral_load_result || 'N/A';
        const latestC  = classifyViralLoad(latest);
        const suppCnt  = vls.filter(v => { const n=parseInt(String(v.viral_load_result||'').replace(/[^0-9]/g,'')); return !isNaN(n)&&n<1000; }).length;
        const suppRate = vls.length ? Math.round(suppCnt/vls.length*100) : 0;
        const rateCol  = suppRate>=90 ? T.success : suppRate>=70 ? T.warning : T.danger;

        h += `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
            ${[['Total Tests', vls.length, T.primary],
               ['Latest',      latest,     latestC.color],
               ['Suppression', suppRate+'%', rateCol]].map(([l,v,c])=>`
            <div style="${T.card('#fff',T.border)} padding:12px;text-align:center;">
                <div style="font-size:0.6rem;font-weight:700;color:${T.muted};text-transform:uppercase;
                            letter-spacing:.05em;margin-bottom:3px;">${l}</div>
                <div style="font-size:1.1rem;font-weight:800;color:${c};">${v}</div>
            </div>`).join('')}
        </div>`;

    } else {
        h += `
        <div style="${T.card('#fff',T.border)} padding:36px 20px;text-align:center;">
            <i class="bi bi-droplet" style="font-size:2rem;color:${T.border};"></i>
            <div style="font-weight:700;color:${T.sub};margin-top:10px;font-size:0.88rem;">
                No Viral Load Records
            </div>
            <div style="color:${T.muted};font-size:0.75rem;margin-top:4px;">
                No VL test results found for this patient
            </div>
        </div>`;
    }

    h += '</div>'; /* /vl section */

    container.innerHTML = h;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDrugShortName(fullName) {
    if (!fullName) return '???';
    return fullName.split('/').map(p => p.trim().split(' ')[0]).join('/');
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
    const isEmpty = !value || value === 'N/A' || value === '—';
    return `
    <div class="info-cell-premium" style="${isEmpty ? 'opacity:.65;' : ''}">
        <div class="info-cell-label">${label}</div>
        <div class="info-cell-value" style="${isEmpty ? 'color:#94a3b8;font-style:italic;font-weight:500;' : ''}">
            ${isEmpty ? 'Not recorded' : value}
        </div>
        ${editable ? `<button class="info-cell-edit"
            onclick="editField('${fieldName}','${String(value).replace(/'/g,"\\'")}','${recordType}')"
            title="Edit ${label}">
            <i class="bi bi-pencil"></i>
        </button>` : ''}
    </div>`;
}

function makeArtStartDateCell(label, value, hospitalNumber) {
    const display = formatDate(value);
    const isEmpty = !value || display === 'N/A' || display === '—';
    return `
    <div class="info-cell-premium art-start-highlight">
        <div class="info-cell-label">
            <i class="bi bi-calendar-heart me-1" style="color:var(--primary);"></i>${label}
        </div>
        <div class="info-cell-value" style="${isEmpty ? 'color:#94a3b8;font-style:italic;font-weight:500;' : 'color:var(--primary);'}">
            ${isEmpty ? 'Not set' : display}
        </div>
        <button class="info-cell-edit"
                onclick="editArtStartDate('${formatDateForInput(value)}','${hospitalNumber}')"
                title="Edit ART Start Date">
            <i class="bi bi-pencil"></i>
        </button>
    </div>`;
}

function getValidationBadge(drug) {
    const classification = drug.refill_classification || '';
    const comment = drug.validation_comment || '';
    const sequenceLabel = drug.sequence_label || '';
    const daysDiff = drug.days_early_or_late || 0;
    const color = getClassificationColor(classification);
    const icon = getClassificationIcon(classification);
    const expectedDate = drug.expected_next_date || 'N/A';
    
    if (!classification) return '';
    
    return `
    <div class="validation-badge" style="margin-top:8px; padding:8px 12px; background:${color}10; border-left:4px solid ${color}; border-radius:6px; font-size:0.7rem;">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;">
            <i class="bi ${icon}" style="color:${color}; font-size:0.9rem;"></i>
            <span style="font-weight:700; color:${color};">${classification}</span>
            <span style="color:#64748b;">|</span>
            <span style="color:#475569; font-weight:600;">${sequenceLabel}</span>
            ${daysDiff !== 0 ? `<span style="color:${daysDiff < 0 ? '#ef4444' : '#f59e0b'}; font-weight:600;">(${Math.abs(daysDiff)}d ${daysDiff < 0 ? 'early' : 'late'})</span>` : ''}
        </div>
        <div style="color:#64748b; font-size:0.65rem;">📅 Expected: ${expectedDate}</div>
        <div style="color:#64748b; font-size:0.65rem;">💬 ${comment}</div>
    </div>`;
}

function getClassificationColor(classification) {
    const colors = {
        "ART Initiation": "#3b82f6",
        "On-Time Refill": "#10b981",
        "Acceptable Early": "#8b5cf6",
        "Late Refill": "#f59e0b",
        "Excessively Early": "#ef4444",
        "Possible Overlap": "#dc2626",
    };
    return colors[classification] || "#6b7280";
}

function getClassificationIcon(classification) {
    const icons = {
        "ART Initiation": "bi-star-fill",
        "On-Time Refill": "bi-check-circle-fill",
        "Acceptable Early": "bi-clock-fill",
        "Late Refill": "bi-exclamation-triangle-fill",
        "Excessively Early": "bi-x-circle-fill",
        "Possible Overlap": "bi-shield-exclamation",
    };
    return icons[classification] || "bi-question-circle-fill";
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
// 🔐 PASSKEY SYSTEM
// ============================================================================

async function requirePasskeyForEdit(actionName) {
    if (AppState.passkeyAuthorized && AppState.authorizationExpiry && new Date() < AppState.authorizationExpiry) return true;
    
    const passkey = await showPasskeyDialog();
    if (!passkey) { showToast('⚠️ Authorization required to ' + actionName, 'warning'); return false; }
    
    try {
        const authData = await MedAPI.auth.verifyPasskey(passkey);
        if (!authData.authorized) { showToast('❌ Invalid passkey', 'error'); return false; }
        
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
            <div class="passkey-dialog-hint"><i class="bi bi-info-circle"></i> Passkeys: ask admin</div>
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
        const data = await MedAPI.patients.update(
            AppState.currentPatient.patient_info.hospital_number,
            'duration', newDuration, 'refill', drugId
        );
        if (!data.success) throw new Error(data.detail || 'Update failed');
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
    if (!AppState.currentPatient) { showToast('No patient selected', 'error'); return; }
    
    const authorized = await requirePasskeyForEdit('modify drug regimen');
    if (!authorized) return;
    
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
        
        window._regBackdrop = backdrop;
        window._regDrugId = drugId;
        window._regResolve = resolve;
        
        window._filterRegimenOptions = function() {
            const search = document.getElementById('regimenSearchPrem');
            const select = document.getElementById('regimenSelectPrem');
            if (!search || !select) return;
            const term = search.value.toLowerCase();
            Array.from(select.options).forEach(o => {
                if (!o.disabled) o.style.display = o.text.toLowerCase().includes(term) ? '' : 'none';
            });
        };
        
        window._onRegimenSelectChange = function() {
            const select = document.getElementById('regimenSelectPrem');
            const custom = document.getElementById('customRegimenPrem');
            if (select && custom && select.value && !select.value.startsWith('optgroup')) {
                custom.value = select.value;
            }
        };
        
        document.getElementById('regCancelBtn2').addEventListener('click', () => {
            backdrop.remove();
            if (window._regResolve) { window._regResolve(null); window._regResolve = null; }
        });
        
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
                const data = await MedAPI.patients.update(
                    AppState.currentPatient.patient_info.hospital_number,
                    'regimen', newRegimen, 'refill', drugId
                );
                if (!data.success) throw new Error(data.detail || 'Update failed');
                showToast('✅ Regimen updated successfully!', 'success');
                await searchPatient();
            } catch(e) {
                showToast('❌ ' + e.message, 'error');
            } finally {
                hideLoading();
            }
            
            if (window._regResolve) { window._regResolve(newRegimen); window._regResolve = null; }
        });
        
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                backdrop.remove();
                if (window._regResolve) { window._regResolve(null); window._regResolve = null; }
            }
        });
        
        document.getElementById('customRegimenPrem')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('regConfirmBtn2').click();
            }
        });
        
        setTimeout(() => document.getElementById('regimenSearchPrem')?.focus(), 100);
    });
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
        const data = await MedAPI.patients.update(hn, fieldName, newValue, 'refill', recordId);
        if (!data.success) throw new Error(data.detail || 'Update failed');
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
        const data = await MedAPI.patients.update(hn, fieldName, newValue, recordType || 'patient', recordId || null);
        if (!data.success) throw new Error(data.detail || 'Update failed');
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
            const ud = await MedAPI.patients.update(hospitalNumber, 'art_start_date', newDate, 'patient');
            if (!ud.success) throw new Error(ud.detail || 'Update failed');
            showToast('✅ ART Start Date updated!','success');
            await validateArtStartDate(hospitalNumber, newDate);
            setTimeout(() => searchPatient(), 1500);
        } catch(e) { showToast('❌ '+e.message,'error'); }
        finally { hideLoading(); }
    });
}

async function validateArtStartDate(hospitalNumber, artStartDate) {
    try {
        const data = await MedAPI.patients.validateArtStart(hospitalNumber, artStartDate);
        if (data.success && !data.is_consistent) {
            const confirmUpdate = await showValidationDialog('ART Start Date Mismatch', `ART Start (${formatDate(artStartDate)}) is after first pickup (${formatDate(data.first_pickup_date)}).`, [
                {text:'Update',class:'btn-secondary',value:'keep'},{text:'Use First Pickup',class:'btn-warning',value:'update'},{text:'Cancel',class:'btn-outline-secondary',value:'cancel'}
            ]);
            if (confirmUpdate === 'update') {
                await MedAPI.patients.update(hospitalNumber, 'art_start_date', data.first_pickup_date, 'patient');
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
// 📏 EDIT HEIGHT - Passkey Protected
// ============================================================================

async function editVitalHeight(currentHeight, drugId) {
    if (!AppState.currentPatient) { showToast('No patient selected', 'error'); return; }
    
    const authorized = await requirePasskeyForEdit('modify height');
    if (!authorized) return;
    
    let newHeight = prompt(`Update Height (cm):\nCurrent: ${currentHeight || 'N/A'}\n\nEnter new value:`, currentHeight || '');
    if (!newHeight || newHeight === currentHeight) return;
    
    showLoading('Updating Height...', `Setting height to ${newHeight} cm`);
    try {
        const data = await MedAPI.patients.update(
            AppState.currentPatient.patient_info.hospital_number,
            'height', newHeight, 'refill', drugId
        );
        if (!data.success) throw new Error(data.detail || 'Update failed');
        showToast('✅ Height updated!', 'success');
        await searchPatient();
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
    finally { hideLoading(); }
}

// ============================================================================
// ⚖️ EDIT WEIGHT - Passkey Protected
// ============================================================================

async function editVitalWeight(currentWeight, drugId) {
    if (!AppState.currentPatient) { showToast('No patient selected', 'error'); return; }
    
    const authorized = await requirePasskeyForEdit('modify weight');
    if (!authorized) return;
    
    let newWeight = prompt(`Update Weight (kg):\nCurrent: ${currentWeight || 'N/A'}\n\nEnter new value:`, currentWeight || '');
    if (!newWeight || newWeight === currentWeight) return;
    
    showLoading('Updating Weight...', `Setting weight to ${newWeight} kg`);
    try {
        const data = await MedAPI.patients.update(
            AppState.currentPatient.patient_info.hospital_number,
            'weight', newWeight, 'refill', drugId
        );
        if (!data.success) throw new Error(data.detail || 'Update failed');
        showToast('✅ Weight updated!', 'success');
        await searchPatient();
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
    finally { hideLoading(); }
}

// ============================================================================
// 🖨️ PRINT VL RESULT
// ============================================================================

async function printVLResult(hospitalNumber, sampleDate) {
    showLoading('Generating VL Result PDF...', 'Preparing document for printing');
    try {
        const result = await MedAPI.vl.printResult(hospitalNumber, sampleDate);
        if (!result.ok) throw new Error('Failed to generate PDF');
        const pdfUrl = URL.createObjectURL(result.blob);
        window.open(pdfUrl, '_blank');
        showToast('🖨️ VL Result PDF opened for printing!', 'success', 3000);
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

// ============================================================================
// 🔧 LAB SETTINGS
// ============================================================================

async function openLabSettings() {
    const modal = document.getElementById('labSettingsModal');
    if (!modal) return;
    try {
        const data = await MedAPI.lab.getSettings();
        if (data.success && data.data) {
            document.getElementById('setPcrLabName').value       = data.data.pcr_lab_name      || '';
            document.getElementById('setFacilityName').value     = data.data.facility_name      || '';
            document.getElementById('setClinicianName').value    = data.data.clinician_name     || '';
            document.getElementById('setAssayedByName').value    = data.data.assayed_by_name    || '';
            document.getElementById('setApprovedByName').value   = data.data.approved_by_name   || '';
            document.getElementById('setCollectedByName').value  = data.data.collected_by_name  || '';
        }
    } catch(e) { console.error('Error loading lab settings:', e); }
    modal.style.display = 'flex';
}

function closeLabSettings() {
    const modal = document.getElementById('labSettingsModal');
    if (modal) modal.style.display = 'none';
}

async function saveLabSettings() {
    const settings = {
        pcr_lab_name:       document.getElementById('setPcrLabName').value.trim(),
        facility_name:      document.getElementById('setFacilityName').value.trim(),
        clinician_name:     document.getElementById('setClinicianName').value.trim(),
        assayed_by_name:    document.getElementById('setAssayedByName').value.trim(),
        approved_by_name:   document.getElementById('setApprovedByName').value.trim(),
        collected_by_name:  document.getElementById('setCollectedByName').value.trim(),
    };
    try {
        const data = await MedAPI.lab.saveSettings(settings);
        if (data.success) { showToast('✅ Lab settings saved!', 'success'); closeLabSettings(); }
        else showToast('❌ Failed to save settings', 'error');
    } catch(e) { showToast('❌ Error: ' + e.message, 'error'); }
}

document.addEventListener('click', function(e) {
    const modal = document.getElementById('labSettingsModal');
    if (modal && e.target === modal) {
        closeLabSettings();
    }
});

// ============================================================================
// USER MANAGEMENT (Admin Only)
// ============================================================================

async function openUserManagement() {
    const modal = document.getElementById('userManagementModal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    await loadUsers();
}

function closeUserManagement() {
    const modal = document.getElementById('userManagementModal');
    if (modal) modal.style.display = 'none';
}

function showAddUserForm() {
    const form = document.getElementById('addUserForm');
    if (form) form.style.display = 'block';
}

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    try {
        const data = await MedAPI.users.list();
        if (!data.success) { tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Access denied</td></tr>'; return; }
        if (data.users) {
            tbody.innerHTML = data.users.map(u => `
                <tr>
                    <td><strong>${u.full_name}</strong></td>
                    <td>${u.username}</td>
                    <td><span class="badge ${u.role === 'admin' ? 'bg-warning text-dark' : u.role === 'assessor' ? 'bg-info' : 'bg-primary'}">${u.role.replace('_', ' ')}</span></td>
                    <td>${u.position || '-'}</td>
                    <td>${u.is_active ? '<span class="text-success">● Active</span>' : '<span class="text-danger">● Inactive</span>'}</td>
                    <td><small>${u.last_login || 'Never'}</small></td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-sm btn-outline-warning" onclick="openEditUser(${u.id}, '${u.full_name.replace(/'/g,"\\'")}', '${u.username}', '${u.role}', '${(u.position||'').replace(/'/g,"\\'")}', ${u.is_active})" title="Edit User" style="padding:2px 8px; font-size:0.7rem;"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${u.id}, '${u.username}')" title="Delete User" style="padding:2px 8px; font-size:0.7rem; margin-left:4px;"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        }
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading users</td></tr>';
    }
}

async function saveNewUser() {
    const fullName = document.getElementById('newUserFullName').value.trim();
    const username = document.getElementById('newUserUsername').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    const position = document.getElementById('newUserPosition').value.trim();
    
    if (!username || !password) {
        showToast('Username and password required', 'warning');
        return;
    }
    
    try {
        const data = await MedAPI.users.create({ full_name: fullName, username, password, role, position });
        if (data.success) {
            showToast('✅ User created!', 'success');
            document.getElementById('addUserForm').style.display = 'none';
            ['newUserFullName','newUserUsername','newUserPassword','newUserPosition'].forEach(id => {
                const el = document.getElementById(id); if (el) el.value = '';
            });
            await loadUsers();
        } else { showToast('❌ ' + (data.detail || 'Failed'), 'error'); }
    } catch(e) { showToast('❌ Error: ' + e.message, 'error'); }
}

document.addEventListener('click', function(e) {
    const modal = document.getElementById('userManagementModal');
    if (modal && e.target === modal) {
        closeUserManagement();
    }
});

// ============================================================================
// EDIT USER - POPUP MODAL
// ============================================================================

function openEditUser(id, fullName, username, role, position, isActive) {
    document.getElementById('editUserId').value = id;
    document.getElementById('editUserFullName').value = fullName;
    document.getElementById('editUserUsername').value = username;
    document.getElementById('editUserRole').value = role || 'dqa_team';
    document.getElementById('editUserPosition').value = position || '';
    document.getElementById('editUserPassword').value = '';
    document.getElementById('editUserStatus').value = isActive ? 'true' : 'false';
    document.getElementById('editUserTitle').textContent = `Editing: ${username}`;
    
    document.getElementById('editUserModal').style.display = 'flex';
    setTimeout(() => document.getElementById('editUserFullName').focus(), 200);
}

function closeEditUser() {
    document.getElementById('editUserModal').style.display = 'none';
}

function toggleEditPassword() {
    const input = document.getElementById('editUserPassword');
    const icon = document.getElementById('togglePassword');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('bi-eye-slash');
        icon.classList.add('bi-eye');
    } else {
        input.type = 'password';
        icon.classList.remove('bi-eye');
        icon.classList.add('bi-eye-slash');
    }
}

async function saveEditUser() {
    const id = document.getElementById('editUserId').value;
    const fullName = document.getElementById('editUserFullName').value.trim();
    const role = document.getElementById('editUserRole').value;
    const position = document.getElementById('editUserPosition').value.trim();
    const password = document.getElementById('editUserPassword').value;
    const isActive = document.getElementById('editUserStatus').value === 'true';
    
    if (!fullName) {
        showToast('Full name is required', 'warning');
        return;
    }
    
    const updateData = {
        full_name: fullName,
        role: role,
        position: position,
        is_active: isActive
    };
    
    if (password) {
        updateData.password = password;
    }
    
    try {
        const data = await MedAPI.users.update(id, updateData);
        if (data.success) { showToast('✅ User updated successfully!', 'success'); closeEditUser(); await loadUsers(); }
        else showToast('❌ ' + (data.detail || 'Failed'), 'error');
    } catch(e) { showToast('❌ Error: ' + e.message, 'error'); }
}

document.addEventListener('click', function(e) {
    const modal = document.getElementById('editUserModal');
    if (modal && e.target === modal) {
        closeEditUser();
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('editUserModal');
        if (modal && modal.style.display === 'flex') {
            closeEditUser();
        }
    }
});

async function deleteUser(id, username) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    
    try {
        const data = await MedAPI.users.delete(id);
        if (data.success) { showToast('✅ User deleted!', 'success'); await loadUsers(); }
        else showToast('❌ ' + (data.detail || 'Failed'), 'error');
    } catch(e) { showToast('❌ Error: ' + e.message, 'error'); }
}

// ============================================================================
// REPORTS
// ============================================================================

function toggleReportsDropdown() {
    const menu = document.getElementById('reportsDropdownMenu');
    if (menu) {
        const isVisible = menu.style.display !== 'none';
        menu.style.display = isVisible ? 'none' : 'block';
    }
}

document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('reportsDropdown');
    const menu = document.getElementById('reportsDropdownMenu');
    if (menu && dropdown && !dropdown.contains(e.target)) {
        menu.style.display = 'none';
    }
});

async function downloadPharmacyReport() {
    const menu = document.getElementById('reportsDropdownMenu');
    if (menu) menu.style.display = 'none';

    const { startDate, endDate } = await _showDateRangeDialog('DQA Report Date Range');
    if (startDate === null) return;   // user cancelled

    showLoading('Generating Report...', 'Fetching data from DQA database');
    try {
        await MedAPI.reports.downloadPharmacy(startDate, endDate);
        showToast('📥 Report downloaded!', 'success', 5000);
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally { hideLoading(); }
}

async function downloadVLReport() {
    const menu = document.getElementById('reportsDropdownMenu');
    if (menu) menu.style.display = 'none';

    const { startDate, endDate } = await _showDateRangeDialog('Viral Load Report Date Range');
    if (startDate === null) return;

    showLoading('Generating Viral Load Report...', 'Fetching data from DQA database');
    try {
        await MedAPI.reports.downloadVL(startDate, endDate);
        showToast('📥 Viral Load report downloaded!', 'success', 5000);
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally { hideLoading(); }
}

/** Reusable date-range picker dialog (replaces prompt() calls). */
function _showDateRangeDialog(title) {
    return new Promise((resolve) => {
        document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop-custom';
        backdrop.style.display = 'flex';
        backdrop.innerHTML = `
        <div onclick="event.stopPropagation()" style="background:white;border-radius:20px;width:90%;max-width:400px;
             box-shadow:0 25px 60px rgba(0,0,0,0.25);overflow:hidden;animation:slideUp 0.3s ease;">
            <div style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:20px 24px;color:white;">
                <h5 style="margin:0;font-weight:700;">${title}</h5>
                <p style="margin:4px 0 0;font-size:0.75rem;opacity:0.8;">Leave blank to include all dates</p>
            </div>
            <div style="padding:20px 24px;">
                <label style="font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;display:block;margin-bottom:4px;">Start Date</label>
                <input type="date" id="_drStart" style="width:100%;padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:0.85rem;margin-bottom:14px;">
                <label style="font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;display:block;margin-bottom:4px;">End Date</label>
                <input type="date" id="_drEnd" style="width:100%;padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:0.85rem;">
            </div>
            <div style="padding:14px 24px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end;background:#fafbff;">
                <button id="_drCancel" style="padding:10px 20px;border:2px solid #e2e8f0;border-radius:12px;background:white;font-weight:600;font-size:0.8rem;color:#64748b;cursor:pointer;">Cancel</button>
                <button id="_drOk" style="padding:10px 24px;border:none;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#6366f1);font-weight:700;font-size:0.8rem;color:white;cursor:pointer;">Download</button>
            </div>
        </div>`;
        document.body.appendChild(backdrop);
        document.getElementById('_drCancel').addEventListener('click', () => { backdrop.remove(); resolve({ startDate: null, endDate: null }); });
        document.getElementById('_drOk').addEventListener('click', () => {
            const startDate = document.getElementById('_drStart').value || '';
            const endDate   = document.getElementById('_drEnd').value   || '';
            backdrop.remove();
            resolve({ startDate, endDate });
        });
        backdrop.addEventListener('click', e => { if (e.target === backdrop) { backdrop.remove(); resolve({ startDate: null, endDate: null }); } });
    });
}

// ============================================================================
// LOCK / RESET
// ============================================================================

async function acquireLock() {
    if (!AppState.currentPatient) return;
    const hn = AppState.currentPatient.patient_info.hospital_number;
    const btn = document.getElementById('lockBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Locking...'; }
    try {
        const data = await MedAPI.patients.lock(hn);
        if (!data.success) throw new Error(data.detail || 'Lock failed');
        AppState.isLocked = true;
        if (btn) { btn.innerHTML = '<i class="bi bi-lock-fill me-1"></i> Locked'; btn.classList.add('btn-success'); }
        showToast('🔒 Record locked','info');
    } catch(e) { showToast(e.message,'error'); }
    finally { if (btn && !AppState.isLocked) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-lock me-1"></i> Edit Mode'; } }
}

async function resetApplication() {
    if (!confirm('⚠️ Reset application?')) return;
    showLoading('Resetting...');
    try {
        const data = await MedAPI.setup.reset();
        if (!data.success) throw new Error(data.message || 'Failed');
        setTimeout(() => window.location.href='/setup', 2000);
    } catch(e) { showToast(e.message,'error'); hideLoading(); }
}

async function refreshActiveUsers() {
    try {
        const data = await MedAPI.team.activeUsers();
        const badge = document.getElementById('activeUsersBadge');
        if (badge) badge.textContent = data.active_count || 0;
    } catch(e) {}
}

function resetAll() {
    AppState.currentPatient = null; 
    AppState.comparisonResults = []; 
    AppState.isLocked = false;
    
    reviewState.active = false;
    reviewState.workflow = null;
    reviewState.currentStep = 0;
    reviewState.results = [];
    reviewState.batchResults = {};
    reviewState.totalFields = 0;
    reviewState.matchedFields = 0;
    reviewState.correctedOnEMR = 0;
    reviewState.correctedOnCareCard = 0;
    reviewState.correctedOnBoth = 0;
    reviewState.careCardValues = {};
    reviewState.originalEMRValues = {};
    reviewState.discrepancyTypes = {};
    reviewState.discrepancyNotes = {};
    reviewState.affectedVisits = {};
    
    const section = document.getElementById('patientSection'); 
    if (section) { section.classList.add('d-none-imp'); section.classList.remove('fade-in'); }
    const comp = document.getElementById('comparisonCard'); 
    if (comp) comp.style.display = 'none';
    const empty = document.getElementById('emptyState'); 
    if (empty) empty.style.display = '';
    const input = document.getElementById('hospitalNumber'); 
    if (input) { input.value = ''; input.focus(); }
    const btn = document.getElementById('lockBtn'); 
    if (btn) { btn.innerHTML = '<i class="bi bi-lock me-1"></i> Edit Mode'; btn.classList.remove('btn-success'); }
    
    resetReviewUI();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getLineColor(line) {
    const colors = {
        'ARVs': '#4f46e5',
        'Anti-TB': '#f59e0b',
        'Prophylaxis': '#10b981',
        'Other': '#6b7280',
        'First Line':'#4f46e5',
        'Second Line':'#f59e0b',
        'Third Line':'#ef4444'
    };
    return colors[line] || '#6b7280';
}

function logout() {
    localStorage.removeItem('meddqa_token');
    localStorage.removeItem('meddqa_user');
    document.cookie = 'meddqa_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.href = '/login';
}

// ============================================================================
// BATCH COMPARISON REVIEW WORKFLOW
// ============================================================================
// ============================================================================
// BATCH COMPARISON REVIEW WORKFLOW
// ============================================================================
// ============================================================================
// BATCH COMPARISON REVIEW WORKFLOW - PROFESSIONAL REDESIGN
// ============================================================================

let reviewState = {
    workflow: null,
    currentStep: 0,
    results: [],
    totalFields: 0,
    matchedFields: 0,
    correctedOnEMR: 0,
    correctedOnCareCard: 0,
    correctedOnBoth: 0,
    active: false,
    batchResults: {},
    previousReview: null,
    careCardValues: {},
    originalEMRValues: {},
    discrepancyTypes: {},   // ✅ NEW
    discrepancyNotes: {},   // ✅ NEW
    affectedVisits: {}      // ✅ Stores which visits are affected for Missing/Not Documented types
};

async function startReviewWorkflow() {
    if (!AppState.currentPatient) {
        showToast('Search for a patient first', 'warning');
        return;
    }
    
    const hn = AppState.currentPatient.patient_info.hospital_number;
    showLoading('Starting Review...', 'Loading patient data');
    
    try {
        const data = await MedAPI.review.start(hn);
        if (!data.success) throw new Error(data.detail || 'Failed');
        
        const prevReview = data.workflow.previous_review || {};
        const batchResults = {};
        let previousFieldResults = [];
        let totalFields = 0, matchedFields = 0, correctedOnEMR = 0, correctedOnCareCard = 0, correctedOnBoth = 0;
        
        // ✅ Initialize storage objects
        const careCardValues = {};
        const originalEMRValues = {};
        const discrepancyTypes = {};
        const discrepancyNotes = {};
        
        // ================================================================
        // ✅ LOAD BIODATA RESULTS (Step 1)
        // ================================================================
        if (prevReview.biodata && Array.isArray(prevReview.biodata)) {
            console.log('📋 Loading biodata results:', prevReview.biodata.length);
            prevReview.biodata.forEach(r => {
                const cleanResult = {
                    field: r.field,
                    label: r.label,
                    emr_value: r.emr_value,
                    match: r.match || false,
                    corrected_on: r.corrected_on || null,
                    care_card_value: r.care_card_value || null,
                    original_emr_value: r.original_emr_value || null,
                    discrepancy_type: r.discrepancy_type || null,
                    discrepancy_note: r.discrepancy_note || null,
                    step: 1
                };
                previousFieldResults.push(cleanResult);
                totalFields++;
                if (cleanResult.match) matchedFields++;
                if (cleanResult.corrected_on === 'emr') correctedOnEMR++;
                if (cleanResult.corrected_on === 'care_card') correctedOnCareCard++;
                if (cleanResult.corrected_on === 'both') correctedOnBoth++;
                
                // ✅ RESTORE Care Card values
                if (cleanResult.care_card_value) {
                    careCardValues[cleanResult.field] = cleanResult.care_card_value;
                }
                // ✅ RESTORE Original EMR values
                if (cleanResult.original_emr_value) {
                    originalEMRValues[cleanResult.field] = cleanResult.original_emr_value;
                }
                // ✅ RESTORE Discrepancy type and note
                if (cleanResult.discrepancy_type) {
                    discrepancyTypes[cleanResult.field] = cleanResult.discrepancy_type;
                }
                if (cleanResult.discrepancy_note) {
                    discrepancyNotes[cleanResult.field] = cleanResult.discrepancy_note;
                }
            });
        }

        // ================================================================
        // ✅ LOAD LATEST REFILL RESULTS (Step 2)
        // ================================================================
        if (prevReview.latest_refill && Array.isArray(prevReview.latest_refill)) {
            console.log('📋 Loading latest_refill results:', prevReview.latest_refill.length);
            prevReview.latest_refill.forEach(r => {
                const cleanResult = {
                    field: r.field,
                    label: r.label,
                    emr_value: r.emr_value,
                    match: r.match || false,
                    corrected_on: r.corrected_on || null,
                    care_card_value: r.care_card_value || null,
                    original_emr_value: r.original_emr_value || null,
                    discrepancy_type: r.discrepancy_type || null,
                    discrepancy_note: r.discrepancy_note || null,
                    step: 2
                };
                previousFieldResults.push(cleanResult);
                totalFields++;
                if (cleanResult.match) matchedFields++;
                if (cleanResult.corrected_on === 'emr') correctedOnEMR++;
                if (cleanResult.corrected_on === 'care_card') correctedOnCareCard++;
                if (cleanResult.corrected_on === 'both') correctedOnBoth++;
                
                if (cleanResult.care_card_value) {
                    careCardValues[cleanResult.field] = cleanResult.care_card_value;
                }
                if (cleanResult.original_emr_value) {
                    originalEMRValues[cleanResult.field] = cleanResult.original_emr_value;
                }
                if (cleanResult.discrepancy_type) {
                    discrepancyTypes[cleanResult.field] = cleanResult.discrepancy_type;
                }
                if (cleanResult.discrepancy_note) {
                    discrepancyNotes[cleanResult.field] = cleanResult.discrepancy_note;
                }
            });
        }

        // ================================================================
        // ✅ LOAD REFILL BATCH RESULTS (Step 3)
        // ================================================================
        if (prevReview.refill_batch && typeof prevReview.refill_batch === 'object') {
            console.log('📋 Loading refill_batch results:', Object.keys(prevReview.refill_batch));
            Object.entries(prevReview.refill_batch).forEach(([key, value]) => {
                if (value) {
                    batchResults[key] = value;
                    totalFields++;
                    if (value === 'match') matchedFields++;
                    if (value === 'corrected_emr') correctedOnEMR++;
                    if (value === 'corrected_carecard') correctedOnCareCard++;
                    if (value === 'corrected_both') correctedOnBoth++;
                }
            });
        }

        // ================================================================
        // ✅ LOAD VL BATCH RESULTS (Step 4)
        // ================================================================
        if (prevReview.vl_batch && typeof prevReview.vl_batch === 'object') {
            console.log('📋 Loading vl_batch results:', Object.keys(prevReview.vl_batch));
            Object.entries(prevReview.vl_batch).forEach(([key, value]) => {
                if (value) {
                    batchResults[key] = value;
                    totalFields++;
                    if (value === 'match') matchedFields++;
                    if (value === 'corrected_emr') correctedOnEMR++;
                    if (value === 'corrected_carecard') correctedOnCareCard++;
                    if (value === 'corrected_both') correctedOnBoth++;
                }
            });
        }

        // ================================================================
        // ✅ LOAD CARE CARD VALUES FROM drug_pickups_details (Refill batch)
        // ================================================================
        if (data.workflow.drug_pickups_details && Array.isArray(data.workflow.drug_pickups_details)) {
            console.log('📋 Loading drug_pickups_details:', data.workflow.drug_pickups_details.length);
            data.workflow.drug_pickups_details.forEach(dp => {
                if (dp.care_card_value && dp.field) {
                    careCardValues[dp.field] = dp.care_card_value;
                }
                if (dp.original_emr_value && dp.field) {
                    originalEMRValues[dp.field] = dp.original_emr_value;
                }
                if (dp.discrepancy_type && dp.field) {
                    discrepancyTypes[dp.field] = dp.discrepancy_type;
                }
                if (dp.discrepancy_note && dp.field) {
                    discrepancyNotes[dp.field] = dp.discrepancy_note;
                }
            });
        }

        // ================================================================
        // ✅ LOAD CARE CARD VALUES FROM viral_loads_details (VL batch)
        // ================================================================
        if (data.workflow.viral_loads_details && Array.isArray(data.workflow.viral_loads_details)) {
            console.log('📋 Loading viral_loads_details:', data.workflow.viral_loads_details.length);
            data.workflow.viral_loads_details.forEach(vl => {
                if (vl.care_card_value && vl.field) {
                    careCardValues[vl.field] = vl.care_card_value;
                }
                if (vl.original_emr_value && vl.field) {
                    originalEMRValues[vl.field] = vl.original_emr_value;
                }
                if (vl.discrepancy_type && vl.field) {
                    discrepancyTypes[vl.field] = vl.discrepancy_type;
                }
                if (vl.discrepancy_note && vl.field) {
                    discrepancyNotes[vl.field] = vl.discrepancy_note;
                }
            });
        }
        
        // ================================================================
        // ✅ LOAD FROM DIRECT MAPS (if backend provides them)
        // ================================================================
        if (prevReview.care_card_values && typeof prevReview.care_card_values === 'object') {
            Object.assign(careCardValues, prevReview.care_card_values);
        }
        if (prevReview.original_emr_values && typeof prevReview.original_emr_values === 'object') {
            Object.assign(originalEMRValues, prevReview.original_emr_values);
        }
        if (prevReview.discrepancy_types && typeof prevReview.discrepancy_types === 'object') {
            Object.assign(discrepancyTypes, prevReview.discrepancy_types);
        }
        if (prevReview.discrepancy_notes && typeof prevReview.discrepancy_notes === 'object') {
            Object.assign(discrepancyNotes, prevReview.discrepancy_notes);
        }
        
        const hasPrevious = Object.keys(batchResults).length > 0 || previousFieldResults.length > 0;
        
        reviewState = {
            workflow: data.workflow,
            currentStep: 0,
            results: previousFieldResults,
            totalFields: totalFields,
            matchedFields: matchedFields,
            correctedOnEMR: correctedOnEMR,
            correctedOnCareCard: correctedOnCareCard,
            correctedOnBoth: correctedOnBoth,
            active: true,
            batchResults: batchResults,
            previousReview: prevReview,
            careCardValues: careCardValues,
            originalEMRValues: originalEMRValues,
            discrepancyTypes: discrepancyTypes,
            discrepancyNotes: discrepancyNotes
        };
        
        console.log('📋 ========== REVIEW STATE LOADED ==========');
        console.log('📋 Total fields:', totalFields);
        console.log('📋 Matched fields:', matchedFields);
        console.log('📋 Care Card Values:', reviewState.careCardValues);
        console.log('📋 Original EMR Values:', reviewState.originalEMRValues);
        console.log('📋 Discrepancy Types:', reviewState.discrepancyTypes);
        console.log('📋 Discrepancy Notes:', reviewState.discrepancyNotes);
        console.log('📋 Batch Results:', reviewState.batchResults);
        console.log('📋 =========================================');
        
        // ✅ Safe DOM operations
        const rwContent = document.getElementById('reviewWorkflowContent');
        if (rwContent) rwContent.style.display = 'block';
        
        const emptyState = document.getElementById('reviewEmptyState');
        if (emptyState) emptyState.style.display = 'none';
        
        const title = document.getElementById('careCardTitle');
        if (title) title.textContent = hasPrevious ? '📋 Continuing Review' : 'Verification in Progress';
        
        const badge = document.getElementById('careCardBadge');
        if (badge) {
            badge.innerHTML = '<span class="pulse-dot"></span>Active';
            badge.className = 'card-badge live';
        }
        
        const startBtn = document.getElementById('btnStartReview');
        if (startBtn) startBtn.style.display = 'none';
        
        renderReviewStep(0);
        
        showToast(hasPrevious ? `📋 Previous review loaded! (${matchedFields}/${totalFields} matched)` : '✅ Review started!', 'success', 3000);
        
    } catch(e) {
        console.error('Start Review Error:', e);
        showToast('❌ ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}


function renderReviewStep(stepIndex) {
    const workflow = reviewState.workflow;
    if (!workflow || stepIndex >= workflow.steps.length) return;
    
    reviewState.currentStep = stepIndex;
    const step = workflow.steps[stepIndex];
    const container = document.getElementById('reviewWorkflowContent');
    if (!container) return;
    
    let html = '';
    
    // ================================================================
    // STEPPER - Sleek horizontal stepper with connecting lines
    // ================================================================
    html += '<div style="display:flex; align-items:center; gap:0; margin-bottom:24px; padding:0 4px;">';
    workflow.steps.forEach((s, i) => {
        let status = 'pending';
        if (i < stepIndex) status = 'completed';
        else if (i === stepIndex) status = 'active';
        
        html += `<div style="display:flex; align-items:center; gap:0; ${i < workflow.steps.length-1 ? 'flex:1;' : ''}">`;
        html += `<div style="
            flex-shrink:0;
            width: ${status === 'active' ? '42px' : '36px'};
            height: ${status === 'active' ? '42px' : '36px'};
            border-radius: 50%;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size: ${status === 'active' ? '1rem' : '0.8rem'};
            transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
            ${status === 'completed' ? 
                'background: linear-gradient(135deg, #10b981, #059669); color: white; box-shadow: 0 2px 8px rgba(16,185,129,0.3);' : 
            status === 'active' ? 
                'background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; box-shadow: 0 4px 16px rgba(79,70,229,0.35); transform: scale(1.05);' : 
                'background: #f1f5f9; color: #94a3b8; border: 2px solid #e2e8f0;'}
        ">
            ${status === 'completed' ? '<i class="bi bi-check-lg" style="font-size:0.9rem;"></i>' : 
              status === 'active' ? `<i class="bi ${s.icon}"></i>` : 
              `<span style="font-size:0.7rem; font-weight:700;">${i+1}</span>`}
        </div>`;
        
        if (i < workflow.steps.length - 1) {
            html += `<div style="
                flex:1;
                height:2px;
                margin:0 4px;
                border-radius:1px;
                transition: all 0.4s ease;
                ${i < stepIndex ? 'background: #10b981;' : 'background: #e2e8f0;'}
            "></div>`;
        }
        
        html += `</div>`;
    });
    html += '</div>';
    
    // Step labels row
    html += '<div style="display:flex; gap:4px; margin-bottom:24px;">';
    workflow.steps.forEach((s, i) => {
        let color = '#94a3b8', weight = '500';
        if (i < stepIndex) { color = '#059669'; weight = '600'; }
        else if (i === stepIndex) { color = '#4f46e5'; weight = '700'; }
        html += `<div style="flex:1; text-align:center; font-size:0.65rem; color:${color}; font-weight:${weight}; letter-spacing:-0.01em;">
            ${s.title.split(' ')[0]}
        </div>`;
    });
    html += '</div>';
    
    // ================================================================
    // STEP CONTENT HEADER
    // ================================================================
    html += `<div style="
        background: linear-gradient(135deg, #f8fafc, #ffffff);
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 18px 20px;
        margin-bottom: 16px;
        display:flex;
        align-items:center;
        gap:14px;
    ">
        <div style="
            width:48px; height:48px;
            border-radius:14px;
            background: linear-gradient(135deg, #eef2ff, #e0e7ff);
            display:flex; align-items:center; justify-content:center;
            font-size:1.3rem; color:#4f46e5;
            flex-shrink:0;
        ">
            <i class="bi ${step.icon}"></i>
        </div>
        <div>
            <div style="font-weight:700; font-size:0.9rem; color:#0f172a;">${step.title}</div>
            <div style="color:#64748b; font-size:0.75rem; margin-top:2px;">${step.instruction || ''}</div>
        </div>
    </div>`;
    
    // ================================================================
    // STEP CONTENT
    // ================================================================
    if (stepIndex === 0 && step.fields) {
        step.fields.forEach((field, i) => html += renderFieldComparisonCard(field, i));
    }
    if (stepIndex === 1 && step.fields) {
        step.fields.forEach((field, i) => html += renderFieldComparisonCard(field, i));
    }
    if (stepIndex === 2 && step.refills) {
        html += renderBatchRefillComparison(step.refills);
    }
    if (stepIndex === 3 && step.viral_loads) {
        html += renderBatchVLComparison(step.viral_loads);
    }
    
    // ================================================================
    // NAVIGATION
    // ================================================================
    html += `<div style="
        display:flex; justify-content:space-between; align-items:center;
        margin-top:24px; padding-top:16px;
        border-top:1px solid #f1f5f9;
    ">`;
    html += stepIndex > 0 ? 
        `<button class="btn btn-sm" onclick="prevReviewStep()" style="
            background:white; border:2px solid #e2e8f0; border-radius:50px;
            padding:10px 20px; font-weight:600; font-size:0.8rem; color:#475569;
            transition:all 0.2s ease;
        " onmouseover="this.style.borderColor='#6366f1';this.style.color='#4f46e5';" onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#475569';">
            <i class="bi bi-arrow-left me-1"></i> Back
        </button>` : '<div></div>';
    
    html += `<div style="display:flex; gap:8px;">
        <button class="btn btn-sm" onclick="cancelReviewWorkflow()" style="
            background:white; border:2px solid #fecaca; border-radius:50px;
            padding:10px 18px; font-weight:600; font-size:0.8rem; color:#ef4444;
            transition:all 0.2s ease;
        " onmouseover="this.style.background='#fef2f2';" onmouseout="this.style.background='white';">
            <i class="bi bi-x-circle me-1"></i> Cancel
        </button>`;
    
    if (stepIndex < workflow.steps.length - 1) {
        html += `<button class="btn btn-sm" onclick="nextReviewStep()" style="
            background: linear-gradient(135deg, #4f46e5, #6366f1);
            border:none; border-radius:50px;
            padding:10px 22px; font-weight:700; font-size:0.8rem; color:white;
            box-shadow: 0 4px 12px rgba(79,70,229,0.3);
            transition:all 0.2s ease;
        " onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 20px rgba(79,70,229,0.4)';" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 12px rgba(79,70,229,0.3)';">
            Next <i class="bi bi-arrow-right ms-1"></i>
        </button>`;
    } else {
        html += `<button class="btn btn-sm" onclick="completeReviewWorkflow()" style="
            background: linear-gradient(135deg, #10b981, #059669);
            border:none; border-radius:50px;
            padding:10px 22px; font-weight:700; font-size:0.8rem; color:white;
            box-shadow: 0 4px 12px rgba(16,185,129,0.3);
            transition:all 0.2s ease;
        " onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 20px rgba(16,185,129,0.4)';" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 12px rgba(16,185,129,0.3)';">
            <i class="bi bi-check-lg me-1"></i> Complete Review
        </button>`;
    }
    
    html += '</div></div>';
    
    container.innerHTML = html;
    
    // ✅ AFTER rendering, apply the stored values to selects
    setTimeout(() => {
        applyStoredFieldValues();
        applyPreviousBatchSelections();
    }, 50);
}

// ================================================================
// ✅ NEW FUNCTION: Apply stored values to field selects
// ================================================================
function applyStoredFieldValues() {
    // For each field result we have stored, set the select value
    reviewState.results.forEach(result => {
        const card = document.getElementById(`fieldCard_${result.field}`);
        if (!card) return;
        
        const select = card.querySelector('.match-select');
        if (!select) return;
        
        let selectValue = '';
        if (result.match) {
            selectValue = 'match';
        } else if (result.corrected_on === 'emr') {
            selectValue = 'corrected_emr';
        } else if (result.corrected_on === 'care_card') {
            selectValue = 'corrected_carecard';
        } else if (result.corrected_on === 'both') {
            selectValue = 'corrected_both';
        }
        
        if (selectValue) {
            select.value = selectValue;
            
            // Update card styling
            const accentStrip = card.querySelector('div > div:first-child');
            if (selectValue === 'match') {
                card.style.borderColor = '#86efac';
                card.style.background = '#f9fdfb';
                if (accentStrip) accentStrip.style.background = '#10b981';
            } else if (selectValue.startsWith('corrected')) {
                card.style.borderColor = '#fde68a';
                card.style.background = '#fffdf7';
                if (accentStrip) accentStrip.style.background = '#f59e0b';
            }
            
            console.log(`✅ Applied stored value for ${result.field}: ${selectValue}`);
        }
    });
}
// ============================================================================
// INDIVIDUAL FIELD COMPARISON CARD — Human-centred side-by-side design
// Officers see EMR value on the left, enter Care Card value on the right,
// then declare the outcome. No abstraction — exactly how real DQA works.
// ============================================================================

function renderFieldComparisonCard(field, index) {
    const existingResult = reviewState.results.find(r => r.field === field.field);
    const storedCCVal    = reviewState.careCardValues?.[field.field] || '';

    // ── Determine saved outcome ──────────────────────────────────────────
    let outcome = '';
    if (existingResult) {
        if (existingResult.match)                             outcome = 'match';
        else if (existingResult.corrected_on === 'emr')       outcome = 'corrected_emr';
        else if (existingResult.corrected_on === 'care_card') outcome = 'corrected_carecard';
        else if (existingResult.corrected_on === 'both')      outcome = 'corrected_both';
    }

    // ── Theme colours based on outcome ──────────────────────────────────
    const isMatch = outcome === 'match';
    const isCorr  = outcome.startsWith('corr');
    const isPend  = !outcome;

    const borderColor = isMatch ? '#86efac' : isCorr ? '#fde68a' : '#e2e8f0';
    const cardBg      = isMatch ? '#f9fdfb' : isCorr ? '#fffdf7' : '#ffffff';
    const accentColor = isMatch ? '#10b981' : isCorr ? '#f59e0b' : '#cbd5e1';

    // ── Status pill ──────────────────────────────────────────────────────
    const pillStyle = isMatch
        ? 'color:#059669; background:#f0fdf4; border:1px solid #86efac;'
        : isCorr
        ? 'color:#b45309; background:#fffbeb; border:1px solid #fde68a;'
        : 'color:#94a3b8; background:#f1f5f9;';
    const pillText = isMatch ? '✓ Matched' : isCorr ? '✎ Corrected' : '○ Pending';

    // ── Care Card display (what was recorded, or the input) ──────────────
    // If matched → show the EMR value as the CC value (they're the same)
    // If corrected → show stored CC value if any, else show the input
    const isSex  = field.field === 'sex';
    const isDate = ['date_of_birth','art_start_date','last_pickup_date'].includes(field.field);

    // For "match" we display the value as read-only (it auto-filled)
    // For corrections we show the editable input
    const showReadonly = isMatch;
    const displayCCVal = isMatch ? (field.emr_value || '—') : storedCCVal;

    let ccAreaHtml = '';
    if (showReadonly) {
        // Read-only — auto-populated with EMR value on match
        ccAreaHtml = `
        <div style="background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:8px;
                    padding:10px 12px; font-weight:700; color:#059669; font-size:0.88rem;
                    min-height:40px; display:flex; align-items:center; word-break:break-word;">
            ${displayCCVal || '<span style="color:#94a3b8; font-style:italic;">Not recorded</span>'}
        </div>
        <div style="font-size:0.6rem; color:#10b981; margin-top:4px; font-weight:600;">
            <i class="bi bi-check-circle me-1"></i>Auto-filled — matches EMR
        </div>`;
    } else {
        // Editable input
        if (isSex) {
            ccAreaHtml = `<select id="ccInput_${field.field}" class="cc-input"
                onchange="onCCInputChange('${field.field}')"
                style="width:100%; padding:9px 12px; border:2px solid #fde68a; border-radius:8px;
                       font-size:0.85rem; font-weight:600; color:#334155; background:#fffdf7;
                       cursor:pointer; outline:none; transition:border-color 0.15s;">
                <option value="">— Select —</option>
                <option value="Male" ${storedCCVal==='Male'?'selected':''}>Male</option>
                <option value="Female" ${storedCCVal==='Female'?'selected':''}>Female</option>
            </select>`;
        } else if (isDate) {
            ccAreaHtml = `<input type="date" id="ccInput_${field.field}" class="cc-input"
                value="${storedCCVal}"
                onchange="onCCInputChange('${field.field}')"
                style="width:100%; padding:9px 12px; border:2px solid #fde68a; border-radius:8px;
                       font-size:0.85rem; font-weight:600; color:#334155; background:#fffdf7;
                       outline:none; transition:border-color 0.15s;">`;
        } else {
            ccAreaHtml = `<input type="text" id="ccInput_${field.field}" class="cc-input"
                value="${storedCCVal.replace(/"/g,'&quot;')}"
                placeholder="Enter what the Care Card shows…"
                onchange="onCCInputChange('${field.field}')"
                oninput="onCCInputChange('${field.field}')"
                style="width:100%; padding:9px 12px; border:2px solid #fde68a; border-radius:8px;
                       font-size:0.85rem; color:#334155; background:#fffdf7;
                       outline:none; transition:border-color 0.15s; font-family:inherit;">`;
        }
        ccAreaHtml += `<div style="font-size:0.6rem; color:#94a3b8; margin-top:4px;">
            <i class="bi bi-info-circle me-1"></i>
            Leave blank if data is missing or not documented
        </div>`;
    }

    // ── Discrepancy summary (shown under card when correction recorded) ──
    const discPanelHtml = (isCorr) ? _renderFieldDiscPanel(field.field, outcome, field) : '';

    // ── Outcome buttons ──────────────────────────────────────────────────
    const outcomes = [
        { val:'match',              icon:'bi-check-circle-fill', label:'Match',       color:'#059669', bg:'#f0fdf4', border:'#86efac',
          desc:'Values agree — no change needed' },
        { val:'corrected_emr',      icon:'bi-pencil-fill',       label:'Fixed EMR',   color:'#4f46e5', bg:'#eef2ff', border:'#a5b4fc',
          desc:'EMR was wrong, corrected it' },
        { val:'corrected_carecard', icon:'bi-card-text',         label:'Card Error',  color:'#b45309', bg:'#fffbeb', border:'#fde68a',
          desc:'Care Card was wrong, EMR is right' },
        { val:'corrected_both',     icon:'bi-arrow-left-right',  label:'Both Fixed',  color:'#be185d', bg:'#fdf2f8', border:'#fbcfe8',
          desc:'Both sources corrected' },
    ];
    const activeOutcome = outcomes.find(o => o.val === outcome);

    const outcomeButtonsHtml = outcomes.map(opt => {
        const isActive = outcome === opt.val;
        return `<button
            class="outcome-btn"
            data-field="${field.field}"
            data-value="${opt.val}"
            onclick="onOutcomeClick('${field.field}','${opt.val}',this)"
            title="${opt.desc}"
            style="flex:1; min-width:0; padding:7px 4px; border-radius:8px; cursor:pointer; font-size:0.7rem; font-weight:${isActive?'700':'500'};
                   border:2px solid ${isActive ? opt.border : '#e2e8f0'};
                   background:${isActive ? opt.bg : 'white'};
                   color:${isActive ? opt.color : '#94a3b8'};
                   display:flex; flex-direction:column; align-items:center; gap:3px;
                   transition:all 0.15s ease;"
            onmouseover="if('${outcome}'!=='${opt.val}'){this.style.borderColor='${opt.border}';this.style.background='${opt.bg}';this.style.color='${opt.color}';}"
            onmouseout="if('${outcome}'!=='${opt.val}'){this.style.borderColor='#e2e8f0';this.style.background='white';this.style.color='#94a3b8';}">
            <i class="bi ${opt.icon}" style="font-size:0.95rem;"></i>
            <span>${opt.label}</span>
        </button>`;
    }).join('');

    return `
    <div class="review-field-card" id="fieldCard_${field.field}" style="
        border:2px solid ${borderColor};
        border-radius:14px;
        background:${cardBg};
        margin-bottom:12px;
        overflow:hidden;
        transition:border-color 0.2s, box-shadow 0.2s;
        box-shadow:0 1px 4px rgba(0,0,0,0.05);
    ">
        <!-- Accent bar + content -->
        <div style="display:flex; align-items:stretch;">
            <div style="width:4px; flex-shrink:0; background:${accentColor}; border-radius:14px 0 0 14px;"></div>
            <div style="flex:1; padding:14px 16px; min-width:0;">

                <!-- ① Header row: number + label + status pill -->
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                    <span style="flex-shrink:0; width:22px; height:22px; border-radius:6px; display:flex; align-items:center; justify-content:center;
                                 background:${accentColor}20; color:${accentColor}; font-weight:800; font-size:0.62rem;">
                        ${index + 1}
                    </span>
                    <span style="font-weight:700; font-size:0.88rem; color:#0f172a; flex:1; min-width:0; truncate;" class="fc-field-label">
                        ${field.label}
                    </span>
                    <span style="flex-shrink:0; font-size:0.62rem; font-weight:700; padding:2px 8px; border-radius:20px; white-space:nowrap; ${pillStyle}">
                        ${pillText}
                    </span>
                </div>

                <!-- ② EMR value row -->
                <div style="margin-bottom:8px;">
                    <div style="font-size:0.6rem; font-weight:700; color:#059669; text-transform:uppercase;
                                letter-spacing:0.06em; margin-bottom:4px; display:flex; align-items:center; gap:4px;">
                        <span style="width:5px; height:5px; background:#10b981; border-radius:50%; display:inline-block;"></span>
                        EMR Record
                    </div>
                    <div class="fc-emr-val" style="background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:8px;
                                padding:9px 12px; font-weight:700; color:#059669; font-size:0.88rem;
                                min-height:38px; display:flex; align-items:center; word-break:break-word;">
                        ${field.emr_value
                            ? `<span style="font-family:inherit;">${field.emr_value}</span>`
                            : '<span style="color:#94a3b8; font-style:italic; font-weight:400;">Not recorded</span>'}
                    </div>
                </div>

                <!-- ③ Care Card row (stacked below EMR, not side-by-side) -->
                <div style="margin-bottom:12px;">
                    <div style="font-size:0.6rem; font-weight:700; color:#b45309; text-transform:uppercase;
                                letter-spacing:0.06em; margin-bottom:4px; display:flex; align-items:center; justify-content:space-between;">
                        <span style="display:flex; align-items:center; gap:4px;">
                            <span style="width:5px; height:5px; background:#f59e0b; border-radius:50%; display:inline-block;"></span>
                            Physical Care Card
                        </span>
                        ${!showReadonly ? '<span style="font-size:0.58rem; color:#94a3b8; font-weight:400; font-style:italic; text-transform:none;">optional</span>' : ''}
                    </div>
                    ${ccAreaHtml}
                </div>

                <!-- ④ Outcome buttons — 2×2 grid, never wraps awkwardly -->
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
                    <div style="font-size:0.6rem; font-weight:700; color:#64748b; text-transform:uppercase;
                                letter-spacing:0.05em; margin-bottom:8px;">
                        <i class="bi bi-clipboard-check me-1"></i>What did you find?
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                        ${outcomeButtonsHtml}
                    </div>
                    ${activeOutcome ? `
                    <div style="margin-top:8px; font-size:0.68rem; color:${activeOutcome.color};
                                font-weight:600; display:flex; align-items:center; gap:5px;">
                        <i class="bi ${activeOutcome.icon}"></i> ${activeOutcome.desc}
                    </div>` : ''}
                </div>

                <!-- ⑤ Discrepancy detail (shown after correction is saved) -->
                ${discPanelHtml ? `<div style="margin-top:10px;">${discPanelHtml}</div>` : ''}

            </div>
        </div>
    </div>`;
}

// Called when officer types/selects a Care Card value — auto-compare and suggest outcome
function onCCInputChange(fieldName) {
    const input = document.getElementById(`ccInput_${fieldName}`);
    if (!input) return;
    const ccVal = input.value?.trim();

    if (!reviewState.careCardValues) reviewState.careCardValues = {};
    if (ccVal) reviewState.careCardValues[fieldName] = ccVal;
    else delete reviewState.careCardValues[fieldName];

    // Find EMR value for this field
    const step = reviewState.workflow?.steps?.[reviewState.currentStep];
    const fieldDef = step?.fields?.find(f => f.field === fieldName);
    if (!fieldDef) return;

    const emrVal  = (fieldDef.emr_value || '').trim().toLowerCase();
    const ccLower = (ccVal || '').toLowerCase();

    const card = document.getElementById(`fieldCard_${fieldName}`);
    if (!card) return;

    // Auto-suggest match if values are equal
    if (emrVal && ccLower &&
        (emrVal === ccLower ||
         emrVal.replace(/[^a-z0-9]/g,'') === ccLower.replace(/[^a-z0-9]/g,''))) {
        const matchBtn = card.querySelector('[data-value="match"]');
        if (matchBtn) {
            matchBtn.style.borderColor  = '#86efac';
            matchBtn.style.background   = '#f0fdf4';
            matchBtn.style.color        = '#10b981';
            matchBtn.style.fontWeight   = '700';
            matchBtn.title = 'Values match — click to confirm';
        }
    } else {
        // Reset match button if user changes value
        const matchBtn = card.querySelector('[data-value="match"]');
        if (matchBtn && !matchBtn.dataset.selected) {
            matchBtn.style.borderColor = '#e2e8f0';
            matchBtn.style.background  = 'white';
            matchBtn.style.color       = '#94a3b8';
            matchBtn.style.fontWeight  = '500';
        }
    }
}

function onOutcomeClick(fieldName, outcomeValue, btnEl) {
    const step     = reviewState.workflow?.steps?.[reviewState.currentStep];
    const fieldDef = step?.fields?.find(f => f.field === fieldName);
    const emrValue = (fieldDef?.emr_value || '').trim();

    const input = document.getElementById(`ccInput_${fieldName}`);
    const ccVal = input ? (input.value || '').trim() : '';

    if (!reviewState.careCardValues) reviewState.careCardValues = {};

    if (outcomeValue === 'match') {
        const autoFill = ccVal || emrValue;
        if (autoFill) reviewState.careCardValues[fieldName] = autoFill;

        if (input && !ccVal && emrValue) {
            input.value = emrValue;
            input.style.borderColor = '#86efac';
            input.style.background  = '#f0fdf4';
        }

        // Clear any stale correction data when switching back to match
        if (reviewState.discrepancyTypes) delete reviewState.discrepancyTypes[fieldName];
        if (reviewState.discrepancyNotes) delete reviewState.discrepancyNotes[fieldName];
        if (reviewState.originalEMRValues) delete reviewState.originalEMRValues[fieldName];

        _finaliseOutcome(fieldName, 'match');
        return;
    }

    if (ccVal) reviewState.careCardValues[fieldName] = ccVal;

    // *** FIX: always clear stale discrepancy data so switching outcomes
    // re-opens the modal with a clean state instead of silently keeping
    // the previous reason. ***
    if (reviewState.discrepancyTypes) delete reviewState.discrepancyTypes[fieldName];
    if (reviewState.discrepancyNotes) delete reviewState.discrepancyNotes[fieldName];
    if (reviewState.originalEMRValues) delete reviewState.originalEMRValues[fieldName];

    const label = fieldDef?.label || fieldName;
    showDiscrepancyTypeModal(fieldName, label, emrValue, outcomeValue, () => {
        const discType = reviewState.discrepancyTypes?.[fieldName];
        if (discType !== 'incorrect_value' || reviewState.careCardValues?.[fieldName]) {
            _finaliseOutcome(fieldName, outcomeValue);
        }
    });
}
function _finaliseOutcome(fieldName, outcomeValue) {
    const isMatch = outcomeValue === 'match';
    const correctedOn = outcomeValue === 'corrected_emr' ? 'emr'
                      : outcomeValue === 'corrected_carecard' ? 'care_card'
                      : outcomeValue === 'corrected_both' ? 'both' : null;

    // Upsert into results
    const existing = reviewState.results.findIndex(r => r.field === fieldName);
    const step = reviewState.workflow?.steps?.[reviewState.currentStep];
    const fieldDef = step?.fields?.find(f => f.field === fieldName);
    const result = {
        field: fieldName,
        label: fieldDef?.label || fieldName,
        emr_value: fieldDef?.emr_value || '',
        match: isMatch,
        corrected_on: correctedOn,
        care_card_value: reviewState.careCardValues?.[fieldName] || null,
        original_emr_value: reviewState.originalEMRValues?.[fieldName] || null,
        discrepancy_type: reviewState.discrepancyTypes?.[fieldName] || null,
        discrepancy_note: reviewState.discrepancyNotes?.[fieldName] || null,
        affected_visits: reviewState.affectedVisits?.[fieldName] || [],
        step: (reviewState.currentStep || 0) + 1
    };
    if (existing >= 0) reviewState.results[existing] = result;
    else reviewState.results.push(result);

    // If EMR correction, ask for original EMR value if not already captured
    if ((correctedOn === 'emr' || correctedOn === 'both') && !reviewState.originalEMRValues?.[fieldName]) {
        const emrVal = fieldDef?.emr_value || '';
        if (!reviewState.originalEMRValues) reviewState.originalEMRValues = {};
        reviewState.originalEMRValues[fieldName] = emrVal; // default to current EMR value
    }

    // Re-render just the field card in-place
    const container = document.getElementById(`fieldCard_${fieldName}`);
    if (container && fieldDef) {
        const newHtml = renderFieldComparisonCard(fieldDef, (reviewState.workflow?.steps?.[reviewState.currentStep]?.fields?.indexOf(fieldDef) ?? 0));
        container.outerHTML = newHtml;
    }

    // Toast
    const msgs = {
        match: '✅ Recorded as Match',
        corrected_emr: '💻 EMR correction recorded',
        corrected_carecard: '📋 Care Card discrepancy documented',
        corrected_both: '🔀 Both-source correction recorded'
    };
    showToast(msgs[outcomeValue] || '✅ Saved', 'success', 1800);
}


function onFieldMatchChange(select, field) {
    const card = document.getElementById(`fieldCard_${field}`);
    if (!card) return;
    
    const value = select.value;
    const accentStrip = card.querySelector('div > div:first-child');
    
    if (value === 'match') {
        card.style.borderColor = '#86efac';
        card.style.background = '#f9fdfb';
        if (accentStrip) accentStrip.style.background = '#10b981';
        
        if (reviewState.careCardValues) delete reviewState.careCardValues[field];
        if (reviewState.originalEMRValues) delete reviewState.originalEMRValues[field];
        if (reviewState.discrepancyTypes) delete reviewState.discrepancyTypes[field];
        if (reviewState.discrepancyNotes) delete reviewState.discrepancyNotes[field];
        
    } else if (value.startsWith('corrected')) {
        card.style.borderColor = '#fde68a';
        card.style.background = '#fffdf7';
        if (accentStrip) accentStrip.style.background = '#f59e0b';
        
        const labelEl = card.querySelector('.field-label');
        const label = labelEl?.textContent?.trim() || field;
        const emrValueEl = card.querySelector('.emr-value');
        const emrValue = emrValueEl?.textContent?.trim() || '';
        
        if (!reviewState.originalEMRValues) reviewState.originalEMRValues = {};
        if (!reviewState.originalEMRValues[field]) {
            reviewState.originalEMRValues[field] = emrValue;
        }
        
        // ✅ Show discrepancy type modal FIRST
        showDiscrepancyTypeModal(field, label, emrValue, value);
        
    } else {
        card.style.borderColor = '#e2e8f0';
        card.style.background = '#ffffff';
        if (accentStrip) accentStrip.style.background = '#e2e8f0';
    }
}


function showDiscrepancyTypeModal(field, label, emrValue, correctionType, onSaveCallback) {
    document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());
    
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop-custom';
    backdrop.style.display = 'flex';
    
    const correctionLabels = {
        'corrected_emr': 'Corrected on EMR',
        'corrected_carecard': 'Corrected on Care Card', 
        'corrected_both': 'Corrected on Both'
    };
    const correctionLabel = correctionLabels[correctionType] || 'Discrepancy Found';
    
    // ✅ Determine field context
    const step = reviewState.workflow?.steps?.[reviewState.currentStep];
    const stepTitle = step?.title || '';
    const isBiodata = stepTitle.includes('Biodata');
    const isLatestRefill = stepTitle.includes('Latest Refill') || stepTitle.includes('Refill Details');
    
    // ✅ Determine correction action
    const isCorrectedEMR = correctionType === 'corrected_emr';
    const isCorrectedCareCard = correctionType === 'corrected_carecard';
    const isCorrectedBoth = correctionType === 'corrected_both';
    
    // ✅ Build context-aware AND correction-aware discrepancy options
    let discrepancyOptions = [];
    
    if (isCorrectedEMR) {
        // EMR was wrong — fixed to match Care Card (Care Card = source of truth)
        if (isBiodata) {
            discrepancyOptions = [
                { value: 'incorrect_value', label: '❌ Incorrect Value in EMR', desc: 'The EMR had wrong biodata — corrected to match Care Card', icon: 'bi-pencil' },
                { value: 'missing_emr', label: '📂 Missing in EMR', desc: 'This biodata was not recorded in the electronic system', icon: 'bi-database-x' },
                { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm accuracy from available sources', icon: 'bi-search' },
                { value: 'other', label: '📌 Other', desc: 'Another reason not listed above — explanation required', icon: 'bi-three-dots' },
            ];
        } else if (isLatestRefill) {
            discrepancyOptions = [
                { value: 'incorrect_value', label: '❌ Incorrect Value in EMR', desc: 'The EMR had wrong refill data — corrected to match Care Card', icon: 'bi-pencil' },
                { value: 'missing_emr', label: '📂 Missing in EMR', desc: 'This refill data was not in the pharmacy records', icon: 'bi-database-x' },
                { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm refill details from available sources', icon: 'bi-search' },
                { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
            ];
        } else {
            discrepancyOptions = [
                { value: 'incorrect_value', label: '❌ Incorrect Value in EMR', desc: 'The EMR had wrong data — corrected to match Care Card', icon: 'bi-pencil' },
                { value: 'missing_emr', label: '📂 Missing in EMR', desc: 'This data was not in the electronic system', icon: 'bi-database-x' },
                { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm accuracy from available sources', icon: 'bi-search' },
                { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
            ];
        }
    } else if (isCorrectedCareCard) {
        // Care Card was wrong — EMR is correct (EMR = source of truth)
        if (isBiodata) {
            discrepancyOptions = [
                { value: 'incorrect_value', label: '❌ Incorrect Value on Care Card', desc: 'The Care Card had wrong biodata — EMR is correct', icon: 'bi-pencil' },
                { value: 'missing_carecard', label: '📋 Missing on Care Card', desc: 'This biodata was not documented on the physical card', icon: 'bi-card-text' },
                { value: 'not_documented', label: '📝 Not Documented on Card', desc: 'Biodata information not recorded on the care card', icon: 'bi-file-earmark-x' },
                { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm accuracy from available sources', icon: 'bi-search' },
                { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
            ];
        } else if (isLatestRefill) {
            discrepancyOptions = [
                { value: 'incorrect_value', label: '❌ Incorrect Value on Care Card', desc: 'The Care Card had wrong refill data — EMR is correct', icon: 'bi-pencil' },
                { value: 'missing_carecard', label: '📋 Missing on Care Card', desc: 'Refill data not documented on the physical card', icon: 'bi-card-text' },
                { value: 'not_documented', label: '📝 Not Documented on Card', desc: 'Refill information not recorded on the care card', icon: 'bi-file-earmark-x' },
                { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm refill details from sources', icon: 'bi-search' },
                { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
            ];
        } else {
            discrepancyOptions = [
                { value: 'incorrect_value', label: '❌ Incorrect Value on Care Card', desc: 'The Care Card had wrong data — EMR is correct', icon: 'bi-pencil' },
                { value: 'missing_carecard', label: '📋 Missing on Care Card', desc: 'Data not documented on the physical card', icon: 'bi-card-text' },
                { value: 'not_documented', label: '📝 Not Documented on Card', desc: 'Information not recorded on the care card', icon: 'bi-file-earmark-x' },
                { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm accuracy from sources', icon: 'bi-search' },
                { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
            ];
        }
    } else if (isCorrectedBoth) {
        // Both EMR and Care Card were wrong — both corrected
        discrepancyOptions = [
            { value: 'incorrect_value', label: '❌ Incorrect Value (Both)', desc: 'Both EMR and Care Card had wrong data — both corrected', icon: 'bi-pencil' },
            { value: 'not_documented', label: '📝 Not Documented', desc: 'Information not properly recorded in either source', icon: 'bi-file-earmark-x' },
            { value: 'unavailable', label: '🚫 Information Unavailable', desc: 'Cannot access or obtain this data from any source', icon: 'bi-slash-circle' },
            { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm accuracy from any available source', icon: 'bi-search' },
            { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
        ];
    }
    
    backdrop.innerHTML = `
    <div onclick="event.stopPropagation()" style="
        background:white; border-radius:20px; width:90%; max-width:600px; max-height:85vh; 
        overflow-y:auto; box-shadow:0 25px 60px rgba(0,0,0,0.25); animation: slideUp 0.3s ease;
    ">
        <!-- Header -->
        <div style="
            background:linear-gradient(135deg, #fffbeb, #fef3c7); padding:24px 24px 16px;
            text-align:center; border-bottom:1px solid #fde68a;
        ">
            <div style="
                width:56px; height:56px; border-radius:50%;
                background:linear-gradient(135deg, #fef3c7, #fde68a);
                display:flex; align-items:center; justify-content:center;
                margin:0 auto 10px; font-size:1.5rem; color:#d97706;
            ">
                <i class="bi bi-question-circle-fill"></i>
            </div>
            <h5 style="font-weight:800; color:#92400e; margin:0; font-size:1rem;">
                Reason for Discrepancy
            </h5>
            <p style="color:#a16207; font-size:0.78rem; margin:4px 0 0;">
                <strong>${label}</strong> — ${correctionLabel}
            </p>
            <div style="
                background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px;
                padding:8px 14px; margin-top:10px; font-size:0.75rem; color:#059669;
            ">
                <i class="bi bi-database me-1"></i> EMR Value: <strong>${emrValue}</strong>
            </div>
            <div style="font-size:0.65rem; color:#94a3b8; margin-top:4px;">
                ${isBiodata ? '<i class="bi bi-person-badge me-1"></i>Biodata Field' : ''}
                ${isLatestRefill ? '<i class="bi bi-capsule me-1"></i>Pharmacy Refill Field' : ''}
                ${!isBiodata && !isLatestRefill ? '<i class="bi bi-clipboard-check me-1"></i>Review Field' : ''}
            </div>
        </div>
        
        <!-- Reason Options -->
        <div style="padding:16px 24px;">
            <label style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px; display:block;">
                Why is there a discrepancy?
            </label>
            <div id="discrepancyOptionsList" style="display:flex; flex-direction:column; gap:6px;">
                ${discrepancyOptions.map(opt => `
                <div class="disc-option" data-value="${opt.value}" onclick="selectDiscrepancyOption(this, '${opt.value}')" style="
                    padding:14px 16px; border:2px solid #e2e8f0; border-radius:12px; cursor:pointer;
                    transition:all 0.15s ease; background:white; display:flex; align-items:flex-start; gap:12px;
                " onmouseover="this.style.borderColor='#f59e0b';this.style.background='#fffdf7';" 
                   onmouseout="if(!this.classList.contains('selected')){this.style.borderColor='#e2e8f0';this.style.background='white';}">
                    <div style="
                        width:36px; height:36px; border-radius:10px; 
                        background:#fef3c7; display:flex; align-items:center; justify-content:center;
                        font-size:1rem; color:#d97706; flex-shrink:0;
                    ">
                        <i class="bi ${opt.icon}"></i>
                    </div>
                    <div>
                        <div style="font-weight:600; font-size:0.85rem; color:#1e293b;">${opt.label}</div>
                        <div style="font-size:0.72rem; color:#64748b; margin-top:2px;">${opt.desc}</div>
                    </div>
                </div>
                `).join('')}
            </div>
            
            <!-- Note Section -->
            <div id="discrepancyNoteSection" style="display:none; margin-top:12px;">
                <label id="discrepancyNoteLabel" style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">
                    📝 Additional Note (Optional)
                </label>
                <textarea id="discrepancyNoteInput" placeholder="Add any relevant details about this discrepancy..." style="
                    width:100%; padding:10px 14px; border:2px solid #e2e8f0; border-radius:10px;
                    font-size:0.82rem; min-height:60px; resize:vertical; margin-top:4px;
                    font-family:inherit; outline:none;
                " onfocus="this.style.borderColor='#6366f1';" onblur="this.style.borderColor='#e2e8f0';"></textarea>
            </div>
        </div>
        
        <!-- Actions -->
        <div style="padding:16px 24px; border-top:1px solid #f1f5f9; display:flex; gap:10px; justify-content:flex-end; background:#fafbff;">
            <button id="discCancelBtn" style="
                padding:10px 20px; border:2px solid #e2e8f0; border-radius:12px;
                background:white; font-weight:600; font-size:0.8rem; color:#64748b; cursor:pointer;
            ">Cancel</button>
            <button id="discSaveBtn" style="
                padding:10px 24px; border:none; border-radius:12px;
                background:linear-gradient(135deg, #f59e0b, #d97706);
                font-weight:700; font-size:0.8rem; color:white; cursor:pointer;
                box-shadow:0 4px 12px rgba(245,158,11,0.3); opacity:0.5;
            " disabled>Save Reason <i class="bi bi-check-lg ms-1"></i></button>
        </div>
    </div>`;
    
    document.body.appendChild(backdrop);
    
    let selectedDiscrepancy = null;
    
    window.selectDiscrepancyOption = function(element, value) {
        document.querySelectorAll('.disc-option').forEach(el => {
            el.classList.remove('selected');
            el.style.borderColor = '#e2e8f0';
            el.style.background = 'white';
        });
        element.classList.add('selected');
        element.style.borderColor = '#f59e0b';
        element.style.background = '#fffdf7';
        selectedDiscrepancy = value;
        
        const saveBtn = document.getElementById('discSaveBtn');
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        
        const noteSection = document.getElementById('discrepancyNoteSection');
        const noteLabel = document.getElementById('discrepancyNoteLabel');
        const noteInput = document.getElementById('discrepancyNoteInput');
        
        if (value === 'incorrect_value') {
            noteSection.style.display = 'none';
        } else if (value === 'other') {
            noteSection.style.display = 'block';
            noteLabel.textContent = '📌 Please specify (Required)';
            noteLabel.style.color = '#ef4444';
            noteInput.placeholder = 'Please explain the reason for this discrepancy...';
        } else {
            noteSection.style.display = 'block';
            noteLabel.textContent = '📝 Additional Note (Optional)';
            noteLabel.style.color = '#64748b';
            noteInput.placeholder = 'Add any relevant details...';
        }
    };
    
    // Save button
    document.getElementById('discSaveBtn').addEventListener('click', () => {
        if (!selectedDiscrepancy) return;
        
        const note = document.getElementById('discrepancyNoteInput')?.value?.trim() || '';
        
        if (selectedDiscrepancy === 'other' && !note) {
            showToast('⚠️ Please explain the reason for selecting "Other"', 'warning');
            document.getElementById('discrepancyNoteInput')?.focus();
            return;
        }
        
        if (!reviewState.discrepancyTypes) reviewState.discrepancyTypes = {};
        reviewState.discrepancyTypes[field] = selectedDiscrepancy;
        
        if (note) {
            if (!reviewState.discrepancyNotes) reviewState.discrepancyNotes = {};
            reviewState.discrepancyNotes[field] = note;
        }
        
        backdrop.remove();
        
        if (selectedDiscrepancy === 'incorrect_value') {
            showCareCardValueModal(field, label, emrValue, correctionType, () => {
                if (typeof onSaveCallback === 'function') onSaveCallback();
            });
        } else {
            const reasonLabel = discrepancyOptions.find(o => o.value === selectedDiscrepancy)?.label.split(' ').slice(1).join(' ') || selectedDiscrepancy;
            showToast(`✅ Discrepancy documented: ${reasonLabel}`, 'success', 2500);
            // Fire the callback immediately — card re-renders with correction state
            if (typeof onSaveCallback === 'function') onSaveCallback();
        }
    });
    
    document.getElementById('discCancelBtn').addEventListener('click', () => {
        backdrop.remove();
        // No outcome is saved — user cancels out, card stays pending
    });
    
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.remove();
    });
}
// ============================================================================
// APPLY PREVIOUS BATCH SELECTIONS
// ============================================================================

function applyPreviousBatchSelections() {
    Object.keys(reviewState.batchResults).forEach(fieldKey => {
        const card = document.getElementById(`batchCard_${fieldKey}`);
        if (card) _rerenderBatchCard(fieldKey);
    });
}

// Global variable to store users list for admin
let availableUsers = [];

// Load users for admin dropdown
async function loadUsersForBatch() {
    try {
        const data = await MedAPI.users.list();
        if (data.success && data.users) {
            availableUsers = data.users.filter(u => u.is_active);
        }
    } catch(e) {
        console.error('Failed to load users:', e);
    }
}

// Show batch download dialog with user selection
async function showBatchDownloadDialog() {
    // Load users if not loaded
    if (availableUsers.length === 0) {
        await loadUsersForBatch();
    }
    
    // Get current user role
    const userStr = localStorage.getItem('meddqa_user');
    let isAdmin = false;
    let currentUsername = '';
    
    if (userStr) {
        try {
            const userData = JSON.parse(userStr);
            isAdmin = userData.role === 'admin';
            currentUsername = userData.full_name || userData.username;
        } catch(e) {}
    }
    
    // Create modal dialog
    document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop-custom';
    backdrop.style.display = 'flex';
    
    let userSelectHtml = '';
    if (isAdmin && availableUsers.length > 0) {
        userSelectHtml = `
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">
                    <i class="bi bi-people"></i> Select Assessor
                </label>
                <select id="batchUserSelect" style="
                    width: 100%;
                    padding: 12px 14px;
                    border: 2px solid #e2e8f0;
                    border-radius: 12px;
                    font-size: 0.85rem;
                    font-weight: 500;
                    color: #334155;
                    background: white;
                    cursor: pointer;
                ">
                    <option value="">-- All Users (All Assessors) --</option>
                    ${availableUsers.map(u => `<option value="${u.full_name || u.username}" ${(u.full_name || u.username) === currentUsername ? 'selected' : ''}>${u.full_name || u.username} (${u.role})</option>`).join('')}
                </select>
                <div style="font-size: 0.65rem; color: #94a3b8; margin-top: 4px;">
                    <i class="bi bi-info-circle"></i> Admin: Select a specific assessor or leave blank for all
                </div>
            </div>
        `;
    } else {
        userSelectHtml = `
            <div style="margin-bottom: 16px; background: #f1f5f9; padding: 10px 14px; border-radius: 12px;">
                <div style="font-size: 0.7rem; font-weight: 700; color: #64748b;">
                    <i class="bi bi-person-badge"></i> Current Assessor
                </div>
                <div style="font-size: 0.9rem; font-weight: 600; color: #1e293b;">${currentUsername}</div>
                <input type="hidden" id="batchUserSelect" value="${currentUsername}">
            </div>
        `;
    }
    
    backdrop.innerHTML = `
        <div onclick="event.stopPropagation()" style="
            background: white;
            border-radius: 20px;
            width: 90%;
            max-width: 450px;
            box-shadow: 0 25px 60px rgba(0,0,0,0.25);
            animation: slideUp 0.3s ease;
            overflow: hidden;
        ">
            <div style="
                background: linear-gradient(135deg, #4f46e5, #6366f1);
                padding: 20px 24px;
                color: white;
            ">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="
                        width: 40px; height: 40px;
                        background: rgba(255,255,255,0.2);
                        border-radius: 12px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.2rem;
                    ">
                        <i class="bi bi-file-earmark-pdf-fill"></i>
                    </div>
                    <div>
                        <h5 style="margin: 0; font-weight: 700;">Batch Report Download</h5>
                        <p style="margin: 2px 0 0; font-size: 0.75rem; opacity: 0.8;">Generate single PDF with all verified patients</p>
                    </div>
                </div>
            </div>
            
            <div style="padding: 20px 24px;">
                ${userSelectHtml}
                
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">
                        <i class="bi bi-calendar"></i> Start Date (Optional)
                    </label>
                    <input type="date" id="batchStartDate" style="
                        width: 100%;
                        padding: 12px 14px;
                        border: 2px solid #e2e8f0;
                        border-radius: 12px;
                        font-size: 0.85rem;
                    ">
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">
                        <i class="bi bi-calendar"></i> End Date (Optional)
                    </label>
                    <input type="date" id="batchEndDate" style="
                        width: 100%;
                        padding: 12px 14px;
                        border: 2px solid #e2e8f0;
                        border-radius: 12px;
                        font-size: 0.85rem;
                    ">
                </div>
                
                <div style="background: #eff6ff; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px;">
                    <div style="font-size: 0.7rem; color: #1e40af;">
                        <i class="bi bi-info-circle-fill me-1"></i>
                        This will generate a single PDF containing all verified patients for the selected assessor within the date range.
                    </div>
                </div>
            </div>
            
            <div style="padding: 16px 24px; border-top: 1px solid #f1f5f9; display: flex; gap: 10px; justify-content: flex-end; background: #fafbff;">
                <button id="batchCancelBtn" style="
                    padding: 10px 20px;
                    border: 2px solid #e2e8f0;
                    border-radius: 12px;
                    background: white;
                    font-weight: 600;
                    font-size: 0.8rem;
                    color: #64748b;
                    cursor: pointer;
                ">Cancel</button>
                <button id="batchGenerateBtn" style="
                    padding: 10px 24px;
                    border: none;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #4f46e5, #6366f1);
                    font-weight: 700;
                    font-size: 0.8rem;
                    color: white;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(79,70,229,0.3);
                "><i class="bi bi-download me-1"></i> Generate Report</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(backdrop);
    
    document.getElementById('batchCancelBtn').addEventListener('click', () => {
        backdrop.remove();
    });
    
    document.getElementById('batchGenerateBtn').addEventListener('click', async () => {
        const userSelect = document.getElementById('batchUserSelect');
        const selectedUser = userSelect ? userSelect.value : null;
        const startDate = document.getElementById('batchStartDate').value;
        const endDate = document.getElementById('batchEndDate').value;
        
        backdrop.remove();
        await downloadBatchReports(selectedUser, startDate, endDate);
    });
    
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.remove();
    });
}

// Updated download function
async function downloadBatchReports(username = null, startDate = null, endDate = null) {
    showLoading('Generating Batch Report...', 'Creating single PDF with all reports');
    try {
        await MedAPI.reports.downloadBatch(username, startDate, endDate);
        showToast('📄 Batch report downloaded as single PDF!', 'success', 5000);
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally { hideLoading(); }
}
// ============================================================================
// BATCH REFILL COMPARISON (Step 3)
// ============================================================================

// ============================================================================
// BATCH REFILL COMPARISON (Step 3) — Clinical Intelligence Edition
// ============================================================================

function renderBatchRefillComparison(refills) {
    let html = '';

    const total    = refills.length;
    const BATCH_KEYS = ['refill_dates','refill_durations','refill_regimens','refill_next_appts'];
    const answered = BATCH_KEYS.filter(k => reviewState.batchResults[k]).length;
    const ringPct  = Math.round(answered / BATCH_KEYS.length * 100);

    // Regimen changes (genuinely useful — not alarming)
    const uniqueRegimens = new Set(refills.map(r => r.regimen).filter(Boolean));

    // ── Header ──────────────────────────────────────────────────────────
    html += `
    <div style="background:linear-gradient(135deg,#1e2d8f,#3b4fd8);border-radius:14px;
                padding:16px 18px;margin-bottom:14px;color:#fff;position:relative;overflow:hidden;">
        <svg style="position:absolute;inset:0;width:100%;height:100%;opacity:.06;pointer-events:none;"
             xmlns="http://www.w3.org/2000/svg">
            <pattern id="rd" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.5" fill="white"/>
            </pattern>
            <rect width="100%" height="100%" fill="url(#rd)"/>
        </svg>
        <div style="position:relative;z-index:1;display:flex;align-items:center;
                    justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
                <div style="font-size:0.65rem;font-weight:700;opacity:.7;text-transform:uppercase;
                            letter-spacing:.06em;margin-bottom:3px;">
                    Step 3 — Drug Dispensing Review
                </div>
                <div style="font-size:1rem;font-weight:800;margin-bottom:6px;">
                    ${total} Refill Visit${total !== 1 ? 's' : ''} to Verify
                </div>
                <div style="font-size:0.72rem;opacity:.8;line-height:1.5;">
                    Compare each pickup date, duration, regimen, and next appointment 
                    against the physical Care Card.
                    ${uniqueRegimens.size > 1
                        ? `<span style="background:rgba(255,255,255,.15);padding:2px 8px;
                                        border-radius:50px;margin-left:6px;font-size:0.68rem;">
                               ${uniqueRegimens.size} regimens on record
                           </span>`
                        : ''}
                </div>
            </div>
            <!-- Progress ring -->
            <div style="flex-shrink:0;text-align:center;">
                <div style="position:relative;width:56px;height:56px;">
                    <svg viewBox="0 0 56 56" width="56" height="56">
                        <circle cx="28" cy="28" r="22" fill="none"
                                stroke="rgba(255,255,255,.2)" stroke-width="4"/>
                        <circle cx="28" cy="28" r="22" fill="none"
                                stroke="#34d399" stroke-width="4"
                                stroke-dasharray="${Math.round(ringPct * 1.382)} 138"
                                stroke-linecap="round"
                                transform="rotate(-90 28 28)"/>
                    </svg>
                    <span style="position:absolute;inset:0;display:flex;align-items:center;
                                 justify-content:center;font-size:0.75rem;font-weight:800;
                                 color:#fff;">${answered}/4</span>
                </div>
                <div style="font-size:0.58rem;opacity:.7;margin-top:2px;">reviewed</div>
            </div>
        </div>
    </div>`;

    // ── Quick-fill bar ──────────────────────────────────────────────────
    html += `
    <div style="background:#f8f9fe;border:1px solid #e1e6ef;border-radius:10px;
                padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;
                gap:10px;flex-wrap:wrap;">
        <span style="font-size:0.7rem;font-weight:700;color:#475569;flex-shrink:0;">Quick-fill:</span>
        <button onclick="_batchFillAll('refill','match')"
                style="padding:5px 12px;border-radius:50px;font-size:0.7rem;font-weight:600;
                       cursor:pointer;background:#f0fdf4;border:1.5px solid #86efac;
                       color:#059669;transition:all .15s;"
                onmouseover="this.style.background='#dcfce7'"
                onmouseout="this.style.background='#f0fdf4'">
            <i class="bi bi-check-all me-1"></i>All Match
        </button>
        <button onclick="_batchFillAll('refill','missing_cc')"
                style="padding:5px 12px;border-radius:50px;font-size:0.7rem;font-weight:600;
                       cursor:pointer;background:#fffbeb;border:1.5px solid #fde68a;
                       color:#d97706;transition:all .15s;"
                onmouseover="this.style.background='#fef3c7'"
                onmouseout="this.style.background='#fffbeb'">
            <i class="bi bi-file-earmark-x me-1"></i>All Missing on Card
        </button>
        <button onclick="_batchClearAll('refill')"
                style="padding:5px 12px;border-radius:50px;font-size:0.7rem;font-weight:600;
                       cursor:pointer;background:#fff;border:1.5px solid #e1e6ef;
                       color:#94a3b8;transition:all .15s;"
                onmouseover="this.style.borderColor='#cbd5e1'"
                onmouseout="this.style.borderColor='#e1e6ef'">
            <i class="bi bi-arrow-counterclockwise me-1"></i>Reset
        </button>
        <span style="font-size:0.65rem;color:#94a3b8;margin-left:auto;">${answered} of 4 reviewed</span>
    </div>`;

    // ── Cross-step consistency check (keep this — it's useful) ──────────
    const step2Results = reviewState.results.filter(r => r.step === 2);
    const step2Conflicts = [];
    const step2Pickup = step2Results.find(r => r.field === 'last_pickup_date');
    if (step2Pickup && !step2Pickup.match && step2Pickup.corrected_on) {
        const step3DatesResult = reviewState.batchResults['refill_dates'];
        if (step3DatesResult === 'match') {
            step2Conflicts.push({
                msg: `Step 2 marked <strong>Last Pickup Date</strong> as corrected — the full pickup history may also need review.`,
                severity: 'warn'
            });
        }
    }
    const step2Regimen = step2Results.find(r => r.field === 'current_regimen' || r.field === 'regimen');
    if (step2Regimen && !step2Regimen.match && step2Regimen.corrected_on) {
        const step3RegResult = reviewState.batchResults['refill_regimens'];
        if (step3RegResult === 'match') {
            step2Conflicts.push({
                msg: `Step 2 marked <strong>Regimen</strong> as corrected — verify all regimens in the batch also match the Care Card.`,
                severity: 'info'
            });
        }
    }
    if (step2Conflicts.length > 0) {
        html += `
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fde68a;
                    border-radius:10px;padding:12px 14px;margin-bottom:14px;">
            <div style="font-size:0.65rem;font-weight:700;color:#92400e;text-transform:uppercase;
                        letter-spacing:.05em;margin-bottom:6px;display:flex;align-items:center;gap:5px;">
                <i class="bi bi-exclamation-triangle-fill"></i> Cross-Step Notice
            </div>
            ${step2Conflicts.map(c => `
            <div style="font-size:0.72rem;color:#78350f;display:flex;align-items:flex-start;gap:6px;">
                <i class="bi bi-${c.severity === 'warn' ? 'exclamation-circle' : 'info-circle'} me-1"
                   style="flex-shrink:0;margin-top:1px;color:#d97706;"></i>
                <span>${c.msg}</span>
            </div>`).join('')}
        </div>`;
    }

    // ── Refill table — plain, no flags ───────────────────────────────────
    html += `
    <div style="background:#fff;border:1.5px solid #e1e6ef;border-radius:12px;
                overflow:hidden;margin-bottom:14px;">
        <div style="background:linear-gradient(135deg,#f8f9fe,#f1f3fc);padding:10px 14px;
                    font-weight:700;font-size:0.78rem;color:#3d4a5c;
                    border-bottom:1px solid #e1e6ef;
                    display:flex;align-items:center;justify-content:space-between;">
            <span>
                <i class="bi bi-calendar3 me-1" style="color:#3b4fd8;"></i>
                Refill Records — ${total} visit${total !== 1 ? 's' : ''}
            </span>
            <span style="font-size:0.65rem;font-weight:500;color:#94a3b8;">EMR data</span>
        </div>
        <div style="max-height:260px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.73rem;">
                <thead>
                    <tr style="background:#f8f9fe;position:sticky;top:0;z-index:1;">
                        <th style="padding:8px 10px;font-size:0.6rem;font-weight:700;
                                   color:#94a3b8;text-transform:uppercase;">#</th>
                        <th style="padding:8px 10px;font-size:0.6rem;font-weight:700;
                                   color:#94a3b8;text-transform:uppercase;">Pickup Date</th>
                        <th style="padding:8px 10px;font-size:0.6rem;font-weight:700;
                                   color:#94a3b8;text-transform:uppercase;">Duration</th>
                        <th style="padding:8px 10px;font-size:0.6rem;font-weight:700;
                                   color:#94a3b8;text-transform:uppercase;">Regimen</th>
                        <th style="padding:8px 10px;font-size:0.6rem;font-weight:700;
                                   color:#94a3b8;text-transform:uppercase;">Next Appt</th>
                    </tr>
                </thead>
                <tbody>
                    ${refills.map((r, i) => {
                        const missD = !r.date || r.date === '—';
                        const rowBg = i % 2 === 0 ? '#fff' : '#f8f9fe';
                        return `
                        <tr style="border-bottom:1px solid #f1f5f9;background:${rowBg};
                                   transition:background .1s;"
                            onmouseover="this.style.background='#f0f2fb'"
                            onmouseout="this.style.background='${rowBg}'">
                            <td style="padding:9px 10px;color:#94a3b8;font-weight:700;">${i + 1}</td>
                            <td style="padding:9px 10px;font-weight:600;
                                       color:${missD ? '#ef4444' : '#0d1117'};">
                                ${missD
                                    ? '<span style="display:inline-flex;align-items:center;gap:3px;">'
                                    + '<i class="bi bi-exclamation-triangle" style="font-size:.65rem;"></i>'
                                    + 'Missing</span>'
                                    : r.date}
                            </td>
                            <td style="padding:9px 10px;font-weight:600;color:#475569;">
                                ${missD
                                    ? '<span style="color:#e2e8f0;">—</span>'
                                    : (r.duration ? r.duration + 'd' : '—')}
                            </td>
                            <td style="padding:9px 10px;font-weight:600;color:#3b4fd8;
                                       max-width:120px;overflow:hidden;text-overflow:ellipsis;
                                       white-space:nowrap;"
                                title="${r.regimen || '—'}">${r.regimen || '—'}</td>
                            <td style="padding:9px 10px;color:#475569;">
                                ${missD
                                    ? '<span style="color:#e2e8f0;">—</span>'
                                    : (r.next_appt || '—')}
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    </div>`;

    // ── Summaries for batch questions ────────────────────────────────────
    const datesSummary     = refills.map(r => r.date || 'Missing').join(' · ');
    const durationsSummary = refills.map(r => r.duration || 'Missing').join(' · ');
    const regimensSummary  = refills.map(r => r.regimen || 'Missing').join(' · ');
    const nextApptsSummary = refills.map(r => r.next_appt || 'Missing').join(' · ');

    const missingDateCount = refills.filter(r => !r.date || r.date === '—').length;

    html += renderBatchQuestion('refill_dates', 'Pickup Dates', 'bi-calendar-event', '#3b4fd8',
        'Do all pickup dates on the Care Card match the EMR?',
        datesSummary,
        missingDateCount > 0
            ? `ℹ️ ${missingDateCount} date${missingDateCount > 1 ? 's' : ''} not recorded in EMR`
            : null,
        'refill');

    html += renderBatchQuestion('refill_durations', 'Refill Durations', 'bi-hourglass-split', '#7c3aed',
        'Do all dispense durations on the Care Card match the EMR?',
        durationsSummary,
        missingDateCount > 0
            ? `ℹ️ Visits with no pickup date will also have no duration on the Care Card`
            : null,
        'refill');

    html += renderBatchQuestion('refill_regimens', 'Regimens Dispensed', 'bi-capsule-fill', '#059669',
        'Do all regimens dispensed match between EMR and Care Card?',
        regimensSummary,
        uniqueRegimens.size > 1
            ? `ℹ️ ${uniqueRegimens.size} different regimens found — confirm each one matches the Care Card`
            : null,
        'refill');

    html += renderBatchQuestion('refill_next_appts', 'Next Appointment Dates', 'bi-calendar-check', '#d97706',
        'Do all next appointment dates on the Care Card match the EMR?',
        nextApptsSummary,
        missingDateCount > 0
            ? `ℹ️ Visits with no pickup date will also have no next appointment on the Care Card`
            : null,
        'refill');

    return html;
}
// ============================================================================
// BATCH VL COMPARISON (Step 4) — Clinical Intelligence Edition
// ============================================================================

function renderBatchVLComparison(viralLoads) {
    let html = '';
    const total = viralLoads.length;

    // ── Pre-analysis ─────────────────────────────────────────────────────────
    const missingSample  = viralLoads.filter(v => !v.sample_date||v.sample_date==='—').length;
    const missingResult  = viralLoads.filter(v => !v.result||v.result==='—').length;
    const missingResDate = viralLoads.filter(v => !v.result_date||v.result_date==='—').length;

    // Classify each VL result
    const classified = viralLoads.map(v => {
        const n = parseInt(String(v.result||'').replace(/[^0-9]/g,''));
        if (isNaN(n)||!v.result||v.result==='—') return {n:null,cat:'unknown',color:'#94a3b8'};
        if (n < 200)   return {n,cat:'suppressed',   color:'#059669'};
        if (n < 1000)  return {n,cat:'low_viremia',  color:'#d97706'};
        return {n,cat:'unsuppressed', color:'#dc2626'};
    });

    const suppressed   = classified.filter(c=>c.cat==='suppressed').length;
    const lowViremia   = classified.filter(c=>c.cat==='low_viremia').length;
    const unsuppressed = classified.filter(c=>c.cat==='unsuppressed').length;
    const suppRate     = total>0 ? Math.round(suppressed/total*100) : 0;

    // Trajectory analysis
    let trajectory = 'stable', trajIcon = 'bi-dash', trajColor = '#94a3b8', trajLabel = 'Stable';
    const validClassified = classified.filter(c=>c.n!==null);
    if (validClassified.length >= 2) {
        const first = validClassified[validClassified.length-1].n;
        const last  = validClassified[0].n;
        if (last < first * 0.5) { trajectory='improving'; trajIcon='bi-arrow-down-circle-fill'; trajColor='#059669'; trajLabel='Improving'; }
        else if (last > first * 2) { trajectory='declining'; trajIcon='bi-arrow-up-circle-fill'; trajColor='#dc2626'; trajLabel='Worsening'; }
        else { trajIcon='bi-dash-circle-fill'; trajLabel='Stable'; }
    }

    // Turnaround time analysis (sample_date → result_date)
    const turnarounds = viralLoads
        .filter(v=>v.sample_date&&v.result_date&&v.sample_date!=='—'&&v.result_date!=='—')
        .map(v=>Math.round((new Date(v.result_date)-new Date(v.sample_date))/(1000*86400)));
    const avgTAT = turnarounds.length ? Math.round(turnarounds.reduce((a,b)=>a+b,0)/turnarounds.length) : null;
    const longTAT = turnarounds.filter(t=>t>60).length;

    // Duplicate results check
    const resultCounts = {};
    viralLoads.forEach(v=>{ if(v.sample_date) resultCounts[v.sample_date]=(resultCounts[v.sample_date]||0)+1; });
    const duplicates = Object.values(resultCounts).filter(c=>c>1).length;

    // Progress
    const VL_KEYS = ['vl_sample_dates','vl_results','vl_result_dates'];
    const answered = VL_KEYS.filter(k=>reviewState.batchResults[k]).length;
    const ringPct  = Math.round(answered/VL_KEYS.length*100);

    // ── Header summary card ─────────────────────────────────────────────────
    html += `
    <div style="background:linear-gradient(135deg,#7f1d1d,#dc2626);border-radius:14px;
                padding:16px 18px;margin-bottom:14px;color:#fff;position:relative;overflow:hidden;">
        <svg style="position:absolute;inset:0;width:100%;height:100%;opacity:.06;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
            <pattern id="vd" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.5" fill="white"/>
            </pattern>
            <rect width="100%" height="100%" fill="url(#vd)"/>
        </svg>
        <div style="position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
                <div style="font-size:0.65rem;font-weight:700;opacity:.7;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">
                    Step 4 — Viral Load Review
                </div>
                <div style="font-size:1rem;font-weight:800;margin-bottom:8px;">${total} VL Test${total!==1?'s':''} to Verify</div>
                <!-- Suppression bar -->
                <div style="margin-bottom:8px;">
                    <div style="font-size:0.62rem;opacity:.75;margin-bottom:3px;">Suppression Rate — ${suppRate}%</div>
                    <div style="height:6px;background:rgba(255,255,255,.2);border-radius:3px;width:180px;max-width:100%;">
                        <div style="height:100%;width:${suppRate}%;border-radius:3px;
                                    background:${suppRate>=90?'#34d399':suppRate>=50?'#fbbf24':'#f87171'};
                                    transition:width .6s ease;"></div>
                    </div>
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:0.68rem;opacity:.85;">
                    ${suppressed>0?`<span style="background:rgba(52,211,153,.25);padding:2px 8px;border-radius:50px;">✓ ${suppressed} suppressed</span>`:''}
                    ${lowViremia>0?`<span style="background:rgba(251,191,36,.25);padding:2px 8px;border-radius:50px;">~ ${lowViremia} low viremia</span>`:''}
                    ${unsuppressed>0?`<span style="background:rgba(248,113,113,.25);padding:2px 8px;border-radius:50px;">✗ ${unsuppressed} unsuppressed</span>`:''}
                    <span style="background:rgba(255,255,255,.15);padding:2px 8px;border-radius:50px;">
                        <i class="bi ${trajIcon} me-1"></i>${trajLabel} trend
                    </span>
                    ${avgTAT!==null?`<span style="background:rgba(255,255,255,.12);padding:2px 8px;border-radius:50px;">⏱ Avg TAT: ${avgTAT}d</span>`:''}
                    ${longTAT>0?`<span style="background:rgba(245,158,11,.25);padding:2px 8px;border-radius:50px;">⚠ ${longTAT} slow result${longTAT>1?'s':''} (&gt;60d)</span>`:''}
                    ${duplicates>0?`<span style="background:rgba(239,68,68,.3);padding:2px 8px;border-radius:50px;">⚠ ${duplicates} duplicate date${duplicates>1?'s':''}</span>`:''}
                </div>
            </div>
            <div style="flex-shrink:0;text-align:center;">
                <div style="position:relative;width:56px;height:56px;">
                    <svg viewBox="0 0 56 56" width="56" height="56">
                        <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="4"/>
                        <circle cx="28" cy="28" r="22" fill="none" stroke="#34d399" stroke-width="4"
                                stroke-dasharray="${Math.round(ringPct*1.382)} 138" stroke-linecap="round"
                                transform="rotate(-90 28 28)"/>
                    </svg>
                    <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                                 font-size:0.75rem;font-weight:800;color:#fff;">${answered}/3</span>
                </div>
                <div style="font-size:0.58rem;opacity:.7;margin-top:2px;">reviewed</div>
            </div>
        </div>
    </div>`;

    // ── Quick-fill bar ───────────────────────────────────────────────────────
    html += `
    <div style="background:#f8f9fe;border:1px solid #e1e6ef;border-radius:10px;
                padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:0.7rem;font-weight:700;color:#475569;flex-shrink:0;">Quick-fill:</span>
        <button onclick="_batchFillAll('vl','match')"
                style="padding:5px 12px;border-radius:50px;font-size:0.7rem;font-weight:600;cursor:pointer;
                       background:#f0fdf4;border:1.5px solid #86efac;color:#059669;"
                onmouseover="this.style.background='#dcfce7'" onmouseout="this.style.background='#f0fdf4'">
            <i class="bi bi-check-all me-1"></i>All Match
        </button>
        <button onclick="_batchFillAll('vl','missing_cc')"
                style="padding:5px 12px;border-radius:50px;font-size:0.7rem;font-weight:600;cursor:pointer;
                       background:#fef2f2;border:1.5px solid #fecaca;color:#dc2626;"
                onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'">
            <i class="bi bi-file-earmark-x me-1"></i>All Missing on Card
        </button>
        <button onclick="_batchClearAll('vl')"
                style="padding:5px 12px;border-radius:50px;font-size:0.7rem;font-weight:600;cursor:pointer;
                       background:#fff;border:1.5px solid #e1e6ef;color:#94a3b8;"
                onmouseover="this.style.borderColor='#cbd5e1'" onmouseout="this.style.borderColor='#e1e6ef'">
            <i class="bi bi-arrow-counterclockwise me-1"></i>Reset
        </button>
        <span style="font-size:0.65rem;color:#94a3b8;margin-left:auto;">${answered} of 3 reviewed</span>
    </div>`;

    // ── VL Trend sparkline ───────────────────────────────────────────────────
    if (validClassified.length > 0) {
        const maxN = Math.max(...validClassified.map(c=>c.n));
        const logMax = Math.log10(maxN||1);
        html += `
        <div style="background:#fff;border:1.5px solid #e1e6ef;border-radius:12px;
                    padding:14px 16px;margin-bottom:14px;">
            <div style="font-size:0.65rem;font-weight:700;color:#475569;text-transform:uppercase;
                        letter-spacing:.06em;margin-bottom:10px;">
                <i class="bi bi-activity me-1" style="color:#dc2626;"></i>VL Trend (log scale)
                <span style="margin-left:8px;font-weight:500;color:${trajColor};">
                    <i class="bi ${trajIcon} me-1"></i>${trajLabel}
                </span>
            </div>
            <div style="display:flex;align-items:flex-end;gap:6px;height:72px;">
                ${[...viralLoads].reverse().map((v,i) => {
                    const c = [...classified].reverse()[i];
                    const ht = c.n ? Math.max(6, (Math.log10(c.n)/logMax)*68) : 4;
                    const ds = v.sample_date ? v.sample_date.substring(5) : '?';
                    return `
                    <div style="flex:1;display:flex;flex-direction:column;align-items:center;
                                justify-content:flex-end;height:100%;">
                        <div style="font-size:0.48rem;color:${c.color};font-weight:700;
                                    margin-bottom:3px;text-align:center;line-height:1.1;">
                            ${c.n===null?'?':c.n<1000?c.n:(c.n/1000).toFixed(0)+'k'}
                        </div>
                        <div style="width:100%;max-width:26px;height:${ht}px;background:${c.color};
                                    border-radius:4px 4px 2px 2px;cursor:pointer;transition:opacity .15s;"
                             title="${ds}: ${v.result||'N/A'}"
                             onmouseover="this.style.opacity='.7'" onmouseout="this.style.opacity='1'">
                        </div>
                        <div style="font-size:0.46rem;color:#94a3b8;margin-top:3px;
                                    writing-mode:vertical-rl;">${ds}</div>
                    </div>`;
                }).join('')}
            </div>
            <!-- 1000 threshold line annotation -->
            <div style="display:flex;align-items:center;gap:6px;margin-top:8px;
                        font-size:0.6rem;color:#64748b;flex-wrap:wrap;">
                <span style="display:flex;align-items:center;gap:3px;"><span style="width:8px;height:8px;border-radius:2px;background:#059669;"></span>Suppressed &lt;200</span>
                <span style="display:flex;align-items:center;gap:3px;"><span style="width:8px;height:8px;border-radius:2px;background:#d97706;"></span>Low 200–999</span>
                <span style="display:flex;align-items:center;gap:3px;"><span style="width:8px;height:8px;border-radius:2px;background:#dc2626;"></span>Unsuppressed ≥1000</span>
                ${avgTAT!==null?`<span style="margin-left:auto;color:#94a3b8;">Avg turnaround: ${avgTAT} days</span>`:''}
            </div>
        </div>`;
    }

    // ── VL table with clinical flags ─────────────────────────────────────────
    html += `
    <div style="background:#fff;border:1.5px solid #e1e6ef;border-radius:12px;
                overflow:hidden;margin-bottom:14px;">
        <div style="background:linear-gradient(135deg,#fff1f2,#fff8f8);padding:10px 14px;
                    font-weight:700;font-size:0.78rem;color:#be123c;border-bottom:1px solid #fecaca;
                    display:flex;align-items:center;justify-content:space-between;">
            <span><i class="bi bi-droplet-fill me-1" style="color:#ef4444;"></i>VL Records — ${total} test${total!==1?'s':''}</span>
            <span style="font-size:0.65rem;font-weight:500;color:#94a3b8;">EMR data shown below</span>
        </div>
        <div style="max-height:220px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.73rem;">
                <thead>
                    <tr style="background:#fff8f8;position:sticky;top:0;z-index:1;">
                        <th style="padding:8px 10px;font-size:0.6rem;font-weight:700;color:#94a3b8;text-transform:uppercase;">#</th>
                        <th style="padding:8px 10px;font-size:0.6rem;font-weight:700;color:#94a3b8;text-transform:uppercase;">Sample Date</th>
                        <th style="padding:8px 10px;font-size:0.6rem;font-weight:700;color:#94a3b8;text-transform:uppercase;">Result</th>
                        <th style="padding:8px 10px;font-size:0.6rem;font-weight:700;color:#94a3b8;text-transform:uppercase;">Class.</th>
                        <th style="padding:8px 10px;font-size:0.6rem;font-weight:700;color:#94a3b8;text-transform:uppercase;">Result Date</th>
                        <th style="padding:8px 10px;font-size:0.6rem;font-weight:700;color:#94a3b8;text-transform:uppercase;">TAT</th>
                        <th style="padding:8px 10px;text-align:center;font-size:0.6rem;font-weight:700;color:#94a3b8;text-transform:uppercase;">Flag</th>
                    </tr>
                </thead>
                <tbody>
                    ${viralLoads.map((v,i) => {
                        const cls       = classified[i];
                        const missS     = !v.sample_date||v.sample_date==='—';
                        const missR     = !v.result||v.result==='—';
                        const missRD    = !v.result_date||v.result_date==='—';
                        const tat       = (!missS&&!missRD) ? Math.round((new Date(v.result_date)-new Date(v.sample_date))/(1000*86400)) : null;
                        const longTATRow= tat!==null&&tat>60;
                        const isDup     = resultCounts[v.sample_date]>1;
                        const rowBg     = i%2===0?'#fff':'#fff8f8';

                        const clsLabels = {suppressed:'Suppressed',low_viremia:'Low',unsuppressed:'High',unknown:'—'};
                        let flag='✓ OK', flagC='#059669';
                        if (missS)        { flag='Missing date'; flagC='#ef4444'; }
                        else if (isDup)   { flag='Duplicate'; flagC='#dc2626'; }
                        else if (longTATRow){ flag=`Slow TAT (${tat}d)`; flagC='#d97706'; }
                        else if (missR)   { flag='No result'; flagC='#d97706'; }
                        else if (missRD)  { flag='No result date'; flagC='#d97706'; }
                        else if (cls.cat==='unsuppressed') { flag='Unsuppressed'; flagC='#dc2626'; }
                        else if (cls.cat==='low_viremia')  { flag='Low viremia'; flagC='#d97706'; }

                        return `
                        <tr style="border-bottom:1px solid #fef2f2;background:${rowBg};transition:background .1s;"
                            onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='${rowBg}'">
                            <td style="padding:9px 10px;color:#94a3b8;font-weight:700;">${i+1}</td>
                            <td style="padding:9px 10px;font-weight:600;color:${missS?'#ef4444':'#0d1117'};">
                                ${missS?'<span style="display:inline-flex;align-items:center;gap:3px;"><i class="bi bi-exclamation-triangle" style="font-size:.65rem;"></i>Missing</span>':v.sample_date}
                                ${isDup?'<span title="Duplicate date" style="font-size:.55rem;color:#dc2626;font-weight:700;margin-left:3px;">DUP</span>':''}
                            </td>
                            <td style="padding:9px 10px;font-weight:800;font-size:0.88rem;color:${cls.color};">
                                ${missS?'<span style="color:#e2e8f0;">—</span>':(missR?'<span style="color:#f59e0b;">?</span>':v.result)}
                            </td>
                            <td style="padding:9px 10px;">
                                ${cls.cat==='unknown'?'<span style="color:#e2e8f0;">—</span>'
                                    :`<span style="background:${cls.color}18;color:${cls.color};border:1px solid ${cls.color}40;
                                                   font-size:0.62rem;font-weight:700;padding:1px 7px;border-radius:50px;">
                                         ${clsLabels[cls.cat]}
                                     </span>`}
                            </td>
                            <td style="padding:9px 10px;color:#475569;font-size:0.75rem;">
                                ${missS?'<span style="color:#e2e8f0;">—</span>':(missRD?'<span style="color:#f59e0b;">?</span>':v.result_date)}
                            </td>
                            <td style="padding:9px 10px;text-align:center;">
                                ${tat===null?'<span style="color:#e2e8f0;">—</span>'
                                    :`<span style="font-size:0.68rem;font-weight:600;
                                                   color:${longTATRow?'#d97706':'#475569'};">
                                         ${tat}d
                                     </span>`}
                            </td>
                            <td style="padding:9px 10px;text-align:center;">
                                <span style="font-size:0.6rem;font-weight:700;padding:2px 7px;
                                             border-radius:50px;white-space:nowrap;
                                             background:${flagC}18;color:${flagC};border:1px solid ${flagC}40;">
                                    ${flag}
                                </span>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
        ${longTAT>0||duplicates>0 ? `
        <div style="padding:8px 14px;background:#fffbeb;border-top:1px solid #fde68a;
                    font-size:0.68rem;color:#92400e;display:flex;align-items:center;gap:6px;">
            <i class="bi bi-lightning-fill"></i>
            <strong>Automatic findings:</strong>
            ${longTAT>0?`${longTAT} result${longTAT>1?'s':''} took over 60 days to return (delayed turnaround). `:''}
            ${duplicates>0?`${duplicates} duplicate sample date${duplicates>1?'s':''} detected.`:''}
        </div>` : ''}
    </div>`;

    // ── Summaries ───────────────────────────────────────────────────────────
    const samplesSummary     = viralLoads.map(v=>v.sample_date||'Missing').join(' · ');
    const resultsSummary     = viralLoads.map((v,i)=>`${v.result||'Missing'} (${['S','L','U','?'][['suppressed','low_viremia','unsuppressed','unknown'].indexOf(classified[i].cat)]||'?'})`).join(' · ');
    const resultDatesSummary = viralLoads.map(v=>v.result_date||'Missing').join(' · ');

    html += renderBatchQuestion('vl_sample_dates','VL Sample Dates','bi-calendar-event','#dc2626',
        'Do all sample collection dates on the Care Card match the EMR?',
        samplesSummary,
        missingSample>0
            ? `⚠️ ${missingSample} sample date${missingSample>1?'s':''} missing — results and result dates for those tests cascade as missing`
            : duplicates>0 ? `⚠️ ${duplicates} duplicate sample date${duplicates>1?'s':''} found — verify against physical record` : null,
        'vl');

    html += renderBatchQuestion('vl_results','Viral Load Results','bi-activity','#be123c',
        'Do all viral load results on the Care Card match the EMR?',
        resultsSummary,
        missingSample>0
            ? `ℹ️ If sample date is missing, result will also be missing on the Care Card`
            : missingResult>0 ? `⚠️ ${missingResult} result${missingResult>1?'s':''} not yet in EMR (may still be pending)` : null,
        'vl');

    html += renderBatchQuestion('vl_result_dates','VL Result Dates','bi-calendar-check','#9f1239',
        'Do all result report dates on the Care Card match the EMR?',
        resultDatesSummary,
        longTAT>0
            ? `ℹ️ ${longTAT} result${longTAT>1?'s':''} had turnaround over 60 days — may not have been documented on Care Card in time`
            : missingResDate>0 ? `⚠️ ${missingResDate} result date${missingResDate>1?'s':''} missing in EMR` : null,
        'vl');

    return html;

}



// ============================================================================
// BATCH QUESTION CARD
// ============================================================================

function renderBatchQuestion(fieldKey, title, icon, iconColor, question, emrSummary, hint, batchType) {
    const existing = reviewState.batchResults[fieldKey] || '';
    const discType = reviewState.discrepancyTypes?.[fieldKey];
    const discNote = reviewState.discrepancyNotes?.[fieldKey];

    // Theme by outcome
    const isMatch   = existing === 'match';
    const isCorr    = existing.startsWith('corrected');
    const isMissing = existing === 'missing_cc'   || existing === 'missing_emr'
                   || existing === 'not_documented'|| existing === 'unable_verify';
    const isPend    = !existing;

    const borderColor = isMatch ? '#86efac' : isCorr ? '#a5b4fc' : isMissing ? '#fde68a' : '#e1e6ef';
    const cardBg      = isMatch ? '#f9fdfb' : isCorr ? '#eef0fd' : isMissing ? '#fffbeb' : '#ffffff';
    const accentColor = isMatch ? '#059669' : isCorr ? '#3b4fd8' : isMissing ? '#d97706' : '#e1e6ef';

    const pillText  = isMatch ? '✓ Matched' : isCorr ? '✎ Corrected' : isMissing ? '⚠ Missing/Issue' : '○ Pending';
    const pillStyle = isMatch ? 'color:#059669;background:#f0fdf4;border:1px solid #86efac;'
                   : isCorr  ? 'color:#3b4fd8;background:#eef0fd;border:1px solid #a5b4fc;'
                   : isMissing? 'color:#d97706;background:#fffbeb;border:1px solid #fde68a;'
                   : 'color:#94a3b8;background:#f1f5f9;';

    // Discrepancy summary badge
    let discBadge = '';
    if (discType && existing && existing !== 'match') {
        const dtL = {incorrect_value:'Incorrect Value',missing_emr:'Missing in EMR',
                     missing_carecard:'Missing on Care Card',not_documented:'Not Documented',
                     unable_verify:'Unable to Verify',lab_pending:'Lab Pending',
                     incomplete_records:'Incomplete Records',unavailable:'Info Unavailable',other:'Other'};
        discBadge = `
        <div style="margin-top:8px;padding:6px 10px;border-radius:7px;background:#eef0fd;
                    border:1px solid #a5b4fc;font-size:0.66rem;color:#3b4fd8;
                    display:flex;align-items:center;gap:5px;">
            <i class="bi bi-flag-fill"></i>
            <strong>Reason:</strong> ${dtL[discType]||discType}
            ${discNote ? `<span style="color:#64748b;">— ${discNote.substring(0,50)}</span>` : ''}
        </div>`;
    }

    // Outcome buttons — 2×3 grid covering all scenarios
    const outcomes = [
        { val:'match',             icon:'bi-check-circle-fill', label:'All Match',    color:'#059669', bg:'#f0fdf4', border:'#86efac',
          desc:'Every entry matches EMR exactly' },
        { val:'corrected_emr',     icon:'bi-pencil-fill',       label:'Fixed EMR',    color:'#3b4fd8', bg:'#eef0fd', border:'#a5b4fc',
          desc:'EMR was wrong, corrected to match Care Card' },
        { val:'corrected_carecard',icon:'bi-card-text',         label:'Card Error',   color:'#b45309', bg:'#fffbeb', border:'#fde68a',
          desc:'Care Card was wrong, EMR is correct' },
        { val:'corrected_both',    icon:'bi-arrow-left-right',  label:'Both Fixed',   color:'#be185d', bg:'#fdf2f8', border:'#fbcfe8',
          desc:'Both sources had errors' },
        { val:'missing_cc',        icon:'bi-file-earmark-x',    label:'Missing on Card', color:'#d97706', bg:'#fffbeb', border:'#fde68a',
          desc:'Not recorded on the physical Care Card' },
        { val:'missing_emr',       icon:'bi-database-x',        label:'Missing in EMR',  color:'#dc2626', bg:'#fef2f2', border:'#fecaca',
          desc:'Not recorded in the electronic system' },
    ];

    const btnHtml = outcomes.map(opt => {
        const active = existing === opt.val;
        return `<button
            class="batch-outcome-btn"
            data-field="${fieldKey}"
            data-value="${opt.val}"
            onclick="onBatchOutcomeClick('${fieldKey}','${opt.val}','${batchType||'refill'}')"
            title="${opt.desc}"
            style="padding:7px 5px;border-radius:8px;cursor:pointer;font-size:0.67rem;
                   font-weight:${active?'700':'500'};text-align:center;
                   border:2px solid ${active?opt.border:'#e1e6ef'};
                   background:${active?opt.bg:'white'};
                   color:${active?opt.color:'#94a3b8'};
                   display:flex;flex-direction:column;align-items:center;gap:3px;
                   transition:all .15s ease;"
            onmouseover="if('${existing}'!=='${opt.val}'){this.style.borderColor='${opt.border}';this.style.background='${opt.bg}';this.style.color='${opt.color}';}"
            onmouseout="if('${existing}'!=='${opt.val}'){this.style.borderColor='#e1e6ef';this.style.background='white';this.style.color='#94a3b8';}">
            <i class="bi ${opt.icon}" style="font-size:.88rem;"></i>
            <span style="line-height:1.2;">${opt.label}</span>
        </button>`;
    }).join('');

    return `
    <div class="batch-question-card" id="batchCard_${fieldKey}"
         style="background:${cardBg};border:2px solid ${borderColor};border-radius:14px;
                overflow:hidden;margin-bottom:10px;transition:border-color .2s,box-shadow .2s;"
         onmouseover="this.style.boxShadow='0 4px 14px rgba(0,0,0,.07)'"
         onmouseout="this.style.boxShadow='none'">
        <div style="display:flex;align-items:stretch;">
            <div style="width:4px;flex-shrink:0;background:${accentColor};border-radius:14px 0 0 14px;"></div>
            <div style="flex:1;padding:14px 16px;">

                <!-- Header row -->
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                    <div style="display:flex;align-items:center;gap:7px;">
                        <div style="width:26px;height:26px;border-radius:7px;
                                    background:${iconColor}18;color:${iconColor};
                                    display:flex;align-items:center;justify-content:center;font-size:.78rem;">
                            <i class="bi ${icon}"></i>
                        </div>
                        <span style="font-weight:700;font-size:0.82rem;color:#0d1117;" class="batch-title">${title}</span>
                    </div>
                    <span style="font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;${pillStyle}">${pillText}</span>
                </div>

                <!-- Question -->
                <div style="font-size:0.72rem;color:#64748b;margin-bottom:8px;">${question}</div>

                <!-- EMR summary -->
                <div class="emr-summary"
                     style="background:#f8f9fe;border:1px solid #e1e6ef;border-radius:8px;
                            padding:8px 12px;font-size:0.68rem;color:#475569;margin-bottom:8px;
                            max-height:50px;overflow-y:auto;font-family:monospace;line-height:1.5;">
                    <strong style="color:#94a3b8;">EMR:</strong> ${emrSummary}
                </div>

                <!-- Hint / cascade warning -->
                ${hint ? `
                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:7px;
                            padding:7px 10px;font-size:0.68rem;color:#92400e;margin-bottom:8px;
                            display:flex;align-items:flex-start;gap:6px;">
                    <i class="bi bi-lightning-fill" style="flex-shrink:0;margin-top:1px;"></i>
                    <span>${hint}</span>
                </div>` : ''}

                <!-- Outcome buttons — 3 columns × 2 rows -->
                <div style="background:#f8f9fe;border:1px solid #e1e6ef;border-radius:10px;padding:10px;">
                    <div style="font-size:0.6rem;font-weight:700;color:#64748b;text-transform:uppercase;
                                letter-spacing:.05em;margin-bottom:7px;">
                        <i class="bi bi-clipboard-check me-1"></i>What did you find?
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;">
                        ${btnHtml}
                    </div>
                </div>

                <!-- Discrepancy badge (shown after reason saved) -->
                ${discBadge}

            </div>
        </div>
    </div>`;
}



function onBatchOutcomeClick(fieldKey, value, batchType) {
    const card = document.getElementById(`batchCard_${fieldKey}`);
    if (!card) return;

    // ── Feature 3: VL clinical significance check before saving ──────────────
    if (batchType === 'vl' && fieldKey === 'vl_results' && value !== 'match') {
        const step = reviewState.workflow?.steps?.find(s => s.viral_loads);
        const vls  = step?.viral_loads || [];
        const significantCrossings = vls.filter(v => {
            const n = parseInt(String(v.result||'').replace(/[^0-9]/g,''));
            if (isNaN(n)) return false;
            // Was previously stored differently? Flag if result crosses 200 or 1000
            return n === 200 || n === 1000 || (n > 195 && n < 205) || (n > 995 && n < 1005);
        });
        // More importantly: detect if any result is crossing suppression threshold
        const unsuppressed = vls.filter(v => {
            const n = parseInt(String(v.result||'').replace(/[^0-9]/g,''));
            return !isNaN(n) && n >= 1000;
        });
        if (unsuppressed.length > 0 && (value === 'corrected_emr' || value === 'corrected_both')) {
            const proceed = confirm(
                `⚠️ Clinical Significance Warning\n\n` +
                `${unsuppressed.length} viral load result${unsuppressed.length>1?'s':''} ` +
                `show UNSUPPRESSED values (≥1000 copies/mL).\n\n` +
                `Correcting VL results at this level may have clinical implications ` +
                `for patient management.\n\nProceed with correction?`
            );
            if (!proceed) return;
        }
    }

    // Save to reviewState
    reviewState.batchResults[fieldKey] = value;

    // ── "match" — clear any stored discrepancy, re-render, check cascade ─────
    if (value === 'match') {
        if (reviewState.discrepancyTypes)  delete reviewState.discrepancyTypes[fieldKey];
        if (reviewState.discrepancyNotes)  delete reviewState.discrepancyNotes[fieldKey];
        if (reviewState.careCardValues)    delete reviewState.careCardValues[fieldKey];
        if (reviewState.affectedVisits)    delete reviewState.affectedVisits[fieldKey];
        _rerenderBatchCard(fieldKey);
        // Feature 1: If dates matched, suggest same for dependent fields
        _checkCascadeSuggestion(fieldKey, 'match');
        return;
    }

    // ── Feature 5: "missing_cc" / "missing_emr" → lightweight visit modal ────
    if (value === 'missing_cc' || value === 'missing_emr') {
        showMissingVisitModal(fieldKey, value, batchType, () => {
            _rerenderBatchCard(fieldKey);
            // Feature 1: cascade missing suggestion to dependent fields
            _checkCascadeSuggestion(fieldKey, value);
        });
        return;
    }

    // ── Correction outcomes → discrepancy modal ───────────────────────────────
    const title    = card.querySelector('.batch-title')?.textContent?.trim() || fieldKey;
    const emrSumEl = card.querySelector('.emr-summary');
    const emrSummary = emrSumEl?.textContent?.replace('EMR:','').trim() || '';

    showBatchDiscrepancyTypeModal(fieldKey, title, emrSummary, value, batchType, () => {
        _rerenderBatchCard(fieldKey);
        _checkCascadeSuggestion(fieldKey, value);
    });
}

// ── Feature 1: Cascade auto-suggestion ───────────────────────────────────────
const CASCADE_MAP = {
    refill_dates: ['refill_durations', 'refill_next_appts'],
    vl_sample_dates: ['vl_results', 'vl_result_dates'],
};

function _checkCascadeSuggestion(triggerKey, value) {
    const dependents = CASCADE_MAP[triggerKey];
    if (!dependents || !dependents.length) return;

    // Only cascade when dates are missing_cc/missing_emr or match
    if (value !== 'missing_cc' && value !== 'missing_emr' && value !== 'match') return;

    // Check which dependents are still pending
    const pending = dependents.filter(k => !reviewState.batchResults[k]);
    if (!pending.length) return;

    // Show a cascade banner above the first pending card
    const firstCard = document.getElementById(`batchCard_${pending[0]}`);
    if (!firstCard) return;

    // Remove any existing cascade banner
    document.querySelectorAll('.cascade-banner').forEach(el => el.remove());

    const label = value === 'match'
        ? `Since <strong>Pickup Dates</strong> all matched, dependent fields are likely to match too`
        : `Since <strong>Pickup Dates</strong> are missing, dependent fields should also be <strong>Missing on Card</strong>`;

    const banner = document.createElement('div');
    banner.className = 'cascade-banner';
    banner.style.cssText = `
        background:${value==='match'?'linear-gradient(135deg,#ecfdf5,#d1fae5)':'linear-gradient(135deg,#fffbeb,#fef3c7)'};
        border:1.5px solid ${value==='match'?'#86efac':'#fde68a'};
        border-radius:10px;padding:10px 14px;margin-bottom:8px;
        font-size:0.72rem;color:${value==='match'?'#065f46':'#92400e'};
        display:flex;align-items:center;gap:10px;flex-wrap:wrap;
        animation:fadeInUp .25s ease both;
    `;
    banner.innerHTML = `
        <i class="bi bi-lightning-fill" style="flex-shrink:0;"></i>
        <span style="flex:1;">${label}.</span>
        <button onclick="_applyCascade('${JSON.stringify(pending).replace(/"/g,"'")}','${value}')"
                style="flex-shrink:0;padding:5px 12px;border-radius:50px;font-size:0.68rem;font-weight:700;
                       cursor:pointer;border:none;
                       background:${value==='match'?'#059669':'#d97706'};color:#fff;">
            <i class="bi bi-check-all me-1"></i>Apply to ${pending.length} field${pending.length>1?'s':''}
        </button>
        <button onclick="this.closest('.cascade-banner').remove()"
                style="flex-shrink:0;width:24px;height:24px;border-radius:50%;border:1px solid currentColor;
                       background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;
                       color:${value==='match'?'#059669':'#d97706'};font-size:.7rem;">
            <i class="bi bi-x"></i>
        </button>
    `;
    firstCard.parentNode.insertBefore(banner, firstCard);
}

function _applyCascade(pendingJSON, value) {
    document.querySelectorAll('.cascade-banner').forEach(el => el.remove());
    const pending = JSON.parse(pendingJSON.replace(/'/g,'"'));
    const batchType = pending[0]?.startsWith('vl_') ? 'vl' : 'refill';
    pending.forEach(k => {
        if (value === 'match') {
            reviewState.batchResults[k] = 'match';
            if (reviewState.discrepancyTypes) delete reviewState.discrepancyTypes[k];
            _rerenderBatchCard(k);
        } else {
            // For missing — run through the lightweight modal for each
            reviewState.batchResults[k] = value;
            if (!reviewState.discrepancyTypes) reviewState.discrepancyTypes = {};
            reviewState.discrepancyTypes[k] = value === 'missing_cc' ? 'missing_carecard' : 'missing_emr';
            _rerenderBatchCard(k);
        }
    });
    showToast(`✅ Applied to ${pending.length} dependent field${pending.length>1?'s':''}`, 'success', 2000);
}

// ── Feature 5: Lightweight missing modal ─────────────────────────────────────
function showMissingVisitModal(fieldKey, value, batchType, onSaveCallback) {
    document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());

    // Gather visits from workflow
    const allSteps = reviewState.workflow?.steps || [];
    const refillStep = allSteps.find(s => s.refills?.length);
    const vlStep     = allSteps.find(s => s.viral_loads?.length);
    const isVL = batchType === 'vl' || fieldKey.startsWith('vl_');
    const items = isVL
        ? (vlStep?.viral_loads || []).map((v,i) => ({ id:i, label: v.sample_date || `Test ${i+1}`, sub: v.result || '—' }))
        : (refillStep?.refills  || []).map((r,i) => ({ id:i, label: r.date       || `Visit ${i+1}`, sub: r.regimen  || '—' }));

    const isMissingCC  = value === 'missing_cc';
    const accent       = isMissingCC ? '#d97706' : '#dc2626';
    const accentLight  = isMissingCC ? '#fffbeb' : '#fef2f2';
    const accentBorder = isMissingCC ? '#fde68a' : '#fecaca';
    const fieldLabels  = {
        refill_dates:'Pickup Dates', refill_durations:'Refill Durations',
        refill_regimens:'Regimens',  refill_next_appts:'Next Appointment Dates',
        vl_sample_dates:'VL Sample Dates', vl_results:'VL Results', vl_result_dates:'VL Result Dates'
    };
    const fieldLabel = fieldLabels[fieldKey] || fieldKey;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop-custom';
    backdrop.style.display = 'flex';
    backdrop.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;
         width:90%;max-width:460px;max-height:88vh;overflow-y:auto;
         box-shadow:0 25px 60px rgba(0,0,0,.25);animation:slideUp .3s cubic-bezier(.34,1.56,.64,1);">

        <!-- Header -->
        <div style="background:${accentLight};border-bottom:2px solid ${accentBorder};
                    padding:20px 22px;border-radius:20px 20px 0 0;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
                <div style="width:36px;height:36px;border-radius:50%;
                            background:${accent};color:#fff;display:flex;
                            align-items:center;justify-content:center;font-size:.95rem;
                            flex-shrink:0;">
                    <i class="bi bi-${isMissingCC?'file-earmark-x':'database-x'}"></i>
                </div>
                <div>
                    <div style="font-weight:800;font-size:0.9rem;color:${accent};">
                        ${isMissingCC ? 'Missing on Care Card' : 'Missing in EMR'}
                    </div>
                    <div style="font-size:0.7rem;color:#64748b;margin-top:1px;">
                        ${fieldLabel}
                    </div>
                </div>
            </div>
            <p style="font-size:0.72rem;color:#475569;margin:8px 0 0;line-height:1.5;">
                ${isMissingCC
                    ? `Select which visits/tests are <strong>not recorded on the physical Care Card</strong>, then confirm.`
                    : `Select which visits/tests are <strong>not recorded in the EMR</strong>, then confirm.`}
            </p>
        </div>

        <!-- Visit/test selector -->
        <div style="padding:16px 22px;">

            ${items.length > 0 ? `
            <!-- Quick select -->
            <div style="display:flex;gap:6px;margin-bottom:10px;">
                <button onclick="document.querySelectorAll('.missing-visit-cb').forEach(cb=>cb.checked=true)"
                        style="padding:4px 10px;border-radius:50px;font-size:0.68rem;font-weight:600;
                               border:1px solid ${accentBorder};background:${accentLight};
                               color:${accent};cursor:pointer;">Select All</button>
                <button onclick="document.querySelectorAll('.missing-visit-cb').forEach(cb=>cb.checked=false)"
                        style="padding:4px 10px;border-radius:50px;font-size:0.68rem;font-weight:600;
                               border:1px solid #e1e6ef;background:#fff;color:#64748b;cursor:pointer;">Clear</button>
            </div>

            <!-- Visit list -->
            <div style="border:1.5px solid ${accentBorder};border-radius:10px;overflow:hidden;margin-bottom:12px;">
                ${items.map((item,i) => `
                <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;
                              cursor:pointer;transition:background .12s;font-size:0.78rem;
                              ${i<items.length-1?'border-bottom:1px solid #f1f5f9':''};"
                       onmouseover="this.style.background='${accentLight}'"
                       onmouseout="this.style.background='#fff'">
                    <input type="checkbox" class="missing-visit-cb" value="${item.id}"
                           style="width:16px;height:16px;accent-color:${accent};flex-shrink:0;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;color:#0d1117;">${item.label}</div>
                        <div style="font-size:0.65rem;color:#94a3b8;margin-top:1px;
                                    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.sub}</div>
                    </div>
                </label>`).join('')}
            </div>` : `
            <div style="text-align:center;padding:20px;color:#94a3b8;font-size:0.78rem;">
                No individual records available — will apply to entire category
            </div>`}

            <!-- Feature 2: affected-visit scope note -->
            <div style="background:#f8f9fe;border:1px solid #e1e6ef;border-radius:8px;
                        padding:10px 12px;margin-bottom:12px;font-size:0.68rem;color:#475569;">
                <i class="bi bi-info-circle me-1" style="color:#3b4fd8;"></i>
                Selecting specific visits helps focus the correction on individual records rather than the entire batch.
                Unselected visits will be treated as matching.
            </div>

            <!-- Note -->
            <label style="font-size:0.65rem;font-weight:700;color:#64748b;
                          text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px;">
                Note <span style="font-weight:400;text-transform:none;">(optional)</span>
            </label>
            <textarea id="missingVisitNote" rows="2"
                      placeholder="Add any relevant details or context…"
                      style="width:100%;padding:9px 12px;border:1.5px solid #e1e6ef;border-radius:8px;
                             font-size:0.78rem;font-family:inherit;resize:vertical;outline:none;
                             transition:border-color .15s;"
                      onfocus="this.style.borderColor='${accent}'"
                      onblur="this.style.borderColor='#e1e6ef'"></textarea>
        </div>

        <!-- Footer -->
        <div style="padding:14px 22px;border-top:1px solid #f1f5f9;
                    display:flex;gap:8px;justify-content:flex-end;background:#fafbff;
                    border-radius:0 0 20px 20px;">
            <button id="missingCancelBtn"
                    style="padding:9px 18px;border-radius:12px;border:2px solid #e1e6ef;
                           background:#fff;font-weight:600;font-size:0.78rem;color:#64748b;
                           cursor:pointer;font-family:inherit;">Cancel</button>
            <button id="missingConfirmBtn"
                    style="padding:9px 22px;border-radius:12px;border:none;
                           background:${accent};font-weight:700;font-size:0.78rem;color:#fff;
                           cursor:pointer;font-family:inherit;
                           box-shadow:0 4px 12px ${accent}40;">
                <i class="bi bi-check-lg me-1"></i>Confirm
            </button>
        </div>
    </div>`;

    document.body.appendChild(backdrop);

    document.getElementById('missingCancelBtn').addEventListener('click', () => {
        backdrop.remove();
        // Roll back the batchResults entry since user cancelled
        delete reviewState.batchResults[fieldKey];
    });

    document.getElementById('missingConfirmBtn').addEventListener('click', () => {
        const checked = [...document.querySelectorAll('.missing-visit-cb:checked')].map(cb => parseInt(cb.value));
        const note    = document.getElementById('missingVisitNote')?.value?.trim() || '';

        // Store discrepancy type
        if (!reviewState.discrepancyTypes) reviewState.discrepancyTypes = {};
        reviewState.discrepancyTypes[fieldKey] = value === 'missing_cc' ? 'missing_carecard' : 'missing_emr';

        // Store affected visits (Feature 2 — applies to all outcome types)
        if (checked.length > 0) {
            if (!reviewState.affectedVisits) reviewState.affectedVisits = {};
            reviewState.affectedVisits[fieldKey] = checked.map(i => items[i]?.label || String(i));
            // Build a care card value summary from affected items
            const affectedLabels = checked.map(i => items[i]?.label || String(i));
            if (!reviewState.careCardValues) reviewState.careCardValues = {};
            reviewState.careCardValues[fieldKey] = `${isMissingCC?'Missing on card':'Missing in EMR'}: ${affectedLabels.join(', ')}`;
        }

        if (note) {
            if (!reviewState.discrepancyNotes) reviewState.discrepancyNotes = {};
            reviewState.discrepancyNotes[fieldKey] = note;
        }

        backdrop.remove();
        showToast(
            `${isMissingCC?'⚠️ Missing on Care Card':'🗄 Missing in EMR'} recorded${checked.length>0?` for ${checked.length} visit${checked.length>1?'s':''}`:' (all visits)'}`,
            'warning', 2500
        );
        if (typeof onSaveCallback === 'function') onSaveCallback();
    });

    backdrop.addEventListener('click', e => { if (e.target === backdrop) { backdrop.remove(); delete reviewState.batchResults[fieldKey]; } });
    document.addEventListener('keydown', function escMV(e) {
        if (e.key === 'Escape') { backdrop.remove(); delete reviewState.batchResults[fieldKey]; document.removeEventListener('keydown', escMV); }
    });
}

// ── Feature 2: Visit-selector for correction outcomes ─────────────────────────
// Inject into showBatchCareCardModal — visit selection is now also available
// for corrected_emr / corrected_carecard / corrected_both.
// The modal already handles visit-list for Missing types.
// For corrections we re-use the same visit-list to let officers mark WHICH
// visits had corrections. This is stored in affectedVisits[fieldKey].

// ── Quick-fill helpers ────────────────────────────────────────────────────────
function _batchFillAll(type, value) {
    const keys = type === 'refill'
        ? ['refill_dates','refill_durations','refill_regimens','refill_next_appts']
        : ['vl_sample_dates','vl_results','vl_result_dates'];

    keys.forEach(k => {
        reviewState.batchResults[k] = value;
        if (value === 'match') {
            if (reviewState.discrepancyTypes) delete reviewState.discrepancyTypes[k];
            if (reviewState.discrepancyNotes) delete reviewState.discrepancyNotes[k];
            if (reviewState.careCardValues)   delete reviewState.careCardValues[k];
            if (reviewState.affectedVisits)   delete reviewState.affectedVisits[k];
        } else if (value === 'missing_cc' || value === 'missing_emr') {
            if (!reviewState.discrepancyTypes) reviewState.discrepancyTypes = {};
            reviewState.discrepancyTypes[k] = value === 'missing_cc' ? 'missing_carecard' : 'missing_emr';
        }
        _rerenderBatchCard(k);
    });
    showToast(
        `✅ All ${type === 'refill' ? 'refill' : 'VL'} fields set to ${value === 'match' ? 'Match' : 'Missing on Card'}`,
        value === 'match' ? 'success' : 'warning', 2500
    );
    document.querySelectorAll('.cascade-banner').forEach(el => el.remove());
}

function _batchClearAll(type) {
    const keys = type === 'refill'
        ? ['refill_dates','refill_durations','refill_regimens','refill_next_appts']
        : ['vl_sample_dates','vl_results','vl_result_dates'];

    keys.forEach(k => {
        delete reviewState.batchResults[k];
        if (reviewState.discrepancyTypes) delete reviewState.discrepancyTypes[k];
        if (reviewState.discrepancyNotes) delete reviewState.discrepancyNotes[k];
        if (reviewState.careCardValues)   delete reviewState.careCardValues[k];
        if (reviewState.affectedVisits)   delete reviewState.affectedVisits[k];
        _rerenderBatchCard(k);
    });
    document.querySelectorAll('.cascade-banner').forEach(el => el.remove());
    showToast('↩️ Selections cleared', 'info', 1800);
}

// Re-render a single batch card in place after state changes
function _rerenderBatchCard(fieldKey) {
    const card = document.getElementById(`batchCard_${fieldKey}`);
    if (!card) return;

    // Find which step we're on to get the right params
    const step      = reviewState.workflow?.steps?.[reviewState.currentStep];
    const batchType = step?.refills ? 'refill' : 'vl';

    // Get the params the card was built with — read from DOM
    const titleEl   = card.querySelector('.batch-title');
    const questionEl= card.querySelector('[style*="font-size:0.72rem;color:#64748b"]');
    const emrSumEl  = card.querySelector('.emr-summary');
    const title     = titleEl?.textContent?.trim() || fieldKey;
    const question  = questionEl?.textContent?.trim() || '';
    const emrSummary= emrSumEl?.textContent?.replace(/^EMR:\s*/,'').trim() || '';

    // We can't easily re-call renderBatchQuestion without the original params,
    // so update just the visual state — border, accent, pill, button states
    const existing  = reviewState.batchResults[fieldKey] || '';
    const isMatch   = existing === 'match';
    const isCorr    = existing.startsWith('corrected');
    const isMissing = existing === 'missing_cc' || existing === 'missing_emr';

    card.style.borderColor  = isMatch ? '#86efac' : isCorr ? '#a5b4fc' : isMissing ? '#fde68a' : '#e1e6ef';
    card.style.background   = isMatch ? '#f9fdfb' : isCorr ? '#eef0fd' : isMissing ? '#fffbeb' : '#ffffff';

    // Update accent strip
    const strip = card.querySelector('div > div:first-child');
    if (strip) strip.style.background = isMatch ? '#059669' : isCorr ? '#3b4fd8' : isMissing ? '#d97706' : '#e1e6ef';

    // Update status pill
    const pill = card.querySelector('[style*="border-radius:20px"]');
    if (pill) {
        const pillText  = isMatch ? '✓ Matched' : isCorr ? '✎ Corrected' : isMissing ? '⚠ Missing/Issue' : '○ Pending';
        const pillStyle = isMatch ? 'color:#059669;background:#f0fdf4;border:1px solid #86efac;'
                        : isCorr  ? 'color:#3b4fd8;background:#eef0fd;border:1px solid #a5b4fc;'
                        : isMissing? 'color:#d97706;background:#fffbeb;border:1px solid #fde68a;'
                        : 'color:#94a3b8;background:#f1f5f9;';
        pill.textContent = pillText;
        pill.setAttribute('style', `font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;${pillStyle}`);
    }

    // Update each outcome button's active state
    card.querySelectorAll('.batch-outcome-btn').forEach(btn => {
        const btnVal = btn.dataset.value;
        const opts = {
            match:             {color:'#059669',bg:'#f0fdf4',border:'#86efac'},
            corrected_emr:     {color:'#3b4fd8',bg:'#eef0fd',border:'#a5b4fc'},
            corrected_carecard:{color:'#b45309',bg:'#fffbeb',border:'#fde68a'},
            corrected_both:    {color:'#be185d',bg:'#fdf2f8',border:'#fbcfe8'},
            missing_cc:        {color:'#d97706',bg:'#fffbeb',border:'#fde68a'},
            missing_emr:       {color:'#dc2626',bg:'#fef2f2',border:'#fecaca'},
        };
        const o = opts[btnVal] || {color:'#94a3b8',bg:'white',border:'#e1e6ef'};
        const active = existing === btnVal;
        btn.style.borderColor  = active ? o.border : '#e1e6ef';
        btn.style.background   = active ? o.bg     : 'white';
        btn.style.color        = active ? o.color  : '#94a3b8';
        btn.style.fontWeight   = active ? '700'    : '500';
    });

    // Update discrepancy badge
    const discType = reviewState.discrepancyTypes?.[fieldKey];
    const discNote = reviewState.discrepancyNotes?.[fieldKey];
    // Remove old badge if any
    card.querySelectorAll('.disc-saved-badge').forEach(el => el.remove());
    if (discType && existing && existing !== 'match') {
        const dtL = {incorrect_value:'Incorrect Value',missing_emr:'Missing in EMR',
                     missing_carecard:'Missing on Care Card',not_documented:'Not Documented',
                     unable_verify:'Unable to Verify',lab_pending:'Lab Pending',
                     incomplete_records:'Incomplete Records',unavailable:'Info Unavailable',other:'Other'};
        const badge = document.createElement('div');
        badge.className = 'disc-saved-badge';
        badge.style.cssText = 'margin-top:8px;padding:6px 10px;border-radius:7px;background:#eef0fd;border:1px solid #a5b4fc;font-size:0.66rem;color:#3b4fd8;display:flex;align-items:center;gap:5px;';
        badge.innerHTML = `<i class="bi bi-flag-fill"></i><strong>Reason:</strong> ${dtL[discType]||discType}${discNote?` <span style="color:#64748b;">— ${discNote.substring(0,50)}</span>`:''}`;
        card.querySelector('div > div:last-child')?.appendChild(badge);
    }
}

// Keep old onBatchSelectChange for any legacy calls
function onBatchSelectChange(select, fieldKey) {
    onBatchOutcomeClick(fieldKey, select.value, 'refill');
}

// NOTE: showBatchDiscrepancyTypeModal is defined further below (context-aware version).
// This stub ensures the first onBatchSelectChange call routes to the full version.
// (Duplicate removed — see the full implementation below around line 4213.)

// ============================================================================
// SHOW BATCH CARE CARD MODAL — handles "Incorrect Value" (enter values) and
// "Missing in EMR" / "Not Documented" / "Missing on Care Card" (select visits)
// ============================================================================
function showBatchCareCardModal(fieldKey, title, emrSummary, correctionType, batchType, onSaveCallback) {
    document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop-custom';
    backdrop.style.display = 'flex';

    const discType = reviewState.discrepancyTypes?.[fieldKey] || 'incorrect_value';
    const isIncorrectValue = (discType === 'incorrect_value');

    // -----------------------------------------------------------------------
    // Build the visit list for checkbox selection (Missing/Not Documented types)
    // Search ALL workflow steps for the correct data regardless of currentStep
    // -----------------------------------------------------------------------
    const allSteps = reviewState.workflow?.steps || [];
    const refillStep = allSteps.find(s => s.refills && s.refills.length > 0);
    const vlStep     = allSteps.find(s => s.viral_loads && s.viral_loads.length > 0);

    const isRefill = batchType === 'refill' || ['refill_dates','refill_durations','refill_regimens','refill_next_appts'].includes(fieldKey);
    const isVL     = batchType === 'vl'     || ['vl_sample_dates','vl_results','vl_result_dates'].includes(fieldKey);

    const visitItems = isRefill && refillStep
        ? (refillStep.refills || []).map((r, i) => ({ idx: i, label: `Visit ${i+1} — ${r.date || 'N/A'}`, sub: `${r.regimen || 'N/A'} · ${r.duration || ''}` }))
        : isVL && vlStep
            ? (vlStep.viral_loads || []).map((v, i) => ({ idx: i, label: `VL ${i+1} — ${v.sample_date || 'N/A'}`, sub: `Result: ${v.result || 'N/A'}` }))
            : [];

    // Restore previously saved affected visits
    const prevAffected = reviewState.affectedVisits?.[fieldKey] || [];

    // -----------------------------------------------------------------------
    // Title/desc based on discrepancy type
    // -----------------------------------------------------------------------
    const discTypeLabels = {
        incorrect_value:  { icon: 'bi-pencil-fill',       color: '#f59e0b', title: 'Enter Correct Values',          sub: 'Provide the Care Card values to document the correction.' },
        missing_emr:      { icon: 'bi-database-x',        color: '#ef4444', title: 'Select Affected Visits (Missing in EMR)',    sub: 'Check which visits are missing from the EMR.' },
        missing_carecard: { icon: 'bi-card-text',          color: '#8b5cf6', title: 'Select Affected Visits (Missing on Care Card)', sub: 'Check which visits are missing from the physical Care Card.' },
        not_documented:   { icon: 'bi-file-earmark-x',    color: '#64748b', title: 'Select Affected Visits (Not Documented)',    sub: 'Check which visits are not documented in any record.' },
        unable_verify:    { icon: 'bi-search',             color: '#3b82f6', title: 'Unable to Verify — Add Note',   sub: 'Provide any context about why verification is not possible.' },
        lab_pending:      { icon: 'bi-hourglass-split',   color: '#10b981', title: 'Lab Result Pending — Add Note', sub: 'Note which results are still pending in the EMR.' },
        incomplete_records:{ icon:'bi-file-earmark-break', color: '#f97316', title: 'Select Incomplete Visits',       sub: 'Check which visits have incomplete records.' },
        unavailable:      { icon: 'bi-slash-circle',       color: '#94a3b8', title: 'Info Unavailable — Add Note',   sub: 'Note why the information cannot be obtained.' },
        other:            { icon: 'bi-three-dots',         color: '#6366f1', title: 'Add Details',                   sub: 'Provide any additional context.' },
    };

    const meta = discTypeLabels[discType] || discTypeLabels.other;

    // Determine if this type uses checkboxes vs text input
    const useCheckboxes = ['missing_emr', 'missing_carecard', 'not_documented', 'incomplete_records'].includes(discType) && visitItems.length > 0;
    const useTextNote   = !isIncorrectValue; // non-incorrect-value types show a note field

    // -----------------------------------------------------------------------
    // Build inner content
    // -----------------------------------------------------------------------
    let innerContent = '';

    if (isIncorrectValue) {
        // --- Incorrect Value: show Care Card text input (and optional original EMR) ---
        const isEMRCorrected      = correctionType === 'corrected_emr';
        const isCareCardCorrected = correctionType === 'corrected_carecard';
        const isBothCorrected     = correctionType === 'corrected_both';

        const prevCareCard = reviewState.careCardValues?.[fieldKey] || '';
        const prevOrigEMR  = reviewState.originalEMRValues?.[fieldKey] || '';

        innerContent = `
        <div style="margin-bottom:14px;">
            <label style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; display:block; margin-bottom:6px;">
                📋 EMR Values (Current)
            </label>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px; font-size:0.75rem; color:#64748b; font-family:'JetBrains Mono',monospace; max-height:80px; overflow-y:auto;">
                ${emrSummary}
            </div>
        </div>

        ${(isEMRCorrected || isBothCorrected) ? `
        <div style="margin-bottom:14px;">
            <label style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; display:block; margin-bottom:6px;">
                💻 Original EMR Value (before correction)
            </label>
            <input type="text" id="bccOriginalEMR" value="${prevOrigEMR}"
                placeholder="What did the EMR show before it was corrected?"
                style="width:100%; padding:11px 14px; border:2px solid #e2e8f0; border-radius:10px; font-size:0.82rem; color:#334155; outline:none; font-family:inherit; box-sizing:border-box;"
                onfocus="this.style.borderColor='#6366f1';" onblur="this.style.borderColor='#e2e8f0';">
        </div>` : ''}

        <div style="margin-bottom:6px;">
            <label style="font-size:0.7rem; font-weight:700; color:#f59e0b; text-transform:uppercase; letter-spacing:0.04em; display:block; margin-bottom:6px;">
                📋 Care Card Value${isEMRCorrected ? ' (correct value)' : isCareCardCorrected ? ' (incorrect — EMR is correct)' : ''}
            </label>
            <textarea id="bccCareCardValue" placeholder="${isEMRCorrected ? 'Enter the correct values from the Care Card...' : isCareCardCorrected ? 'Enter what was on the Care Card (the wrong value)...' : 'Enter what is documented on the Care Card...'}"
                style="width:100%; padding:11px 14px; border:2px solid #fde68a; border-radius:10px; font-size:0.82rem; color:#334155; outline:none; font-family:inherit; min-height:70px; resize:vertical; box-sizing:border-box;"
                onfocus="this.style.borderColor='#f59e0b';" onblur="this.style.borderColor='#fde68a';">${prevCareCard}</textarea>
        </div>`;
    } else if (useCheckboxes) {
        // --- Missing/Not Documented: show visit checkboxes ---
        const checkboxHtml = visitItems.length > 0
            ? visitItems.map(v => `
            <label style="
                display:flex; align-items:flex-start; gap:10px; padding:10px 12px;
                border:2px solid ${prevAffected.includes(v.idx) ? '#ef444450' : '#e2e8f0'};
                border-radius:10px; cursor:pointer; background:${prevAffected.includes(v.idx) ? '#fef2f2' : 'white'};
                transition:all 0.15s ease; margin-bottom:6px;
            " onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background=this.querySelector('input').checked?'#fef2f2':'white';">
                <input type="checkbox" data-visit-idx="${v.idx}" value="${v.idx}"
                    ${prevAffected.includes(v.idx) ? 'checked' : ''}
                    style="margin-top:2px; accent-color:#ef4444; width:15px; height:15px; flex-shrink:0; cursor:pointer;"
                    onchange="this.closest('label').style.background=this.checked?'#fef2f2':'white'; this.closest('label').style.borderColor=this.checked?'#ef444450':'#e2e8f0';">
                <div>
                    <div style="font-weight:600; font-size:0.82rem; color:#1e293b;">${v.label}</div>
                    ${v.sub ? `<div style="font-size:0.7rem; color:#64748b; margin-top:1px;">${v.sub}</div>` : ''}
                </div>
            </label>`).join('')
            : `<div style="color:#94a3b8; font-size:0.78rem; padding:12px; text-align:center;">No visit data available to select</div>`;

        innerContent = `
        <div style="margin-bottom:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <label style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">
                    Select Affected Visits
                </label>
                <button onclick="
                    const cbs = document.querySelectorAll('#bccVisitList input[type=checkbox]');
                    const allChecked = Array.from(cbs).every(c=>c.checked);
                    cbs.forEach(c=>{c.checked=!allChecked; c.dispatchEvent(new Event('change'));});
                " style="font-size:0.68rem; font-weight:600; color:#6366f1; background:none; border:none; cursor:pointer; padding:0;">
                    Select / Deselect All
                </button>
            </div>
            <div id="bccVisitList" style="max-height:260px; overflow-y:auto; padding-right:2px;">
                ${checkboxHtml}
            </div>
        </div>
        <div style="margin-bottom:6px;">
            <label style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; display:block; margin-bottom:6px;">
                📝 Additional Note (Optional)
            </label>
            <textarea id="bccNote" placeholder="Add any relevant context..."
                style="width:100%; padding:10px 14px; border:2px solid #e2e8f0; border-radius:10px; font-size:0.8rem; color:#334155; outline:none; font-family:inherit; min-height:52px; resize:vertical; box-sizing:border-box;"
                onfocus="this.style.borderColor='#6366f1';" onblur="this.style.borderColor='#e2e8f0';">${reviewState.discrepancyNotes?.[fieldKey] || ''}</textarea>
        </div>`;
    } else {
        // --- Other types: just a note field ---
        innerContent = `
        <div style="margin-bottom:6px;">
            <label style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; display:block; margin-bottom:6px;">
                📝 ${discType === 'other' ? 'Details (Required)' : 'Additional Note (Optional)'}
            </label>
            <textarea id="bccNote" placeholder="${discType === 'other' ? 'Please explain...' : 'Add any relevant context...'}"
                style="width:100%; padding:10px 14px; border:2px solid #e2e8f0; border-radius:10px; font-size:0.8rem; color:#334155; outline:none; font-family:inherit; min-height:80px; resize:vertical; box-sizing:border-box;"
                onfocus="this.style.borderColor='#6366f1';" onblur="this.style.borderColor='#e2e8f0';">${reviewState.discrepancyNotes?.[fieldKey] || ''}</textarea>
        </div>`;
    }

    backdrop.innerHTML = `
    <div onclick="event.stopPropagation()" style="
        background:white; border-radius:20px; width:90%; max-width:560px; max-height:88vh;
        overflow-y:auto; box-shadow:0 25px 60px rgba(0,0,0,0.25); animation: slideUp 0.3s ease;
    ">
        <div style="
            background:linear-gradient(135deg, #fffbeb, #fef3c7); padding:20px 24px 14px;
            text-align:center; border-bottom:1px solid #fde68a;
        ">
            <div style="
                width:50px; height:50px; border-radius:50%;
                background:white; border:2px solid ${meta.color}30;
                display:flex; align-items:center; justify-content:center;
                margin:0 auto 10px; font-size:1.4rem; color:${meta.color};
            ">
                <i class="bi ${meta.icon}"></i>
            </div>
            <h5 style="font-weight:800; color:#92400e; margin:0; font-size:0.95rem;">${meta.title}</h5>
            <p style="color:#a16207; font-size:0.75rem; margin:4px 0 0;">${meta.sub}</p>
            <div style="font-size:0.65rem; color:#94a3b8; margin-top:4px; font-weight:600;">${title}</div>
        </div>

        <div style="padding:18px 24px;">
            ${innerContent}
        </div>

        <div style="padding:14px 24px; border-top:1px solid #f1f5f9; display:flex; gap:10px; justify-content:flex-end; background:#fafbff;">
            <button id="bccCancelBtn" style="
                padding:10px 20px; border:2px solid #e2e8f0; border-radius:12px;
                background:white; font-weight:600; font-size:0.8rem; color:#64748b; cursor:pointer;
            ">Cancel</button>
            <button id="bccSaveBtn" style="
                padding:10px 24px; border:none; border-radius:12px;
                background:linear-gradient(135deg, #f59e0b, #d97706);
                font-weight:700; font-size:0.8rem; color:white; cursor:pointer;
                box-shadow:0 4px 12px rgba(245,158,11,0.3);
            "><i class="bi bi-check-lg me-1"></i> Save Details</button>
        </div>
    </div>`;

    document.body.appendChild(backdrop);

    // -----------------------------------------------------------------------
    // Save handler
    // -----------------------------------------------------------------------
    document.getElementById('bccSaveBtn').addEventListener('click', () => {
        if (isIncorrectValue) {
            const careCardVal = document.getElementById('bccCareCardValue')?.value?.trim();
            const origEMRVal  = document.getElementById('bccOriginalEMR')?.value?.trim();
            const isEMROrBoth = correctionType === 'corrected_emr' || correctionType === 'corrected_both';

            if (!careCardVal) {
                showToast('⚠️ Please enter the Care Card value', 'warning');
                document.getElementById('bccCareCardValue')?.focus();
                return;
            }
            if (isEMROrBoth && !origEMRVal) {
                showToast('⚠️ Please enter the original EMR value before correction', 'warning');
                document.getElementById('bccOriginalEMR')?.focus();
                return;
            }
            if (!reviewState.careCardValues) reviewState.careCardValues = {};
            reviewState.careCardValues[fieldKey] = careCardVal;
            if (origEMRVal) {
                if (!reviewState.originalEMRValues) reviewState.originalEMRValues = {};
                reviewState.originalEMRValues[fieldKey] = origEMRVal;
            }
        } else if (useCheckboxes) {
            // Save affected visit indices
            const checked = Array.from(document.querySelectorAll('#bccVisitList input[type=checkbox]:checked'))
                .map(cb => parseInt(cb.value));
            if (!reviewState.affectedVisits) reviewState.affectedVisits = {};
            reviewState.affectedVisits[fieldKey] = checked;

            // Build a care_card_value summary from the selected visits for the PDF
            if (checked.length > 0) {
                const affected = visitItems.filter(v => checked.includes(v.idx));
                const summary = affected.map(v => v.label).join('; ');
                if (!reviewState.careCardValues) reviewState.careCardValues = {};
                reviewState.careCardValues[fieldKey] = `Affected: ${summary}`;
            }

            const note = document.getElementById('bccNote')?.value?.trim();
            if (note) {
                if (!reviewState.discrepancyNotes) reviewState.discrepancyNotes = {};
                reviewState.discrepancyNotes[fieldKey] = note;
            }
        } else {
            const note = document.getElementById('bccNote')?.value?.trim();
            if (discType === 'other' && !note) {
                showToast('⚠️ Please provide details for "Other"', 'warning');
                document.getElementById('bccNote')?.focus();
                return;
            }
            if (note) {
                if (!reviewState.discrepancyNotes) reviewState.discrepancyNotes = {};
                reviewState.discrepancyNotes[fieldKey] = note;
            }
        }

        backdrop.remove();
        showToast('✅ Details saved', 'success', 2000);
        if (typeof onSaveCallback === 'function') onSaveCallback();
    });

    document.getElementById('bccCancelBtn').addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

    // Escape key
    document.addEventListener('keydown', function bccEsc(e) {
        if (e.key === 'Escape') { backdrop.remove(); document.removeEventListener('keydown', bccEsc); }
    });
}


function showCareCardValueModal(field, label, emrValue, correctionType, onSaveCallback) {
    document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());
    
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop-custom';
    backdrop.style.display = 'flex';
    
    const isEMRCorrected = correctionType === 'corrected_emr';
    const isCareCardCorrected = correctionType === 'corrected_carecard';
    const isBothCorrected = correctionType === 'corrected_both';
    
    // Determine input type based on field
    const isSexField = (field === 'sex');
    const isDateField = (field === 'date_of_birth' || field === 'art_start_date' || field === 'last_pickup_date');
    
    // Build the correct input element
    let careCardInputHtml = '';
    if (isSexField) {
        careCardInputHtml = `
        <select id="careCardValueInput" style="
            width:100%;
            padding:12px 14px;
            border:2px solid #fde68a;
            border-radius:12px;
            font-size:0.85rem;
            font-weight:500;
            color:#334155;
            background:#fffdf7;
            outline:none;
            cursor:pointer;
            transition:all 0.2s ease;
            margin-top:4px;
        " onfocus="this.style.borderColor='#f59e0b';this.style.boxShadow='0 0 0 4px rgba(245,158,11,0.1)';" 
           onblur="this.style.borderColor='#fde68a';this.style.boxShadow='none';">
            <option value="">-- Select Sex on Care Card --</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
        </select>`;
    } else if (isDateField) {
        careCardInputHtml = `
        <input type="date" id="careCardValueInput" style="
            width:100%;
            padding:12px 14px;
            border:2px solid #fde68a;
            border-radius:12px;
            font-size:0.85rem;
            font-weight:500;
            color:#334155;
            background:#fffdf7;
            outline:none;
            cursor:pointer;
            transition:all 0.2s ease;
            margin-top:4px;
        " onfocus="this.style.borderColor='#f59e0b';this.style.boxShadow='0 0 0 4px rgba(245,158,11,0.1)';" 
           onblur="this.style.borderColor='#fde68a';this.style.boxShadow='none';">`;
    } else {
        careCardInputHtml = `
        <input type="text" id="careCardValueInput" placeholder="${isEMRCorrected ? 'Enter the Care Card value (the correct one)...' : isCareCardCorrected ? 'Enter what the Care Card shows (the wrong value)...' : 'Enter what is on the Care Card...'}" style="
            width:100%;
            padding:12px 14px;
            border:2px solid #fde68a;
            border-radius:12px;
            font-size:0.85rem;
            font-weight:500;
            color:#334155;
            background:#fffdf7;
            outline:none;
            transition:all 0.2s ease;
            margin-top:4px;
        " onfocus="this.style.borderColor='#f59e0b';this.style.boxShadow='0 0 0 4px rgba(245,158,11,0.1)';" 
           onblur="this.style.borderColor='#fde68a';this.style.boxShadow='none';">`;
    }
    
    backdrop.innerHTML = `
    <div onclick="event.stopPropagation()" style="
        background:white;
        border-radius:20px;
        width:90%;
        max-width:520px;
        max-height:85vh;
        overflow-y:auto;
        box-shadow:0 25px 60px rgba(0,0,0,0.25);
        animation: slideUp 0.3s ease;
    ">
        <!-- Header -->
        <div style="
            background:linear-gradient(135deg, #fffbeb, #fef3c7);
            padding:24px 24px 16px;
            text-align:center;
            border-bottom:1px solid #fde68a;
        ">
            <div style="
                width:56px; height:56px;
                border-radius:50%;
                background:linear-gradient(135deg, #fef3c7, #fde68a);
                display:flex; align-items:center; justify-content:center;
                margin:0 auto 10px;
                font-size:1.5rem;
                color:#d97706;
            ">
                <i class="bi bi-card-checklist"></i>
            </div>
            <h5 style="font-weight:800; color:#92400e; margin:0; font-size:1rem;">
                ${isEMRCorrected ? 'EMR Was Corrected' : isCareCardCorrected ? 'Care Card Discrepancy' : 'Both Corrected'}
            </h5>
            <p style="color:#a16207; font-size:0.78rem; margin:4px 0 0;">
                ${isEMRCorrected ? 'EMR was wrong → fixed using Care Card' : 
                  isCareCardCorrected ? 'Care Card was wrong → EMR is correct' : 
                  'Both EMR and Care Card were corrected'}
            </p>
        </div>
        
        <!-- Body -->
        <div style="padding:20px 24px;">
            
            <!-- Current EMR Value -->
            <div style="
                background:#f0fdf4;
                border:1px solid #bbf7d0;
                border-radius:10px;
                padding:12px 16px;
                margin-bottom:16px;
            ">
                <div style="font-size:0.65rem; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">
                    <i class="bi bi-database me-1"></i> Current EMR Value ${isEMRCorrected ? '(After Correction)' : ''}
                </div>
                <div class="emr-value-display" style="font-weight:700; color:#059669; font-size:0.95rem;">${emrValue}</div>
            </div>
            
            <!-- Field Label -->
            <div style="font-weight:600; font-size:0.85rem; color:#334155; margin-bottom:16px;">
                ${label} <span style="color:#ef4444;">*</span>
            </div>
            
            ${isEMRCorrected || isBothCorrected ? `
            <!-- Original EMR Value (BEFORE correction) -->
            <div style="margin-bottom:16px;">
                <label style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">
                    🔙 What was on the EMR BEFORE correction?
                </label>
                ${isSexField ? `
                <select id="originalEMRInput" style="
                    width:100%;
                    padding:12px 14px;
                    border:2px solid #e2e8f0;
                    border-radius:12px;
                    font-size:0.85rem;
                    font-weight:500;
                    color:#334155;
                    background:#f8fafc;
                    outline:none;
                    cursor:pointer;
                    transition:all 0.2s ease;
                    margin-top:4px;
                " onfocus="this.style.borderColor='#6366f1';this.style.boxShadow='0 0 0 4px rgba(99,102,241,0.1)';" 
                   onblur="this.style.borderColor='#e2e8f0';this.style.boxShadow='none';">
                    <option value="">-- Select old EMR value --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                </select>
                ` : isDateField ? `
                <input type="date" id="originalEMRInput" style="
                    width:100%;
                    padding:12px 14px;
                    border:2px solid #e2e8f0;
                    border-radius:12px;
                    font-size:0.85rem;
                    font-weight:500;
                    color:#334155;
                    background:#f8fafc;
                    outline:none;
                    cursor:pointer;
                    transition:all 0.2s ease;
                    margin-top:4px;
                " onfocus="this.style.borderColor='#6366f1';this.style.boxShadow='0 0 0 4px rgba(99,102,241,0.1)';" 
                   onblur="this.style.borderColor='#e2e8f0';this.style.boxShadow='none';">
                ` : `
                <input type="text" id="originalEMRInput" placeholder="Enter the old EMR value before it was fixed..." style="
                    width:100%;
                    padding:12px 14px;
                    border:2px solid #e2e8f0;
                    border-radius:12px;
                    font-size:0.85rem;
                    font-weight:500;
                    color:#334155;
                    background:#f8fafc;
                    outline:none;
                    transition:all 0.2s ease;
                    margin-top:4px;
                " onfocus="this.style.borderColor='#6366f1';this.style.boxShadow='0 0 0 4px rgba(99,102,241,0.1)';" 
                   onblur="this.style.borderColor='#e2e8f0';this.style.boxShadow='none';">
                `}
            </div>
            ` : ''}
            
            <!-- Care Card Value (ALWAYS asked) -->
            <div style="margin-bottom:6px;">
                <label style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">
                    📋 What is on the physical Care Card?
                </label>
                ${careCardInputHtml}
            </div>
            
            <!-- Info alert -->
            <div style="
                background:#eff6ff;
                border:1px solid #bfdbfe;
                border-radius:8px;
                padding:10px 14px;
                font-size:0.7rem;
                color:#1e40af;
                margin-top:12px;
            ">
                <i class="bi bi-info-circle me-1"></i>
                ${isEMRCorrected ? '<strong>EMR was corrected.</strong> The Care Card had the correct information.' : 
                  isCareCardCorrected ? '<strong>Care Card was wrong.</strong> EMR value is correct and was kept.' : 
                  '<strong>Both were corrected.</strong> Neither EMR nor Care Card had the right value.'}
            </div>
        </div>
        
        <!-- Actions -->
        <div style="padding:16px 24px; border-top:1px solid #f1f5f9; display:flex; gap:10px; justify-content:flex-end; background:#fafbff;">
            <button id="ccCancelBtn" style="
                padding:10px 20px;
                border:2px solid #e2e8f0;
                border-radius:12px;
                background:white;
                font-weight:600;
                font-size:0.8rem;
                color:#64748b;
                cursor:pointer;
                transition:all 0.2s ease;
            " onmouseover="this.style.borderColor='#94a3b8';" onmouseout="this.style.borderColor='#e2e8f0';">
                Cancel
            </button>
            <button id="ccSaveBtn" style="
                padding:10px 24px;
                border:none;
                border-radius:12px;
                background:linear-gradient(135deg, #f59e0b, #d97706);
                font-weight:700;
                font-size:0.8rem;
                color:white;
                cursor:pointer;
                box-shadow:0 4px 12px rgba(245,158,11,0.3);
                transition:all 0.2s ease;
            " onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 20px rgba(245,158,11,0.4)';" 
               onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 12px rgba(245,158,11,0.3)';">
                <i class="bi bi-check-lg me-1"></i> Save Details
            </button>
        </div>
    </div>`;
    
    document.body.appendChild(backdrop);
    
    const careCardInput = document.getElementById('careCardValueInput');
    const originalEMRInput = document.getElementById('originalEMRInput');
    
    // Focus on Care Card input
    setTimeout(() => {
        if (careCardInput) {
            if (careCardInput.tagName === 'SELECT') {
                careCardInput.focus();
            } else {
                careCardInput.focus();
            }
        }
    }, 150);
    
    // Focus on Care Card input
setTimeout(() => {
    if (careCardInput) {
        careCardInput.focus();
    }
}, 150);

// *** ADD THIS SAVE HANDLER ***
document.getElementById('ccSaveBtn').addEventListener('click', () => {
    const careCardInput = document.getElementById('careCardValueInput');
    const originalEMRInput = document.getElementById('originalEMRInput');

    let careCardValue = '';
    if (careCardInput) {
        careCardValue = careCardInput.tagName === 'SELECT'
            ? careCardInput.value
            : (careCardInput.value || '').trim();
    }
    const originalEMRValue = originalEMRInput ? (originalEMRInput.value || '').trim() : '';

    if (!careCardValue) {
        showToast('⚠️ Please enter the Care Card value', 'warning');
        careCardInput?.focus();
        return;
    }

    if ((isEMRCorrected || isBothCorrected) && !originalEMRValue) {
        showToast('⚠️ Please enter the original EMR value before correction', 'warning');
        originalEMRInput?.focus();
        return;
    }

    // Store values in reviewState
    if (!reviewState.careCardValues) reviewState.careCardValues = {};
    reviewState.careCardValues[field] = careCardValue;

    if (originalEMRValue) {
        if (!reviewState.originalEMRValues) reviewState.originalEMRValues = {};
        reviewState.originalEMRValues[field] = originalEMRValue;
    }

    backdrop.remove();
    showToast('✅ Details saved', 'success', 2000);
    if (typeof onSaveCallback === 'function') onSaveCallback();
});

    document.getElementById('ccCancelBtn').addEventListener('click', () => {
        // Remove the result that _finaliseOutcome already wrote before this
        // modal opened, so the card returns to "pending" state.
        const idx = reviewState.results.findIndex(r => r.field === field);
        if (idx >= 0) {
            const old = reviewState.results[idx];
            reviewState.totalFields    = Math.max(0, reviewState.totalFields - 1);
            if (old.match)                        reviewState.matchedFields      = Math.max(0, reviewState.matchedFields - 1);
            if (old.corrected_on === 'emr')        reviewState.correctedOnEMR     = Math.max(0, reviewState.correctedOnEMR - 1);
            if (old.corrected_on === 'care_card')  reviewState.correctedOnCareCard= Math.max(0, reviewState.correctedOnCareCard - 1);
            if (old.corrected_on === 'both')       reviewState.correctedOnBoth    = Math.max(0, reviewState.correctedOnBoth - 1);
            reviewState.results.splice(idx, 1);
        }
        // Also wipe the discrepancy type so the card resets cleanly
        if (reviewState.discrepancyTypes) delete reviewState.discrepancyTypes[field];
        if (reviewState.discrepancyNotes) delete reviewState.discrepancyNotes[field];
        if (reviewState.careCardValues)   delete reviewState.careCardValues[field];
        if (reviewState.originalEMRValues) delete reviewState.originalEMRValues[field];

        backdrop.remove();

        // Re-render the card so it goes back to "pending" (no outcome selected)
        const step    = reviewState.workflow?.steps?.[reviewState.currentStep];
        const fieldDef = step?.fields?.find(f => f.field === field);
        if (fieldDef) {
            const container = document.getElementById(`fieldCard_${field}`);
            if (container) {
                const fieldIdx = step.fields.indexOf(fieldDef);
                container.outerHTML = renderFieldComparisonCard(fieldDef, fieldIdx);
            }
        }
    });
    
    // Enter key to save
    const handleEnterKey = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('ccSaveBtn').click();
        }
    };
    
    if (careCardInput) {
        careCardInput.addEventListener('keypress', handleEnterKey);
    }
    if (originalEMRInput) {
        originalEMRInput.addEventListener('keypress', handleEnterKey);
    }
    
    // Escape key to cancel
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            backdrop.remove();
            document.removeEventListener('keydown', escHandler);
        }
    });
}

function showBatchDiscrepancyTypeModal(fieldKey, title, emrSummary, correctionType, batchType, onSaveCallback) {
    document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());
    
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop-custom';
    backdrop.style.display = 'flex';
    
    const correctionLabels = {
        'corrected_emr': 'Corrected on EMR',
        'corrected_carecard': 'Corrected on Care Card', 
        'corrected_both': 'Corrected on Both'
    };
    
    // ✅ Determine correction action
    const isCorrectedEMR = correctionType === 'corrected_emr';
    const isCorrectedCareCard = correctionType === 'corrected_carecard';
    const isCorrectedBoth = correctionType === 'corrected_both';
    
    // ✅ Build context-aware options
    let discrepancyOptions = [];
    
    if (isCorrectedEMR) {
        // EMR was wrong — fixed to match Care Card
        if (batchType === 'refill') {
            discrepancyOptions = [
                { value: 'incorrect_value', label: '❌ Incorrect Value(s) in EMR', desc: 'Pharmacy data in EMR was wrong — corrected to match Care Card', icon: 'bi-pencil' },
                { value: 'missing_emr', label: '📂 Missing in EMR', desc: 'Pharmacy visits not recorded in electronic system', icon: 'bi-database-x' },
                { value: 'incomplete_records', label: '📊 Incomplete EMR Records', desc: 'Some pharmacy visits are missing from EMR', icon: 'bi-file-earmark-break' },
                { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm refill details from sources', icon: 'bi-search' },
                { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
            ];
        } else if (batchType === 'vl') {
            discrepancyOptions = [
                { value: 'incorrect_value', label: '❌ Incorrect Value(s) in EMR', desc: 'Lab data in EMR was wrong — corrected to match Care Card', icon: 'bi-pencil' },
                { value: 'missing_emr', label: '📂 Missing in EMR', desc: 'Lab results not recorded in electronic system', icon: 'bi-database-x' },
                { value: 'lab_pending', label: '🧪 Lab Result Pending in EMR', desc: 'Laboratory results not yet in electronic system', icon: 'bi-hourglass-split' },
                { value: 'incomplete_records', label: '📊 Incomplete EMR Records', desc: 'Some VL tests are missing from EMR', icon: 'bi-file-earmark-break' },
                { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm VL results from sources', icon: 'bi-search' },
                { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
            ];
        } else {
            discrepancyOptions = [
                { value: 'incorrect_value', label: '❌ Incorrect Value(s) in EMR', desc: 'Data in EMR was wrong — corrected to match Care Card', icon: 'bi-pencil' },
                { value: 'missing_emr', label: '📂 Missing in EMR', desc: 'Data not recorded in electronic system', icon: 'bi-database-x' },
                { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm accuracy from sources', icon: 'bi-search' },
                { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
            ];
        }
    } else if (isCorrectedCareCard) {
        // Care Card was wrong — EMR is correct
        if (batchType === 'refill') {
            discrepancyOptions = [
                { value: 'incorrect_value', label: '❌ Incorrect Value(s) on Care Card', desc: 'Refill data on Care Card was wrong — EMR is correct', icon: 'bi-pencil' },
                { value: 'missing_carecard', label: '📋 Missing on Care Card', desc: 'Refill history not documented on physical card', icon: 'bi-card-text' },
                { value: 'not_documented', label: '📝 Not Documented on Card', desc: 'Refill information not recorded on care card', icon: 'bi-file-earmark-x' },
                { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm refill details from sources', icon: 'bi-search' },
                { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
            ];
        } else if (batchType === 'vl') {
            discrepancyOptions = [
                { value: 'incorrect_value', label: '❌ Incorrect Value(s) on Care Card', desc: 'VL data on Care Card was wrong — EMR is correct', icon: 'bi-pencil' },
                { value: 'missing_carecard', label: '📋 Missing on Care Card', desc: 'VL history not documented on physical card', icon: 'bi-card-text' },
                { value: 'not_documented', label: '📝 Not Documented on Card', desc: 'VL information not recorded on care card', icon: 'bi-file-earmark-x' },
                { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm VL results from sources', icon: 'bi-search' },
                { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
            ];
        } else {
            discrepancyOptions = [
                { value: 'incorrect_value', label: '❌ Incorrect Value(s) on Care Card', desc: 'Data on Care Card was wrong — EMR is correct', icon: 'bi-pencil' },
                { value: 'missing_carecard', label: '📋 Missing on Care Card', desc: 'Data not documented on physical card', icon: 'bi-card-text' },
                { value: 'not_documented', label: '📝 Not Documented on Card', desc: 'Information not recorded on care card', icon: 'bi-file-earmark-x' },
                { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm accuracy from sources', icon: 'bi-search' },
                { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
            ];
        }
    } else if (isCorrectedBoth) {
        // Both were wrong
        discrepancyOptions = [
            { value: 'incorrect_value', label: '❌ Incorrect Value(s) — Both', desc: 'Both EMR and Care Card had wrong data — both corrected', icon: 'bi-pencil' },
            { value: 'not_documented', label: '📝 Not Documented', desc: 'Information not properly recorded in either source', icon: 'bi-file-earmark-x' },
            { value: 'unavailable', label: '🚫 Information Unavailable', desc: 'Cannot access or obtain this data from any source', icon: 'bi-slash-circle' },
            { value: 'unable_verify', label: '🔍 Unable to Verify', desc: 'Cannot confirm accuracy from any available source', icon: 'bi-search' },
            { value: 'other', label: '📌 Other', desc: 'Another reason — explanation required', icon: 'bi-three-dots' },
        ];
    }
    
    const batchLabel = batchType === 'refill' ? 'Refill History' : batchType === 'vl' ? 'VL History' : 'Batch';
    
    backdrop.innerHTML = `
    <div onclick="event.stopPropagation()" style="
        background:white; border-radius:20px; width:90%; max-width:600px; max-height:85vh; 
        overflow-y:auto; box-shadow:0 25px 60px rgba(0,0,0,0.25); animation: slideUp 0.3s ease;
    ">
        <div style="
            background:linear-gradient(135deg, #fffbeb, #fef3c7); padding:24px 24px 16px;
            text-align:center; border-bottom:1px solid #fde68a;
        ">
            <div style="
                width:56px; height:56px; border-radius:50%;
                background:linear-gradient(135deg, #fef3c7, #fde68a);
                display:flex; align-items:center; justify-content:center;
                margin:0 auto 10px; font-size:1.5rem; color:#d97706;
            ">
                <i class="bi ${batchType === 'refill' ? 'bi-capsule' : batchType === 'vl' ? 'bi-droplet' : 'bi-question-circle-fill'}"></i>
            </div>
            <h5 style="font-weight:800; color:#92400e; margin:0; font-size:1rem;">
                Reason for Discrepancy
            </h5>
            <p style="color:#a16207; font-size:0.78rem; margin:4px 0 0;">
                <strong>${title}</strong> — ${correctionLabels[correctionType] || 'Discrepancy Found'}
            </p>
            <div style="font-size:0.65rem; color:#94a3b8; margin-top:4px;">
                <i class="bi ${batchType === 'refill' ? 'bi-calendar3' : batchType === 'vl' ? 'bi-droplet' : 'bi-clipboard-check'} me-1"></i>${batchLabel} Batch Review
            </div>
        </div>
        
        <div style="padding:16px 24px;">
            <label style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px; display:block;">
                Why is there a discrepancy?
            </label>
            <div id="batchDiscOptionsList" style="display:flex; flex-direction:column; gap:6px;">
                ${discrepancyOptions.map(opt => `
                <div class="batch-disc-option" data-value="${opt.value}" onclick="selectBatchDiscOption(this, '${opt.value}')" style="
                    padding:14px 16px; border:2px solid #e2e8f0; border-radius:12px; cursor:pointer;
                    transition:all 0.15s ease; background:white; display:flex; align-items:flex-start; gap:12px;
                " onmouseover="this.style.borderColor='#f59e0b';this.style.background='#fffdf7';" 
                   onmouseout="if(!this.classList.contains('selected')){this.style.borderColor='#e2e8f0';this.style.background='white';}">
                    <div style="
                        width:36px; height:36px; border-radius:10px; 
                        background:#fef3c7; display:flex; align-items:center; justify-content:center;
                        font-size:1rem; color:#d97706; flex-shrink:0;
                    ">
                        <i class="bi ${opt.icon}"></i>
                    </div>
                    <div>
                        <div style="font-weight:600; font-size:0.85rem; color:#1e293b;">${opt.label}</div>
                        <div style="font-size:0.72rem; color:#64748b; margin-top:2px;">${opt.desc}</div>
                    </div>
                </div>
                `).join('')}
            </div>
            
            <div id="batchDiscNoteSection" style="display:none; margin-top:12px;">
                <label id="batchDiscNoteLabel" style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">
                    📝 Additional Note (Optional)
                </label>
                <textarea id="batchDiscNoteInput" placeholder="Add any relevant details..." style="
                    width:100%; padding:10px 14px; border:2px solid #e2e8f0; border-radius:10px;
                    font-size:0.82rem; min-height:60px; resize:vertical; margin-top:4px;
                    font-family:inherit; outline:none;
                " onfocus="this.style.borderColor='#6366f1';" onblur="this.style.borderColor='#e2e8f0';"></textarea>
            </div>
        </div>
        
        <div style="padding:16px 24px; border-top:1px solid #f1f5f9; display:flex; gap:10px; justify-content:flex-end; background:#fafbff;">
            <button id="batchDiscCancelBtn" style="
                padding:10px 20px; border:2px solid #e2e8f0; border-radius:12px;
                background:white; font-weight:600; font-size:0.8rem; color:#64748b; cursor:pointer;
            ">Cancel</button>
            <button id="batchDiscSaveBtn" style="
                padding:10px 24px; border:none; border-radius:12px;
                background:linear-gradient(135deg, #f59e0b, #d97706);
                font-weight:700; font-size:0.8rem; color:white; cursor:pointer;
                box-shadow:0 4px 12px rgba(245,158,11,0.3); opacity:0.5;
            " disabled>Save Reason <i class="bi bi-check-lg ms-1"></i></button>
        </div>
    </div>`;
    
    document.body.appendChild(backdrop);
    
    let selectedDisc = null;
    
    window.selectBatchDiscOption = function(element, value) {
        document.querySelectorAll('.batch-disc-option').forEach(el => {
            el.classList.remove('selected');
            el.style.borderColor = '#e2e8f0';
            el.style.background = 'white';
        });
        element.classList.add('selected');
        element.style.borderColor = '#f59e0b';
        element.style.background = '#fffdf7';
        selectedDisc = value;
        
        const saveBtn = document.getElementById('batchDiscSaveBtn');
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        
        const noteSection = document.getElementById('batchDiscNoteSection');
        const noteLabel = document.getElementById('batchDiscNoteLabel');
        const noteInput = document.getElementById('batchDiscNoteInput');
        
        if (value === 'incorrect_value') {
            noteSection.style.display = 'none';
        } else if (value === 'other') {
            noteSection.style.display = 'block';
            noteLabel.textContent = '📌 Please specify (Required)';
            noteLabel.style.color = '#ef4444';
            noteInput.placeholder = 'Please explain the reason for this discrepancy...';
        } else {
            noteSection.style.display = 'block';
            noteLabel.textContent = '📝 Additional Note (Optional)';
            noteLabel.style.color = '#64748b';
            noteInput.placeholder = 'Add any relevant details...';
        }
    };
    
    document.getElementById('batchDiscSaveBtn').addEventListener('click', () => {
        if (!selectedDisc) return;
        
        const note = document.getElementById('batchDiscNoteInput')?.value?.trim() || '';
        
        if (selectedDisc === 'other' && !note) {
            showToast('⚠️ Please explain the reason for selecting "Other"', 'warning');
            document.getElementById('batchDiscNoteInput')?.focus();
            return;
        }
        
        if (!reviewState.discrepancyTypes) reviewState.discrepancyTypes = {};
        reviewState.discrepancyTypes[fieldKey] = selectedDisc;
        
        if (note) {
            if (!reviewState.discrepancyNotes) reviewState.discrepancyNotes = {};
            reviewState.discrepancyNotes[fieldKey] = note;
        }
        
        backdrop.remove();
        
        // Always open the care card / visit modal — it adapts to the discrepancy type
        const NEEDS_VISIT_SELECTION = ['missing_emr', 'missing_carecard', 'not_documented', 'incomplete_records'];
        const NEEDS_NOTE_ONLY = ['unable_verify', 'lab_pending', 'unavailable', 'other'];
        const alwaysShow = NEEDS_VISIT_SELECTION.includes(selectedDisc) || NEEDS_NOTE_ONLY.includes(selectedDisc) || selectedDisc === 'incorrect_value';
        if (alwaysShow) {
            showBatchCareCardModal(fieldKey, title, emrSummary, correctionType, batchType, onSaveCallback);
        } else {
            showToast('✅ Discrepancy documented', 'success', 2500);
            if (typeof onSaveCallback === 'function') onSaveCallback();
        }
    });
    
    document.getElementById('batchDiscCancelBtn').addEventListener('click', () => {
        backdrop.remove();
    });
    
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.remove();
    });
}


// ============================================================================
// SAVE RESULTS, NAVIGATION, COMPLETE
// ============================================================================

function saveCurrentStepResults() {
    const step = reviewState.workflow.steps[reviewState.currentStep];
    if (!step) return;
    
    // ================================================================
    // PROCESS INDIVIDUAL FIELDS (Steps 1 & 2)
    // ================================================================
    if (step.fields) {
        step.fields.forEach(field => {
            const card = document.getElementById(`fieldCard_${field.field}`);
            if (!card) return;
            
            const select = card.querySelector('.match-select');
            if (!select || !select.value) return;
            
            const value = select.value;
            let match = false, correctedOn = null;
            
            if (value === 'match') match = true;
            else if (value === 'corrected_emr') correctedOn = 'emr';
            else if (value === 'corrected_carecard') correctedOn = 'care_card';
            else if (value === 'corrected_both') correctedOn = 'both';
            
            // ✅ BUILD RESULT WITH ALL VALUES
            const result = {
                field: field.field,
                label: field.label,
                emr_value: field.emr_value,
                match: match,
                corrected_on: correctedOn,
                discrepancy_type: reviewState.discrepancyTypes?.[field.field] || null,
                discrepancy_note: reviewState.discrepancyNotes?.[field.field] || null,
                care_card_value: reviewState.careCardValues?.[field.field] || null,
                original_emr_value: reviewState.originalEMRValues?.[field.field] || null,
                step: reviewState.currentStep + 1
            };
            
            // Remove old result for this field
            const oldIdx = reviewState.results.findIndex(r => r.field === field.field);
            if (oldIdx >= 0) {
                const old = reviewState.results[oldIdx];
                reviewState.totalFields--;
                if (old.match) reviewState.matchedFields--;
                if (old.corrected_on === 'emr') reviewState.correctedOnEMR--;
                if (old.corrected_on === 'care_card') reviewState.correctedOnCareCard--;
                if (old.corrected_on === 'both') reviewState.correctedOnBoth--;
                reviewState.results.splice(oldIdx, 1);
            }
            
            // Add new counts
            reviewState.totalFields++;
            if (match) reviewState.matchedFields++;
            if (correctedOn === 'emr') reviewState.correctedOnEMR++;
            if (correctedOn === 'care_card') reviewState.correctedOnCareCard++;
            if (correctedOn === 'both') reviewState.correctedOnBoth++;
            
            reviewState.results.push(result);
        });
    }
    
    // ================================================================
    // PROCESS BATCH FIELDS (Steps 3 & 4) - FIXED
    // ================================================================
    const processBatch = (batchFields, labels, stepNum) => {
        batchFields.forEach(batchField => {
            const value = reviewState.batchResults[batchField];
            if (!value) return;
            
            let match = false, correctedOn = null;
            if (value === 'match') match = true;
            else if (value === 'corrected_emr') correctedOn = 'emr';
            else if (value === 'corrected_carecard') correctedOn = 'care_card';
            else if (value === 'corrected_both') correctedOn = 'both';
            
            // Remove old result
            const oldIdx = reviewState.results.findIndex(r => r.field === batchField);
            if (oldIdx >= 0) {
                const old = reviewState.results[oldIdx];
                reviewState.totalFields--;
                if (old.match) reviewState.matchedFields--;
                if (old.corrected_on === 'emr') reviewState.correctedOnEMR--;
                if (old.corrected_on === 'care_card') reviewState.correctedOnCareCard--;
                if (old.corrected_on === 'both') reviewState.correctedOnBoth--;
                reviewState.results.splice(oldIdx, 1);
            }
            
            // Add new counts
            reviewState.totalFields++;
            if (match) reviewState.matchedFields++;
            if (correctedOn === 'emr') reviewState.correctedOnEMR++;
            if (correctedOn === 'care_card') reviewState.correctedOnCareCard++;
            if (correctedOn === 'both') reviewState.correctedOnBoth++;
            
            // ✅ FIXED: BUILD RESULT WITH ALL DATA INCLUDING DISCREPANCY INFO
            reviewState.results.push({
                field: batchField,
                label: labels[batchField] || batchField,
                emr_value: 'Batch comparison',
                match: match,
                corrected_on: correctedOn,
                discrepancy_type: reviewState.discrepancyTypes?.[batchField] || null,
                discrepancy_note: reviewState.discrepancyNotes?.[batchField] || null,
                care_card_value: reviewState.careCardValues?.[batchField] || null,
                original_emr_value: reviewState.originalEMRValues?.[batchField] || null,
                affected_visits: reviewState.affectedVisits?.[batchField] || null,
                step: stepNum
            });
        });
    };
    
    if (step.refills) {
        processBatch(
            ['refill_dates', 'refill_durations', 'refill_regimens', 'refill_next_appts'],
            {
                'refill_dates': 'Refill - Pickup Dates',
                'refill_durations': 'Refill - Durations',
                'refill_regimens': 'Refill - Regimens',
                'refill_next_appts': 'Refill - Next Appointments'
            },
            3
        );
    }
    
    if (step.viral_loads) {
        processBatch(
            ['vl_sample_dates', 'vl_results', 'vl_result_dates'],
            {
                'vl_sample_dates': 'VL - Sample Dates',
                'vl_results': 'VL - Results',
                'vl_result_dates': 'VL - Result Dates'
            },
            4
        );
    }
}

function nextReviewStep() {
    const step = reviewState.workflow.steps[reviewState.currentStep];

    // ── Validate individual fields (Steps 1 & 2) ─────────────────────────
    if (step && step.fields) {
        for (const field of step.fields) {
            const result = reviewState.results.find(r => r.field === field.field);

            // Must have an outcome recorded
            if (!result || (!result.match && !result.corrected_on)) {
                showToast(`⚠️ Please review "${field.label}" before proceeding`, 'warning');
                // Highlight the card
                const card = document.getElementById(`fieldCard_${field.field}`);
                if (card) {
                    card.style.outline = '2px solid #ef4444';
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => { card.style.outline = ''; }, 2500);
                }
                return;
            }

            // For correction outcomes: must have a discrepancy type selected
            if (!result.match && result.corrected_on) {
                const discType = reviewState.discrepancyTypes?.[field.field];
                if (!discType) {
                    showToast(`⚠️ Select a discrepancy reason for "${field.label}"`, 'warning');
                    const card = document.getElementById(`fieldCard_${field.field}`);
                    if (card) {
                        card.style.outline = '2px solid #f59e0b';
                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => { card.style.outline = ''; }, 2500);
                        // Re-trigger the discrepancy modal
                        const emrValue = field.emr_value || '';
                        const corrType = result.corrected_on === 'emr' ? 'corrected_emr'
                                       : result.corrected_on === 'care_card' ? 'corrected_carecard'
                                       : 'corrected_both';
                        showDiscrepancyTypeModal(field.field, field.label, emrValue, corrType, () => {
                            // After saving, don't auto-advance — let officer click Next again
                        });
                    }
                    return;
                }
            }
        }
    }

    // ── Validate batch fields (Steps 3 & 4) ──────────────────────────────
    if (step && (step.refills || step.viral_loads)) {
        const batchFields = step.refills
            ? ['refill_dates', 'refill_durations', 'refill_regimens', 'refill_next_appts']
            : ['vl_sample_dates', 'vl_results', 'vl_result_dates'];

        const VALID_OUTCOMES = new Set(['match','corrected_emr','corrected_carecard','corrected_both','missing_cc','missing_emr']);
        for (const bf of batchFields) {
            const val = reviewState.batchResults[bf];
            if (!val || !VALID_OUTCOMES.has(val)) {
                showToast('⚠️ Please review all batch fields before proceeding', 'warning');
                const card = document.getElementById(`batchCard_${bf}`);
                if (card) {
                    card.style.outline = '2px solid #ef4444';
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => { card.style.outline = ''; }, 2500);
                }
                return;
            }

            // Corrections need a discrepancy type
            if (val.startsWith('corrected')) {
                const discType = reviewState.discrepancyTypes?.[bf];
                if (!discType) {
                    const batchType = step.refills ? 'refill' : 'vl';
                    const card = document.getElementById(`batchCard_${bf}`);
                    const title = card?.querySelector('.batch-title')?.textContent || bf;
                    const emrSummary = card?.querySelector('.emr-summary')?.textContent || '';
                    showToast('⚠️ Select a discrepancy reason for the batch field', 'warning');
                    if (card) {
                        card.style.outline = '2px solid #f59e0b';
                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => { card.style.outline = ''; }, 2500);
                    }
                    showBatchDiscrepancyTypeModal(bf, title, emrSummary, val, batchType);
                    return;
                }
            }
        }
    }
    
    saveCurrentStepResults();
    if (reviewState.currentStep < reviewState.workflow.steps.length - 1) {
        renderReviewStep(reviewState.currentStep + 1);
        document.getElementById('reviewWorkflowContent').scrollIntoView({ behavior: 'smooth' });
    }
}

function prevReviewStep() {
    if (reviewState.currentStep > 0) {
        renderReviewStep(reviewState.currentStep - 1);
        document.getElementById('reviewWorkflowContent').scrollIntoView({ behavior: 'smooth' });
    }
}

function cancelReviewWorkflow() {
    if (confirm('Cancel review? Progress will be lost.')) {
        cancelReviewAndReset();
        showToast('Review cancelled', 'info');
    }
}

async function completeReviewWorkflow() {
    saveCurrentStepResults();
    
    if (reviewState.results.length === 0) {
        showToast('⚠️ Please review at least one item.', 'warning');
        return;
    }
    
    // ── Validate all steps ────────────────────────────────────────────────
    const workflow = reviewState.workflow;
    if (!workflow) return;

    let missingFields = [];

    // Step 1: Biodata
    if (workflow.steps[0]?.fields) {
        workflow.steps[0].fields.forEach(field => {
            const result = reviewState.results.find(r => r.field === field.field);
            if (!result || (!result.match && !result.corrected_on)) {
                missingFields.push({ label: field.label, step: 1 });
            } else if (!result.match && result.corrected_on && !reviewState.discrepancyTypes?.[field.field]) {
                missingFields.push({ label: `${field.label} (discrepancy reason needed)`, step: 1 });
            }
        });
    }

    // Step 2: Latest Refill
    if (workflow.steps[1]?.fields) {
        workflow.steps[1].fields.forEach(field => {
            const result = reviewState.results.find(r => r.field === field.field);
            if (!result || (!result.match && !result.corrected_on)) {
                missingFields.push({ label: field.label, step: 2 });
            } else if (!result.match && result.corrected_on && !reviewState.discrepancyTypes?.[field.field]) {
                missingFields.push({ label: `${field.label} (discrepancy reason needed)`, step: 2 });
            }
        });
    }

    // Steps 3 & 4: Batch fields
    const allBatchFields = [
        ...['refill_dates', 'refill_durations', 'refill_regimens', 'refill_next_appts'],
        ...['vl_sample_dates', 'vl_results', 'vl_result_dates'],
    ];
    allBatchFields.forEach(field => {
        const val = reviewState.batchResults[field];
        const stepNum = field.startsWith('vl_') ? 4 : 3;
        if (!val) {
            missingFields.push({ label: field.replace(/_/g,' '), step: stepNum });
        } else if (val.startsWith('corrected') && !reviewState.discrepancyTypes?.[field]) {
            missingFields.push({ label: `${field.replace(/_/g,' ')} (discrepancy reason needed)`, step: stepNum });
        }
    });
    
    // If any fields are missing, show a beautiful alert
    if (missingFields.length > 0) {
        const targetStep = missingFields[0].step || 1;

        // Build stepStatus so the progress grid in the modal works
        const workflow = reviewState.workflow;
        const stepStatus = { 1: {done:0,total:0}, 2: {done:0,total:0}, 3: {done:0,total:0}, 4: {done:0,total:0} };
        if (workflow?.steps?.[0]?.fields) {
            stepStatus[1].total = workflow.steps[0].fields.length;
            stepStatus[1].done  = workflow.steps[0].fields.filter(f => reviewState.results.find(r => r.field === f.field && (r.match || r.corrected_on))).length;
        }
        if (workflow?.steps?.[1]?.fields) {
            stepStatus[2].total = workflow.steps[1].fields.length;
            stepStatus[2].done  = workflow.steps[1].fields.filter(f => reviewState.results.find(r => r.field === f.field && (r.match || r.corrected_on))).length;
        }
        const refillFields = ['refill_dates','refill_durations','refill_regimens','refill_next_appts'];
        stepStatus[3].total = refillFields.length;
        stepStatus[3].done  = refillFields.filter(f => reviewState.batchResults[f]).length;
        const vlFields = ['vl_sample_dates','vl_results','vl_result_dates'];
        stepStatus[4].total = vlFields.length;
        stepStatus[4].done  = vlFields.filter(f => reviewState.batchResults[f]).length;
        
        // Build the alert HTML
        const stepIcons = { 1: 'bi-person-badge', 2: 'bi-capsule', 3: 'bi-calendar3', 4: 'bi-droplet' };
        const stepNames = { 1: 'Biodata Verification', 2: 'Latest Refill Details', 3: 'Refill History Review', 4: 'Viral Load History' };
        
        let missingItemsHtml = missingFields.slice(0, 5).map(f => `
            <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #fecaca;">
                <span style="
                    width:22px; height:22px;
                    border-radius:50%;
                    background:#fef2f2;
                    color:#ef4444;
                    display:flex; align-items:center; justify-content:center;
                    font-size:0.65rem; font-weight:700;
                    flex-shrink:0;
                ">!</span>
                <span style="font-size:0.78rem; color:#991b1b;">Step ${f.step} — <strong>${f.label}</strong></span>
            </div>
        `).join('');
        
        if (missingFields.length > 5) {
            missingItemsHtml += `<div style="text-align:center; padding:6px; font-size:0.7rem; color:#94a3b8;">+ ${missingFields.length - 5} more field(s)</div>`;
        }
        
        // Create modal backdrop
        document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop-custom';
        backdrop.style.display = 'flex';
        backdrop.innerHTML = `
        <div onclick="event.stopPropagation()" style="
            background:white;
            border-radius:20px;
            width:90%;
            max-width:480px;
            box-shadow:0 25px 60px rgba(0,0,0,0.25);
            overflow:hidden;
            animation: slideUp 0.3s ease;
        ">
            <!-- Header -->
            <div style="
                background:linear-gradient(135deg, #fef2f2, #fff5f5);
                padding:28px 24px 20px;
                text-align:center;
                border-bottom:1px solid #fecaca;
            ">
                <div style="
                    width:64px; height:64px;
                    border-radius:50%;
                    background:linear-gradient(135deg, #fef2f2, #fee2e2);
                    display:flex; align-items:center; justify-content:center;
                    margin:0 auto 12px;
                    font-size:1.8rem;
                ">
                    <i class="bi bi-exclamation-triangle-fill" style="color:#ef4444;"></i>
                </div>
                <h5 style="font-weight:800; color:#991b1b; margin:0; font-size:1.1rem;">
                    Incomplete Review
                </h5>
                <p style="color:#b91c1c; font-size:0.8rem; margin:6px 0 0;">
                    ${missingFields.length} field(s) still need your attention
                </p>
            </div>
            
            <!-- Progress overview -->
            <div style="padding:16px 24px; display:flex; gap:8px;">
                ${[1,2,3,4].map(step => {
                    const done = stepStatus[step].done;
                    const total = stepStatus[step].total;
                    const isComplete = done >= total && total > 0;
                    const isTarget = step === targetStep;
                    return `
                    <div style="flex:1; text-align:center;">
                        <div style="
                            width:40px; height:40px;
                            border-radius:50%;
                            margin:0 auto 6px;
                            display:flex; align-items:center; justify-content:center;
                            font-size:0.9rem;
                            background:${isComplete ? '#ecfdf5' : isTarget ? '#fef2f2' : '#f8fafc'};
                            color:${isComplete ? '#059669' : isTarget ? '#ef4444' : '#94a3b8'};
                            border:2px solid ${isComplete ? '#86efac' : isTarget ? '#fca5a5' : '#e2e8f0'};
                            transition:all 0.2s ease;
                        ">
                            <i class="bi ${isComplete ? 'bi-check-lg' : stepIcons[step]}" style="font-size:${isComplete ? '1rem' : '0.8rem'};"></i>
                        </div>
                        <div style="font-size:0.6rem; font-weight:700; color:${isTarget ? '#ef4444' : '#94a3b8'};">
                            ${isComplete ? 'Done' : `${done}/${total}`}
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
            
            <!-- Missing fields list -->
            <div style="padding:0 24px 16px; max-height:200px; overflow-y:auto;">
                <div style="
                    background:#fff5f5;
                    border:1px solid #fecaca;
                    border-radius:12px;
                    padding:12px 16px;
                ">
                    <div style="font-size:0.7rem; font-weight:700; color:#991b1b; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">
                        <i class="bi bi-list-ul me-1"></i> Missing Fields
                    </div>
                    ${missingItemsHtml}
                </div>
            </div>
            
            <!-- Actions -->
            <div style="padding:16px 24px; border-top:1px solid #f1f5f9; display:flex; gap:10px; justify-content:flex-end; background:#fafbff;">
                <button id="alertCancelBtn" style="
                    padding:10px 20px;
                    border:2px solid #e2e8f0;
                    border-radius:12px;
                    background:white;
                    font-weight:600;
                    font-size:0.8rem;
                    color:#64748b;
                    cursor:pointer;
                    transition:all 0.2s ease;
                " onmouseover="this.style.borderColor='#94a3b8';" onmouseout="this.style.borderColor='#e2e8f0';">
                    Review Again
                </button>
                <button id="alertGoBtn" style="
                    padding:10px 24px;
                    border:none;
                    border-radius:12px;
                    background:linear-gradient(135deg, #ef4444, #dc2626);
                    font-weight:700;
                    font-size:0.8rem;
                    color:white;
                    cursor:pointer;
                    box-shadow:0 4px 12px rgba(239,68,68,0.3);
                    transition:all 0.2s ease;
                " onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 20px rgba(239,68,68,0.4)';" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 12px rgba(239,68,68,0.3)';">
                    <i class="bi bi-arrow-right me-1"></i> Go to Step ${targetStep}
                </button>
            </div>
        </div>`;
        
        document.body.appendChild(backdrop);
        
        // Button handlers
        document.getElementById('alertCancelBtn').addEventListener('click', () => {
            backdrop.remove();
        });
        
        document.getElementById('alertGoBtn').addEventListener('click', () => {
            backdrop.remove();
            renderReviewStep(targetStep - 1);
            document.getElementById('reviewWorkflowContent').scrollIntoView({ behavior: 'smooth' });
        });
        
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) backdrop.remove();
        });
        
        return;
    }
    
    showLoading('Saving Review...');
    
    try {
        const token = localStorage.getItem('meddqa_token');
        const hn = AppState.currentPatient.patient_info.hospital_number;
        
        // ✅ Get username directly from localStorage
        let username = 'Unknown';
        const userStr = localStorage.getItem('meddqa_user');
        if (userStr) {
            try {
                const userData = JSON.parse(userStr);
                username = userData.full_name || userData.username || 'Unknown';
            } catch(e) {
                username = userStr || 'Unknown';
            }
        }
        
        console.log('📤 Sending review with username:', username);
        
        // Build the full review_results array: individual field results + batch results
        const batchFieldToStep = {
            refill_dates: 3, refill_durations: 3, refill_regimens: 3, refill_next_appts: 3,
            vl_sample_dates: 4, vl_results: 4, vl_result_dates: 4
        };
        const batchLabelMap = {
            refill_dates: 'Refill — Pickup Dates', refill_durations: 'Refill — Durations',
            refill_regimens: 'Refill — Regimens', refill_next_appts: 'Refill — Next Appointments',
            vl_sample_dates: 'VL — Sample Dates', vl_results: 'VL — Results', vl_result_dates: 'VL — Result Dates'
        };

        const batchResultItems = Object.entries(reviewState.batchResults).map(([field, val]) => {
            const isMatch = val === 'match';
            const correctedOn = val === 'corrected_emr' ? 'emr'
                              : val === 'corrected_carecard' ? 'care_card'
                              : val === 'corrected_both' ? 'both' : null;
            return {
                field,
                label: batchLabelMap[field] || field,
                emr_value: '',
                match: isMatch,
                corrected_on: correctedOn,
                care_card_value: reviewState.careCardValues?.[field] || null,
                original_emr_value: reviewState.originalEMRValues?.[field] || null,
                discrepancy_type: reviewState.discrepancyTypes?.[field] || null,
                discrepancy_note: reviewState.discrepancyNotes?.[field] || null,
                affected_visits: reviewState.affectedVisits?.[field] || [],
                step: batchFieldToStep[field] || 3
            };
        });

        const allResults = [...reviewState.results, ...batchResultItems];

        const res = await MedAPI.review.complete({
            hospital_number:        hn,
            person_uuid:            AppState.currentPatient.patient_info.person_uuid,
            review_results:         allResults,
            total_fields:           reviewState.totalFields,
            matched_fields:         reviewState.matchedFields,
            corrected_on_emr:       reviewState.correctedOnEMR,
            corrected_on_carecard:  reviewState.correctedOnCareCard,
            verified_by:            username,
            discrepancy_types:      reviewState.discrepancyTypes  || {},
            discrepancy_notes:      reviewState.discrepancyNotes  || {},
            affected_visits:        reviewState.affectedVisits    || {},
        });
        const data = res;
        
        if (data.success) {
            const s = data.summary;
            const mismatched = s.mismatched || (s.total - s.matched);
            const allMatched = s.matched === s.total;
            
            document.getElementById('reviewWorkflowContent').innerHTML = `
                <div style="text-align:center; padding:32px 20px;">
                    <div style="
                        width:80px; height:80px;
                        border-radius:24px;
                        background: ${allMatched ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)' : 'linear-gradient(135deg, #fffbeb, #fef3c7)'};
                        display:flex; align-items:center; justify-content:center;
                        margin:0 auto 20px;
                        font-size:2rem;
                        box-shadow: 0 8px 24px ${allMatched ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'};
                    ">
                        ${allMatched ? '🎉' : '⚠️'}
                    </div>
                    <h5 style="font-weight:800; color:${allMatched ? '#059669' : '#d97706'}; margin-bottom:6px;">
                        ${allMatched ? 'All Records Match!' : 'Review Complete'}
                    </h5>
                    <p style="color:#64748b; font-size:0.8rem; margin-bottom:20px;">
                        ${allMatched ? 'No discrepancies found.' : 'Discrepancies were found and corrected.'}
                        <br><small>Verified by: <strong>${username}</strong></small>
                    </p>
                    
                    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px;">
                        <div style="background:white; border:2px solid #e2e8f0; border-radius:14px; padding:16px 12px; text-align:center;">
                            <div style="font-size:1.5rem; font-weight:800; color:#334155;">${s.total}</div>
                            <div style="font-size:0.6rem; font-weight:700; color:#94a3b8; text-transform:uppercase;">Items</div>
                        </div>
                        <div style="background:white; border:2px solid #86efac; border-radius:14px; padding:16px 12px; text-align:center;">
                            <div style="font-size:1.5rem; font-weight:800; color:#059669;">${s.matched}</div>
                            <div style="font-size:0.6rem; font-weight:700; color:#94a3b8; text-transform:uppercase;">Matched</div>
                        </div>
                        ${mismatched > 0 ? `
                        <div style="background:white; border:2px solid #fca5a5; border-radius:14px; padding:16px 12px; text-align:center;">
                            <div style="font-size:1.5rem; font-weight:800; color:#ef4444;">${mismatched}</div>
                            <div style="font-size:0.6rem; font-weight:700; color:#94a3b8; text-transform:uppercase;">Fixed</div>
                        </div>` : `<div></div>`}
                        <div style="background:white; border:2px solid #c7d2fe; border-radius:14px; padding:16px 12px; text-align:center;">
                            <div style="font-size:1.5rem; font-weight:800; color:#4f46e5;">${s.match_rate}</div>
                            <div style="font-size:0.6rem; font-weight:700; color:#94a3b8; text-transform:uppercase;">Rate</div>
                        </div>
                    </div>
                    
                    <button class="btn btn-sm" onclick="cancelReviewAndReset(); searchPatient();" style="
                        background: linear-gradient(135deg, #4f46e5, #6366f1);
                        border:none; border-radius:50px;
                        padding:12px 28px; font-weight:700; font-size:0.85rem; color:white;
                        box-shadow: 0 4px 16px rgba(79,70,229,0.3);
                    " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(79,70,229,0.4)';" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 16px rgba(79,70,229,0.3)';">
                        <i class="bi bi-arrow-left me-2"></i> Back to Patient
                    </button>

                    <button class="btn btn-sm" onclick="printVerificationReport('${hn}')" style="
                    background:white;
                    border:2px solid #4f46e5;
                    border-radius:50px;
                    padding:10px 20px;
                    font-weight:700;
                    font-size:0.8rem;
                    color:#4f46e5;
                    cursor:pointer;
                    margin-right:8px;
                    transition:all 0.2s ease;
                " onmouseover="this.style.background='#eef2ff';" onmouseout="this.style.background='white';">
                    <i class="bi bi-printer me-1"></i> Print Report
                </button>
                </div>`;
            showToast(`✅ Done! ${s.matched}/${s.total} matched by ${username}`, 'success', 5000);
        } else {
            showToast('❌ ' + (data.detail || 'Failed'), 'error');
        }
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}


function cancelReviewAndReset() {
    if (reviewState.active && !confirm('Cancel review? Progress will be lost.')) return;
    reviewState = {
        workflow: null, currentStep: 0, results: [], totalFields: 0, matchedFields: 0,
        correctedOnEMR: 0, correctedOnCareCard: 0, correctedOnBoth: 0,
        active: false, batchResults: {}, previousReview: null,
        careCardValues: {}, originalEMRValues: {}, discrepancyTypes: {}, discrepancyNotes: {}, affectedVisits: {}
    };

    const rwContent = document.getElementById('reviewWorkflowContent');
    if (rwContent) rwContent.innerHTML = '';

    const emptyState = document.getElementById('reviewEmptyState');
    if (emptyState) emptyState.style.display = 'block';

    const careCardTitle = document.getElementById('careCardTitle');
    if (careCardTitle) careCardTitle.textContent = 'Care Card Verification';

    const careCardBadge = document.getElementById('careCardBadge');
    if (careCardBadge) {
        careCardBadge.innerHTML = '<span class="pulse-dot"></span>Ready';
        careCardBadge.className = 'card-badge live';
    }

    const startBtn = document.getElementById('btnStartReview');
    if (startBtn) startBtn.style.display = 'inline-flex';

    const printBtn = document.getElementById('btnPrintReport');
    if (printBtn) printBtn.style.display = 'none';

    const reviewedBadge = document.getElementById('reviewedStatusBadge');
    if (reviewedBadge) reviewedBadge.style.display = 'none';
}


async function printVerificationReport(hospitalNumber) {
    let hn = hospitalNumber || document.getElementById('btnPrintReport')?.getAttribute('data-hn');
    if (!hn && AppState.currentPatient) hn = AppState.currentPatient.patient_info.hospital_number;
    if (!hn) { showToast('No patient selected', 'warning'); return; }

    showLoading('Generating PDF...');
    try {
        await MedAPI.reports.printVerification(hn);
        showToast('📄 Report opened for printing!', 'success', 3000);
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally { hideLoading(); }
}


// ============================================================================
// BATCH PRINT FUNCTIONS
// ============================================================================

function openBatchPrintModal() {
    // Close reports dropdown
    const menu = document.getElementById('reportsDropdownMenu');
    if (menu) menu.style.display = 'none';
    
    // Show admin username field if user is admin
    const userStr = localStorage.getItem('meddqa_user');
    if (userStr) {
        try {
            const userData = JSON.parse(userStr);
            if (userData.role === 'admin') {
                document.getElementById('batchUsernameSection').style.display = 'block';
            }
        } catch(e) {}
    }
    
    // Set default dates
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    document.getElementById('batchStartDate').value = yesterday.toISOString().split('T')[0];
    document.getElementById('batchEndDate').value = today.toISOString().split('T')[0];
    
    document.getElementById('batchPrintModal').style.display = 'flex';
    document.getElementById('batchPreviewCount').style.display = 'none';
}

function closeBatchPrintModal() {
    document.getElementById('batchPrintModal').style.display = 'none';
}

// Close on backdrop click
document.addEventListener('click', function(e) {
    const modal = document.getElementById('batchPrintModal');
    if (modal && e.target === modal) {
        closeBatchPrintModal();
    }
});

async function previewBatchCount() {
    const startDate = document.getElementById('batchStartDate').value;
    const endDate = document.getElementById('batchEndDate').value;
    const username = document.getElementById('batchUsername')?.value?.trim() || '';
    
    if (!startDate || !endDate) {
        showToast('⚠️ Please select both start and end dates', 'warning');
        return;
    }
    
    try {
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (username) params.append('username', username);

        const res  = await fetch(`/api/reports/batch-count?${params.toString()}`, { headers: MedAPI._getHeaders() });
        const data = await res.json();

        if (data && data.success) {
            document.getElementById('batchCountText').textContent = data.count;
            document.getElementById('batchPreviewCount').style.display = 'block';
            showToast(`📊 ${data.count} patient(s) found`, 'info', 3000);
        } else {
            showToast('❌ ' + (data?.message || 'Failed to get count'), 'error');
        }
    } catch(e) {
        console.error('Preview count error:', e);
        showToast('❌ Failed to check count: ' + e.message, 'error');
    }
}

async function generateBatchPDF() {
    const startDate = document.getElementById('batchStartDate').value;
    const endDate = document.getElementById('batchEndDate').value;
    
    // Get the logged-in user's FULL NAME
    const userStr = localStorage.getItem('meddqa_user');
    let fullName = '';
    let isAdmin = false;
    
    if (userStr) {
        try {
            const userData = JSON.parse(userStr);
            isAdmin = (userData.role === 'admin');
            
            if (isAdmin) {
                // Admin can type any name in the input field
                fullName = document.getElementById('batchUsername')?.value?.trim() || '';
            } else {
                // Non-admin: ALWAYS use their full name
                fullName = userData.full_name || '';
            }
        } catch(e) {
            fullName = userStr;
        }
    }
    
    console.log('📤 Full Name:', fullName);
    console.log('👑 Is Admin:', isAdmin);
    
    if (!fullName && !isAdmin) {
        showToast('⚠️ Cannot determine your identity. Please log in again.', 'warning');
        return;
    }
    
    showLoading('Generating Batch PDF...', 'This may take a moment');
    closeBatchPrintModal();
    try {
        await MedAPI.reports.downloadBatch(fullName || null, startDate, endDate);
        showToast('📄 Batch PDF opened for printing!', 'success', 5000);
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally { hideLoading(); }
}

function generateBatchPrintPDF(records) {
    // This function should handle the actual PDF generation
    console.log('Generating PDF for records:', records.length);
    
    // Example: Create a print window with all records
    const printWindow = window.open('', '_blank');
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>DQA Verification Report</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
                .header { text-align: center; margin-bottom: 30px; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>DQA Verification Report</h2>
                <p>Generated: ${new Date().toLocaleString()}</p>
                <p>Total Records: ${records.length}</p>
            </div>
            <button class="no-print" onclick="window.print()">Print Report</button>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Patient ID</th>
                        <th>Patient Name</th>
                        <th>Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    records.forEach((record, index) => {
        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${record.patient_id || record.id || 'N/A'}</td>
                <td>${record.patient_name || record.name || 'N/A'}</td>
                <td>${record.verified_date || record.date || 'N/A'}</td>
                <td>${record.status || 'Verified'}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
            <script>
                // Auto-print
                window.onload = function() {
                    setTimeout(() => window.print(), 500);
                }
            </script>
        </body>
        </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
}

async function checkExistingVerification(hospitalNumber) {
    try {
        const data = await MedAPI.review.start(hospitalNumber);

        if (data.success && data.workflow && data.workflow.previous_review) {
            const prev = data.workflow.previous_review;
            const isComplete = prev.is_complete || (prev.biodata && prev.biodata.length > 0);

            if (isComplete) {
                const printBtn = document.getElementById('btnPrintReport');
                if (printBtn) { printBtn.style.display = 'inline-flex'; printBtn.setAttribute('data-hn', hospitalNumber); }

                const reviewedBadge = document.getElementById('reviewedStatusBadge');
                if (reviewedBadge) reviewedBadge.style.display = 'block';

                const careCardBadge = document.getElementById('careCardBadge');
                if (careCardBadge) {
                    careCardBadge.innerHTML = '<i class="bi bi-check-circle-fill"></i> Reviewed';
                    careCardBadge.style.background = '#ecfdf5';
                    careCardBadge.style.color = '#059669';
                    careCardBadge.style.border = '1px solid #86efac';
                }

                const careCardTitle = document.getElementById('careCardTitle');
                if (careCardTitle) careCardTitle.textContent = '✓ Care Card Verified';
            }
        }
    } catch(e) {
        console.log('Verification check error:', e);
    }
}

async function editVLField(fieldName, currentValue, hospitalNumber, sampleDate) {
    if (!AppState.currentPatient) { showToast('No patient selected', 'error'); return; }
    
    const authorized = await requirePasskeyForEdit('modify VL data');
    if (!authorized) return;
    
    const labels = {
        'sample_collection_date': 'Sample Collection Date',
        'vl_result': 'VL Result',
        'result_date': 'Result Date'
    };
    
    let newValue;
    if (fieldName === 'sample_collection_date' || fieldName === 'result_date') {
        // Date input
        newValue = await showDatePicker(labels[fieldName], currentValue);
    } else {
        // Text input
        newValue = prompt(`Update ${labels[fieldName]}:\nCurrent: ${currentValue}\n\nEnter new value:`, currentValue);
    }
    
    if (!newValue || newValue === currentValue) return;
    
    showLoading('Updating VL Data...', `Setting ${labels[fieldName]} to ${newValue}`);
    try {
        const data = await MedAPI.vl.update(
            hospitalNumber,
            fieldName,
            newValue,
            sampleDate
        );
        if (!data.success) throw new Error(data.detail || 'Update failed');
        showToast(`✅ ${labels[fieldName]} updated!`, 'success');
        await searchPatient();
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally { hideLoading(); }
}

function showDatePicker(label, currentValue) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop-custom';
        backdrop.style.display = 'flex';
        backdrop.innerHTML = `
        <div onclick="event.stopPropagation()" style="background:white; border-radius:16px; padding:24px; width:90%; max-width:380px; text-align:center; box-shadow:0 20px 50px rgba(0,0,0,0.3);">
            <h6 style="font-weight:700; margin-bottom:4px;">Update ${label}</h6>
            <p style="color:#64748b; font-size:0.8rem; margin-bottom:16px;">Current: ${currentValue}</p>
            <input type="date" id="datePickerInput" value="${currentValue}" style="width:100%; padding:10px; border:2px solid #e2e8f0; border-radius:8px; font-size:0.9rem; margin-bottom:16px;">
            <div style="display:flex; gap:10px; justify-content:center;">
                <button class="btn btn-outline-secondary btn-sm" id="dateCancelBtn">Cancel</button>
                <button class="btn btn-primary btn-sm" id="dateConfirmBtn">Update</button>
            </div>
        </div>`;
        document.body.appendChild(backdrop);
        
        document.getElementById('dateConfirmBtn').addEventListener('click', () => {
            const val = document.getElementById('datePickerInput').value;
            backdrop.remove();
            resolve(val || null);
        });
        document.getElementById('dateCancelBtn').addEventListener('click', () => {
            backdrop.remove();
            resolve(null);
        });
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) { backdrop.remove(); resolve(null); }
        });
    });
}

async function deleteVLRecord(hospitalNumber, sampleDate) {
    if (!AppState.currentPatient) { showToast('No patient selected', 'error'); return; }
    
    const authorized = await requirePasskeyForEdit('delete VL record');
    if (!authorized) return;
    
    // Confirm deletion with a beautiful modal
    const confirmed = await showDeleteConfirmation(sampleDate);
    if (!confirmed) return;
    
    showLoading('Deleting VL Record...', `Removing VL dated ${sampleDate}`);
    try {
        const data = await MedAPI.vl.delete(hospitalNumber, sampleDate);
        if (!data.success) throw new Error(data.detail || 'Delete failed');
        showToast('🗑️ VL record deleted successfully!', 'success');
        await searchPatient();
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally { hideLoading(); }
}

function showDeleteConfirmation(sampleDate) {
    return new Promise((resolve) => {
        document.querySelectorAll('.modal-backdrop-custom').forEach(el => el.remove());
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop-custom';
        backdrop.style.display = 'flex';
        backdrop.innerHTML = `
        <div onclick="event.stopPropagation()" style="background:white; border-radius:20px; width:90%; max-width:420px; box-shadow:0 25px 60px rgba(0,0,0,0.3); overflow:hidden; animation: slideUp 0.3s ease;">
            <div style="background:linear-gradient(135deg, #fef2f2, #fff5f5); padding:28px 24px 20px; text-align:center; border-bottom:1px solid #fecaca;">
                <div style="width:56px; height:56px; border-radius:50%; background:linear-gradient(135deg, #fef2f2, #fee2e2); display:flex; align-items:center; justify-content:center; margin:0 auto 12px; font-size:1.8rem; color:#ef4444;">
                    <i class="bi bi-exclamation-triangle-fill"></i>
                </div>
                <h5 style="font-weight:800; color:#991b1b; margin:0;">Delete VL Record?</h5>
                <p style="color:#b91c1c; font-size:0.8rem; margin:6px 0 0;">
                    This will permanently delete the Viral Load record dated <strong>${sampleDate}</strong>
                </p>
                <p style="color:#dc2626; font-size:0.7rem; margin:4px 0 0;">
                    Sample Collection Date, Result, and Result Date will all be removed.
                </p>
            </div>
            <div style="padding:16px 24px; display:flex; gap:10px; justify-content:flex-end; background:#fafbff;">
                <button id="delCancelBtn" style="padding:10px 20px; border:2px solid #e2e8f0; border-radius:12px; background:white; font-weight:600; font-size:0.8rem; color:#64748b; cursor:pointer;">Cancel</button>
                <button id="delConfirmBtn" style="padding:10px 24px; border:none; border-radius:12px; background:linear-gradient(135deg, #ef4444, #dc2626); font-weight:700; font-size:0.8rem; color:white; cursor:pointer; box-shadow:0 4px 12px rgba(239,68,68,0.3);">
                    <i class="bi bi-trash me-1"></i> Delete Record
                </button>
            </div>
        </div>`;
        document.body.appendChild(backdrop);
        
        document.getElementById('delConfirmBtn').addEventListener('click', () => { backdrop.remove(); resolve(true); });
        document.getElementById('delCancelBtn').addEventListener('click', () => { backdrop.remove(); resolve(false); });
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { backdrop.remove(); resolve(false); } });
    });
}


// Add to window exports
window.deleteVLRecord = deleteVLRecord;
// ============================================================================
// WINDOW EXPORTS
// ============================================================================
window.editVLField = editVLField;
window.openBatchPrintModal = openBatchPrintModal;
window.closeBatchPrintModal = closeBatchPrintModal;
window.previewBatchCount = previewBatchCount;
window.generateBatchPDF = generateBatchPDF;
window.printVerificationReport = printVerificationReport;
window.logout = logout;
window.searchPatient = searchPatient;
window.resetAll = resetAll;
window.acquireLock = acquireLock;
window.resetApplication = resetApplication;
window.editField = editField;
window.editRefillField = editRefillField;
window.editDrugRegimen = editDrugRegimen;
window.editDrugDuration = editDrugDuration;
window.editArtStartDate = editArtStartDate;
window.editVitalHeight = editVitalHeight;
window.editVitalWeight = editVitalWeight;
window.clearAuthorization = clearAuthorization;
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
window.getRegimenDropdownOptions = getRegimenDropdownOptions;
window.getClassificationColor = getClassificationColor;
window.getClassificationIcon = getClassificationIcon;
window.getValidationBadge = getValidationBadge;
window.printVLResult = printVLResult;
window.openLabSettings = openLabSettings;
window.closeLabSettings = closeLabSettings;
window.saveLabSettings = saveLabSettings;
window.openUserManagement = openUserManagement;
window.closeUserManagement = closeUserManagement;
window.showAddUserForm = showAddUserForm;
window.saveNewUser = saveNewUser;
window.loadUsers = loadUsers;
window.openEditUser = openEditUser;
window.closeEditUser = closeEditUser;
window.saveEditUser = saveEditUser;
window.toggleEditPassword = toggleEditPassword;
window.deleteUser = deleteUser;
window.toggleReportsDropdown = toggleReportsDropdown;
window.downloadPharmacyReport = downloadPharmacyReport;
window.downloadVLReport = downloadVLReport;
window.startReviewWorkflow = startReviewWorkflow;
window.cancelReviewAndReset = cancelReviewAndReset;
window.nextReviewStep = nextReviewStep;
window.prevReviewStep = prevReviewStep;
window.onFieldMatchChange = onFieldMatchChange;
window.onBatchSelectChange = onBatchSelectChange;
window.completeReviewWorkflow = completeReviewWorkflow;
window.cancelReviewWorkflow = cancelReviewWorkflow;
window.getLineColor = getLineColor;
window.getRegimenOptions = getRegimenOptions;
window.printVerificationReport = printVerificationReport;
console.log('✅ MedDQA - Ready (Review Workflow Only)');
// ============================================================================
// MISSING FUNCTION STUBS — referenced throughout app.js but undefined
// ============================================================================

/**
 * _renderFieldDiscPanel — renders a small inline discrepancy-detail panel.
 * when a correction outcome is already recorded.
 * Called by renderFieldComparisonCard() when building previously-saved steps.
 *
 * @param {string} fieldName
 * @param {string} outcome  corrected_emr | corrected_carecard | corrected_both
 * @param {object} fieldDef
 * @returns {string}  HTML string
 */
function _renderFieldDiscPanel(fieldName, outcome, fieldDef) {
    const discType  = reviewState.discrepancyTypes?.[fieldName];
    const discNote  = reviewState.discrepancyNotes?.[fieldName];
    const ccVal     = reviewState.careCardValues?.[fieldName];
    const origEMR   = reviewState.originalEMRValues?.[fieldName];

    if (!discType && !ccVal) return '';

    const typeLabels = {
        incorrect_value:  'Incorrect Value',
        missing_emr:      'Missing in EMR',
        missing_carecard: 'Missing on Care Card',
        not_documented:   'Not Documented',
        unable_verify:    'Unable to Verify',
        lab_pending:      'Lab Result Pending',
        incomplete_records: 'Incomplete Records',
        unavailable:      'Info Unavailable',
        other:            'Other',
    };

    const outcomeColors = {
        corrected_emr:      { bg: '#eef2ff', border: '#c7d2fe', text: '#4338ca' },
        corrected_carecard: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
        corrected_both:     { bg: '#fdf2f8', border: '#fbcfe8', text: '#9d174d' },
    };
    const c = outcomeColors[outcome] || outcomeColors.corrected_emr;

    return `
    <div style="
        margin-top:10px;
        background:${c.bg};
        border:1px solid ${c.border};
        border-radius:10px;
        padding:10px 14px;
        font-size:0.72rem;
    ">
        <div style="font-weight:700;color:${c.text};margin-bottom:6px;">
            <i class="bi bi-flag-fill me-1"></i>Discrepancy Details
        </div>
        ${discType ? `<div style="color:#475569;margin-bottom:3px;"><strong>Reason:</strong> ${typeLabels[discType] || discType}</div>` : ''}
        ${ccVal    ? `<div style="color:#475569;margin-bottom:3px;"><strong>Care Card value:</strong> ${ccVal.length > 80 ? ccVal.substring(0,80)+'…' : ccVal}</div>` : ''}
        ${origEMR  ? `<div style="color:#475569;margin-bottom:3px;"><strong>Original EMR value:</strong> ${origEMR}</div>` : ''}
        ${discNote ? `<div style="color:#64748b;font-style:italic;"><i class="bi bi-chat-square-text me-1"></i>${discNote}</div>` : ''}
    </div>`;
}