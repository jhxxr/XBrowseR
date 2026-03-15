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
    toastEl.textContent = String(message || '未知错误');
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
        return `<button class="small-btn" data-action="launch-profile" data-id="${profileId}">启动</button>`;
    }

    const progress = Math.max(0, Math.min(100, Math.round(launchState.progress || 0)));
    const wrapClass = launchState.error ? 'launch-inline is-error' : 'launch-inline';
    const label = launchState.detail || (launchState.error ? '启动失败' : '启动中');

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
        ? `Mihomo 已就绪 · 运行中 ${appState.runtime.running.length} 个`
        : 'Mihomo 内核缺失';
    document.getElementById('topbarHint').textContent = appState.runtime.apiUrl
        ? `API ${appState.runtime.apiUrl}`
        : 'API 未启用';
}

function renderProxySelect() {
    const select = document.getElementById('profileProxyId');
    const proxies = appState.settings.proxies || [];
    select.innerHTML = '<option value="">直连</option>' + proxies.map((proxy) => {
        const latency = proxy.latency > 0 ? ` · ${proxy.latency}ms` : '';
        return `<option value="${proxy.id}">${proxy.name}${latency}</option>`;
    }).join('');
}

function renderProfilePreview() {
    const preview = {
        种子: currentFingerprintDraft.seed || '新建',
        设备预设: currentFingerprintDraft.presetId || '自动',
        UserAgent: document.getElementById('profileUserAgent').value || '自动',
        平台: document.getElementById('profilePlatform').value || 'Win32',
        语言: document.getElementById('profileLanguage').value || '自动',
        时区: document.getElementById('profileTimezone').value || '自动',
        CPU线程: document.getElementById('profileHardware').value || '自动',
        内存GB: document.getElementById('profileMemory').value || '自动',
        屏幕: `${document.getElementById('profileWidth').value || '?'} x ${document.getElementById('profileHeight').value || '?'}`,
        缩放比: currentFingerprintDraft.devicePixelRatio || '自动',
        WebGL厂商: currentFingerprintDraft.webglVendor || '自动',
        WebGL渲染器: currentFingerprintDraft.webglRenderer || '自动'
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
    if (runtime) return '<span class="status-pill running">运行中</span>';

    const launchState = launchProgressByProfileId.get(profileId);
    if (launchState?.error) return '<span class="status-pill stopped">失败</span>';
    if (launchState) return '<span class="status-pill launching">启动中</span>';
    return '<span class="status-pill stopped">未启动</span>';
}

function renderProfileActions(profileId) {
    return `
        <div class="profile-actions">
            <button class="small-btn" data-action="edit-profile" data-id="${profileId}">编辑</button>
            ${renderLaunchProgressInline(profileId)}
            <button class="small-btn" data-action="stop-profile" data-id="${profileId}">停止</button>
            <button class="small-btn danger" data-action="delete-profile" data-id="${profileId}">删除</button>
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
        profileTableBody.innerHTML = '<tr><td colspan="7">当前筛选条件下没有环境。</td></tr>';
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
                    <div class="profile-meta">${isBuiltInStartUrl(profile.startUrl) ? '内置检测页' : (profile.startUrl || '-')}</div>
                </td>
                <td>${proxy ? proxy.name : '直连'}</td>
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
        proxyTableBody.innerHTML = '<tr><td colspan="6">当前还没有导入任何代理。</td></tr>';
        return;
    }

    proxyTableBody.innerHTML = proxies.map((proxy) => `
        <tr>
            <td>${proxy.name}</td>
            <td>${getProxyProtocol(proxy)}</td>
            <td>${proxy.source === 'subscription' ? '订阅' : proxy.source === 'file' ? '文件' : '手动'}</td>
            <td>${proxy.latency > 0 ? `${proxy.latency}ms` : '-'}</td>
            <td>${formatDate(proxy.updatedAt)}</td>
            <td>
                <div class="proxy-actions">
                    <button class="small-btn" data-action="test-proxy" data-id="${proxy.id}">测速</button>
                    <button class="small-btn danger" data-action="delete-proxy" data-id="${proxy.id}">删除</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderSubscriptions() {
    const subscriptions = appState.settings.subscriptions || [];
    if (!subscriptions.length) {
        subscriptionList.innerHTML = '<div class="sub-item">当前没有已保存的订阅。</div>';
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
            <div class="profile-meta">最近更新：${formatDate(subscription.lastUpdated)}</div>
            <div class="sub-actions">
                <button class="small-btn" data-action="refresh-subscription" data-id="${subscription.id}">刷新</button>
                <button class="small-btn danger" data-action="delete-subscription" data-id="${subscription.id}">删除</button>
            </div>
        </div>
    `).join('');
}

function renderApiPanel() {
    document.getElementById('apiEnabled').value = String(appState.settings.api.enabled);
    document.getElementById('apiPort').value = String(appState.settings.api.port);

    document.getElementById('apiStatusCard').innerHTML = `
        <div>服务状态：${appState.settings.api.enabled ? '已启用' : '已关闭'}</div>
        <div>服务地址：${appState.runtime.apiUrl || '-'}</div>
        <div>MCP 地址：${appState.runtime.apiUrl ? `${appState.runtime.apiUrl}/mcp` : '-'}</div>
        <div>Mihomo：${appState.runtime.mihomoReady ? appState.runtime.mihomoBinary : '缺失，启动时会自动下载'}</div>
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
        '当前 MCP 入口是 HTTP 信息端点，后续可以继续扩展。'
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
            detail: '准备启动',
            error: false
        });
        renderProfileTable();
        await window.xbrowser.launchProfile(id, requestId);
        showToast('环境已启动。');
        return;
    }

    if (action === 'stop-profile') {
        await window.xbrowser.stopProfile(id);
        clearLaunchProgress(id);
        renderProfileTable();
        showToast('环境已停止。');
        return;
    }

    if (action === 'delete-profile') {
        if (!window.confirm('确定删除这个环境吗？')) return;
        await window.xbrowser.deleteProfile(id);
        clearLaunchProgress(id);
        renderProfileTable();
        showToast('环境已删除。');
        return;
    }

    if (action === 'test-proxy') {
        await window.xbrowser.testProxy(id);
        showToast('代理测速完成。');
        return;
    }

    if (action === 'delete-proxy') {
        if (!window.confirm('确定删除这个代理吗？')) return;
        await window.xbrowser.deleteProxy(id);
        showToast('代理已删除。');
        return;
    }

    if (action === 'refresh-subscription') {
        await window.xbrowser.refreshSubscription(id);
        showToast('订阅已刷新。');
        return;
    }

    if (action === 'delete-subscription') {
        if (!window.confirm('确定删除这个订阅以及其下所有节点吗？')) return;
        await window.xbrowser.deleteSubscription(id);
        showToast('订阅已删除。');
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
        showToast('环境名称不能为空。');
        return;
    }

    await window.xbrowser.saveProfile(payload);
    fillProfileForm();
    await randomizeFingerprintFields();
    setView('home');
    showToast('环境已保存。');
});

document.getElementById('manualProxyForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = document.getElementById('manualProxyName').value.trim();
    const url = document.getElementById('manualProxyUrl').value.trim();
    if (!url) {
        showToast('代理链接不能为空。');
        return;
    }

    await window.xbrowser.addManualProxy({ name, url });
    document.getElementById('manualProxyName').value = '';
    document.getElementById('manualProxyUrl').value = '';
    showToast('代理已添加。');
});

document.getElementById('subscriptionForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = document.getElementById('subscriptionName').value.trim() || '订阅';
    const url = document.getElementById('subscriptionUrl').value.trim();
    if (!url) {
        showToast('订阅地址不能为空。');
        return;
    }

    await window.xbrowser.importSubscription({ name, url });
    document.getElementById('subscriptionName').value = '';
    document.getElementById('subscriptionUrl').value = '';
    showToast('订阅导入完成。');
});

document.getElementById('apiForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const enabled = document.getElementById('apiEnabled').value === 'true';
    const port = Number(document.getElementById('apiPort').value);
    await window.xbrowser.saveSettings({ api: { enabled, port } });
    showToast('API 设置已保存。');
});

document.getElementById('importProxyFileBtn').addEventListener('click', async () => {
    const result = await window.xbrowser.importProxyFile();
    if (!result?.canceled) {
        showToast(`已导入 ${result.added} 个代理。`);
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
                detail: error.message || '启动失败',
                error: true
            });
            renderProfileTable();
            scheduleLaunchProgressCleanup(button.dataset.id, 1800);
        }
        showToast(error.message || '发生未知错误');
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

boot().catch((error) => showToast(error.message || '初始化失败'));
