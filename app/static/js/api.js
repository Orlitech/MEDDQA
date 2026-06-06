/**
 * MedDQA API Client  (api.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all HTTP calls.
 * app.js imports helpers from here instead of calling fetch() inline.
 *
 * Drop-in compatible with the existing app.js — exposes the same function
 * signatures that were previously scattered as raw fetch() calls throughout
 * the file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Internal helpers ────────────────────────────────────────────────────────

const TIMEOUT_MS = 30_000;

function _getHeaders(extra = {}) {
    const token    = localStorage.getItem('meddqa_token')    || '';
    const userStr  = localStorage.getItem('meddqa_user')     || '';
    let   userName = '';
    try   { userName = JSON.parse(userStr).full_name || JSON.parse(userStr).username || ''; }
    catch { userName = userStr; }

    return {
        'Content-Type':    'application/json',
        'X-Session-Token': token,
        'X-User':          userName,
        ...extra,
    };
}

async function _request(method, path, body = null, extraHeaders = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const opts = {
            method,
            headers: _getHeaders(extraHeaders),
            signal: controller.signal,
        };
        if (body !== null) opts.body = JSON.stringify(body);

        const res  = await fetch(path, opts);
        clearTimeout(timer);

        // Binary (PDF / Excel) — return a { blob, filename, ok } object
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/pdf') ||
            ct.includes('application/vnd') ||
            ct.includes('text/csv') ||
            ct.includes('application/octet-stream')) {
            const blob       = await res.blob();
            const disp       = res.headers.get('content-disposition') || '';
            const nameMatch  = disp.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            const filename   = nameMatch ? nameMatch[1].replace(/['"]/g, '') : 'download';
            return { blob, filename, ok: res.ok, status: res.status };
        }

        const data = await res.json();

        if (!res.ok) {
            const msg = data?.detail || data?.message || `HTTP ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            err.data   = data;
            throw err;
        }

        return data;
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
            const e = new Error('Request timed out');
            e.status = 408;
            throw e;
        }
        throw err;
    }
}

const _get  = (path, h)         => _request('GET',    path, null, h);
const _post = (path, body, h)   => _request('POST',   path, body, h);
const _put  = (path, body, h)   => _request('PUT',    path, body, h);
const _del  = (path, h)         => _request('DELETE', path, null, h);

/** Trigger a browser file-save from a Blob returned by the API. */
function _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
}


// ─── Patients ────────────────────────────────────────────────────────────────

const MedAPI_Patients = {
    /**
     * Search for a patient by hospital number.
     * @returns {Promise<{success:boolean, data:object}>}
     */
    search(hospitalNumber) {
        return _get(`/api/patients/search/${encodeURIComponent(hospitalNumber.trim().toUpperCase())}`);
    },

    /**
     * Update a single field on a patient or refill record.
     * @param {string} hospitalNumber
     * @param {string} fieldName
     * @param {string} newValue
     * @param {'patient'|'refill'} recordType
     * @param {string|null} recordId
     */
    update(hospitalNumber, fieldName, newValue, recordType = 'patient', recordId = null) {
        return _put('/api/patients/update', {
            hospital_number: hospitalNumber,
            field_name:      fieldName,
            new_value:       newValue,
            record_type:     recordType,
            record_id:       recordId,
        });
    },

    /**
     * Lock a patient record for editing.
     * @param {string} hospitalNumber
     */
    lock(hospitalNumber) {
        return _post(`/api/patients/${encodeURIComponent(hospitalNumber)}/lock`);
    },

    /**
     * Validate ART start date against first pharmacy pickup.
     * @param {string} hospitalNumber
     * @param {string} artStartDate  (YYYY-MM-DD)
     */
    validateArtStart(hospitalNumber, artStartDate) {
        return _post(
            `/api/patients/${encodeURIComponent(hospitalNumber)}/validate-art-start`,
            { art_start_date: artStartDate },
        );
    },
};



// ─── Viral Load ───────────────────────────────────────────────────────────────
const MedAPI_VL = {
    /**
     * Update a Viral Load field.
     * @param {string} hospitalNumber
     * @param {string} fieldName
     * @param {string} newValue
     * @param {string} sampleDate
     */
    update(hospitalNumber, fieldName, newValue, sampleDate) {
        return _put('/api/patients/update-vl', {
            hospital_number: hospitalNumber,
            field_name: fieldName,
            new_value: newValue,
            sample_date: sampleDate
        });
    },

    /**
     * Open a VL result as a PDF in a new browser tab.
     * @param {string} hospitalNumber
     * @param {string} sampleDate
     * @returns {Promise<{blob:Blob, filename:string}>}
     */
    async printResult(hospitalNumber, sampleDate) {
        const result = await _get(
            `/api/vl/print/${encodeURIComponent(hospitalNumber)}/${encodeURIComponent(sampleDate)}`
        );
        return result; // { blob, filename, ok }
    },

    /**
     * Delete a VL record.
     * @param {string} hospitalNumber
     * @param {string} sampleDate
     */
    delete(hospitalNumber, sampleDate) {
        return _del(
            `/api/vl/${encodeURIComponent(hospitalNumber)}/${encodeURIComponent(sampleDate)}`
        );
    },
};


// ─── Reports ──────────────────────────────────────────────────────────────────

const MedAPI_Reports = {
    /**
     * Download the pharmacy DQA report as an Excel file.
     * @param {string|null} startDate  YYYY-MM-DD or empty
     * @param {string|null} endDate    YYYY-MM-DD or empty
     */
    async downloadPharmacy(startDate, endDate) {
        const qs  = new URLSearchParams();
        if (startDate) qs.set('start_date', startDate);
        if (endDate)   qs.set('end_date',   endDate);
        const result = await _get(`/api/reports/pharmacy/excel${qs.toString() ? '?' + qs : ''}`);
        if (result.blob) {
            _download(result.blob, result.filename || `MedDQA_Report_${_today()}.xlsx`);
        }
        return result;
    },

    /**
     * Download the viral load report as an Excel file.
     * @param {string|null} startDate
     * @param {string|null} endDate
     */
    async downloadVL(startDate, endDate) {
        const qs = new URLSearchParams();
        if (startDate) qs.set('start_date', startDate);
        if (endDate)   qs.set('end_date',   endDate);
        const result = await _get(`/api/reports/viral-load/excel${qs.toString() ? '?' + qs : ''}`);
        if (result.blob) {
            _download(result.blob, result.filename || `VL_Report_${_today()}.xlsx`);
        }
        return result;
    },

    /**
     * Open a single-patient DQA verification report PDF in a new tab.
     * @param {string} hospitalNumber
     */
    async printVerification(hospitalNumber) {
        const result = await _get(`/api/reports/dqa-verification/${encodeURIComponent(hospitalNumber)}`);
        if (result.blob) {
            const url = URL.createObjectURL(result.blob);
            window.open(url, '_blank');
        }
        return result;
    },

    /**
     * Download the batch DQA verification report as a single PDF.
     * @param {string|null} username
     * @param {string|null} startDate
     * @param {string|null} endDate
     */
    async downloadBatch(username, startDate, endDate) {
        const qs = new URLSearchParams();
        if (username)  qs.set('username',   username);
        if (startDate) qs.set('start_date', startDate);
        if (endDate)   qs.set('end_date',   endDate);
        const result = await _get(
            `/api/reports/dqa-verification-batch${qs.toString() ? '?' + qs : ''}`
        );
        if (result.blob) {
            _download(result.blob, result.filename || `DQA_Batch_Report_${_today()}.pdf`);
        }
        return result;
    },
};


// ─── Auth ─────────────────────────────────────────────────────────────────────

const MedAPI_Auth = {
    /**
     * Verify a passkey and return role + authorised_by.
     * @param {string} passkey
     */
    verifyPasskey(passkey) {
        return _post('/api/auth/verify-passkey', { passkey });
    },
};


// ─── Review ───────────────────────────────────────────────────────────────────

const MedAPI_Review = {
    /**
     * Start a review workflow for a patient.
     * @param {string} hospitalNumber
     */
    start(hospitalNumber) {
        return _get(`/api/review/start/${encodeURIComponent(hospitalNumber)}`);
    },

    /**
     * Save a completed review.
     * @param {object} payload
     */
    complete(payload) {
        return _post('/api/review/complete', payload);
    },

    /**
     * Check whether a patient already has a saved verification.
     * @param {string} hospitalNumber
     */
    checkVerification(hospitalNumber) {
        return _get(`/api/review/verification/${encodeURIComponent(hospitalNumber)}`);
    },
};


// ─── Lab Settings ─────────────────────────────────────────────────────────────

const MedAPI_Lab = {
    getSettings() {
        return _get('/api/lab/settings');
    },
    saveSettings(settings) {
        return _put('/api/lab/settings', settings);
    },
};


// ─── Users ────────────────────────────────────────────────────────────────────

const MedAPI_Users = {
    list() {
        return _get('/api/users');
    },
    create(userData) {
        return _post('/api/users', userData);
    },
    update(id, userData) {
        return _put(`/api/users/${id}`, userData);
    },
    delete(id) {
        return _del(`/api/users/${id}`);
    },
};


// ─── Team ─────────────────────────────────────────────────────────────────────

const MedAPI_Team = {
    activeUsers() {
        return _get('/api/team/active-users');
    },
};


// ─── Reference ────────────────────────────────────────────────────────────────

const MedAPI_Reference = {
    regimens() {
        return _get('/api/reference/regimens');
    },
};


// ─── Setup ────────────────────────────────────────────────────────────────────

const MedAPI_Setup = {
    status() {
        return _get('/api/setup/status');
    },
    reset() {
        return _post('/api/setup/reset');
    },
};


// ─── Unified namespace ────────────────────────────────────────────────────────

/**
 * MedAPI — single access point for all server calls.
 *
 * Usage (from app.js or any inline script):
 *   const data = await MedAPI.patients.search('H001234');
 *   await MedAPI.reports.downloadPharmacy('2025-01-01', '2025-06-01');
 */
window.MedAPI = {
    patients:  MedAPI_Patients,
    vl:        MedAPI_VL,
    reports:   MedAPI_Reports,
    auth:      MedAPI_Auth,
    review:    MedAPI_Review,
    lab:       MedAPI_Lab,
    users:     MedAPI_Users,
    team:      MedAPI_Team,
    reference: MedAPI_Reference,
    setup:     MedAPI_Setup,

    /** Low-level helpers exposed for edge cases */
    _download,
    _getHeaders,
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function _today() {
    return new Date().toISOString().split('T')[0];
}
