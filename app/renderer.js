let appState = {
    profiles: [],
    settings: {
        proxies: [],
        subscriptions: [],
        api: { enabled: true, port: 23919 },
        ui: { activeView: 'home' }
    },
    runtime: { running: [] }
};

const toastEl = document.getElementById('toast');
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
const viewIds = ['home', 'create', 'proxies', 'api'];
const homeSearchInput = document.getElementById('homeSearchInput');
const profileForm = document.getElementById('profileForm');
const profileTableBody = document.getElementById('profileTableBody');
const proxyTableBody = document.getElementById('proxyTableBody');
const subscriptionList = document.getElementById('subscriptionList');
const fingerprintPreview = document.getElementById('fingerprintPreview');

let homeFilter = 'all';
let homeSearch = '';
let currentFingerprintDraft = {};

const launchProgressByProfileId = new Map();
const launchCleanupTimers = new Map();

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isBuiltInStartUrl(url) {
    const value = String(url || '').trim();
    if (!value) return true;
    if (value.includes('/app/startpage.html')) return true;
    return /^https?:\/\/127\.0\.0\.1:\d+\/dashboard(?:\?.*)?$/i.test(value);
}

function showToast(message) {
    toastEl.textContent = String(message || 'Unknown error');
    toastEl.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function setView(view) {
    const nextView = viewIds.includes(view) ? view : 'home';
    navButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === nextView));
    viewIds.forEach((id) => {
        document.getElementById(`view-${id}`).classList.toggle('active', id === nextView);
    });
    appState.settings.ui.activeView = nextView;
    window.xbrowser.saveSettings({ ui: { activeView: nextView } }).catch(() => {});
}

function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString();
}

function getProxyProtocol(proxy) {
    if (proxy.proxy?.type) return proxy.proxy.type.toUpperCase();
    if (proxy.url) return (proxy.url.split('://')[0] || 'UNK').toUpperCase();
    return 'UNK';
}

function getRunning(profileId) {
    return appState.runtime.running.find((item) => item.id === profileId);
}

function upsertLaunchProgress(profileId, patch) {
    const current = launchProgressByProfileId.get(profileId) || {};
    launchProgressByProfileId.set(profileId, { ...current, ...patch });
}

function clearLaunchProgress(profileId) {
    const timer = launchCleanupTimers.get(profileId);
    if (timer) {
        clearTimeout(timer);
        launchCleanupTimers.delete(profileId);
    }
    launchProgressByProfileId.delete(profileId);
}

function scheduleLaunchProgressCleanup(profileId, delayMs) {
    const currentTimer = launchCleanupTimers.get(profileId);
    if (currentTimer) {
        clearTimeout(currentTimer);
    }

    const timer = setTimeout(() => {
        launchCleanupTimers.delete(profileId);
        launchProgressByProfileId.delete(profileId);
        renderProfileTable();
    }, delayMs);

    launchCleanupTimers.set(profileId, timer);
}

function renderLaunchProgressInline(profileId) {
    const launchState = launchProgressByProfileId.get(profileId);
    if (!launchState) {
        return `<button class="small-btn" data-action="launch-profile" data-id="${profileId}">Launch</button>`;
    }

    const progress = Math.max(0, Math.min(100, Math.round(launchState.progress || 0)));
    const wrapClass = launchState.error ? 'launch-inline is-error' : 'launch-inline';
    const label = launchState.detail || (launchState.error ? 'Launch failed' : 'Launching');

    return `
        <div class="${wrapClass}">
            <div class="launch-inline-top">
                <span class="launch-inline-label">${label}</span>
                <span class="launch-inline-percent">${progress}%</span>
            </div>
            <div class="launch-inline-bar">
                <div class="launch-inline-fill" style="width:${progress}%"></div>
            </div>
        </div>
    `;
}

function renderStats() {
    document.getElementById('statProfiles').textContent = String(appState.profiles.length);
    document.getElementById('statProxies').textContent = String(appState.settings.proxies.length);
    document.getElementById('statRunning').textContent = String(appState.runtime.running.length);
    document.getElementById('sidebarRuntime').textContent = appState.runtime.mihomoReady
        ? `Mihomo ready · ${appState.runtime.running.length} running`
        : 'Mihomo missing';
    document.getElementById('topbarHint').textContent = appState.runtime.apiUrl
        ? `API ${appState.runtime.apiUrl}`
        : 'API disabled';
}

function renderProxySelect() {
    const select = document.getElementById('profileProxyId');
    const proxies = appState.settings.proxies || [];
    select.innerHTML = '<option value="">Direct connection</option>' + proxies.map((proxy) => {
        const latency = proxy.latency > 0 ? ` · ${proxy.latency}ms` : '';
        return `<option value="${proxy.id}">${proxy.name}${latency}</option>`;
    }).join('');
}

function renderProfilePreview() {
    const preview = {
        seed: currentFingerprintDraft.seed || 'new',
        presetId: currentFingerprintDraft.presetId || 'auto',
        userAgent: document.getElementById('profileUserAgent').value || 'auto',
        platform: document.getElementById('profilePlatform').value || 'Win32',
        language: document.getElementById('profileLanguage').value || 'auto',
        timezone: document.getElementById('profileTimezone').value || 'auto',
        hardwareConcurrency: document.getElementById('profileHardware').value || 'auto',
        deviceMemory: document.getElementById('profileMemory').value || 'auto',
        screen: `${document.getElementById('profileWidth').value || '?'} x ${document.getElementById('profileHeight').value || '?'}`,
        devicePixelRatio: currentFingerprintDraft.devicePixelRatio || 'auto',
        webglVendor: currentFingerprintDraft.webglVendor || 'auto',
        webglRenderer: currentFingerprintDraft.webglRenderer || 'auto'
    };
    fingerprintPreview.textContent = JSON.stringify(preview, null, 2);
}

function readOptionalNumber(elementId) {
    const raw = document.getElementById(elementId).value.trim();
    return raw ? Number(raw) : 0;
}

function captureFingerprintDraftFromForm() {
    const language = document.getElementById('profileLanguage').value.trim() || 'auto';
    const languages = language === 'auto'
        ? []
        : Array.from(new Set([language, language.split('-')[0]].filter(Boolean)));

    currentFingerprintDraft = {
        ...currentFingerprintDraft,
        platform: document.getElementById('profilePlatform').value,
        userAgent: document.getElementById('profileUserAgent').value.trim(),
        language,
        languages,
        timezone: document.getElementById('profileTimezone').value.trim() || 'auto',
        useProxyLocale: currentFingerprintDraft.useProxyLocale !== false,
        hardwareConcurrency: readOptionalNumber('profileHardware'),
        deviceMemory: readOptionalNumber('profileMemory'),
        screen: {
            width: readOptionalNumber('profileWidth'),
            height: readOptionalNumber('profileHeight')
        }
    };
}

function applyFingerprintToForm(fingerprint = {}) {
    currentFingerprintDraft = clone(fingerprint || {});

    document.getElementById('profilePlatform').value = fingerprint.platform || 'Win32';
    document.getElementById('profileUserAgent').value = fingerprint.userAgent || '';
    document.getElementById('profileLanguage').value = !fingerprint.language || fingerprint.language === 'auto'
        ? ''
        : fingerprint.language;
    document.getElementById('profileTimezone').value = !fingerprint.timezone || fingerprint.timezone === 'auto'
        ? ''
        : fingerprint.timezone;
    document.getElementById('profileHardware').value = fingerprint.hardwareConcurrency || '';
    document.getElementById('profileMemory').value = fingerprint.deviceMemory || '';
    document.getElementById('profileWidth').value = fingerprint.screen?.width || '';
    document.getElementById('profileHeight').value = fingerprint.screen?.height || '';

    renderProfilePreview();
}

async function randomizeFingerprintFields(overrides = {}) {
    const platform = overrides.platform || document.getElementById('profilePlatform').value || 'Win32';
    const fingerprint = await window.xbrowser.generateFingerprint({ platform });
    applyFingerprintToForm(fingerprint);
}

function fillProfileForm(profile = null) {
    document.getElementById('profileId').value = profile?.id || '';
    document.getElementById('profileName').value = profile?.name || '';
    document.getElementById('profileStartUrl').value = isBuiltInStartUrl(profile?.startUrl)
        ? ''
        : (profile?.startUrl || '');
    document.getElementById('profileProxyId').value = profile?.proxyId || '';
    document.getElementById('profileTags').value = Array.isArray(profile?.tags) ? profile.tags.join(', ') : '';
    document.getElementById('profileNotes').value = profile?.notes || '';
    applyFingerprintToForm(profile?.fingerprint || { platform: 'Win32' });
}

function getProfileStatus(profileId) {
    const runtime = getRunning(profileId);
    if (runtime) return '<span class="status-pill running">Running</span>';

    const launchState = launchProgressByProfileId.get(profileId);
    if (launchState?.error) return '<span class="status-pill stopped">Failed</span>';
    if (launchState) return '<span class="status-pill launching">Launching</span>';
    return '<span class="status-pill stopped">Stopped</span>';
}

function renderProfileActions(profileId) {
    return `
        <div class="profile-actions">
            <button class="small-btn" data-action="edit-profile" data-id="${profileId}">Edit</button>
            ${renderLaunchProgressInline(profileId)}
            <button class="small-btn" data-action="stop-profile" data-id="${profileId}">Stop</button>
            <button class="small-btn danger" data-action="delete-profile" data-id="${profileId}">Delete</button>
        </div>
    `;
}

function renderProfileTable() {
    const proxies = appState.settings.proxies || [];
    const filtered = appState.profiles.filter((profile) => {
        const isRunning = !!getRunning(profile.id);
        if (homeFilter === 'running' && !isRunning) return false;
        if (homeFilter === 'stopped' && isRunning) return false;
        if (!homeSearch) return true;

        const proxyName = proxies.find((item) => item.id === profile.proxyId)?.name || '';
        const text = [profile.name, profile.notes, proxyName, ...(profile.tags || [])]
            .join(' ')
            .toLowerCase();
        return text.includes(homeSearch);
    });

    if (!filtered.length) {
        profileTableBody.innerHTML = '<tr><td colspan="7">No profiles match the current filter.</td></tr>';
        return;
    }

    profileTableBody.innerHTML = filtered.map((profile, index) => {
        const runtime = getRunning(profile.id);
        if (runtime && launchProgressByProfileId.has(profile.id)) {
            clearLaunchProgress(profile.id);
        }

        const proxy = proxies.find((item) => item.id === profile.proxyId);
        return `
            <tr>
                <td>JHX-${String(index + 1).padStart(2, '0')}</td>
                <td>
                    <div class="profile-title">${profile.name}</div>
                    <div class="profile-meta">${isBuiltInStartUrl(profile.startUrl) ? 'Built-in start page' : (profile.startUrl || '-')}</div>
                </td>
                <td>${proxy ? proxy.name : 'Direct'}</td>
                <td>${(profile.tags || []).join(', ') || '-'}</td>
                <td>${formatDate(profile.lastOpenedAt || profile.createdAt)}</td>
                <td>${getProfileStatus(profile.id)}</td>
                <td>${renderProfileActions(profile.id)}</td>
            </tr>
        `;
    }).join('');
}

function renderProxyTable() {
    const proxies = appState.settings.proxies || [];
    if (!proxies.length) {
        proxyTableBody.innerHTML = '<tr><td colspan="6">No proxies imported yet.</td></tr>';
        return;
    }

    proxyTableBody.innerHTML = proxies.map((proxy) => `
        <tr>
            <td>${proxy.name}</td>
            <td>${getProxyProtocol(proxy)}</td>
            <td>${proxy.source === 'subscription' ? 'Subscription' : proxy.source === 'file' ? 'File' : 'Manual'}</td>
            <td>${proxy.latency > 0 ? `${proxy.latency}ms` : '-'}</td>
            <td>${formatDate(proxy.updatedAt)}</td>
            <td>
                <div class="proxy-actions">
                    <button class="small-btn" data-action="test-proxy" data-id="${proxy.id}">Test</button>
                    <button class="small-btn danger" data-action="delete-proxy" data-id="${proxy.id}">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderSubscriptions() {
    const subscriptions = appState.settings.subscriptions || [];
    if (!subscriptions.length) {
        subscriptionList.innerHTML = '<div class="sub-item">No subscriptions saved.</div>';
        return;
    }

    subscriptionList.innerHTML = subscriptions.map((subscription) => `
        <div class="sub-item">
            <div class="profile-top">
                <div>
                    <div class="profile-title">${subscription.name}</div>
                    <div class="profile-meta">${subscription.url}</div>
                </div>
            </div>
            <div class="profile-meta">Last updated: ${formatDate(subscription.lastUpdated)}</div>
            <div class="sub-actions">
                <button class="small-btn" data-action="refresh-subscription" data-id="${subscription.id}">Refresh</button>
                <button class="small-btn danger" data-action="delete-subscription" data-id="${subscription.id}">Delete</button>
            </div>
        </div>
    `).join('');
}

function renderApiPanel() {
    document.getElementById('apiEnabled').value = String(appState.settings.api.enabled);
    document.getElementById('apiPort').value = String(appState.settings.api.port);

    document.getElementById('apiStatusCard').innerHTML = `
        <div>Service: ${appState.settings.api.enabled ? 'Enabled' : 'Disabled'}</div>
        <div>Address: ${appState.runtime.apiUrl || '-'}</div>
        <div>MCP: ${appState.runtime.apiUrl ? `${appState.runtime.apiUrl}/mcp` : '-'}</div>
        <div>Mihomo: ${appState.runtime.mihomoReady ? appState.runtime.mihomoBinary : 'Missing, will be downloaded automatically'}</div>
    `;

    document.getElementById('apiDocs').textContent = [
        'GET  /api/status',
        'GET  /api/profiles',
        'POST /api/profiles',
        'POST /api/profiles/:id/open',
        'POST /api/profiles/:id/stop',
        'GET  /api/proxies',
        'GET  /mcp',
        '',
        'Current MCP entry is an HTTP info endpoint and can be extended later.'
    ].join('\n');
}

function renderAll() {
    renderStats();
    renderProxySelect();
    renderProfileTable();
    renderProxyTable();
    renderSubscriptions();
    renderApiPanel();
}

function collectProfilePayload() {
    captureFingerprintDraftFromForm();
    return {
        id: document.getElementById('profileId').value || undefined,
        name: document.getElementById('profileName').value.trim(),
        startUrl: document.getElementById('profileStartUrl').value.trim(),
        proxyId: document.getElementById('profileProxyId').value,
        tags: document.getElementById('profileTags').value.trim(),
        notes: document.getElementById('profileNotes').value.trim(),
        fingerprint: clone(currentFingerprintDraft)
    };
}

async function handleProfileActions(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const { action, id } = button.dataset;

    if (action === 'edit-profile') {
        const profile = appState.profiles.find((item) => item.id === id);
        fillProfileForm(profile);
        setView('create');
        return;
    }

    if (action === 'launch-profile') {
        const requestId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        upsertLaunchProgress(id, {
            requestId,
            progress: 0,
            detail: 'Preparing launch',
            error: false
        });
        renderProfileTable();
        await window.xbrowser.launchProfile(id, requestId);
        showToast('Profile launched.');
        return;
    }

    if (action === 'stop-profile') {
        await window.xbrowser.stopProfile(id);
        clearLaunchProgress(id);
        renderProfileTable();
        showToast('Profile stopped.');
        return;
    }

    if (action === 'delete-profile') {
        if (!window.confirm('Delete this profile?')) return;
        await window.xbrowser.deleteProfile(id);
        clearLaunchProgress(id);
        renderProfileTable();
        showToast('Profile deleted.');
        return;
    }

    if (action === 'test-proxy') {
        await window.xbrowser.testProxy(id);
        showToast('Proxy test finished.');
        return;
    }

    if (action === 'delete-proxy') {
        if (!window.confirm('Delete this proxy?')) return;
        await window.xbrowser.deleteProxy(id);
        showToast('Proxy deleted.');
        return;
    }

    if (action === 'refresh-subscription') {
        await window.xbrowser.refreshSubscription(id);
        showToast('Subscription refreshed.');
        return;
    }

    if (action === 'delete-subscription') {
        if (!window.confirm('Delete this subscription and its nodes?')) return;
        await window.xbrowser.deleteSubscription(id);
        showToast('Subscription deleted.');
    }
}

async function boot() {
    appState = await window.xbrowser.bootstrap();
    renderAll();

    const initialView = viewIds.includes(appState.settings.ui.activeView)
        ? appState.settings.ui.activeView
        : 'home';
    setView(initialView);

    fillProfileForm();
    await randomizeFingerprintFields();
}

profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = collectProfilePayload();
    if (!payload.name) {
        showToast('Profile name is required.');
        return;
    }

    await window.xbrowser.saveProfile(payload);
    fillProfileForm();
    await randomizeFingerprintFields();
    setView('home');
    showToast('Profile saved.');
});

document.getElementById('manualProxyForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = document.getElementById('manualProxyName').value.trim();
    const url = document.getElementById('manualProxyUrl').value.trim();
    if (!url) {
        showToast('Proxy URL is required.');
        return;
    }

    await window.xbrowser.addManualProxy({ name, url });
    document.getElementById('manualProxyName').value = '';
    document.getElementById('manualProxyUrl').value = '';
    showToast('Proxy added.');
});

document.getElementById('subscriptionForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = document.getElementById('subscriptionName').value.trim() || 'Subscription';
    const url = document.getElementById('subscriptionUrl').value.trim();
    if (!url) {
        showToast('Subscription URL is required.');
        return;
    }

    await window.xbrowser.importSubscription({ name, url });
    document.getElementById('subscriptionName').value = '';
    document.getElementById('subscriptionUrl').value = '';
    showToast('Subscription imported.');
});

document.getElementById('apiForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const enabled = document.getElementById('apiEnabled').value === 'true';
    const port = Number(document.getElementById('apiPort').value);
    await window.xbrowser.saveSettings({ api: { enabled, port } });
    showToast('API settings saved.');
});

document.getElementById('importProxyFileBtn').addEventListener('click', async () => {
    const result = await window.xbrowser.importProxyFile();
    if (!result?.canceled) {
        showToast(`Imported ${result.added} proxies.`);
    }
});

document.getElementById('openDataDirBtn').addEventListener('click', () => {
    window.xbrowser.openDataDir();
});

document.getElementById('resetFormBtn').addEventListener('click', async () => {
    fillProfileForm();
    await randomizeFingerprintFields();
});

document.getElementById('randomizeBtn').addEventListener('click', async () => {
    await randomizeFingerprintFields();
});

document.getElementById('profilePlatform').addEventListener('change', async () => {
    await randomizeFingerprintFields();
});

document.querySelectorAll('.preset-url-btn').forEach((button) => {
    button.addEventListener('click', () => {
        document.getElementById('profileStartUrl').value = button.dataset.url;
    });
});

document.getElementById('gotoCreateBtn').addEventListener('click', () => setView('create'));
document.getElementById('refreshHomeBtn').addEventListener('click', () => renderAll());

homeSearchInput.addEventListener('input', (event) => {
    homeSearch = event.target.value.trim().toLowerCase();
    renderProfileTable();
});

document.querySelectorAll('.tab-chip').forEach((button) => {
    button.addEventListener('click', () => {
        homeFilter = button.dataset.filter;
        document.querySelectorAll('.tab-chip').forEach((item) => item.classList.toggle('active', item === button));
        renderProfileTable();
    });
});

profileForm.addEventListener('input', () => {
    captureFingerprintDraftFromForm();
    renderProfilePreview();
});

navButtons.forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
});

document.body.addEventListener('click', (event) => {
    handleProfileActions(event).catch((error) => {
        const button = event.target.closest('[data-action="launch-profile"]');
        if (button?.dataset?.id) {
            upsertLaunchProgress(button.dataset.id, {
                progress: 0,
                detail: error.message || 'Launch failed',
                error: true
            });
            renderProfileTable();
            scheduleLaunchProgressCleanup(button.dataset.id, 1800);
        }
        showToast(error.message || 'Unexpected error');
    });
});

window.xbrowser.onStateUpdated((state) => {
    appState = state;
    renderAll();
});

window.xbrowser.onLaunchProgress((payload) => {
    if (!payload?.profileId) {
        return;
    }

    const current = launchProgressByProfileId.get(payload.profileId);
    if (current?.requestId && payload.requestId && current.requestId !== payload.requestId) {
        return;
    }

    upsertLaunchProgress(payload.profileId, {
        requestId: payload.requestId || current?.requestId || '',
        progress: payload.progress || 0,
        detail: payload.detail || '',
        error: !!payload.error
    });

    renderProfileTable();

    if (payload.done) {
        scheduleLaunchProgressCleanup(payload.profileId, payload.error ? 1800 : 400);
    }
});

boot().catch((error) => showToast(error.message || 'Bootstrap failed'));
