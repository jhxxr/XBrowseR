let appState = {
    profiles: [],
    settings: { proxies: [], subscriptions: [], api: { enabled: true, port: 23919 }, ui: { activeView: 'home' } },
    runtime: { running: [] }
};

const toastEl = document.getElementById('toast');
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
const viewIds = ['home', 'create', 'proxies', 'api'];
let homeFilter = 'all';
let homeSearch = '';
const launchProgressByProfileId = new Map();
const launchCleanupTimers = new Map();
const USER_AGENTS = {
    Win32: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
    ],
    MacIntel: [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
    ]
};

function isBuiltInStartUrl(url) {
    const value = String(url || '').trim();
    if (!value) return true;
    if (value.includes('/app/startpage.html')) return true;
    return /^https?:\/\/127\.0\.0\.1:\d+\/dashboard(?:\?.*)?$/i.test(value);
}

function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function setLaunchOverlayState() {}

function finishLaunchOverlay() {}

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

function scheduleLaunchProgressCleanup(profileId, delay) {
    const current = launchCleanupTimers.get(profileId);
    if (current) clearTimeout(current);
    const timer = setTimeout(() => {
        launchCleanupTimers.delete(profileId);
        launchProgressByProfileId.delete(profileId);
        renderProfileTable();
        syncLaunchProgressUI();
    }, delay);
    launchCleanupTimers.set(profileId, timer);
}

function renderLaunchProgress(profileId) {
    const launchState = launchProgressByProfileId.get(profileId);
    if (!launchState) {
        return `<button class="small-btn" data-action="launch-profile" data-id="${profileId}">鍚姩</button>`;
    }

    const progress = Math.max(0, Math.min(100, Math.round(launchState.progress || 0)));
    const wrapClass = launchState.error ? 'launch-inline is-error' : 'launch-inline';
    const label = launchState.detail || (launchState.error ? '鍚姩澶辫触' : '姝ｅ湪鍚姩');
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

function syncLaunchProgressUI() {
    const rows = Array.from(document.querySelectorAll('#profileTableBody tr'));
    for (const row of rows) {
        const launchButton = row.querySelector('[data-action="launch-profile"]');
        if (!launchButton) continue;

        const profileId = launchButton.dataset.id;
        const runtime = getRunning(profileId);
        const launchState = launchProgressByProfileId.get(profileId);
        const statusCell = row.children[5];

        if (runtime && launchState) {
            clearLaunchProgress(profileId);
        }

        const currentLaunchState = launchProgressByProfileId.get(profileId);
        if (!currentLaunchState) {
            continue;
        }

        if (statusCell) {
            statusCell.innerHTML = currentLaunchState.error
                ? '<span class="status-pill stopped">鍚姩澶辫触</span>'
                : '<span class="status-pill launching">鍚姩涓?/span>';
        }

        launchButton.outerHTML = renderLaunchProgress(profileId);
    }
}

function setView(view) {
    navButtons.forEach(button => button.classList.toggle('active', button.dataset.view === view));
    viewIds.forEach(id => {
        document.getElementById(`view-${id}`).classList.toggle('active', id === view);
    });
    appState.settings.ui.activeView = view;
    window.xbrowser.saveSettings({ ui: { activeView: view } }).catch(() => { });
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
    return appState.runtime.running.find(item => item.id === profileId);
}

function renderProxySelect() {
    const select = document.getElementById('profileProxyId');
    const proxies = appState.settings.proxies || [];
    select.innerHTML = '<option value="">不使用代理</option>' + proxies.map(proxy => {
        const latency = proxy.latency > 0 ? ` · ${proxy.latency}ms` : '';
        return `<option value="${proxy.id}">${proxy.name}${latency}</option>`;
    }).join('');
}

function renderStats() {
    document.getElementById('statProfiles').textContent = String(appState.profiles.length);
    document.getElementById('statProxies').textContent = String(appState.settings.proxies.length);
    document.getElementById('statRunning').textContent = String(appState.runtime.running.length);
    document.getElementById('sidebarRuntime').textContent = appState.runtime.mihomoReady
        ? `Mihomo 已就绪 · ${appState.runtime.running.length} 运行中`
        : '未发现 Mihomo 内核';
    document.getElementById('topbarHint').textContent = appState.runtime.apiUrl
        ? `API ${appState.runtime.apiUrl}`
        : 'API 未启用';
}

function renderProfilePreview() {
    const preview = {
        userAgent: document.getElementById('profileUserAgent').value,
        language: document.getElementById('profileLanguage').value || 'auto(ip)',
        timezone: document.getElementById('profileTimezone').value || 'auto(ip)',
        platform: document.getElementById('profilePlatform').value,
        hardwareConcurrency: document.getElementById('profileHardware').value || 'auto',
        deviceMemory: document.getElementById('profileMemory').value || 'auto',
        screen: `${document.getElementById('profileWidth').value || '?'} x ${document.getElementById('profileHeight').value || '?'}`
    };
    document.getElementById('fingerprintPreview').textContent = JSON.stringify(preview, null, 2);
}

function getUserAgentsForPlatform(platform) {
    return USER_AGENTS[platform] || USER_AGENTS.Win32;
}

function syncUserAgentToPlatform(force = false) {
    const platform = document.getElementById('profilePlatform').value;
    const userAgentInput = document.getElementById('profileUserAgent');
    const allKnown = [...USER_AGENTS.Win32, ...USER_AGENTS.MacIntel];
    if (force || !userAgentInput.value.trim() || allKnown.includes(userAgentInput.value.trim())) {
        const pool = getUserAgentsForPlatform(platform);
        userAgentInput.value = pool[Math.floor(Math.random() * pool.length)];
    }
}

function fillProfileForm(profile = null) {
    document.getElementById('profileId').value = profile?.id || '';
    document.getElementById('profileName').value = profile?.name || '';
    document.getElementById('profileStartUrl').value = isBuiltInStartUrl(profile?.startUrl) ? '' : (profile?.startUrl || '');
    document.getElementById('profilePlatform').value = profile?.fingerprint?.platform || 'Win32';
    document.getElementById('profileProxyId').value = profile?.proxyId || '';
    document.getElementById('profileUserAgent').value = profile?.fingerprint?.userAgent || '';
    document.getElementById('profileLanguage').value = !profile?.fingerprint?.language || profile.fingerprint.language === 'auto' ? '' : profile.fingerprint.language;
    document.getElementById('profileTimezone').value = !profile?.fingerprint?.timezone || profile.fingerprint.timezone === 'auto' ? '' : profile.fingerprint.timezone;
    document.getElementById('profileHardware').value = profile?.fingerprint?.hardwareConcurrency || '';
    document.getElementById('profileMemory').value = profile?.fingerprint?.deviceMemory || '';
    document.getElementById('profileWidth').value = profile?.fingerprint?.screen?.width || '';
    document.getElementById('profileHeight').value = profile?.fingerprint?.screen?.height || '';
    document.getElementById('profileTags').value = Array.isArray(profile?.tags) ? profile.tags.join(', ') : '';
    document.getElementById('profileNotes').value = profile?.notes || '';
    renderProfilePreview();
}

function randomizeFingerprintFields() {
    const languages = ['en-US', 'en-GB', 'zh-CN', 'zh-HK'];
    const timezones = ['UTC', 'Asia/Hong_Kong', 'Asia/Singapore', 'Europe/Amsterdam'];
    const resolutions = [
        [1366, 768],
        [1440, 900],
        [1536, 864],
        [1920, 1080]
    ];

    const pick = items => items[Math.floor(Math.random() * items.length)];
    const [width, height] = pick(resolutions);
    const platform = document.getElementById('profilePlatform').value;

    document.getElementById('profileUserAgent').value = pick(getUserAgentsForPlatform(platform));
    document.getElementById('profileLanguage').value = '';
    document.getElementById('profileTimezone').value = '';
    document.getElementById('profileHardware').value = String([4, 6, 8, 12][Math.floor(Math.random() * 4)]);
    document.getElementById('profileMemory').value = String([4, 8, 16][Math.floor(Math.random() * 3)]);
    document.getElementById('profileWidth').value = String(width);
    document.getElementById('profileHeight').value = String(height);
    renderProfilePreview();
}

function renderProfileTable() {
    const tbody = document.getElementById('profileTableBody');
    const proxies = appState.settings.proxies || [];
    const filtered = appState.profiles.filter(profile => {
        const isRunning = !!getRunning(profile.id);
        if (homeFilter === 'running' && !isRunning) return false;
        if (homeFilter === 'stopped' && isRunning) return false;
        if (!homeSearch) return true;
        const proxyName = proxies.find(item => item.id === profile.proxyId)?.name || '';
        const text = [profile.name, profile.notes, proxyName, ...(profile.tags || [])].join(' ').toLowerCase();
        return text.includes(homeSearch);
    });

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7">当前筛选结果为空。</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((profile, index) => {
        const runtime = getRunning(profile.id);
        const status = runtime ? '<span class="status-pill running">运行中</span>' : '<span class="status-pill stopped">未启动</span>';
        const proxy = proxies.find(item => item.id === profile.proxyId);
        return `
            <tr>
                <td>JHX-${String(index + 1).padStart(2, '0')}</td>
                <td>
                    <div class="profile-title">${profile.name}</div>
                    <div class="profile-meta">${isBuiltInStartUrl(profile.startUrl) ? '内置启动页' : profile.startUrl}</div>
                </td>
                <td>${proxy ? proxy.name : '直连'}</td>
                <td>${(profile.tags || []).join(', ') || '-'}</td>
                <td>${formatDate(profile.lastOpenedAt || profile.createdAt)}</td>
                <td>${status}</td>
                <td>
                    <div class="profile-actions">
                    <button class="small-btn" data-action="edit-profile" data-id="${profile.id}">编辑</button>
                    <button class="small-btn" data-action="launch-profile" data-id="${profile.id}">启动</button>
                    <button class="small-btn" data-action="stop-profile" data-id="${profile.id}">停止</button>
                    <button class="small-btn danger" data-action="delete-profile" data-id="${profile.id}">删除</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderProxyTable() {
    const tbody = document.getElementById('proxyTableBody');
    const proxies = appState.settings.proxies || [];
    if (!proxies.length) {
        tbody.innerHTML = '<tr><td colspan="6">当前没有导入代理节点。</td></tr>';
        return;
    }
    tbody.innerHTML = proxies.map(proxy => `
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
    const container = document.getElementById('subscriptionList');
    const subscriptions = appState.settings.subscriptions || [];
    if (!subscriptions.length) {
        container.innerHTML = '<div class="sub-item">当前没有订阅。</div>';
        return;
    }
    container.innerHTML = subscriptions.map(subscription => `
        <div class="sub-item">
            <div class="profile-top">
                <div>
                    <div class="profile-title">${subscription.name}</div>
                    <div class="profile-meta">${subscription.url}</div>
                </div>
            </div>
            <div class="profile-meta">上次更新：${formatDate(subscription.lastUpdated)}</div>
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
        <div>服务状态：${appState.settings.api.enabled ? '已开启' : '已关闭'}</div>
        <div>本地地址：${appState.runtime.apiUrl || '-'}</div>
        <div>MCP 入口：${appState.runtime.apiUrl ? `${appState.runtime.apiUrl}/mcp` : '-'}</div>
        <div>Mihomo 内核：${appState.runtime.mihomoReady ? appState.runtime.mihomoBinary : '未找到，请放入 /bin'}</div>
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
        '说明：当前 MCP 为 HTTP 说明端点，后续可继续扩展为正式 MCP transport。'
    ].join('\n');
}

function renderAll() {
    renderStats();
    renderProxySelect();
    renderProfileTable();
    syncLaunchProgressUI();
    renderProxyTable();
    renderSubscriptions();
    renderApiPanel();
}

function collectProfilePayload() {
    return {
        id: document.getElementById('profileId').value || undefined,
        name: document.getElementById('profileName').value.trim(),
        startUrl: document.getElementById('profileStartUrl').value.trim(),
        proxyId: document.getElementById('profileProxyId').value,
        tags: document.getElementById('profileTags').value.trim(),
        notes: document.getElementById('profileNotes').value.trim(),
        fingerprint: {
            platform: document.getElementById('profilePlatform').value,
            userAgent: document.getElementById('profileUserAgent').value.trim(),
            language: document.getElementById('profileLanguage').value.trim() || 'auto',
            timezone: document.getElementById('profileTimezone').value.trim() || 'auto',
            useProxyLocale: true,
            hardwareConcurrency: Number(document.getElementById('profileHardware').value || 0),
            deviceMemory: Number(document.getElementById('profileMemory').value || 0),
            screen: {
                width: Number(document.getElementById('profileWidth').value || 0),
                height: Number(document.getElementById('profileHeight').value || 0)
            }
        }
    };
}

async function handleProfileActions(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;

    if (action === 'edit-profile') {
        const profile = appState.profiles.find(item => item.id === id);
        fillProfileForm(profile);
        setView('create');
        return;
    }

    if (action === 'launch-profile') {
        const requestId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        upsertLaunchProgress(id, {
            requestId,
            progress: 0,
            detail: '鎻愪氦鍚姩璇锋眰',
            error: false
        });
        renderProfileTable();
        syncLaunchProgressUI();
        await window.xbrowser.launchProfile(id, requestId);
        showToast('窗口已启动');
        return;
    }

    if (action === 'stop-profile') {
        await window.xbrowser.stopProfile(id);
        showToast('窗口已停止');
        return;
    }

    if (action === 'delete-profile' && confirm('确定删除这个窗口环境吗？')) {
        await window.xbrowser.deleteProfile(id);
        showToast('窗口已删除');
        return;
    }

    if (action === 'test-proxy') {
        await window.xbrowser.testProxy(id);
        showToast('测速完成');
        return;
    }

    if (action === 'delete-proxy' && confirm('确定删除这个代理节点吗？')) {
        await window.xbrowser.deleteProxy(id);
        showToast('代理已删除');
        return;
    }

    if (action === 'refresh-subscription') {
        await window.xbrowser.refreshSubscription(id);
        showToast('订阅已刷新');
        return;
    }

    if (action === 'delete-subscription' && confirm('确定删除该订阅及其节点吗？')) {
        await window.xbrowser.deleteSubscription(id);
        showToast('订阅已删除');
    }
}

async function boot() {
    appState = await window.xbrowser.bootstrap();
    const initialView = viewIds.includes(appState.settings.ui.activeView) ? appState.settings.ui.activeView : 'home';
    setView(initialView);
    fillProfileForm();
    randomizeFingerprintFields();
    renderAll();
}

document.getElementById('profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = collectProfilePayload();
    if (!payload.name) {
        showToast('窗口名称不能为空');
        return;
    }
    await window.xbrowser.saveProfile(payload);
    fillProfileForm();
    randomizeFingerprintFields();
    setView('home');
    showToast('窗口已保存');
});

document.getElementById('manualProxyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('manualProxyName').value.trim();
    const url = document.getElementById('manualProxyUrl').value.trim();
    if (!url) {
        showToast('请填写节点链接');
        return;
    }
    await window.xbrowser.addManualProxy({ name, url });
    document.getElementById('manualProxyName').value = '';
    document.getElementById('manualProxyUrl').value = '';
    showToast('节点已添加');
});

document.getElementById('subscriptionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('subscriptionName').value.trim() || 'Subscription';
    const url = document.getElementById('subscriptionUrl').value.trim();
    if (!url) {
        showToast('请填写订阅地址');
        return;
    }
    await window.xbrowser.importSubscription({ name, url });
    document.getElementById('subscriptionName').value = '';
    document.getElementById('subscriptionUrl').value = '';
    showToast('订阅导入完成');
});

document.getElementById('apiForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const enabled = document.getElementById('apiEnabled').value === 'true';
    const port = Number(document.getElementById('apiPort').value);
    await window.xbrowser.saveSettings({ api: { enabled, port } });
    showToast('API 配置已保存');
});

document.getElementById('importProxyFileBtn').addEventListener('click', async () => {
    const result = await window.xbrowser.importProxyFile();
    if (!result?.canceled) showToast(`导入了 ${result.added} 个节点`);
});

document.getElementById('openDataDirBtn').addEventListener('click', () => {
    window.xbrowser.openDataDir();
});

document.getElementById('resetFormBtn').addEventListener('click', () => {
    fillProfileForm();
    randomizeFingerprintFields();
});

document.getElementById('randomizeBtn').addEventListener('click', () => {
    randomizeFingerprintFields();
});
document.getElementById('profilePlatform').addEventListener('change', () => {
    syncUserAgentToPlatform(true);
    renderProfilePreview();
});
document.querySelectorAll('.preset-url-btn').forEach(button => {
    button.addEventListener('click', () => {
        document.getElementById('profileStartUrl').value = button.dataset.url;
    });
});

document.getElementById('gotoCreateBtn').addEventListener('click', () => setView('create'));
document.getElementById('refreshHomeBtn').addEventListener('click', () => renderAll());
document.getElementById('homeSearchInput').addEventListener('input', (event) => {
    homeSearch = event.target.value.trim().toLowerCase();
    renderProfileTable();
    syncLaunchProgressUI();
});
document.querySelectorAll('.tab-chip').forEach(button => {
    button.addEventListener('click', () => {
        homeFilter = button.dataset.filter;
        document.querySelectorAll('.tab-chip').forEach(item => item.classList.toggle('active', item === button));
        renderProfileTable();
        syncLaunchProgressUI();
    });
});

document.getElementById('profileForm').addEventListener('input', renderProfilePreview);

navButtons.forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));

document.body.addEventListener('click', (event) => {
    handleProfileActions(event).catch(error => {
        const button = event.target.closest('[data-action="launch-profile"]');
        if (button?.dataset?.id) {
            upsertLaunchProgress(button.dataset.id, {
                progress: 0,
                detail: error.message,
                error: true
            });
            renderProfileTable();
            syncLaunchProgressUI();
            scheduleLaunchProgressCleanup(button.dataset.id, 1800);
        }
        showToast(error.message);
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

    const title = payload.profileName ? `正在启动 ${payload.profileName}` : '正在启动窗口';
    setLaunchOverlayState({
        visible: true,
        progress: payload.progress || 0,
        title,
        detail: payload.detail || '准备环境',
        error: !!payload.error
    });

    if (payload.done) {
        finishLaunchOverlay({
            error: !!payload.error,
            detail: payload.detail || ''
        });
    }
});

window.xbrowser.onLaunchProgress((payload) => {
    if (!payload?.profileId) {
        return;
    }

    const current = launchProgressByProfileId.get(payload.profileId);
    if (!current) {
        return;
    }
    if (payload.requestId && current.requestId && payload.requestId !== current.requestId) {
        return;
    }

    upsertLaunchProgress(payload.profileId, {
        requestId: payload.requestId || current.requestId || '',
        progress: payload.progress || 0,
        detail: payload.detail || '',
        error: !!payload.error
    });
    renderProfileTable();
    syncLaunchProgressUI();

    if (payload.done) {
        scheduleLaunchProgressCleanup(payload.profileId, payload.error ? 1800 : 400);
    }
});

boot().catch(error => showToast(error.message));
