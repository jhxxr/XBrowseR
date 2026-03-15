let appState = {
    profiles: [],
    settings: {
        proxies: [],
        subscriptions: [],
        api: { enabled: true, port: 23919 },
        agent: { providers: [], activeProviderId: '', toolTimeoutMs: 20000 },
        ui: { activeView: 'home' }
    },
    runtime: {
        running: [],
        providerFormats: [],
        agent: { running: false }
    }
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

const agentProviderForm = document.getElementById('agentProviderForm');
const agentProviderList = document.getElementById('agentProviderList');
const agentLaunchDialog = document.getElementById('agentLaunchDialog');
const agentLaunchForm = document.getElementById('agentLaunchForm');
const agentLaunchModelSelect = document.getElementById('agentLaunchModel');
const agentLaunchProfileSelect = document.getElementById('agentLaunchProfile');
const agentLaunchMessageInput = document.getElementById('agentLaunchMessage');
const agentComposerForm = document.getElementById('agentComposerForm');
const agentComposerInput = document.getElementById('agentComposerInput');
const sendAgentMessageBtn = document.getElementById('sendAgentMessageBtn');
const stopAgentBtn = document.getElementById('stopAgentBtn');
const closeAgentSessionBtn = document.getElementById('closeAgentSessionBtn');
const openAgentLaunchDialogBtn = document.getElementById('openAgentLaunchDialogBtn');
const closeAgentLaunchDialogBtn = document.getElementById('closeAgentLaunchDialogBtn');
const agentCurrentProviderEl = document.getElementById('agentCurrentProvider');
const agentRuntimeCard = document.getElementById('agentRuntimeCard');
const agentConversationList = document.getElementById('agentConversationList');
const agentActiveProviderBadge = document.getElementById('agentActiveProviderBadge');
const providerModelsHint = document.getElementById('providerModelsHint');
const agentFormatDocs = document.getElementById('agentFormatDocs');
const agentToolTimeoutInput = document.getElementById('agentToolTimeoutMs');
const agentProfileSelect = document.getElementById('agentProfileSelect');
const agentCurrentProviderInput = document.getElementById('agentCurrentProviderInput');
const agentLogList = document.getElementById('agentLogList');

let homeFilter = 'all';
let homeSearch = '';
let currentFingerprintDraft = {};
let agentDraftModels = [];
let agentLogs = [];

const launchProgressByProfileId = new Map();
const launchCleanupTimers = new Map();

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

function getProfileCode(profile) {
    const current = String(profile?.code || '').trim().toUpperCase();
    if (current) {
        return current.replace(/^JHX-/, '');
    }

    const fallback = String(profile?.id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (fallback) {
        return fallback.slice(0, 6);
    }

    return 'UNSET';
}

function getProxyProtocol(proxy) {
    if (proxy.proxy?.type) return proxy.proxy.type.toUpperCase();
    if (proxy.url) return (proxy.url.split('://')[0] || 'UNK').toUpperCase();
    return 'UNK';
}

function getRunning(profileId) {
    return appState.runtime.running.find((item) => item.id === profileId);
}

function getProviderFormats() {
    return appState.runtime.providerFormats || [];
}

function getAgentProviders() {
    return appState.settings.agent?.providers || [];
}

function getActiveProvider() {
    const activeId = appState.settings.agent?.activeProviderId || '';
    return getAgentProviders().find((item) => item.id === activeId) || getAgentProviders()[0] || null;
}

function getAgentToolTimeoutMs() {
    return Math.max(5000, Math.min(60000, Number(appState.settings.agent?.toolTimeoutMs) || 20000));
}

function getProviderFormatMeta(format) {
    return getProviderFormats().find((item) => item.value === format) || {
        value: format,
        label: format,
        defaultBaseUrl: ''
    };
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

function mountAgentSettingsFields() {
    const timeoutFieldWrap = agentToolTimeoutInput?.closest('.grid.two');
    const providerPanel = agentProviderForm?.closest('.panel');
    if (!timeoutFieldWrap || !providerPanel) {
        return;
    }
    if (providerPanel.querySelector('#agentGlobalSettingsCard')) {
        return;
    }

    const settingsCard = document.createElement('div');
    settingsCard.id = 'agentGlobalSettingsCard';
    settingsCard.className = 'agent-global-settings sub-list-wrap';
    settingsCard.innerHTML = `
        <div class="sub-list-title">Agent 全局设置</div>
        <div class="agent-setting-note">
            这些配置作用于整个 Agent 运行层，不绑定任何供应商。
        </div>
        <div class="form-actions">
            <button id="saveAgentSettingsBtn" type="button" class="ghost-btn">保存 Agent 设置</button>
        </div>
    `;

    const providerListWrap = providerPanel.querySelector('.sub-list-wrap');
    providerPanel.insertBefore(settingsCard, providerListWrap || null);
    settingsCard.insertBefore(timeoutFieldWrap, settingsCard.querySelector('.form-actions'));

    settingsCard.querySelector('#saveAgentSettingsBtn').addEventListener('click', async () => {
        const agentSettings = readAgentSettingsPayload();
        await window.xbrowser.saveSettings({ agent: agentSettings });
        showToast('Agent 全局设置已保存。');
    });
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
                <span class="launch-inline-label">${escapeHtml(label)}</span>
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

    if (appState.runtime.agent?.running) {
        document.getElementById('topbarHint').textContent = 'Agent 任务执行中';
        return;
    }

    document.getElementById('topbarHint').textContent = appState.runtime.activeProvider
        ? `Agent ${appState.runtime.activeProvider.name}`
        : (appState.runtime.apiUrl ? `API ${appState.runtime.apiUrl}` : 'API 未启用');
}

function renderProxySelect() {
    const select = document.getElementById('profileProxyId');
    const proxies = appState.settings.proxies || [];
    select.innerHTML = '<option value="">直连</option>' + proxies.map((proxy) => {
        const latency = proxy.latency > 0 ? ` · ${proxy.latency}ms` : '';
        return `<option value="${proxy.id}">${escapeHtml(proxy.name)}${latency}</option>`;
    }).join('');
}

function renderAgentProfileSelect() {
    const currentValue = agentProfileSelect.value;
    agentProfileSelect.innerHTML = appState.profiles.map((profile) => {
        const runtime = getRunning(profile.id);
        const suffix = runtime ? ' · 运行中' : ' · 可自动启动';
        return `<option value="${profile.id}">${escapeHtml(profile.name)}${suffix}</option>`;
    }).join('');

    if (!appState.profiles.length) {
        agentProfileSelect.innerHTML = '<option value="">暂无环境</option>';
        return;
    }

    agentProfileSelect.value = appState.profiles.some((item) => item.id === currentValue)
        ? currentValue
        : appState.profiles[0].id;
}

function getAgentRuntime() {
    return appState.runtime.agent || {
        running: false,
        sessionId: '',
        profileId: '',
        profileName: '',
        providerId: '',
        providerName: '',
        providerFormat: '',
        model: '',
        pageUrl: '',
        events: []
    };
}

function getAgentModelChoices() {
    return getAgentProviders()
        .filter((provider) => String(provider.model || '').trim())
        .map((provider) => ({
            value: provider.id,
            model: provider.model,
            providerName: provider.name || provider.model,
            format: provider.format || '',
            label: provider.name && provider.name !== provider.model
                ? `${provider.model} · ${provider.name}`
                : provider.model
        }));
}

function openAgentLaunchDialog() {
    renderAgentLaunchOptions();
    agentLaunchDialog.classList.remove('hidden');
}

function closeAgentLaunchDialog() {
    agentLaunchDialog.classList.add('hidden');
}

function renderAgentLaunchOptions() {
    const runtimeAgent = getAgentRuntime();
    const modelChoices = getAgentModelChoices();
    const currentModelValue = modelChoices.some((item) => item.value === agentLaunchModelSelect.value)
        ? agentLaunchModelSelect.value
        : (runtimeAgent.providerId || getActiveProvider()?.id || modelChoices[0]?.value || '');

    if (!modelChoices.length) {
        agentLaunchModelSelect.innerHTML = '<option value="">暂无可用模型</option>';
        agentLaunchModelSelect.value = '';
    } else {
        agentLaunchModelSelect.innerHTML = modelChoices.map((choice) => `
            <option value="${choice.value}">${escapeHtml(choice.label)}</option>
        `).join('');
        agentLaunchModelSelect.value = currentModelValue;
    }

    const currentProfileValue = appState.profiles.some((item) => item.id === agentLaunchProfileSelect.value)
        ? agentLaunchProfileSelect.value
        : (runtimeAgent.profileId || appState.profiles[0]?.id || '');

    if (!appState.profiles.length) {
        agentLaunchProfileSelect.innerHTML = '<option value="">暂无窗口</option>';
        agentLaunchProfileSelect.value = '';
    } else {
        agentLaunchProfileSelect.innerHTML = appState.profiles.map((profile) => {
            const runtime = getRunning(profile.id);
            const suffix = runtime ? ' · 已运行' : ' · 可自动启动';
            return `<option value="${profile.id}">${escapeHtml(profile.name)}${suffix}</option>`;
        }).join('');
        agentLaunchProfileSelect.value = currentProfileValue;
    }

    openAgentLaunchDialogBtn.disabled = !modelChoices.length || !appState.profiles.length;
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
            <button class="small-btn" data-action="clear-profile-cache" data-id="${profileId}">清缓存</button>
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

    profileTableBody.innerHTML = filtered.map((profile) => {
        const runtime = getRunning(profile.id);
        if (runtime && launchProgressByProfileId.has(profile.id)) {
            clearLaunchProgress(profile.id);
        }

        const proxy = proxies.find((item) => item.id === profile.proxyId);
        return `
            <tr>
                <td>${escapeHtml(getProfileCode(profile))}</td>
                <td>
                    <div class="profile-title">${escapeHtml(profile.name)}</div>
                    <div class="profile-meta">${escapeHtml(isBuiltInStartUrl(profile.startUrl) ? '内置检测页' : (profile.startUrl || '-'))}</div>
                </td>
                <td>${escapeHtml(proxy ? proxy.name : '直连')}</td>
                <td>${escapeHtml((profile.tags || []).join(', ') || '-')}</td>
                <td>${escapeHtml(formatDate(profile.lastOpenedAt || profile.createdAt))}</td>
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
            <td>${escapeHtml(proxy.name)}</td>
            <td>${escapeHtml(getProxyProtocol(proxy))}</td>
            <td>${escapeHtml(proxy.source === 'subscription' ? '订阅' : proxy.source === 'file' ? '文件' : '手动')}</td>
            <td>${proxy.latency > 0 ? `${proxy.latency}ms` : '-'}</td>
            <td>${escapeHtml(formatDate(proxy.updatedAt))}</td>
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
            <div>
                <div class="profile-title">${escapeHtml(subscription.name)}</div>
                <div class="profile-meta">${escapeHtml(subscription.url)}</div>
                <div class="profile-meta">最近更新：${escapeHtml(formatDate(subscription.lastUpdated))}</div>
            </div>
            <div class="sub-actions">
                <button class="small-btn" data-action="refresh-subscription" data-id="${subscription.id}">刷新</button>
                <button class="small-btn danger" data-action="delete-subscription" data-id="${subscription.id}">删除</button>
            </div>
        </div>
    `).join('');
}

function renderAgentModelOptions(provider = null) {
    const select = document.getElementById('agentProviderModel');
    const manualInput = document.getElementById('agentProviderManualModel');
    const models = Array.from(new Set((provider?.models || []).filter(Boolean)));
    agentDraftModels = clone(models);
    const currentModel = manualInput.value.trim() || provider?.model || '';

    const options = ['<option value="">请选择或手动输入</option>']
        .concat(models.map((modelId) => `<option value="${escapeHtml(modelId)}">${escapeHtml(modelId)}</option>`));
    select.innerHTML = options.join('');

    if (models.includes(currentModel)) {
        select.value = currentModel;
    } else {
        select.value = '';
        manualInput.value = currentModel;
    }
}

function fillAgentProviderForm(provider = null) {
    const format = provider?.format || getProviderFormats()[0]?.value || 'openai';
    const formatMeta = getProviderFormatMeta(format);

    document.getElementById('agentProviderId').value = provider?.id || '';
    document.getElementById('agentProviderName').value = provider?.name || '';
    document.getElementById('agentProviderFormat').value = format;
    document.getElementById('agentProviderBaseUrl').value = provider?.baseUrl || formatMeta.defaultBaseUrl || '';
    document.getElementById('agentProviderApiKey').value = provider?.apiKey || '';
    document.getElementById('agentProviderManualModel').value = provider?.model || '';
    renderAgentModelOptions(provider);
}

function readAgentProviderPayload() {
    const format = document.getElementById('agentProviderFormat').value;
    const selectModel = document.getElementById('agentProviderModel').value.trim();
    const manualModel = document.getElementById('agentProviderManualModel').value.trim();
    const editingProvider = getAgentProviders().find((item) => item.id === document.getElementById('agentProviderId').value);

    return {
        id: document.getElementById('agentProviderId').value || undefined,
        name: document.getElementById('agentProviderName').value.trim() || getProviderFormatMeta(format).label,
        format,
        baseUrl: document.getElementById('agentProviderBaseUrl').value.trim(),
        apiKey: document.getElementById('agentProviderApiKey').value.trim(),
        model: manualModel || selectModel,
        models: clone(editingProvider?.models?.length ? editingProvider.models : agentDraftModels)
    };
}

function readAgentSettingsPayload() {
    return {
        toolTimeoutMs: Math.max(5000, Math.min(60000, Number(agentToolTimeoutInput.value) || 20000))
    };
}

function renderAgentSettings() {
    if (agentToolTimeoutInput) {
        agentToolTimeoutInput.value = String(getAgentToolTimeoutMs());
    }
}

function renderAgentProviderList() {
    const providers = getAgentProviders();
    const activeProvider = getActiveProvider();

    if (!providers.length) {
        agentProviderList.innerHTML = '<div class="sub-item">尚未保存任何供应商配置。</div>';
        return;
    }

    agentProviderList.innerHTML = providers.map((provider) => {
        const isActive = provider.id === activeProvider?.id;
        return `
            <div class="agent-provider-item ${isActive ? 'is-active' : ''}">
                <div class="agent-provider-head">
                    <div>
                        <div class="agent-provider-title">${escapeHtml(provider.name)}</div>
                        <div class="agent-provider-meta">${escapeHtml(provider.baseUrl || '-')}</div>
                    </div>
                    <span class="provider-chip">${escapeHtml(provider.format)}</span>
                </div>
                <div class="provider-badge-row">
                    <span class="capability-chip">${escapeHtml(provider.model || '未选模型')}</span>
                    <span class="capability-chip">${provider.models?.length || 0} 个模型缓存</span>
                    ${isActive ? '<span class="capability-chip">默认配置</span>' : ''}
                </div>
                <div class="sub-actions">
                    <button class="small-btn" data-action="edit-agent-provider" data-id="${provider.id}">编辑</button>
                    <button class="small-btn" data-action="activate-agent-provider" data-id="${provider.id}">设为默认</button>
                    <button class="small-btn danger" data-action="delete-agent-provider" data-id="${provider.id}">删除</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderAgentRuntime() {
    const activeProvider = getActiveProvider();
    const runtimeAgent = appState.runtime.agent || { running: false };
    const selectedRuntime = getRunning(agentProfileSelect.value);

    agentActiveProviderBadge.textContent = activeProvider
        ? `${activeProvider.name} · ${activeProvider.format}`
        : '未配置供应商';
    agentCurrentProviderInput.value = activeProvider
        ? `${activeProvider.name} / ${activeProvider.model || '未选模型'}`
        : '';

    agentRuntimeCard.innerHTML = `
        <div class="agent-runtime-row"><span>默认供应商</span><strong>${escapeHtml(activeProvider?.name || '-')}</strong></div>
        <div class="agent-runtime-row"><span>当前模型</span><strong>${escapeHtml(activeProvider?.model || '-')}</strong></div>
        <div class="agent-runtime-row"><span>目标环境状态</span><strong>${escapeHtml(selectedRuntime ? '已运行' : '可自动启动')}</strong></div>
        <div class="agent-runtime-row"><span>调试端口</span><strong>${escapeHtml(selectedRuntime?.debugPort || '-')}</strong></div>
        <div class="agent-runtime-row"><span>Agent 状态</span><strong>${escapeHtml(runtimeAgent.running ? '执行中' : '空闲')}</strong></div>
    `;

    providerModelsHint.textContent = activeProvider
        ? `已缓存 ${activeProvider.models?.length || 0} 个模型，可继续手动补录`
        : '模型列表尚未拉取';

    const runDisabled = !activeProvider || !activeProvider.model || !appState.profiles.length || runtimeAgent.running;
    document.getElementById('runAgentBtn').disabled = runDisabled;
    document.getElementById('stopAgentBtn').disabled = !runtimeAgent.running;
}

function renderAgentLogs() {
    if (!agentLogs.length) {
        agentLogList.innerHTML = '<div class="sub-item">暂无日志。执行一次任务后会在这里显示模型决策和浏览器动作。</div>';
        return;
    }

    agentLogList.innerHTML = agentLogs.slice().reverse().map((entry) => {
        const levelClass = entry.level === 'error'
            ? 'is-error'
            : entry.level === 'final'
                ? 'is-final'
                : '';
        return `
            <div class="agent-log-item ${levelClass}">
                <div class="agent-log-meta">
                    <span>${escapeHtml(entry.level || 'info')}</span>
                    <span>${escapeHtml(formatDate(entry.createdAt))}</span>
                </div>
                <div class="agent-log-text">${escapeHtml(entry.message || '')}</div>
            </div>
        `;
    }).join('');
}

function renderAgentRuntime() {
    const activeProvider = getActiveProvider();
    const runtimeAgent = getAgentRuntime();
    const sessionProvider = getAgentProviders().find((item) => item.id === runtimeAgent.providerId) || activeProvider;
    const modelChoices = getAgentModelChoices();
    const hasSession = !!runtimeAgent.sessionId;
    const sessionProfileRuntime = runtimeAgent.profileId ? getRunning(runtimeAgent.profileId) : null;

    if (hasSession) {
        agentActiveProviderBadge.textContent = `会话中 · ${runtimeAgent.profileName || '未命名窗口'} · ${runtimeAgent.model || '-'}`;
    } else if (modelChoices.length) {
        agentActiveProviderBadge.textContent = `已配置 ${modelChoices.length} 个可用模型`;
    } else {
        agentActiveProviderBadge.textContent = '未配置可用模型';
    }

    agentCurrentProviderEl.innerHTML = hasSession
        ? `
            <div class="agent-provider-title">${escapeHtml(runtimeAgent.model || '-')}</div>
            <div class="agent-provider-meta">${escapeHtml(runtimeAgent.providerName || '-')} · ${escapeHtml(runtimeAgent.providerFormat || sessionProvider?.format || '-')}</div>
        `
        : (activeProvider
            ? `
                <div class="agent-provider-title">${escapeHtml(activeProvider.model || '未选择模型')}</div>
                <div class="agent-provider-meta">${escapeHtml(activeProvider.name || '-')} · ${escapeHtml(activeProvider.format || '-')}</div>
            `
            : '<div class="agent-provider-meta">先在左侧保存提供商与模型，然后再启动窗口会话。</div>');

    agentRuntimeCard.innerHTML = `
        <div class="agent-runtime-row"><span>会话状态</span><strong>${escapeHtml(runtimeAgent.running ? '执行中' : (hasSession ? '待命中' : '未启动'))}</strong></div>
        <div class="agent-runtime-row"><span>当前窗口</span><strong>${escapeHtml(runtimeAgent.profileName || '-')}</strong></div>
        <div class="agent-runtime-row"><span>模型</span><strong>${escapeHtml(runtimeAgent.model || activeProvider?.model || '-')}</strong></div>
        <div class="agent-runtime-row"><span>浏览器状态</span><strong>${escapeHtml(sessionProfileRuntime ? '已连接真实窗口' : (runtimeAgent.profileId ? '将自动拉起窗口' : '-'))}</strong></div>
        <div class="agent-runtime-row"><span>当前页面</span><strong>${escapeHtml(runtimeAgent.pageUrl || '-')}</strong></div>
    `;

    providerModelsHint.textContent = activeProvider
        ? `当前编辑配置已缓存 ${activeProvider.models?.length || 0} 个模型，可继续手动补充模型 ID。`
        : '模型列表尚未拉取';

    stopAgentBtn.disabled = !runtimeAgent.running;
    closeAgentSessionBtn.disabled = !hasSession;
    sendAgentMessageBtn.disabled = !hasSession || runtimeAgent.running;
    agentComposerInput.disabled = !hasSession || runtimeAgent.running;
    agentComposerInput.placeholder = hasSession
        ? (runtimeAgent.running ? 'Agent 正在执行，请等待或先停止当前操作。' : '继续告诉 Agent 你想让这个窗口做什么')
        : '先启动一个窗口 Agent 会话';
}

function renderAgentConversation() {
    const runtimeAgent = getAgentRuntime();
    const events = Array.isArray(runtimeAgent.events) ? runtimeAgent.events : [];

    if (!events.length) {
        agentConversationList.innerHTML = runtimeAgent.sessionId
            ? '<div class="sub-item">会话已建立。发送第一条消息，让 Agent 接管这个窗口。</div>'
            : '<div class="sub-item">这里会持续显示窗口会话中的对话、状态和浏览器操作记录。</div>';
        return;
    }

    agentConversationList.innerHTML = events.map((entry) => {
        let itemClass = 'is-status';
        let title = '状态';
        let body = entry.message || '';

        if (entry.kind === 'message' && entry.role === 'user') {
            itemClass = 'is-user';
            title = '你';
            body = entry.content || '';
        } else if (entry.kind === 'message' && entry.role === 'assistant') {
            itemClass = 'is-assistant';
            title = 'Agent';
            body = entry.content || '';
        } else if (entry.kind === 'tool') {
            title = '工具';
        } else if (entry.level === 'error') {
            itemClass = 'is-error';
        }

        return `
            <div class="agent-chat-item ${itemClass}">
                <div class="agent-log-meta">
                    <span>${escapeHtml(title)}</span>
                    <span>${escapeHtml(formatDate(entry.createdAt))}</span>
                </div>
                <div class="agent-log-text">${escapeHtml(body)}</div>
            </div>
        `;
    }).join('');

    agentConversationList.scrollTop = agentConversationList.scrollHeight;
}

function renderAgentDocs() {
    const formats = getProviderFormats();
    agentFormatDocs.innerHTML = formats.map((item) => `
        <div class="sub-item">
            <div>
                <div class="profile-title">${escapeHtml(item.label)}</div>
                <div class="profile-meta">${escapeHtml(item.value)} · 默认地址：${escapeHtml(item.defaultBaseUrl)}</div>
            </div>
        </div>
    `).join('');
}

function renderAgentPanel() {
    openAgentLaunchDialogBtn.textContent = '打开 Agent 窗口';
    renderAgentSettings();
    renderAgentLaunchOptions();
    renderAgentProviderList();
    renderAgentRuntime();
    renderAgentConversation();
    renderAgentDocs();

    const currentId = document.getElementById('agentProviderId').value;
    const editing = getAgentProviders().find((item) => item.id === currentId);
    if (!currentId || !editing) {
        fillAgentProviderForm(getActiveProvider());
    } else {
        fillAgentProviderForm(editing);
    }
}

function renderAll() {
    renderStats();
    renderProxySelect();
    renderProfileTable();
    renderProxyTable();
    renderSubscriptions();
    renderAgentPanel();
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

async function handleBodyActions(event) {
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

    if (action === 'clear-profile-cache') {
        if (!window.confirm('确定清空这个环境的浏览器缓存吗？这不会删除 Cookie、LocalStorage 和指纹配置。')) return;
        const result = await window.xbrowser.clearProfileCache(id);
        const cleared = Number(result?.cleared || 0);
        showToast(cleared > 0 ? `已清理 ${cleared} 个缓存目录。` : '没有可清理的缓存目录。');
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
        return;
    }

    if (action === 'edit-agent-provider') {
        const provider = getAgentProviders().find((item) => item.id === id);
        fillAgentProviderForm(provider);
        return;
    }

    if (action === 'activate-agent-provider') {
        await window.xbrowser.setActiveAgentProvider(id);
        showToast('默认供应商已切换。');
        return;
    }

    if (action === 'delete-agent-provider') {
        if (!window.confirm('确定删除这个供应商配置吗？')) return;
        await window.xbrowser.deleteAgentProvider(id);

        const editingId = document.getElementById('agentProviderId').value;
        if (editingId === id) {
            fillAgentProviderForm(getActiveProvider());
        }

        showToast('供应商配置已删除。');
    }
}

async function boot() {
    appState = await window.xbrowser.bootstrap();
    mountAgentSettingsFields();
    renderAll();

    const initialView = viewIds.includes(appState.settings.ui.activeView)
        ? appState.settings.ui.activeView
        : 'home';
    setView(initialView);

    fillProfileForm();
    fillAgentProviderForm(getActiveProvider());
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

agentProviderForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = readAgentProviderPayload();
    if (!payload.apiKey) {
        showToast('API Key 不能为空。');
        return;
    }
    if (!payload.baseUrl) {
        showToast('Base URL 不能为空。');
        return;
    }

    const provider = await window.xbrowser.saveAgentProvider(payload);
    fillAgentProviderForm(provider);
    showToast('供应商配置已保存。');
});

document.getElementById('newAgentProviderBtn').addEventListener('click', () => {
    fillAgentProviderForm(null);
});

document.getElementById('fetchModelsBtn').addEventListener('click', async () => {
    const payload = readAgentProviderPayload();
    if (!payload.apiKey || !payload.baseUrl) {
        showToast('请先填写 Base URL 和 API Key。');
        return;
    }

    const models = await window.xbrowser.fetchAgentModels(payload);
    const mergedProvider = {
        ...payload,
        models,
        model: payload.model
    };
    renderAgentModelOptions(mergedProvider);
    providerModelsHint.textContent = `已获取 ${models.length} 个模型`;
    showToast(`已获取 ${models.length} 个模型。`);
});

document.getElementById('setDefaultProviderBtn').addEventListener('click', async () => {
    let providerId = document.getElementById('agentProviderId').value;
    if (!providerId) {
        const payload = readAgentProviderPayload();
        const saved = await window.xbrowser.saveAgentProvider({ ...payload, setActive: true });
        providerId = saved.id;
        fillAgentProviderForm(saved);
    }
    await window.xbrowser.setActiveAgentProvider(providerId);
    showToast('默认供应商已设置。');
});

document.getElementById('deleteProviderBtn').addEventListener('click', async () => {
    const providerId = document.getElementById('agentProviderId').value;
    if (!providerId) {
        fillAgentProviderForm(null);
        return;
    }
    if (!window.confirm('确定删除这个供应商配置吗？')) return;
    await window.xbrowser.deleteAgentProvider(providerId);
    fillAgentProviderForm(getActiveProvider());
    showToast('供应商配置已删除。');
});

document.getElementById('agentProviderFormat').addEventListener('change', (event) => {
    const formatMeta = getProviderFormatMeta(event.target.value);
    document.getElementById('agentProviderBaseUrl').value = formatMeta.defaultBaseUrl || '';
    document.getElementById('agentProviderManualModel').value = '';
    renderAgentModelOptions({ format: event.target.value, models: [], model: '' });
});

document.getElementById('agentProviderModel').addEventListener('change', (event) => {
    document.getElementById('agentProviderManualModel').value = event.target.value || '';
});

document.getElementById('agentTaskForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const profileId = agentProfileSelect.value;
    const prompt = document.getElementById('agentTaskPrompt').value.trim();
    if (!profileId) {
        showToast('请先创建或选择环境。');
        return;
    }
    if (!prompt) {
        showToast('请输入任务描述。');
        return;
    }

    await window.xbrowser.runAgentTask({ profileId, prompt });
    showToast('Agent 任务已提交。');
});

document.getElementById('stopAgentBtn').addEventListener('click', async () => {
    await window.xbrowser.stopAgentTask();
});

document.getElementById('clearAgentLogBtn').addEventListener('click', () => {
    agentLogs = [];
    renderAgentLogs();
});

openAgentLaunchDialogBtn.addEventListener('click', () => {
    window.xbrowser.openAgentWindow();
});

closeAgentLaunchDialogBtn.addEventListener('click', () => {
    closeAgentLaunchDialog();
});

agentLaunchDialog.addEventListener('click', (event) => {
    if (event.target === agentLaunchDialog) {
        closeAgentLaunchDialog();
    }
});

agentLaunchForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const providerId = agentLaunchModelSelect.value;
    const profileId = agentLaunchProfileSelect.value;
    const initialMessage = agentLaunchMessageInput.value.trim();

    if (!providerId) {
        showToast('请先选择一个可用模型。');
        return;
    }

    if (!profileId) {
        showToast('请选择要接管的窗口。');
        return;
    }

    await window.xbrowser.startAgentSession({
        providerId,
        profileId,
        initialMessage
    });

    agentLaunchMessageInput.value = '';
    closeAgentLaunchDialog();
    showToast('Agent 会话已启动。');
});

agentComposerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const message = agentComposerInput.value.trim();
    if (!message) {
        showToast('消息不能为空。');
        return;
    }

    await window.xbrowser.sendAgentSessionMessage({ message });
    agentComposerInput.value = '';
});

closeAgentSessionBtn.addEventListener('click', async () => {
    if (!window.confirm('确定结束当前 Agent 会话吗？会话记录会被清空，但不会关闭真实浏览器窗口。')) return;
    await window.xbrowser.closeAgentSession();
    agentComposerInput.value = '';
    showToast('Agent 会话已结束。');
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
    handleBodyActions(event).catch((error) => {
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

window.xbrowser.onAgentEvent((payload) => {
    if (payload?.kind === 'status' && payload.level === 'error') {
        console.error('[agent-event]', payload.message || payload);
    }
});

boot().catch((error) => showToast(error.message || '初始化失败'));
