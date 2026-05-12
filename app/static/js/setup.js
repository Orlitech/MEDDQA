// Setup Wizard JavaScript
let currentStep = 1;
let emrConnectionOk = false;

document.addEventListener('DOMContentLoaded', function() {
    // Check if already configured
    checkSetupStatus();
});

async function checkSetupStatus() {
    try {
        const response = await fetch('/api/setup/status');
        const data = await response.json();
        
        if (data.configured) {
            // Already configured, redirect to app
            window.location.href = '/';
        }
    } catch (error) {
        console.log('Setup required');
    }
}

function updateProgress(step) {
    currentStep = step;
    
    // Update steps
    for (let i = 1; i <= 3; i++) {
        const stepEl = document.getElementById(`step${i}`);
        stepEl.classList.remove('active', 'completed');
        
        if (i < step) {
            stepEl.classList.add('completed');
            stepEl.querySelector('.step-circle').innerHTML = '<i class="bi bi-check"></i>';
        } else if (i === step) {
            stepEl.classList.add('active');
        }
    }
    
    // Update progress line
    const progressWidth = (step - 1) * 50;
    document.getElementById('progressLine').style.width = `${progressWidth}%`;
    
    // Show/hide sections
    for (let i = 1; i <= 3; i++) {
        const section = document.getElementById(`section${i}`);
        if (i === step) {
            section.classList.add('active');
        } else {
            section.classList.remove('active');
        }
    }
}

function nextStep(currentStepNum) {
    if (currentStepNum === 1) {
        // Validate EMR fields
        const host = document.getElementById('emrHost').value.trim();
        const dbname = document.getElementById('emrDbname').value.trim();
        const user = document.getElementById('emrUser').value.trim();
        const password = document.getElementById('emrPassword').value.trim();
        
        if (!host || !dbname || !user || !password) {
            showToast('Please fill in all EMR database fields', 'error');
            // Highlight empty fields
            highlightEmptyFields(['emrHost', 'emrPort', 'emrDbname', 'emrUser', 'emrPassword']);
            return;
        }
        
        if (!emrConnectionOk) {
            showToast('Please test the EMR connection first', 'warning');
            return;
        }
    }
    
    updateProgress(currentStepNum + 1);
}

function prevStep(currentStepNum) {
    updateProgress(currentStepNum - 1);
}

async function testEMRConnection() {
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner me-2"></span>Testing...';
    
    const statusDiv = document.getElementById('emrStatus');
    statusDiv.className = 'connection-status loading';
    statusDiv.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Testing connection...';
    
    const data = {
        host: document.getElementById('emrHost').value.trim(),
        port: document.getElementById('emrPort').value.trim(),
        dbname: document.getElementById('emrDbname').value.trim(),
        user: document.getElementById('emrUser').value.trim(),
        password: document.getElementById('emrPassword').value.trim()
    };
    
    try {
        const response = await fetch('/api/setup/test-emr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            statusDiv.className = 'connection-status success';
            statusDiv.innerHTML = `
                <i class="bi bi-check-circle me-2"></i>
                ${result.message}
                ${result.details?.is_emr_database ? '<br><small>✓ EMR tables detected</small>' : '<br><small>⚠ No EMR tables found - check database name</small>'}
            `;
            emrConnectionOk = true;
            
            // Mark all fields as success
            markFieldsSuccess(['emrHost', 'emrPort', 'emrDbname', 'emrUser', 'emrPassword']);
        } else {
            statusDiv.className = 'connection-status error';
            statusDiv.innerHTML = `<i class="bi bi-x-circle me-2"></i>${result.message}`;
            emrConnectionOk = false;
        }
    } catch (error) {
        statusDiv.className = 'connection-status error';
        statusDiv.innerHTML = `<i class="bi bi-x-circle me-2"></i>Connection failed: ${error.message}`;
        emrConnectionOk = false;
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function toggleDQACredentials() {
    const useSame = document.getElementById('useSameCredentials').checked;
    const dqaCredentials = document.getElementById('dqaCredentials');
    
    if (useSame) {
        dqaCredentials.style.display = 'none';
        // Clear DQA specific fields
        document.getElementById('dqaHost').value = '';
        document.getElementById('dqaPort').value = '';
        document.getElementById('dqaUser').value = '';
        document.getElementById('dqaPassword').value = '';
    } else {
        dqaCredentials.style.display = 'block';
    }
}

async function saveAndComplete() {
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner me-2"></span>Saving Configuration...';
    
    const useSameCredentials = document.getElementById('useSameCredentials').checked;
    
    const config = {
        emr_host: document.getElementById('emrHost').value.trim(),
        emr_port: document.getElementById('emrPort').value.trim(),
        emr_dbname: document.getElementById('emrDbname').value.trim(),
        emr_user: document.getElementById('emrUser').value.trim(),
        emr_password: document.getElementById('emrPassword').value.trim(),
        
        dqa_host: useSameCredentials ? document.getElementById('emrHost').value.trim() : document.getElementById('dqaHost').value.trim(),
        dqa_port: useSameCredentials ? document.getElementById('emrPort').value.trim() : document.getElementById('dqaPort').value.trim(),
        dqa_dbname: document.getElementById('dqaDbname').value.trim(),
        dqa_user: useSameCredentials ? document.getElementById('emrUser').value.trim() : document.getElementById('dqaUser').value.trim(),
        dqa_password: useSameCredentials ? document.getElementById('emrPassword').value.trim() : document.getElementById('dqaPassword').value.trim(),
    };
    
    try {
        const response = await fetch('/api/setup/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Show completion screen
            updateProgress(3);
            
            // Display summary
            const summary = document.getElementById('setupSummary');
            summary.innerHTML = `
                <div class="mb-2"><strong>EMR Database:</strong></div>
                <div class="ms-3 mb-3">
                    <div>📍 ${config.emr_host}:${config.emr_port}</div>
                    <div>📦 ${config.emr_dbname}</div>
                    <div>👤 ${config.emr_user}</div>
                </div>
                <div class="mb-2"><strong>DQA Database:</strong></div>
                <div class="ms-3">
                    <div>📍 ${config.dqa_host}:${config.dqa_port}</div>
                    <div>📦 ${config.dqa_dbname} <span class="badge bg-success">New</span></div>
                    <div>👤 ${config.dqa_user}</div>
                </div>
            `;
            
            showToast('Setup completed successfully!', 'success');
        } else {
            showToast(result.message || 'Setup failed', 'error');
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function goToApplication() {
    window.location.href = '/';
}

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'bi bi-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'bi bi-eye';
    }
}

function highlightEmptyFields(fieldIds) {
    fieldIds.forEach(id => {
        const field = document.getElementById(id);
        if (!field.value.trim()) {
            field.classList.add('error');
            setTimeout(() => field.classList.remove('error'), 2000);
        }
    });
}

function markFieldsSuccess(fieldIds) {
    fieldIds.forEach(id => {
        const field = document.getElementById(id);
        field.classList.add('success');
    });
}

function showToast(message, type = 'info') {
    // Remove existing toasts
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    
    const colors = {
        success: 'bg-success text-white',
        error: 'bg-danger text-white',
        warning: 'bg-warning text-dark',
        info: 'bg-info text-white'
    };
    
    const icons = {
        success: 'bi-check-circle',
        error: 'bi-x-circle',
        warning: 'bi-exclamation-triangle',
        info: 'bi-info-circle'
    };
    
    toast.innerHTML = `
        <div class="toast show ${colors[type]}" role="alert">
            <div class="toast-body d-flex align-items-center gap-2">
                <i class="bi ${icons[type]} fs-5"></i>
                ${message}
            </div>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.5s ease forwards';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}