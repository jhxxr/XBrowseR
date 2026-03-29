function createEmptyAgentRuntimeState() {
    return window.xbrowser?.getEmptyAgentRuntimeState?.() || {
        running: false,
        mode: 'idle',
        sessionId: '',
        profileId: '',
        profileName: '',
        providerId: '',
        providerName: '',
        providerFormat: '',
        model: '',
        pageUrl: '',
        events: [],
        batch: {
            running: false,
            stopRequested: false,
            jobId: '',
            providerId: '',
            providerName: '',
            providerFormat: '',
            model: '',
            prompt: '',
            concurrency: 1,
            maxRetries: 0,
            failureStrategy: 'skip',
            currentTaskId: '',
            exportFilePath: '',
            exportedAt: 0,
            counts: {
                total: 0,
                queued: 0,
                running: 0,
                success: 0,
                error: 0,
                stopped: 0,
                completed: 0
            },
            tasks: []
        }
    };
}

function createEmptySyncRuntimeState() {
    return {
        id: '',
        masterProfileId: '',
        slaveProfileIds: [],
        eventTypes: ['navigation', 'click', 'input'],
        running: false,
        startedAt: null,
        lastEvent: null,
        counts: {
            total: 0,
            success: 0,
            error: 0
        },
        slaves: [],
        events: []
    };
}

function createEmptyUpdaterState() {
    return {
        supported: false,
        enabled: false,
        status: 'idle',
        currentVersion: '',
        availableVersion: '',
        downloadedVersion: '',
        releaseName: '',
        releaseDate: '',
        progress: 0,
        bytesPerSecond: 0,
        transferred: 0,
        total: 0,
        checkedAt: 0,
        downloadedAt: 0,
        canRestartToUpdate: false,
        message: '',
        error: ''
    };
}

function createEmptyBrowserRuntimeState() {
    return {
        source: 'official-chromium-snapshots',
        sourceName: 'Official Chromium Snapshots',
        loading: false,
        refreshedAt: 0,
        latestVersion: '',
        available: [],
        error: '',
        activeVersion: '',
        activeLabel: '',
        activePath: '',
        binary: '',
        installDir: '',
        installed: []
    };
}

let appState = {
    profiles: [],
    templates: [],
    accounts: [],
    settings: {
        projects: [],
        proxies: [],
        subscriptions: [],
        browser: { source: 'official-chromium-snapshots', activeVersion: '' },
        api: { enabled: true, port: 23919 },
        agent: { providers: [], activeProviderId: '', toolTimeoutMs: 20000, maxExecutionSteps: 10 },
        ui: { activeView: 'home', homeProjectId: 'all' }
    },
    runtime: {
        running: [],
        providerFormats: [],
        browser: createEmptyBrowserRuntimeState(),
        agent: createEmptyAgentRuntimeState(),
        sync: createEmptySyncRuntimeState(),
        updater: createEmptyUpdaterState()
    }
};

const toastEl = document.getElementById('toast');
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
const viewIds = ['home', 'create', 'proxies', 'extensions', 'accounts', 'trash', 'api', 'sync'];
const homeSearchInput = document.getElementById('homeSearchInput');
const homeProjectFilterSelect = document.getElementById('homeProjectFilter');
const batchProxyIdSelect = document.getElementById('batchProxyId');
const batchBindProxyBtn = document.getElementById('batchBindProxyBtn');
const batchMoveProjectIdSelect = document.getElementById('batchMoveProjectId');
const batchMoveBtn = document.getElementById('batchMoveBtn');
const clearProfileSelectionBtn = document.getElementById('clearProfileSelectionBtn');
const selectAllProfilesInput = document.getElementById('selectAllProfiles');
const profileForm = document.getElementById('profileForm');
const profileTableBody = document.getElementById('profileTableBody');
const trashTableBody = document.getElementById('trashTableBody');
const proxyTableBody = document.getElementById('proxyTableBody');
const proxyCountryFilterSelect = document.getElementById('proxyCountryFilter');
const proxyCityFilterSelect = document.getElementById('proxyCityFilter');
const proxyLatencyFilterSelect = document.getElementById('proxyLatencyFilter');
const proxyAllocationModeSelect = document.getElementById('proxyAllocationMode');
const refreshProxyGeoBtn = document.getElementById('refreshProxyGeoBtn');
const allocateProxyBtn = document.getElementById('allocateProxyBtn');
const extensionTableBody = document.getElementById('extensionTableBody');
const subscriptionList = document.getElementById('subscriptionList');
const fingerprintPreview = document.getElementById('fingerprintPreview');
const fingerprintSummaryList = document.getElementById('fingerprintSummaryList');
const templateSelect = document.getElementById('templateSelect');
const templateNameInput = document.getElementById('templateName');
const templateNotesInput = document.getElementById('templateNotes');
const applyTemplateBtn = document.getElementById('applyTemplateBtn');
const saveTemplateBtn = document.getElementById('saveTemplateBtn');
const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');
const resetTemplateBtn = document.getElementById('resetTemplateBtn');
const batchCreateCountInput = document.getElementById('batchCreateCount');
const batchCreatePrefixInput = document.getElementById('batchCreatePrefix');
const batchCreateProxyModeSelect = document.getElementById('batchCreateProxyMode');
const batchCreateInheritTagsInput = document.getElementById('batchCreateInheritTags');
const batchCreateRandomizeFingerprintInput = document.getElementById('batchCreateRandomizeFingerprint');
const batchCreateBtn = document.getElementById('batchCreateBtn');
const profileProjectIdSelect = document.getElementById('profileProjectId');
const projectEditorIdSelect = document.getElementById('projectEditorId');
const projectNameInput = document.getElementById('projectName');
const projectColorInput = document.getElementById('projectColor');
const projectNotesInput = document.getElementById('projectNotes');
const saveProjectBtn = document.getElementById('saveProjectBtn');
const deleteProjectBtn = document.getElementById('deleteProjectBtn');
const resetProjectBtn = document.getElementById('resetProjectBtn');
const profileExtensionList = document.getElementById('profileExtensionList');
const importExtensionBtn = document.getElementById('importExtensionBtn');
const importCrxExtensionBtn = document.getElementById('importCrxExtensionBtn');
const accountForm = document.getElementById('accountForm');
const accountTableBody = document.getElementById('accountTableBody');
const accountProfileIdSelect = document.getElementById('accountProfileId');
const resetAccountBtn = document.getElementById('resetAccountBtn');
const syncMasterProfileIdSelect = document.getElementById('syncMasterProfileId');
const syncEventTypeList = document.getElementById('syncEventTypeList');
const syncSlaveProfileList = document.getElementById('syncSlaveProfileList');
const syncRuntimeCard = document.getElementById('syncRuntimeCard');
const syncSlaveTableBody = document.getElementById('syncSlaveTableBody');
const syncEventLog = document.getElementById('syncEventLog');
const startSyncBtn = document.getElementById('startSyncBtn');
const stopSyncBtn = document.getElementById('stopSyncBtn');
const updateActionBtn = document.getElementById('updateActionBtn');
const browserKernelStatus = document.getElementById('browserKernelStatus');
const browserKernelMenuBtn = document.getElementById('browserKernelMenuBtn');
const browserKernelMenu = document.getElementById('browserKernelMenu');
const browserKernelMenuStatus = document.getElementById('browserKernelMenuStatus');
const browserKernelMenuHeadline = document.getElementById('browserKernelMenuHeadline');
const browserKernelMenuBadge = document.getElementById('browserKernelMenuBadge');
const browserInstalledList = document.getElementById('browserInstalledList');
const browserAvailableList = document.getElementById('browserAvailableList');
const browserAvailableListHint = document.getElementById('browserAvailableListHint');
const refreshBrowserCatalogBtn = document.getElementById('refreshBrowserCatalogBtn');
const openBrowserInstallDirBtn = document.getElementById('openBrowserInstallDirBtn');

const agentProviderForm = document.getElementById('agentProviderForm');
const agentProviderList = document.getElementById('agentProviderList');
const openAgentLaunchDialogBtn = document.getElementById('openAgentLaunchDialogBtn');
const agentCurrentProviderEl = document.getElementById('agentCurrentProvider');
const agentRuntimeCard = document.getElementById('agentRuntimeCard');
const agentActiveProviderBadge = document.getElementById('agentActiveProviderBadge');
const providerModelsHint = document.getElementById('providerModelsHint');
const agentFormatDocs = document.getElementById('agentFormatDocs');
const agentToolTimeoutInput = document.getElementById('agentToolTimeoutMs');
const agentMaxExecutionStepsInput = document.getElementById('agentMaxExecutionSteps');
const profileIdentityLabel = document.getElementById('profileIdentityLabel');
const copyProfileIdBtn = document.getElementById('copyProfileIdBtn');
const jumpToProxyBtn = document.getElementById('jumpToProxyBtn');
const clearSelectedProxyBtn = document.getElementById('clearSelectedProxyBtn');
const jumpToAccountsBtn = document.getElementById('jumpToAccountsBtn');
const summaryRandomizeBtn = document.getElementById('summaryRandomizeBtn');
const profileWindowPositionPicker = document.getElementById('profileWindowPositionPicker');
const profileBasicSegmentedGroups = Array.from(document.querySelectorAll('.segmented-toggle'));
const profileSelectTriggers = Array.from(document.querySelectorAll('[data-select-trigger]'));
const profileSelectSearchInputs = Array.from(document.querySelectorAll('.smart-select-search'));
const profileWindowPositionCells = Array.from(document.querySelectorAll('.window-position-cell'));

let homeFilter = 'all';
let homeProjectId = 'all';
let homeSearch = '';
let currentFingerprintDraft = {};
let agentDraftModels = [];
let profileSearchableOptions = {
    profileLanguage: [],
    profileUiLanguage: [],
    profileTimezone: []
};
let profileBasicSettingsMounted = false;
const selectedProfileIds = new Set();
let proxyCountryFilter = '';
let proxyCityFilter = '';
let proxyLatencyFilter = '';
let lastUpdaterToastKey = '';
let browserKernelMenuOpen = false;

const launchProgressByProfileId = new Map();
const launchCleanupTimers = new Map();
const BROWSER_AVAILABLE_PREVIEW_LIMIT = 5;

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

function setBrowserKernelMenuOpen(open) {
    browserKernelMenuOpen = !!open;
    if (!browserKernelMenu || !browserKernelMenuBtn) {
        return;
    }

    browserKernelMenu.hidden = !browserKernelMenuOpen;
    browserKernelMenuBtn.setAttribute('aria-expanded', browserKernelMenuOpen ? 'true' : 'false');
    browserKernelMenuBtn.parentElement?.classList.toggle('is-open', browserKernelMenuOpen);
}

function renderBrowserKernelEmpty(message) {
    return `<div class="topbar-kernel-empty">${escapeHtml(message)}</div>`;
}

function renderBrowserKernelItem({
    title = '',
    meta = [],
    tags = [],
    actionLabel = '',
    actionKind = '',
    revision = '',
    disabled = false,
    active = false
} = {}) {
    const metaText = (Array.isArray(meta) ? meta : [meta]).filter(Boolean);
    const actionHtml = actionLabel
        ? `<button type="button" class="small-btn topbar-kernel-item-action" data-browser-kernel-action="${escapeHtml(actionKind)}" data-revision="${escapeHtml(revision)}" ${disabled ? 'disabled' : ''}>${escapeHtml(actionLabel)}</button>`
        : '';

    return `
        <div class="topbar-kernel-item ${active ? 'is-active' : ''}">
            <div class="topbar-kernel-item-main">
                <div class="topbar-kernel-item-title">${escapeHtml(title)}</div>
                <div class="topbar-kernel-item-meta">
                    ${tags.map((tag) => `<span class="topbar-kernel-tag ${tag.type === 'active' ? 'is-active' : ''}">${escapeHtml(tag.label)}</span>`).join('')}
                    ${metaText.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
                </div>
            </div>
            ${actionHtml}
        </div>
    `;
}

const PROFILE_LANGUAGE_CODES = [
    'af', 'sq', 'am', 'ar', 'hy', 'az', 'eu', 'be', 'bn', 'bs', 'bg', 'ca', 'ceb', 'zh-CN', 'zh-HK', 'zh-TW',
    'hr', 'cs', 'da', 'nl', 'en-US', 'en-GB', 'eo', 'et', 'fil', 'fi', 'fr', 'gl', 'ka', 'de', 'el', 'gu',
    'ha', 'haw', 'he', 'hi', 'hu', 'is', 'id', 'ga', 'it', 'ja', 'jv', 'kn', 'kk', 'km', 'ko', 'ku', 'ky',
    'lo', 'la', 'lv', 'lt', 'mk', 'ms', 'ml', 'mt', 'mr', 'mn', 'ne', 'no', 'fa', 'pl', 'pt-BR', 'pt-PT',
    'pa', 'ro', 'ru', 'sr', 'si', 'sk', 'sl', 'so', 'es', 'sw', 'sv', 'ta', 'te', 'th', 'tr', 'uk', 'ur',
    'uz', 'vi', 'cy', 'xh', 'yi', 'yo', 'zu'
];

const FALLBACK_TIMEZONES = [
    'UTC', 'Africa/Cairo', 'Africa/Johannesburg', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Mexico_City', 'America/New_York', 'America/Phoenix', 'America/Sao_Paulo', 'Asia/Bangkok',
    'Asia/Dubai', 'Asia/Ho_Chi_Minh', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Kolkata', 'Asia/Kuala_Lumpur',
    'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Melbourne', 'Australia/Sydney',
    'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Istanbul', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid',
    'Europe/Moscow', 'Europe/Paris', 'Pacific/Auckland'
];

const PROFILE_SELECT_CONFIG = {
    profileLanguage: {
        modeFieldId: 'profileLanguageMode',
        wrapperId: 'profileLanguageSelectWrap',
        placeholder: '请选择语言',
        optionType: 'language'
    },
    profileUiLanguage: {
        modeFieldId: 'profileUiLanguageMode',
        wrapperId: 'profileUiLanguageSelectWrap',
        placeholder: '请选择界面语言',
        optionType: 'language'
    },
    profileTimezone: {
        modeFieldId: 'profileTimezoneMode',
        wrapperId: 'profileTimezoneSelectWrap',
        placeholder: '请选择时区',
        optionType: 'timezone'
    }
};

const WINDOW_POSITION_COORDINATES = {
    'top-left': { left: '11%', top: '8%' },
    'top-center': { left: '35%', top: '8%' },
    'top-right': { left: '60%', top: '8%' },
    'center-left': { left: '11%', top: '40%' },
    center: { left: '35%', top: '40%' },
    'center-right': { left: '60%', top: '40%' },
    'bottom-left': { left: '11%', top: '71%' },
    'bottom-center': { left: '35%', top: '71%' },
    'bottom-right': { left: '60%', top: '71%' }
};

function safeDisplayName(displayNames, value) {
    try {
        return displayNames?.of(value) || '';
    } catch (error) {
        return '';
    }
}

function normalizeSelectOptionLabel(value) {
    return String(value || '')
        .replace(/_/g, ' ')
        .replace(/\//g, ' / ')
        .trim();
}

function buildLanguageOptions() {
    const zhDisplayNames = typeof Intl?.DisplayNames === 'function'
        ? new Intl.DisplayNames(['zh-CN'], { type: 'language' })
        : null;

    return PROFILE_LANGUAGE_CODES.map((code) => {
        const nativeDisplayNames = typeof Intl?.DisplayNames === 'function'
            ? new Intl.DisplayNames([code], { type: 'language' })
            : null;
        const zhName = safeDisplayName(zhDisplayNames, code) || code;
        const nativeName = safeDisplayName(nativeDisplayNames, code);
        const label = nativeName && nativeName.toLowerCase() !== zhName.toLowerCase()
            ? `${zhName} - ${nativeName}`
            : zhName;
        return {
            value: code,
            label,
            searchText: `${code} ${label}`.toLowerCase()
        };
    }).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}

function buildTimezoneOptions() {
    const values = typeof Intl?.supportedValuesOf === 'function'
        ? Intl.supportedValuesOf('timeZone')
        : FALLBACK_TIMEZONES;

    return Array.from(new Set(values)).map((timezone) => ({
        value: timezone,
        label: normalizeSelectOptionLabel(timezone),
        searchText: normalizeSelectOptionLabel(timezone).toLowerCase()
    })).sort((left, right) => left.label.localeCompare(right.label, 'en'));
}

function initializeProfileSearchableOptions() {
    profileSearchableOptions = {
        profileLanguage: buildLanguageOptions(),
        profileUiLanguage: buildLanguageOptions(),
        profileTimezone: buildTimezoneOptions()
    };
}

function getProfileModeValue(fieldId, fallback = 'auto') {
    return document.getElementById(fieldId)?.value || fallback;
}

function setProfileModeValue(fieldId, value) {
    const input = document.getElementById(fieldId);
    if (input) {
        input.value = value;
    }
}

function getProfileHiddenBoolean(fieldId, defaultValue = true) {
    const raw = String(document.getElementById(fieldId)?.value || '').trim();
    if (!raw) return defaultValue;
    return raw !== '0' && raw.toLowerCase() !== 'false';
}

function setProfileHiddenBoolean(fieldId, value) {
    const input = document.getElementById(fieldId);
    if (input) {
        input.value = value ? '1' : '0';
    }
}

function getSelectedProfileOption(fieldId) {
    const value = String(document.getElementById(fieldId)?.value || '').trim();
    const options = profileSearchableOptions[fieldId] || [];
    return options.find((option) => option.value === value) || null;
}

function updateSearchableSelectTrigger(fieldId) {
    const trigger = document.querySelector(`[data-select-trigger="${fieldId}"]`);
    const config = PROFILE_SELECT_CONFIG[fieldId];
    if (!trigger || !config) return;

    const option = getSelectedProfileOption(fieldId);
    trigger.textContent = option?.label || config.placeholder;
    trigger.classList.toggle('is-placeholder', !option);
}

function renderSearchableSelectOptions(fieldId, query = '') {
    const optionsWrap = document.querySelector(`[data-select-options="${fieldId}"]`);
    if (!optionsWrap) return;

    const normalizedQuery = String(query || '').trim().toLowerCase();
    const currentValue = String(document.getElementById(fieldId)?.value || '').trim();
    const options = (profileSearchableOptions[fieldId] || [])
        .filter((option) => !normalizedQuery || option.searchText.includes(normalizedQuery));

    if (!options.length) {
        optionsWrap.innerHTML = '<div class="smart-select-empty">没有匹配项</div>';
        return;
    }

    optionsWrap.innerHTML = options.map((option) => `
        <button type="button" class="smart-select-option ${option.value === currentValue ? 'active' : ''}" data-select-option="${fieldId}" data-value="${escapeHtml(option.value)}">
            ${escapeHtml(option.label)}
        </button>
    `).join('');
}

function closeAllSearchableSelects() {
    Object.keys(PROFILE_SELECT_CONFIG).forEach((fieldId) => {
        const wrap = document.getElementById(PROFILE_SELECT_CONFIG[fieldId].wrapperId);
        const panel = document.querySelector(`[data-select-panel="${fieldId}"]`);
        if (wrap) wrap.classList.remove('is-open');
        if (panel) panel.classList.add('hidden');
    });
}

function toggleSearchableSelect(fieldId, shouldOpen) {
    const config = PROFILE_SELECT_CONFIG[fieldId];
    if (!config) return;

    const wrap = document.getElementById(config.wrapperId);
    const panel = document.querySelector(`[data-select-panel="${fieldId}"]`);
    const searchInput = document.querySelector(`[data-select-search="${fieldId}"]`);
    if (!wrap || !panel) return;

    closeAllSearchableSelects();

    if (!shouldOpen) {
        return;
    }

    wrap.classList.add('is-open');
    panel.classList.remove('hidden');
    if (searchInput) {
        searchInput.value = '';
        renderSearchableSelectOptions(fieldId, '');
        requestAnimationFrame(() => searchInput.focus());
    } else {
        renderSearchableSelectOptions(fieldId, '');
    }
}

function setSearchableSelectValue(fieldId, value, { close = true } = {}) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    input.value = String(value || '').trim();
    updateSearchableSelectTrigger(fieldId);
    renderSearchableSelectOptions(fieldId);
    if (close) {
        closeAllSearchableSelects();
    }
}

function syncSegmentedToggleState() {
    profileBasicSegmentedGroups.forEach((group) => {
        const fieldId = group.dataset.modeField || group.dataset.boolField;
        if (!fieldId) return;
        const value = String(document.getElementById(fieldId)?.value || '').trim();
        group.querySelectorAll('.segment-btn').forEach((button) => {
            button.classList.toggle('active', String(button.dataset.value || '') === value);
        });
    });
}

function syncProfileWindowPositionPreview() {
    const position = String(document.getElementById('profileWindowPosition')?.value || 'top-left').trim();
    const picker = profileWindowPositionPicker;
    const coordinates = WINDOW_POSITION_COORDINATES[position] || WINDOW_POSITION_COORDINATES['top-left'];
    if (!picker) return;

    picker.style.setProperty('--window-preview-left', coordinates.left);
    picker.style.setProperty('--window-preview-top', coordinates.top);
    profileWindowPositionCells.forEach((cell) => {
        cell.classList.toggle('active', cell.dataset.positionValue === position);
    });
}

function syncProfileBasicSettingsVisibility() {
    Object.entries(PROFILE_SELECT_CONFIG).forEach(([fieldId, config]) => {
        const wrap = document.getElementById(config.wrapperId);
        const isManual = getProfileModeValue(config.modeFieldId) === 'manual';
        if (wrap) {
            wrap.classList.toggle('hidden', !isManual);
        }
        updateSearchableSelectTrigger(fieldId);
        renderSearchableSelectOptions(fieldId);
    });

    document.getElementById('profileGeoManualFields')?.classList.toggle(
        'hidden',
        getProfileModeValue('profileGeoMode') !== 'manual'
    );
    document.getElementById('profileWindowSizeFields')?.classList.toggle(
        'hidden',
        getProfileModeValue('profileWindowSizeMode', 'custom') !== 'custom'
    );

    syncSegmentedToggleState();
    syncProfileWindowPositionPreview();
}

function updateProfileDraftPreview() {
    captureFingerprintDraftFromForm();
    renderProfilePreview();
}

function bindProfileBasicSettings() {
    if (profileBasicSettingsMounted) {
        return;
    }
    profileBasicSettingsMounted = true;

    profileBasicSegmentedGroups.forEach((group) => {
        group.addEventListener('click', (event) => {
            const button = event.target.closest('.segment-btn');
            if (!button) return;
            const fieldId = group.dataset.modeField || group.dataset.boolField;
            if (!fieldId) return;
            if (group.dataset.boolKind === 'enum') {
                setProfileModeValue(fieldId, button.dataset.value || '');
            } else if (group.dataset.boolField) {
                setProfileHiddenBoolean(fieldId, button.dataset.value !== '0');
            } else {
                setProfileModeValue(fieldId, button.dataset.value || 'auto');
            }
            syncProfileBasicSettingsVisibility();
            updateProfileDraftPreview();
        });
    });

    profileSelectTriggers.forEach((trigger) => {
        trigger.addEventListener('click', (event) => {
            event.stopPropagation();
            const fieldId = trigger.dataset.selectTrigger;
            const wrap = document.getElementById(PROFILE_SELECT_CONFIG[fieldId]?.wrapperId || '');
            toggleSearchableSelect(fieldId, !(wrap && wrap.classList.contains('is-open')));
        });
    });

    profileSelectSearchInputs.forEach((input) => {
        input.addEventListener('input', () => {
            renderSearchableSelectOptions(input.dataset.selectSearch, input.value);
        });
        input.addEventListener('click', (event) => event.stopPropagation());
    });

    Object.keys(PROFILE_SELECT_CONFIG).forEach((fieldId) => {
        const optionsWrap = document.querySelector(`[data-select-options="${fieldId}"]`);
        optionsWrap?.addEventListener('click', (event) => {
            const option = event.target.closest('.smart-select-option');
            if (!option) return;
            setSearchableSelectValue(fieldId, option.dataset.value || '');
            updateProfileDraftPreview();
        });
    });

    profileWindowPositionCells.forEach((cell) => {
        cell.addEventListener('click', () => {
            setProfileModeValue('profileWindowPosition', cell.dataset.positionValue || 'top-left');
            syncProfileWindowPositionPreview();
            updateProfileDraftPreview();
        });
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.smart-select')) {
            closeAllSearchableSelects();
        }
    });
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

function getTemplates() {
    return appState.templates || [];
}

function getTemplateById(templateId) {
    return getTemplates().find((item) => item.id === templateId) || null;
}

function getProjects() {
    return appState.settings.projects || [];
}

function getProjectById(projectId) {
    if (!projectId) return null;
    return getProjects().find((item) => item.id === projectId) || null;
}

function getAccounts() {
    return appState.accounts || [];
}

function getActiveProfiles() {
    return appState.profiles.filter((profile) => !profile.deletedAt);
}

function getAccountsByProfileId(profileId) {
    return getAccounts().filter((account) => account.profileId === profileId);
}

function getExtensions() {
    return appState.settings.extensions || [];
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

function getAgentMaxExecutionSteps() {
    return Math.max(3, Math.min(50, Number(appState.settings.agent?.maxExecutionSteps) || 10));
}

function getSyncState() {
    return appState.runtime?.sync || createEmptySyncRuntimeState();
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

function mountAgentSettingsFieldsLegacy() {
    const timeoutFieldWrap = agentToolTimeoutInput?.closest('.grid.two');
    const providerPanel = agentProviderForm?.closest('.panel');
    if (!timeoutFieldWrap || !providerPanel) {
        return;
    }
    if (providerPanel.querySelector('#agentGlobalSettingsCard')) {
        return;
    }

    const settingsCard = document.createElement('div');
    const batchTuning = '';
    const exportSummary = '';
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
        ${batchTuning ? `<div class="agent-runtime-row"><span>批量策略</span><strong>${escapeHtml(batchTuning)}</strong></div>` : ''}
        ${exportSummary ? `<div class="agent-runtime-row"><span>最近导出</span><strong>${escapeHtml(exportSummary)}</strong></div>` : ''}
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
            这些配置作用于整个 Agent 运行层，不绑定任何单个提供商。
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
    document.getElementById('statProfiles').textContent = String(appState.profiles.filter((profile) => !profile.deletedAt).length);
    document.getElementById('statProxies').textContent = String(appState.settings.proxies.length);
    document.getElementById('statRunning').textContent = String(appState.runtime.running.length);
    document.getElementById('sidebarRuntime').textContent = appState.runtime.mihomoReady
        ? `Mihomo 已就绪 · 运行中 ${appState.runtime.running.length} 个`
        : 'Mihomo 内核缺失';

    const runtimeAgent = getAgentRuntime();
    const batch = getAgentBatchState(runtimeAgent);

    if (batch.running) {
        document.getElementById('topbarHint').textContent = 'Agent 批量任务执行中';
        return;
    }

    if (batch.tasks.length) {
        document.getElementById('topbarHint').textContent = 'Agent 批量任务待清空';
        return;
    }

    if (runtimeAgent.running) {
        document.getElementById('topbarHint').textContent = 'Agent 单窗口执行中';
        return;
    }

    document.getElementById('topbarHint').textContent = appState.runtime.activeProvider
        ? `Agent ${appState.runtime.activeProvider.name}`
        : (appState.runtime.apiUrl ? `API ${appState.runtime.apiUrl}` : 'API 未启用');
}

function renderBrowserKernelPanel() {
    if (!browserKernelStatus) {
        return;
    }

    const browser = getBrowserRuntimeState();
    const installed = Array.isArray(browser.installed) ? browser.installed : [];
    const available = Array.isArray(browser.available) ? browser.available : [];
    const previewAvailable = available.slice(0, BROWSER_AVAILABLE_PREVIEW_LIMIT);
    const installedIds = new Set(installed.map((item) => item.id));

    const statusText = browser.activeLabel
        ? `${browser.activeLabel}${browser.loading ? ' · 刷新中' : ''}`
        : (browser.loading ? '正在加载 Chromium 版本...' : '未安装 Chromium 内核');
    const fullStatusText = browser.error
        ? `${statusText} · ${browser.error}`
        : statusText;

    browserKernelStatus.textContent = fullStatusText;
    if (browserKernelMenuStatus) {
        browserKernelMenuStatus.textContent = browser.activeLabel || (browser.loading ? '刷新中...' : '未安装');
    }
    if (browserKernelMenuHeadline) {
        browserKernelMenuHeadline.textContent = fullStatusText;
    }
    if (browserKernelMenuBtn) {
        browserKernelMenuBtn.title = fullStatusText;
        browserKernelMenuBtn.classList.toggle('is-loading', browser.loading);
    }
    if (browserKernelMenuBadge) {
        const hasLatestMissing = !!previewAvailable[0] && !installedIds.has(previewAvailable[0].id);
        browserKernelMenuBadge.hidden = !hasLatestMissing;
        browserKernelMenuBadge.textContent = hasLatestMissing ? '1' : '';
    }
    if (browserInstalledList) {
        browserInstalledList.innerHTML = installed.length
            ? installed.map((item) => renderBrowserKernelItem({
                title: item.label || `r${item.id}`,
                meta: [item.installedAt ? `安装于 ${formatDate(item.installedAt)}` : '已安装'],
                tags: item.id === browser.activeVersion ? [{ label: '使用中', type: 'active' }] : [],
                actionLabel: item.id === browser.activeVersion ? '当前' : '切换',
                actionKind: item.id === browser.activeVersion ? 'none' : 'activate',
                revision: item.id,
                disabled: browser.loading || item.id === browser.activeVersion,
                active: item.id === browser.activeVersion
            })).join('')
            : renderBrowserKernelEmpty('还没有已安装的内核版本。');
    }
    if (browserAvailableListHint) {
        browserAvailableListHint.textContent = available.length > BROWSER_AVAILABLE_PREVIEW_LIMIT
            ? `仅显示最新 ${BROWSER_AVAILABLE_PREVIEW_LIMIT} 个`
            : '';
    }
    if (browserAvailableList) {
        browserAvailableList.innerHTML = previewAvailable.length
            ? previewAvailable.map((item) => {
                const isInstalled = installedIds.has(item.id);
                const isActive = item.id === browser.activeVersion;
                const tags = [];
                if (item.latest) tags.push({ label: '最新' });
                if (isActive) {
                    tags.push({ label: '使用中', type: 'active' });
                } else if (isInstalled) {
                    tags.push({ label: '已安装' });
                }
                return renderBrowserKernelItem({
                    title: item.label || `r${item.id}`,
                    meta: [isInstalled ? '已下载，可直接切换' : '官方快照版本'],
                    tags,
                    actionLabel: isActive ? '当前' : (isInstalled ? '切换' : '下载'),
                    actionKind: isActive ? 'none' : (isInstalled ? 'activate' : 'install'),
                    revision: item.id,
                    disabled: browser.loading || isActive,
                    active: isActive
                });
            }).join('')
            : renderBrowserKernelEmpty(browser.loading ? '正在加载官方版本列表...' : (browser.error || '暂无可用版本'));
    }

    refreshBrowserCatalogBtn.disabled = browser.loading;
    openBrowserInstallDirBtn.disabled = !browser.installDir;
}

function renderUpdaterAction() {
    if (!updateActionBtn) {
        return;
    }

    const updater = getUpdaterState();
    updateActionBtn.hidden = true;
    updateActionBtn.disabled = true;
    updateActionBtn.textContent = '';
    updateActionBtn.title = '';
    updateActionBtn.classList.remove('is-loading', 'is-ready');

    if (!updater.supported || !updater.enabled) {
        return;
    }

    if (updater.status === 'checking') {
        updateActionBtn.hidden = false;
        updateActionBtn.classList.add('is-loading');
        updateActionBtn.textContent = '后台检查更新';
        return;
    }

    if (updater.status === 'available' || updater.status === 'downloading') {
        const versionLabel = updater.availableVersion ? `v${updater.availableVersion}` : '新版本';
        const progress = Math.max(1, Math.round(Number(updater.progress) || 0));
        updateActionBtn.hidden = false;
        updateActionBtn.classList.add('is-loading');
        updateActionBtn.textContent = updater.status === 'available'
            ? `${versionLabel} 后台下载中`
            : `${versionLabel} 下载 ${progress}%`;
        return;
    }

    if (updater.status === 'downloaded' || updater.status === 'installing') {
        const versionLabel = updater.downloadedVersion ? ` v${updater.downloadedVersion}` : '';
        updateActionBtn.hidden = false;
        updateActionBtn.classList.add(updater.status === 'downloaded' ? 'is-ready' : 'is-loading');
        updateActionBtn.disabled = updater.status !== 'downloaded';
        updateActionBtn.textContent = updater.status === 'downloaded'
            ? `立即重启更新${versionLabel}`
            : '正在安装更新';
        updateActionBtn.title = updater.status === 'downloaded'
            ? '也可以直接关闭应用，退出时会自动安装'
            : '';
    }
}

function renderProjectOptions() {
    const projects = getProjects();
    const projectOptions = projects.map((project) => (
        `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`
    ));
    profileProjectIdSelect.innerHTML = projectOptions.join('');

    const filterOptions = ['<option value="all">全部项目</option>']
        .concat(projectOptions);
    homeProjectFilterSelect.innerHTML = filterOptions.join('');
    batchMoveProjectIdSelect.innerHTML = '<option value="">移动到项目</option>' + projectOptions.join('');

    const editorOptions = ['<option value="">新项目</option>'].concat(projectOptions).join('');
    projectEditorIdSelect.innerHTML = editorOptions;

    const selectedHomeProjectId = homeProjectId === 'all' || projects.some((project) => project.id === homeProjectId)
        ? homeProjectId
        : 'all';
    homeProjectFilterSelect.value = selectedHomeProjectId;
    if (!projects.some((project) => project.id === batchMoveProjectIdSelect.value)) {
        batchMoveProjectIdSelect.value = '';
    }

    const currentProfileProjectId = profileProjectIdSelect.dataset.pendingValue || profileProjectIdSelect.value || projects[0]?.id || '';
    profileProjectIdSelect.value = projects.some((project) => project.id === currentProfileProjectId)
        ? currentProfileProjectId
        : (projects[0]?.id || '');
    delete profileProjectIdSelect.dataset.pendingValue;

    const currentEditorProjectId = projectEditorIdSelect.dataset.pendingValue || projectEditorIdSelect.value || '';
    projectEditorIdSelect.value = currentEditorProjectId === '' || projects.some((project) => project.id === currentEditorProjectId)
        ? currentEditorProjectId
        : '';
    delete projectEditorIdSelect.dataset.pendingValue;
}

function renderAccountProfileOptions() {
    const profiles = getActiveProfiles();
    const options = ['<option value="">未绑定环境</option>'].concat(profiles.map((profile) => (
        `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`
    )));
    accountProfileIdSelect.innerHTML = options.join('');

    const currentProfileId = accountProfileIdSelect.dataset.pendingValue || accountProfileIdSelect.value || '';
    accountProfileIdSelect.value = currentProfileId && profiles.some((profile) => profile.id === currentProfileId)
        ? currentProfileId
        : '';
    delete accountProfileIdSelect.dataset.pendingValue;
}

function renderProfileExtensionOptions(selectedIds = null) {
    const extensions = getExtensions();
    const selected = new Set(Array.isArray(selectedIds)
        ? selectedIds
        : Array.from(profileExtensionList.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value));

    if (!extensions.length) {
        profileExtensionList.innerHTML = '<span class="profile-meta">当前还没有可用扩展，先去扩展中心导入。</span>';
        return;
    }

    profileExtensionList.innerHTML = extensions.map((extension) => `
        <label class="small-btn">
            <input type="checkbox" class="profile-extension-checkbox" value="${escapeHtml(extension.id)}" ${selected.has(extension.id) ? 'checked' : ''}>
            ${escapeHtml(extension.name)}${extension.enabled ? '' : ' (已停用)'}
        </label>
    `).join('');
}

function fillProjectForm(project = null) {
    const current = project || getProjectById(projectEditorIdSelect.value) || getProjects()[0] || null;
    projectEditorIdSelect.value = current?.id || '';
    projectNameInput.value = current?.name || '';
    projectColorInput.value = current?.color || '#0f766e';
    projectNotesInput.value = current?.notes || '';
    deleteProjectBtn.disabled = !current?.id || current.id === 'default';
}

function getVisibleHomeProfiles() {
    const proxies = appState.settings.proxies || [];
    return appState.profiles.filter((profile) => {
        if (profile.deletedAt) return false;
        const isRunning = !!getRunning(profile.id);
        if (homeFilter === 'running' && !isRunning) return false;
        if (homeFilter === 'stopped' && isRunning) return false;
        if (homeProjectId !== 'all' && profile.projectId !== homeProjectId) return false;
        if (!homeSearch) return true;

        const proxyName = proxies.find((item) => item.id === profile.proxyId)?.name || '';
        const projectName = (getProjectById(profile.projectId) || getProjects()[0])?.name || '';
        const text = [profile.name, profile.notes, projectName, proxyName, ...(profile.tags || [])]
            .join(' ')
            .toLowerCase();
        return text.includes(homeSearch);
    });
}

function syncProfileSelectionState() {
    const validProfileIds = new Set(
        appState.profiles
            .filter((profile) => !profile.deletedAt)
            .map((profile) => profile.id)
    );
    Array.from(selectedProfileIds).forEach((profileId) => {
        if (!validProfileIds.has(profileId)) {
            selectedProfileIds.delete(profileId);
        }
    });

    const visibleProfiles = getVisibleHomeProfiles();
    const selectableIds = visibleProfiles.map((profile) => profile.id);
    const selectedVisibleCount = selectableIds.filter((profileId) => selectedProfileIds.has(profileId)).length;
    selectAllProfilesInput.checked = selectableIds.length > 0 && selectedVisibleCount === selectableIds.length;
    selectAllProfilesInput.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < selectableIds.length;
    allocateProxyBtn.textContent = selectedProfileIds.size ? `自动分配到已选环境 (${selectedProfileIds.size})` : '自动分配到已选环境';
    batchBindProxyBtn.textContent = selectedProfileIds.size ? `批量绑定代理 (${selectedProfileIds.size})` : '批量绑定代理';
    batchMoveBtn.textContent = selectedProfileIds.size ? `批量移动 (${selectedProfileIds.size})` : '批量移动';
    clearProfileSelectionBtn.disabled = !selectedProfileIds.size;
}

function renderProxySelect() {
    const proxies = appState.settings.proxies || [];
    document.getElementById('profileProxyId').innerHTML = '<option value="">直连</option>' + proxies.map((proxy) => {
        const latency = proxy.latency > 0 ? ` · ${proxy.latency}ms` : '';
        return `<option value="${proxy.id}">${escapeHtml(proxy.name)}${latency}</option>`;
    }).join('');

    const currentBatchProxyId = batchProxyIdSelect.value || '';
    batchProxyIdSelect.innerHTML = '<option value="">选择批量代理</option><option value="__direct__">切换为直连</option>' + proxies.map((proxy) => {
        const location = [proxy.countryCode, proxy.city].filter(Boolean).join('/');
        const locationMeta = location ? ` · ${location}` : '';
        return `<option value="${proxy.id}">${escapeHtml(proxy.name)}${locationMeta}</option>`;
    }).join('');
    batchProxyIdSelect.value = currentBatchProxyId && (
        currentBatchProxyId === '__direct__' || proxies.some((proxy) => proxy.id === currentBatchProxyId)
    )
        ? currentBatchProxyId
        : '';
}

function getVisibleProxies() {
    const maxLatency = Math.max(0, Number(proxyLatencyFilter) || 0);
    return (appState.settings.proxies || []).filter((proxy) => {
        if (proxyCountryFilter && String(proxy.countryCode || '').trim().toUpperCase() !== proxyCountryFilter) {
            return false;
        }
        if (proxyCityFilter && String(proxy.city || '').trim() !== proxyCityFilter) {
            return false;
        }
        if (maxLatency > 0 && (!(Number(proxy.latency) > 0) || Number(proxy.latency) > maxLatency)) {
            return false;
        }
        return true;
    });
}

function renderProxyFilters() {
    const proxies = appState.settings.proxies || [];
    const countryOptions = Array.from(new Set(proxies.map((proxy) => String(proxy.countryCode || '').trim().toUpperCase()).filter(Boolean))).sort();
    const cityOptions = Array.from(new Set(proxies
        .filter((proxy) => !proxyCountryFilter || String(proxy.countryCode || '').trim().toUpperCase() === proxyCountryFilter)
        .map((proxy) => String(proxy.city || '').trim())
        .filter(Boolean))).sort((left, right) => left.localeCompare(right, 'zh-CN'));
    const currentMode = proxyAllocationModeSelect.value || appState.settings.proxyAllocation?.mode || 'manual';

    proxyCountryFilterSelect.innerHTML = '<option value="">全部国家</option>' + countryOptions.map((countryCode) => (
        `<option value="${escapeHtml(countryCode)}">${escapeHtml(countryCode)}</option>`
    )).join('');
    proxyCountryFilterSelect.value = countryOptions.includes(proxyCountryFilter) ? proxyCountryFilter : '';
    proxyCountryFilter = proxyCountryFilterSelect.value || '';

    proxyCityFilterSelect.innerHTML = '<option value="">全部城市</option>' + cityOptions.map((city) => (
        `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`
    )).join('');
    proxyCityFilterSelect.value = cityOptions.includes(proxyCityFilter) ? proxyCityFilter : '';
    proxyCityFilter = proxyCityFilterSelect.value || '';

    proxyLatencyFilterSelect.value = ['200', '500', '1000'].includes(String(proxyLatencyFilter)) ? String(proxyLatencyFilter) : '';
    proxyAllocationModeSelect.value = ['manual', 'round-robin', 'sticky', 'geo-match'].includes(currentMode) ? currentMode : 'manual';
    allocateProxyBtn.textContent = selectedProfileIds.size
        ? `自动分配到已选环境 (${selectedProfileIds.size})`
        : '自动分配到已选环境';
}

function getAgentRuntime() {
    return appState.runtime.agent || createEmptyAgentRuntimeState();
}

function getUpdaterState() {
    return appState.runtime.updater || createEmptyUpdaterState();
}

function getBrowserRuntimeState() {
    return appState.runtime.browser || createEmptyBrowserRuntimeState();
}

function getAgentBatchState(runtimeAgent = getAgentRuntime()) {
    return runtimeAgent.batch || createEmptyAgentRuntimeState().batch;
}

function getAgentBatchCounts(batch = getAgentBatchState()) {
    if (batch.counts) {
        return batch.counts;
    }

    return (batch.tasks || []).reduce((summary, task) => {
        summary.total += 1;
        if (task.status === 'queued') summary.queued += 1;
        if (task.status === 'running') summary.running += 1;
        if (task.status === 'success') summary.success += 1;
        if (task.status === 'error') summary.error += 1;
        if (task.status === 'stopped') summary.stopped += 1;
        if (task.status === 'success' || task.status === 'error' || task.status === 'stopped') {
            summary.completed += 1;
        }
        return summary;
    }, {
        total: 0,
        queued: 0,
        running: 0,
        success: 0,
        error: 0,
        stopped: 0,
        completed: 0
    });
}

function renderProfilePreview() {
    const geolocation = currentFingerprintDraft.geolocation || {};
    const media = currentFingerprintDraft.media || {};
    const windowConfig = currentFingerprintDraft.window || {};
    const profileId = document.getElementById('profileId').value.trim();
    const proxyId = document.getElementById('profileProxyId').value || '';
    const proxy = (appState.settings.proxies || []).find((item) => item.id === proxyId) || null;
    const linkedAccounts = profileId ? getAccountsByProfileId(profileId) : [];
    const startupUrls = parseUrlListInput('profileStartupUrls');
    const searchEngine = document.getElementById('profileSearchEngine')?.value || 'google';
    const preferences = {
        restoreLastSession: getProfileHiddenBoolean('profileRestoreLastSession', false),
        autoInjectAccountAssets: getProfileHiddenBoolean('profileAutoInjectAccountAssets', true),
        clearCacheBeforeLaunch: getProfileHiddenBoolean('profileClearCacheBeforeLaunch', false),
        clearCookiesBeforeLaunch: getProfileHiddenBoolean('profileClearCookiesBeforeLaunch', false),
        clearLocalStorageBeforeLaunch: getProfileHiddenBoolean('profileClearLocalStorageBeforeLaunch', false),
        openDevtoolsOnLaunch: getProfileHiddenBoolean('profileOpenDevtoolsOnLaunch', false),
        disableNotifications: getProfileHiddenBoolean('profileDisableNotifications', false)
    };
    const preferenceSummary = [
        preferences.restoreLastSession ? '恢复会话' : '',
        preferences.autoInjectAccountAssets ? '自动注入账号' : '',
        preferences.clearCacheBeforeLaunch ? '清缓存' : '',
        preferences.clearCookiesBeforeLaunch ? '清 Cookie' : '',
        preferences.clearLocalStorageBeforeLaunch ? '清存储' : '',
        preferences.openDevtoolsOnLaunch ? 'DevTools' : '',
        preferences.disableNotifications ? '禁通知' : ''
    ].filter(Boolean).join(' / ') || '标准启动';
    const preview = {
        种子: currentFingerprintDraft.seed || '新建',
        设备预设: currentFingerprintDraft.presetId || '自动',
        UserAgent: document.getElementById('profileUserAgent').value || '自动',
        平台: document.getElementById('profilePlatform').value || 'Win32',
        搜索引擎: searchEngine,
        语言: currentFingerprintDraft.language || '自动',
        界面语言: currentFingerprintDraft.uiLanguage || '自动',
        时区: currentFingerprintDraft.timezone || '自动',
        CPU线程: document.getElementById('profileHardware').value || '自动',
        内存GB: document.getElementById('profileMemory').value || '自动',
        屏幕: `${document.getElementById('profileWidth').value || '?'} x ${document.getElementById('profileHeight').value || '?'}`,
        窗口: windowConfig.sizeMode === 'fullscreen'
            ? '全屏'
            : `${windowConfig.width || '?'} x ${windowConfig.height || '?'} / ${windowConfig.position || 'top-left'}`,
        缩放比: currentFingerprintDraft.devicePixelRatio || '自动',
        WebRTC: document.getElementById('profileWebrtcMode').value || 'proxy',
        定位: geolocation.mode === 'manual'
            ? `${geolocation.latitude || 0}, ${geolocation.longitude || 0}`
            : (geolocation.mode || 'auto'),
        定位权限: geolocation.permission || 'allow',
        声音: media.audioEnabled === false ? '关闭' : '开启',
        图片: media.imageEnabled === false ? '关闭' : '开启',
        视频: media.videoEnabled === false ? '关闭' : '开启',
        额外标签页: startupUrls.length,
        启动偏好: preferenceSummary,
        字体数: Array.isArray(currentFingerprintDraft.fonts) ? currentFingerprintDraft.fonts.length : 0,
        WebGPU: currentFingerprintDraft.webgpu?.enabled !== false ? (currentFingerprintDraft.gpuTier || 'medium') : '关闭',
        DNT: currentFingerprintDraft.doNotTrack || '关闭',
        WebGL厂商: currentFingerprintDraft.webglVendor || '自动',
        WebGL渲染器: currentFingerprintDraft.webglRenderer || '自动'
    };
    if (profileIdentityLabel) {
        profileIdentityLabel.textContent = profileId || '未保存';
    }
    const proxySummaryEl = document.getElementById('profileProxySummary');
    if (proxySummaryEl) {
        proxySummaryEl.innerHTML = proxy
            ? `
                <div class="editor-info-title">${escapeHtml(proxy.name || '已绑定代理')}</div>
                <div class="editor-info-text">${escapeHtml(getProxyGeoSummary(proxy))}${proxy.latency > 0 ? ` / ${proxy.latency}ms` : ''}</div>
            `
            : `
                <div class="editor-info-title">直连模式</div>
                <div class="editor-info-text">当前窗口未绑定代理，将直接使用本机网络。</div>
            `;
    }
    const accountSummaryEl = document.getElementById('profileAccountSummaryCard');
    if (accountSummaryEl) {
        accountSummaryEl.innerHTML = linkedAccounts.length
            ? `
                <div class="editor-info-title">${escapeHtml(getProfileAccountSummary(profileId))}</div>
                <div class="editor-info-text">已绑定 ${linkedAccounts.length} 个账号，可在启动时自动注入账号资产。</div>
            `
            : `
                <div class="editor-info-title">未绑定账号</div>
                <div class="editor-info-text">保存窗口后可前往账号页绑定 Cookie / LocalStorage 资产。</div>
            `;
    }
    if (fingerprintSummaryList) {
        const summaryRows = [
            ['操作系统', document.getElementById('profilePlatform').value || 'Win32'],
            ['User Agent', document.getElementById('profileUserAgent').value || '自动生成'],
            ['搜索引擎', searchEngine],
            ['代理', proxy ? proxy.name : '直连'],
            ['时区', currentFingerprintDraft.timezone || '自动'],
            ['地理位置', geolocation.mode === 'manual' ? `${geolocation.latitude || 0}, ${geolocation.longitude || 0}` : (geolocation.mode || 'auto')],
            ['窗口', windowConfig.sizeMode === 'fullscreen'
                ? '全屏'
                : `${windowConfig.width || '?'} x ${windowConfig.height || '?'} / ${windowConfig.position || 'top-left'}`],
            ['媒体', `声音 ${media.audioEnabled === false ? '关' : '开'} / 图片 ${media.imageEnabled === false ? '关' : '开'} / 视频 ${media.videoEnabled === false ? '关' : '开'}`],
            ['偏好', preferenceSummary],
            ['额外 URLs', startupUrls.length ? startupUrls.join(' / ') : '无']
        ];
        fingerprintSummaryList.innerHTML = summaryRows.map(([key, value]) => `
            <div class="editor-summary-row">
                <div class="editor-summary-key">${escapeHtml(key)}</div>
                <div class="editor-summary-value">${escapeHtml(String(value || '-'))}</div>
            </div>
        `).join('');
    }
    fingerprintPreview.textContent = JSON.stringify(preview, null, 2);
}

function readOptionalNumber(elementId) {
    const raw = document.getElementById(elementId).value.trim();
    return raw ? Number(raw) : 0;
}

function parseStringListInput(elementId) {
    return Array.from(new Set(document.getElementById(elementId).value
        .split(/[\r\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)));
}

function parseUrlListInput(elementId) {
    return parseStringListInput(elementId).filter((item) => /^https?:\/\//i.test(item));
}

function formatStructuredText(value) {
    if (typeof value === 'string') {
        return value;
    }
    if (value == null) {
        return '';
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch (error) {
        return String(value);
    }
}

function parseSpeechVoicesInput() {
    return document.getElementById('profileSpeechVoices').value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
            const [name, lang, voiceURI] = line.split('|').map((item) => item.trim());
            return {
                default: index === 0,
                localService: true,
                name: name || voiceURI || `Voice-${index + 1}`,
                lang: lang || document.getElementById('profileLanguage').value.trim() || 'en-US',
                voiceURI: voiceURI || name || `Voice-${index + 1}`
            };
        })
        .filter((item) => item.name && item.voiceURI);
}

function formatSpeechVoices(voices = []) {
    return Array.isArray(voices)
        ? voices.map((voice) => [voice.name, voice.lang, voice.voiceURI].filter(Boolean).join('|')).join('\n')
        : '';
}

function captureFingerprintDraftFromForm() {
    const languageMode = getProfileModeValue('profileLanguageMode', 'auto');
    const uiLanguageMode = getProfileModeValue('profileUiLanguageMode', 'auto');
    const timezoneMode = getProfileModeValue('profileTimezoneMode', 'auto');
    const language = languageMode === 'manual'
        ? (document.getElementById('profileLanguage').value.trim() || 'auto')
        : 'auto';
    const languages = language === 'auto'
        ? []
        : Array.from(new Set([language, language.split('-')[0]].filter(Boolean)));
    const uiLanguage = uiLanguageMode === 'manual'
        ? (document.getElementById('profileUiLanguage').value.trim() || 'auto')
        : 'auto';
    const timezone = timezoneMode === 'manual'
        ? (document.getElementById('profileTimezone').value.trim() || 'auto')
        : 'auto';
    const geolocationMode = getProfileModeValue('profileGeoMode', 'auto');
    const geolocationPermission = getProfileModeValue('profileGeoPermission', 'allow');
    const fonts = parseStringListInput('profileFonts');
    const speechVoices = parseSpeechVoicesInput();
    const windowSizeMode = getProfileModeValue('profileWindowSizeMode', 'custom');
    const windowWidth = readOptionalNumber('profileWindowWidth');
    const windowHeight = readOptionalNumber('profileWindowHeight');

    currentFingerprintDraft = {
        ...currentFingerprintDraft,
        platform: document.getElementById('profilePlatform').value,
        userAgent: document.getElementById('profileUserAgent').value.trim(),
        language,
        languages,
        uiLanguage,
        timezone,
        useProxyLocale: currentFingerprintDraft.useProxyLocale !== false,
        hardwareConcurrency: readOptionalNumber('profileHardware'),
        deviceMemory: readOptionalNumber('profileMemory'),
        screen: {
            width: readOptionalNumber('profileWidth'),
            height: readOptionalNumber('profileHeight')
        },
        webrtcMode: document.getElementById('profileWebrtcMode').value || 'proxy',
        geolocation: {
            mode: geolocationMode,
            permission: geolocationPermission,
            latitude: geolocationMode === 'manual' ? readOptionalNumber('profileGeoLatitude') : 0,
            longitude: geolocationMode === 'manual' ? readOptionalNumber('profileGeoLongitude') : 0,
            accuracy: readOptionalNumber('profileGeoAccuracy') || 30
        },
        media: {
            audioEnabled: getProfileHiddenBoolean('profileAudioEnabled', true),
            imageEnabled: getProfileHiddenBoolean('profileImageEnabled', true),
            videoEnabled: getProfileHiddenBoolean('profileVideoEnabled', true)
        },
        window: {
            sizeMode: windowSizeMode,
            width: windowSizeMode === 'custom'
                ? (windowWidth || readOptionalNumber('profileWidth') || currentFingerprintDraft.screen?.width || 1280)
                : 0,
            height: windowSizeMode === 'custom'
                ? (windowHeight || readOptionalNumber('profileHeight') || currentFingerprintDraft.screen?.height || 900)
                : 0,
            position: getProfileModeValue('profileWindowPosition', 'top-left')
        },
        fonts,
        clientRectsNoise: readOptionalNumber('profileClientRectsNoise'),
        audioContextNoise: readOptionalNumber('profileAudioContextNoise'),
        speechVoices,
        gpuTier: document.getElementById('profileGpuTier').value || 'medium',
        webgpu: {
            enabled: document.getElementById('profileWebgpuEnabled').checked !== false
        },
        doNotTrack: document.getElementById('profileDoNotTrack').value || '',
        searchEngine: document.getElementById('profileSearchEngine')?.value || 'google',
        startupUrls: parseUrlListInput('profileStartupUrls'),
        storagePreset: {
            cookies: document.getElementById('profilePresetCookies')?.value || '',
            localStorage: document.getElementById('profilePresetLocalStorage')?.value || ''
        },
        preferences: {
            restoreLastSession: getProfileHiddenBoolean('profileRestoreLastSession', false),
            autoInjectAccountAssets: getProfileHiddenBoolean('profileAutoInjectAccountAssets', true),
            clearCacheBeforeLaunch: getProfileHiddenBoolean('profileClearCacheBeforeLaunch', false),
            clearCookiesBeforeLaunch: getProfileHiddenBoolean('profileClearCookiesBeforeLaunch', false),
            clearLocalStorageBeforeLaunch: getProfileHiddenBoolean('profileClearLocalStorageBeforeLaunch', false),
            openDevtoolsOnLaunch: getProfileHiddenBoolean('profileOpenDevtoolsOnLaunch', false),
            disableNotifications: getProfileHiddenBoolean('profileDisableNotifications', false)
        }
    };
}

function applyFingerprintToForm(fingerprint = {}) {
    currentFingerprintDraft = clone(fingerprint || {});

    document.getElementById('profilePlatform').value = fingerprint.platform || 'Win32';
    document.getElementById('profileUserAgent').value = fingerprint.userAgent || '';
    document.getElementById('profileSearchEngine').value = fingerprint.searchEngine || 'google';
    setProfileModeValue('profileLanguageMode', !fingerprint.language || fingerprint.language === 'auto' ? 'auto' : 'manual');
    setSearchableSelectValue('profileLanguage', !fingerprint.language || fingerprint.language === 'auto' ? '' : fingerprint.language, { close: false });
    setProfileModeValue('profileUiLanguageMode', !fingerprint.uiLanguage || fingerprint.uiLanguage === 'auto' ? 'auto' : 'manual');
    setSearchableSelectValue('profileUiLanguage', !fingerprint.uiLanguage || fingerprint.uiLanguage === 'auto' ? '' : fingerprint.uiLanguage, { close: false });
    setProfileModeValue('profileTimezoneMode', !fingerprint.timezone || fingerprint.timezone === 'auto' ? 'auto' : 'manual');
    setSearchableSelectValue('profileTimezone', !fingerprint.timezone || fingerprint.timezone === 'auto' ? '' : fingerprint.timezone, { close: false });
    document.getElementById('profileHardware').value = fingerprint.hardwareConcurrency || '';
    document.getElementById('profileMemory').value = fingerprint.deviceMemory || '';
    document.getElementById('profileWidth').value = fingerprint.screen?.width || '';
    document.getElementById('profileHeight').value = fingerprint.screen?.height || '';
    document.getElementById('profileWebrtcMode').value = fingerprint.webrtcMode || 'proxy';
    setProfileModeValue('profileGeoPermission', fingerprint.geolocation?.permission || (fingerprint.geolocation?.mode === 'block' ? 'block' : 'allow'));
    setProfileModeValue('profileGeoMode', fingerprint.geolocation?.mode === 'block' ? 'auto' : (fingerprint.geolocation?.mode || 'auto'));
    document.getElementById('profileGeoLatitude').value = fingerprint.geolocation?.latitude || '';
    document.getElementById('profileGeoLongitude').value = fingerprint.geolocation?.longitude || '';
    document.getElementById('profileGeoAccuracy').value = fingerprint.geolocation?.accuracy || '';
    setProfileHiddenBoolean('profileAudioEnabled', fingerprint.media?.audioEnabled !== false);
    setProfileHiddenBoolean('profileImageEnabled', fingerprint.media?.imageEnabled !== false);
    setProfileHiddenBoolean('profileVideoEnabled', fingerprint.media?.videoEnabled !== false);
    setProfileModeValue('profileWindowSizeMode', fingerprint.window?.sizeMode === 'fullscreen' ? 'fullscreen' : 'custom');
    document.getElementById('profileWindowWidth').value = fingerprint.window?.width || fingerprint.screen?.width || '';
    document.getElementById('profileWindowHeight').value = fingerprint.window?.height || fingerprint.screen?.height || '';
    setProfileModeValue('profileWindowPosition', fingerprint.window?.position || 'top-left');
    document.getElementById('profileFonts').value = Array.isArray(fingerprint.fonts) ? fingerprint.fonts.join('\n') : '';
    document.getElementById('profileClientRectsNoise').value = fingerprint.clientRectsNoise || '';
    document.getElementById('profileAudioContextNoise').value = fingerprint.audioContextNoise || fingerprint.audioNoise || '';
    document.getElementById('profileSpeechVoices').value = formatSpeechVoices(fingerprint.speechVoices || []);
    document.getElementById('profileGpuTier').value = fingerprint.gpuTier || 'medium';
    document.getElementById('profileWebgpuEnabled').checked = fingerprint.webgpu?.enabled !== false;
    document.getElementById('profileDoNotTrack').value = fingerprint.doNotTrack || '';
    document.getElementById('profileStartupUrls').value = Array.isArray(fingerprint.startupUrls) ? fingerprint.startupUrls.join('\n') : '';
    document.getElementById('profilePresetCookies').value = formatStructuredText(fingerprint.storagePreset?.cookies || '');
    document.getElementById('profilePresetLocalStorage').value = formatStructuredText(fingerprint.storagePreset?.localStorage || '');
    setProfileHiddenBoolean('profileRestoreLastSession', fingerprint.preferences?.restoreLastSession === true);
    setProfileHiddenBoolean('profileAutoInjectAccountAssets', fingerprint.preferences?.autoInjectAccountAssets !== false);
    setProfileHiddenBoolean('profileClearCacheBeforeLaunch', fingerprint.preferences?.clearCacheBeforeLaunch === true);
    setProfileHiddenBoolean('profileClearCookiesBeforeLaunch', fingerprint.preferences?.clearCookiesBeforeLaunch === true);
    setProfileHiddenBoolean('profileClearLocalStorageBeforeLaunch', fingerprint.preferences?.clearLocalStorageBeforeLaunch === true);
    setProfileHiddenBoolean('profileOpenDevtoolsOnLaunch', fingerprint.preferences?.openDevtoolsOnLaunch === true);
    setProfileHiddenBoolean('profileDisableNotifications', fingerprint.preferences?.disableNotifications === true);

    syncProfileBasicSettingsVisibility();
    captureFingerprintDraftFromForm();
    renderProfilePreview();
}

async function randomizeFingerprintFields(overrides = {}) {
    captureFingerprintDraftFromForm();
    const platform = overrides.platform || document.getElementById('profilePlatform').value || 'Win32';
    const preserved = {
        language: currentFingerprintDraft.language,
        uiLanguage: currentFingerprintDraft.uiLanguage,
        timezone: currentFingerprintDraft.timezone,
        geolocation: clone(currentFingerprintDraft.geolocation || {}),
        media: clone(currentFingerprintDraft.media || {}),
        window: clone(currentFingerprintDraft.window || {}),
        searchEngine: currentFingerprintDraft.searchEngine || 'google',
        startupUrls: clone(currentFingerprintDraft.startupUrls || []),
        storagePreset: clone(currentFingerprintDraft.storagePreset || {}),
        preferences: clone(currentFingerprintDraft.preferences || {})
    };
    const fingerprint = await window.xbrowser.generateFingerprint({ platform });
    applyFingerprintToForm({
        ...fingerprint,
        language: preserved.language || fingerprint.language,
        uiLanguage: preserved.uiLanguage || fingerprint.uiLanguage,
        timezone: preserved.timezone || fingerprint.timezone,
        geolocation: Object.keys(preserved.geolocation || {}).length ? preserved.geolocation : fingerprint.geolocation,
        media: Object.keys(preserved.media || {}).length ? preserved.media : fingerprint.media,
        window: Object.keys(preserved.window || {}).length ? preserved.window : fingerprint.window,
        searchEngine: preserved.searchEngine || fingerprint.searchEngine,
        startupUrls: preserved.startupUrls || fingerprint.startupUrls,
        storagePreset: Object.keys(preserved.storagePreset || {}).length ? preserved.storagePreset : fingerprint.storagePreset,
        preferences: Object.keys(preserved.preferences || {}).length ? preserved.preferences : fingerprint.preferences
    });
}

function fillProfileForm(profile = null) {
    document.getElementById('profileId').value = profile?.id || '';
    document.getElementById('profileTemplateId').value = profile?.templateId || '';
    document.getElementById('profileName').value = profile?.name || '';
    document.getElementById('profileStartUrl').value = isBuiltInStartUrl(profile?.startUrl)
        ? ''
        : (profile?.startUrl || '');
    profileProjectIdSelect.value = profile?.projectId || getProjects()[0]?.id || '';
    document.getElementById('profileProxyId').value = profile?.proxyId || '';
    document.getElementById('profileTags').value = Array.isArray(profile?.tags) ? profile.tags.join(', ') : '';
    document.getElementById('profileNotes').value = profile?.notes || '';
    renderProfileExtensionOptions(profile?.extensionIds || []);
    syncBatchCreateForm(profile);
    applyFingerprintToForm(profile?.fingerprint || { platform: 'Win32' });
}

function syncTemplateEditor(template = null) {
    document.getElementById('templateEditorId').value = template?.id || '';
    templateSelect.value = template?.id || '';
    templateNameInput.value = template?.name || '';
    templateNotesInput.value = template?.notes || '';
    applyTemplateBtn.disabled = !template?.id;
    deleteTemplateBtn.disabled = !template?.id;
}

function renderTemplatePanel() {
    const currentValue = templateSelect.value || document.getElementById('templateEditorId').value || '';
    const templates = getTemplates();
    const options = ['<option value="">请选择模板</option>']
        .concat(templates.map((template) => (
            `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`
        )));
    templateSelect.innerHTML = options.join('');

    const selected = getTemplateById(currentValue);
    if (!selected && document.getElementById('templateEditorId').value) {
        syncTemplateEditor(null);
        return;
    }

    templateSelect.value = selected?.id || '';
    applyTemplateBtn.disabled = !selected?.id;
    deleteTemplateBtn.disabled = !selected?.id;
}

function syncBatchCreateForm(profile = null) {
    batchCreateCountInput.value = batchCreateCountInput.value || '10';
    batchCreatePrefixInput.value = profile?.name || batchCreatePrefixInput.value || '';
    batchCreateProxyModeSelect.value = batchCreateProxyModeSelect.value || 'current';
    batchCreateInheritTagsInput.checked = batchCreateInheritTagsInput.checked !== false;
    batchCreateRandomizeFingerprintInput.checked = batchCreateRandomizeFingerprintInput.checked !== false;
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
            <button class="small-btn" data-action="clone-profile" data-id="${profileId}">克隆</button>
            <button class="small-btn" data-action="export-profile" data-id="${profileId}">导出</button>
            <button class="small-btn" data-action="manage-profile-account" data-id="${profileId}">账号</button>
            ${renderLaunchProgressInline(profileId)}
            <button class="small-btn" data-action="stop-profile" data-id="${profileId}">停止</button>
            <button class="small-btn" data-action="clear-profile-cache" data-id="${profileId}">清缓存</button>
            <button class="small-btn danger" data-action="trash-profile" data-id="${profileId}">回收站</button>
        </div>
    `;
}

function renderTrashActions(profileId) {
    return `
        <div class="profile-actions">
            <button class="small-btn" data-action="restore-profile" data-id="${profileId}">恢复</button>
            <button class="small-btn danger" data-action="destroy-profile" data-id="${profileId}">彻底删除</button>
        </div>
    `;
}

function getProfileAccountSummary(profileId) {
    const linkedAccounts = getAccountsByProfileId(profileId);
    if (!linkedAccounts.length) {
        return '未绑定账号';
    }

    if (linkedAccounts.length === 1) {
        const account = linkedAccounts[0];
        return `账号 ${account.platform || '-'} / ${account.username || account.email || account.phone || account.id}`;
    }

    return `已绑定 ${linkedAccounts.length} 个账号`;
}

function renderProfileTable() {
    const proxies = appState.settings.proxies || [];
    const filtered = getVisibleHomeProfiles();

    if (!filtered.length) {
        profileTableBody.innerHTML = '<tr><td colspan="8">当前筛选条件下没有环境。</td></tr>';
        syncProfileSelectionState();
        return;
    }

    profileTableBody.innerHTML = filtered.map((profile) => {
        const runtime = getRunning(profile.id);
        if (runtime && launchProgressByProfileId.has(profile.id)) {
            clearLaunchProgress(profile.id);
        }

        const proxy = proxies.find((item) => item.id === profile.proxyId);
        const project = getProjectById(profile.projectId) || getProjects()[0];
        return `
            <tr>
                <td><input type="checkbox" class="profile-select" data-id="${profile.id}" ${selectedProfileIds.has(profile.id) ? 'checked' : ''}></td>
                <td>${escapeHtml(getProfileCode(profile))}</td>
                <td>
                    <div class="profile-title">${escapeHtml(profile.name)}</div>
                    <div class="profile-meta">${escapeHtml(getProfileAccountSummary(profile.id))}</div>
                    <div class="profile-meta">${escapeHtml(project?.name || '默认项目')} · ${escapeHtml(isBuiltInStartUrl(profile.startUrl) ? '内置检测页' : (profile.startUrl || '-'))}</div>
                </td>
                <td>${escapeHtml(proxy ? proxy.name : '直连')}</td>
                <td>${escapeHtml((profile.tags || []).join(', ') || '-')}</td>
                <td>${escapeHtml(formatDate(profile.lastOpenedAt || profile.createdAt))}</td>
                <td>${getProfileStatus(profile.id)}</td>
                <td>${renderProfileActions(profile.id)}</td>
            </tr>
        `;
    }).join('');
    syncProfileSelectionState();
}

function renderTrashTable() {
    const deletedProfiles = appState.profiles
        .filter((profile) => !!profile.deletedAt)
        .sort((left, right) => Number(right.deletedAt || 0) - Number(left.deletedAt || 0));

    if (!deletedProfiles.length) {
        trashTableBody.innerHTML = '<tr><td colspan="5">回收站中还没有环境。</td></tr>';
        return;
    }

    trashTableBody.innerHTML = deletedProfiles.map((profile) => {
        const project = getProjectById(profile.deletedFromProjectId) || getProjects()[0];
        return `
            <tr>
                <td>${escapeHtml(getProfileCode(profile))}</td>
                <td>
                    <div class="profile-title">${escapeHtml(profile.name)}</div>
                    <div class="profile-meta">${escapeHtml(profile.notes || '-')}</div>
                </td>
                <td>${escapeHtml(project?.name || '默认项目')}</td>
                <td>${escapeHtml(formatDate(profile.deletedAt))}</td>
                <td>${renderTrashActions(profile.id)}</td>
            </tr>
        `;
    }).join('');
}

function renderProxyTable() {
    const proxies = getVisibleProxies();
    if (!proxies.length) {
        proxyTableBody.innerHTML = '<tr><td colspan="8">当前还没有导入任何代理。</td></tr>';
        return;
    }

    proxyTableBody.innerHTML = proxies.map((proxy) => `
        <tr>
            <td>${escapeHtml(proxy.name)}</td>
            <td>${escapeHtml(getProxyProtocol(proxy))}</td>
            <td>${escapeHtml(proxy.source === 'subscription' ? '订阅' : proxy.source === 'file' ? '文件' : '手动')}</td>
            <td>${escapeHtml(getProxyGeoSummary(proxy))}</td>
            <td><span class="status-pill ${getProxyStatusMeta(proxy.status).className}">${escapeHtml(getProxyStatusMeta(proxy.status).label)}</span></td>
            <td>${proxy.latency > 0 ? `${proxy.latency}ms` : '-'}</td>
            <td>${escapeHtml(formatDate(proxy.lastCheckedAt || proxy.updatedAt))}</td>
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

function getAccountStatusMeta(status) {
    const current = String(status || '').trim() || 'active';
    if (current === 'blocked') {
        return { label: '受限', className: 'stopped' };
    }
    if (current === 'idle') {
        return { label: '闲置', className: 'launching' };
    }
    return { label: '可用', className: 'running' };
}

function getProxyStatusMeta(status) {
    const current = String(status || '').trim() || 'unknown';
    if (current === 'ok') {
        return { label: '可用', className: 'running' };
    }
    if (current === 'error') {
        return { label: '异常', className: 'stopped' };
    }
    return { label: '未检测', className: 'launching' };
}

function getProxyGeoSummary(proxy = {}) {
    const location = [proxy.countryCode, proxy.city].filter(Boolean).join(' / ');
    const provider = String(proxy.provider || '').trim();
    if (location && provider) {
        return `${location} · ${provider}`;
    }
    return location || provider || '-';
}

function fillAccountForm(account = null) {
    document.getElementById('accountId').value = account?.id || '';
    document.getElementById('accountPlatform').value = account?.platform || '';
    document.getElementById('accountUsername').value = account?.username || '';
    document.getElementById('accountPassword').value = account?.password || '';
    document.getElementById('accountEmail').value = account?.email || '';
    document.getElementById('accountPhone').value = account?.phone || '';
    document.getElementById('accountTwoFactorSecret').value = account?.twoFactorSecret || '';
    accountProfileIdSelect.value = account?.profileId || '';
    document.getElementById('accountStatus').value = account?.status || 'active';
    document.getElementById('accountNotes').value = account?.notes || '';
}

function collectAccountPayload() {
    return {
        id: document.getElementById('accountId').value || undefined,
        platform: document.getElementById('accountPlatform').value.trim(),
        username: document.getElementById('accountUsername').value.trim(),
        password: document.getElementById('accountPassword').value,
        email: document.getElementById('accountEmail').value.trim(),
        phone: document.getElementById('accountPhone').value.trim(),
        twoFactorSecret: document.getElementById('accountTwoFactorSecret').value.trim(),
        profileId: accountProfileIdSelect.value || '',
        status: document.getElementById('accountStatus').value || 'active',
        notes: document.getElementById('accountNotes').value.trim()
    };
}

function getAccountCookieCount(account) {
    try {
        const parsed = JSON.parse(String(account?.cookies || '').trim() || '[]');
        if (Array.isArray(parsed)) {
            return parsed.length;
        }
        if (parsed && Array.isArray(parsed.cookies)) {
            return parsed.cookies.length;
        }
    } catch (error) {
        return 0;
    }
    return 0;
}

function getAccountLocalStorageSummary(account) {
    try {
        const raw = String(account?.localStorage || '').trim();
        if (!raw) {
            return { origins: 0, items: 0 };
        }

        const parsed = JSON.parse(raw);
        const origins = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.origins) ? parsed.origins : []);
        const originCount = origins.length;
        const itemCount = origins.reduce((total, entry) => {
            if (Array.isArray(entry?.items)) {
                return total + entry.items.length;
            }
            if (Array.isArray(entry?.entries)) {
                return total + entry.entries.length;
            }
            return total;
        }, 0);
        return {
            origins: originCount,
            items: itemCount
        };
    } catch (error) {
        return { origins: 0, items: 0 };
    }
}

function getExtensionBoundProfileCount(extensionId) {
    return appState.profiles.filter((profile) => !profile.deletedAt && Array.isArray(profile.extensionIds) && profile.extensionIds.includes(extensionId)).length;
}

function getSelectedActiveProfileIds() {
    return Array.from(selectedProfileIds).filter((profileId) => {
        const profile = appState.profiles.find((item) => item.id === profileId);
        return profile && !profile.deletedAt;
    });
}

function renderExtensionTable() {
    const extensions = getExtensions();
    if (!extensions.length) {
        extensionTableBody.innerHTML = '<tr><td colspan="7">当前还没有导入任何扩展。</td></tr>';
        return;
    }

    extensionTableBody.innerHTML = extensions.map((extension) => `
        <tr>
            <td>
                <div class="profile-title">${escapeHtml(extension.name)}</div>
                <div class="profile-meta">${escapeHtml(extension.path || '-')}</div>
            </td>
            <td>${escapeHtml(extension.version || '-')}</td>
            <td>${escapeHtml(extension.sourceType || '-')}</td>
            <td>${escapeHtml(extension.scope || 'profile')}</td>
            <td>${extension.enabled ? '<span class="status-pill running">已启用</span>' : '<span class="status-pill stopped">已停用</span>'}</td>
            <td>${escapeHtml(`${getExtensionBoundProfileCount(extension.id)} 个环境`)}</td>
            <td>
                <div class="profile-actions">
                    <button class="small-btn" data-action="assign-extension" data-id="${extension.id}">分配到已选环境</button>
                    <button class="small-btn" data-action="remove-extension" data-id="${extension.id}">从已选移除</button>
                    <button class="small-btn" data-action="toggle-extension" data-id="${extension.id}">${extension.enabled ? '停用' : '启用'}</button>
                    <button class="small-btn danger" data-action="delete-extension" data-id="${extension.id}">删除</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderAccountTable() {
    const accounts = getAccounts();
    if (!accounts.length) {
        accountTableBody.innerHTML = '<tr><td colspan="6">当前还没有保存任何账号。</td></tr>';
        return;
    }

    accountTableBody.innerHTML = accounts.map((account) => {
        const profile = appState.profiles.find((item) => item.id === account.profileId) || null;
        const project = profile ? getProjectById(profile.projectId) : null;
        const statusMeta = getAccountStatusMeta(account.status);
        const contact = [account.email, account.phone].filter(Boolean).join(' / ') || '-';
        const cookieCount = getAccountCookieCount(account);
        const localStorageSummary = getAccountLocalStorageSummary(account);
        const binding = profile
            ? `${profile.name}${project ? ` / ${project.name}` : ''}`
            : '未绑定';

        return `
            <tr>
                <td>
                    <div class="profile-title">${escapeHtml(account.platform || '-')}</div>
                    <div class="profile-meta">${escapeHtml(account.username || account.email || account.phone || '-')}</div>
                    <div class="profile-meta">${escapeHtml(`Cookie ${cookieCount} 条 / Storage ${localStorageSummary.origins} 站点 ${localStorageSummary.items} 项`)}</div>
                </td>
                <td>
                    <div class="profile-title">${escapeHtml(contact)}</div>
                    <div class="profile-meta">${escapeHtml(account.twoFactorSecret ? '已保存二步验证码密钥' : '未保存二步验证码密钥')}</div>
                </td>
                <td>${escapeHtml(binding)}</td>
                <td><span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span></td>
                <td>${escapeHtml(formatDate(account.updatedAt || account.createdAt))}</td>
                <td>
                    <div class="profile-actions">
                        <button class="small-btn" data-action="edit-account" data-id="${account.id}">编辑</button>
                        <button class="small-btn" data-action="export-account-cookies" data-id="${account.id}">导出 Cookie</button>
                        <button class="small-btn" data-action="import-account-cookies" data-id="${account.id}">导入 Cookie</button>
                        <button class="small-btn" data-action="export-account-storage" data-id="${account.id}">导出 Storage</button>
                        <button class="small-btn" data-action="import-account-storage" data-id="${account.id}">导入 Storage</button>
                        <button class="small-btn danger" data-action="delete-account" data-id="${account.id}">删除</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
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
        toolTimeoutMs: Math.max(5000, Math.min(60000, Number(agentToolTimeoutInput.value) || 20000)),
        maxExecutionSteps: Math.max(3, Math.min(50, Number(agentMaxExecutionStepsInput.value) || 10))
    };
}

function renderAgentSettings() {
    if (agentToolTimeoutInput) {
        agentToolTimeoutInput.value = String(getAgentToolTimeoutMs());
    }
    if (agentMaxExecutionStepsInput) {
        agentMaxExecutionStepsInput.value = String(getAgentMaxExecutionSteps());
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
    const runtimeAgent = getAgentRuntime();
    const batch = getAgentBatchState(runtimeAgent);
    const counts = getAgentBatchCounts(batch);
    const sessionProvider = getAgentProviders().find((item) => item.id === runtimeAgent.providerId) || activeProvider;
    const batchProvider = batch.providerId
        ? {
            id: batch.providerId,
            name: batch.providerName,
            format: batch.providerFormat,
            model: batch.model
        }
        : null;
    const modelCount = getAgentProviders().filter((provider) => String(provider.model || '').trim()).length;
    const hasSession = !!runtimeAgent.sessionId;
    const hasBatchState = !!batch.tasks.length;
    const sessionProfileRuntime = runtimeAgent.profileId ? getRunning(runtimeAgent.profileId) : null;
    const currentBatchTask = batch.tasks.find((item) => item.id === batch.currentTaskId) || batch.tasks[0] || null;
    const displayProvider = batch.running || hasBatchState
        ? (batchProvider || activeProvider)
        : (hasSession ? sessionProvider : activeProvider);
    const modeLabel = batch.running || hasBatchState
        ? '批量任务'
        : (hasSession ? '单窗口会话' : '未启动');
    const statusLabel = batch.running
        ? (batch.stopRequested ? '停止中' : '执行中')
        : (hasBatchState
            ? `待清空（成功 ${counts.success} / 失败 ${counts.error} / 停止 ${counts.stopped}）`
            : (runtimeAgent.running ? '执行中' : (hasSession ? '待命中' : '未启动')));
    const currentTarget = batch.running
        ? (currentBatchTask?.profileName || '-')
        : (hasBatchState ? `${counts.total} 个窗口` : (runtimeAgent.profileName || '-'));
    const currentPage = currentBatchTask?.pageUrl || runtimeAgent.pageUrl || '-';
    const batchTuning = hasBatchState
        ? `并发 ${batch.concurrency || 1} / 重试 ${batch.maxRetries || 0} / 策略 ${(batch.failureStrategy || 'skip') === 'stop' ? '失败即停' : '跳过继续'}`
        : '';
    const exportSummary = batch.exportFilePath
        ? `${batch.exportFilePath}${batch.exportedAt ? ` / ${formatDate(batch.exportedAt)}` : ''}`
        : '';
    const browserState = batch.running || hasBatchState
        ? '按需接管或自动拉起批量窗口'
        : (sessionProfileRuntime ? '已连接真实窗口' : (runtimeAgent.profileId ? '将自动拉起窗口' : '-'));

    if (batch.running) {
        agentActiveProviderBadge.textContent = `批量任务中 / ${counts.running || 1}/${counts.total || 1} / ${batch.model || '-'}`;
    } else if (hasBatchState) {
        agentActiveProviderBadge.textContent = `批量结果 / 成功 ${counts.success} / 失败 ${counts.error} / 停止 ${counts.stopped}`;
    } else if (hasSession) {
        agentActiveProviderBadge.textContent = `会话中 / ${runtimeAgent.profileName || '未命名窗口'} / ${runtimeAgent.model || '-'}`;
    } else if (modelCount) {
        agentActiveProviderBadge.textContent = `已配置 ${modelCount} 个可用模型`;
    } else {
        agentActiveProviderBadge.textContent = '未配置可用模型';
    }

    agentCurrentProviderEl.innerHTML = displayProvider
        ? `
            <div class="agent-provider-title">${escapeHtml(displayProvider.model || '未选择模型')}</div>
            <div class="agent-provider-meta">${escapeHtml(displayProvider.name || '-')} / ${escapeHtml(displayProvider.format || '-')}</div>
        `
        : '<div class="agent-provider-meta">先在左侧保存供应商与模型，然后再打开独立 Agent 控制台。</div>';

    agentRuntimeCard.innerHTML = `
        <div class="agent-runtime-row"><span>运行模式</span><strong>${escapeHtml(modeLabel)}</strong></div>
        <div class="agent-runtime-row"><span>执行状态</span><strong>${escapeHtml(statusLabel)}</strong></div>
        <div class="agent-runtime-row"><span>当前目标</span><strong>${escapeHtml(currentTarget)}</strong></div>
        <div class="agent-runtime-row"><span>模型</span><strong>${escapeHtml(displayProvider?.model || runtimeAgent.model || activeProvider?.model || '-')}</strong></div>
        <div class="agent-runtime-row"><span>浏览器状态</span><strong>${escapeHtml(browserState)}</strong></div>
        <div class="agent-runtime-row"><span>当前页面</span><strong>${escapeHtml(currentPage)}</strong></div>
        ${hasBatchState ? `<div class="agent-runtime-row"><span>批量统计</span><strong>${escapeHtml(`总数 ${counts.total} / 执行中 ${counts.running} / 成功 ${counts.success} / 失败 ${counts.error} / 停止 ${counts.stopped}`)}</strong></div>` : ''}
    `;
    if (batchTuning) {
        agentRuntimeCard.innerHTML += `<div class="agent-runtime-row"><span>批量策略</span><strong>${escapeHtml(batchTuning)}</strong></div>`;
    }
    if (exportSummary) {
        agentRuntimeCard.innerHTML += `<div class="agent-runtime-row"><span>最近导出</span><strong>${escapeHtml(exportSummary)}</strong></div>`;
    }

    providerModelsHint.textContent = activeProvider
        ? `当前编辑配置已缓存 ${activeProvider.models?.length || 0} 个模型，可继续手动补充模型 ID。`
        : '模型列表尚未拉取';
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

function renderAgentCapabilities() {
    const capabilityList = document.querySelector('.agent-capability-list');
    if (!capabilityList) {
        return;
    }

    const items = [
        '页面快照',
        '页面跳转',
        '点击',
        '单字段填写',
        '多字段表单',
        '文件上传',
        '等待选择器',
        '截图',
        '页面信息'
    ];

    capabilityList.innerHTML = items
        .map((item) => `<span class="capability-chip">${escapeHtml(item)}</span>`)
        .join('');
}

function renderAgentPanel() {
    openAgentLaunchDialogBtn.textContent = '打开 Agent 控制台';
    renderAgentSettings();
    renderAgentProviderList();
    renderAgentRuntime();
    renderAgentDocs();
    renderAgentCapabilities();

    const currentId = document.getElementById('agentProviderId').value;
    const editing = getAgentProviders().find((item) => item.id === currentId);
    if (!currentId || !editing) {
        fillAgentProviderForm(getActiveProvider());
    } else {
        fillAgentProviderForm(editing);
    }
}

function renderSyncPanel() {
    const syncState = getSyncState();
    const profiles = getActiveProfiles();
    const currentMasterId = syncState.running
        ? syncState.masterProfileId
        : (syncMasterProfileIdSelect.value || '');
    const currentSlaveIds = new Set(syncState.running
        ? syncState.slaveProfileIds
        : Array.from(syncSlaveProfileList.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value));
    const currentEventTypes = new Set(syncState.running
        ? syncState.eventTypes
        : Array.from(syncEventTypeList.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value));

    syncMasterProfileIdSelect.innerHTML = ['<option value="">选择主窗口</option>'].concat(profiles.map((profile) => (
        `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`
    ))).join('');
    syncMasterProfileIdSelect.value = profiles.some((profile) => profile.id === currentMasterId) ? currentMasterId : '';

    const eventTypeOptions = [
        { value: 'navigation', label: '导航' },
        { value: 'click', label: '点击' },
        { value: 'input', label: '输入' },
        { value: 'scroll', label: '滚动' }
    ];
    syncEventTypeList.innerHTML = eventTypeOptions.map((item) => `
        <label class="small-btn">
            <input type="checkbox" class="sync-event-type" value="${item.value}" ${currentEventTypes.has(item.value) ? 'checked' : ''} ${syncState.running ? 'disabled' : ''}>
            ${item.label}
        </label>
    `).join('');

    syncSlaveProfileList.innerHTML = profiles
        .filter((profile) => profile.id !== syncMasterProfileIdSelect.value)
        .map((profile) => `
            <label class="small-btn">
                <input type="checkbox" class="sync-slave-checkbox" value="${escapeHtml(profile.id)}" ${currentSlaveIds.has(profile.id) ? 'checked' : ''} ${syncState.running ? 'disabled' : ''}>
                ${escapeHtml(profile.name)}
            </label>
        `).join('') || '<span class="profile-meta">当前没有可用从窗口。</span>';

    const counts = syncState.counts || { total: 0, success: 0, error: 0 };
    const master = profiles.find((profile) => profile.id === syncState.masterProfileId);
    syncRuntimeCard.innerHTML = `
        <div class="agent-runtime-row"><span>运行状态</span><strong>${escapeHtml(syncState.running ? '同步中' : '未启动')}</strong></div>
        <div class="agent-runtime-row"><span>主窗口</span><strong>${escapeHtml(master?.name || '-')}</strong></div>
        <div class="agent-runtime-row"><span>事件类型</span><strong>${escapeHtml((syncState.eventTypes || []).join(' / ') || '-')}</strong></div>
        <div class="agent-runtime-row"><span>总事件</span><strong>${escapeHtml(String(counts.total || 0))}</strong></div>
        <div class="agent-runtime-row"><span>成功 / 失败</span><strong>${escapeHtml(`${counts.success || 0} / ${counts.error || 0}`)}</strong></div>
        <div class="agent-runtime-row"><span>最近事件</span><strong>${escapeHtml(syncState.lastEvent?.type || '-')}</strong></div>
    `;

    if (!syncState.slaves?.length) {
        syncSlaveTableBody.innerHTML = '<tr><td colspan="4">当前没有从窗口状态。</td></tr>';
    } else {
        syncSlaveTableBody.innerHTML = syncState.slaves.map((slave) => `
            <tr>
                <td>${escapeHtml(slave.profileName || slave.profileId)}</td>
                <td>${escapeHtml(String(slave.success || 0))}</td>
                <td>${escapeHtml(String(slave.error || 0))}</td>
                <td>${escapeHtml(slave.lastError || (slave.lastEventAt ? `最近成功 ${formatDate(slave.lastEventAt)}` : '-'))}</td>
            </tr>
        `).join('');
    }

    if (!syncState.events?.length) {
        syncEventLog.innerHTML = '<div class="sub-item">还没有同步事件。</div>';
    } else {
        syncEventLog.innerHTML = syncState.events.map((event) => `
            <div class="sub-item">
                <div>
                    <div class="profile-title">${escapeHtml(event.type || '-')}</div>
                    <div class="profile-meta">${escapeHtml(event.url || event.selector || event.href || '-')}</div>
                </div>
                <div class="profile-meta">${escapeHtml(formatDate(event.timestamp || Date.now()))}</div>
            </div>
        `).join('');
    }

    syncMasterProfileIdSelect.disabled = syncState.running;
    startSyncBtn.disabled = syncState.running;
    stopSyncBtn.disabled = !syncState.running;
}

function renderAll() {
    renderStats();
    renderBrowserKernelPanel();
    renderUpdaterAction();
    renderProjectOptions();
    renderAccountProfileOptions();
    renderProfileExtensionOptions();
    renderTemplatePanel();
    renderProxySelect();
    renderProxyFilters();
    renderProfileTable();
    renderTrashTable();
    renderExtensionTable();
    renderAccountTable();
    renderProxyTable();
    renderSubscriptions();
    renderAgentPanel();
    renderSyncPanel();
    syncProfileSelectionState();
}

function collectProfilePayload() {
    captureFingerprintDraftFromForm();
    return {
        id: document.getElementById('profileId').value || undefined,
        templateId: document.getElementById('profileTemplateId').value || '',
        projectId: profileProjectIdSelect.value || getProjects()[0]?.id || 'default',
        name: document.getElementById('profileName').value.trim(),
        startUrl: document.getElementById('profileStartUrl').value.trim(),
        proxyId: document.getElementById('profileProxyId').value,
        tags: document.getElementById('profileTags').value.trim(),
        notes: document.getElementById('profileNotes').value.trim(),
        extensionIds: Array.from(profileExtensionList.querySelectorAll('.profile-extension-checkbox:checked')).map((input) => input.value),
        fingerprint: clone(currentFingerprintDraft)
    };
}

function collectProfileDraftPayload() {
    const payload = collectProfilePayload();
    return {
        name: payload.name,
        startUrl: payload.startUrl,
        proxyId: payload.proxyId,
        projectId: payload.projectId,
        notes: payload.notes,
        tags: payload.tags,
        extensionIds: payload.extensionIds,
        fingerprint: payload.fingerprint
    };
}

function collectBatchCreatePayload() {
    return {
        count: Number(batchCreateCountInput.value) || 0,
        namePrefix: batchCreatePrefixInput.value.trim() || document.getElementById('profileName').value.trim(),
        proxyMode: batchCreateProxyModeSelect.value || 'current',
        inheritTags: batchCreateInheritTagsInput.checked,
        randomizeFingerprint: batchCreateRandomizeFingerprintInput.checked,
        templateId: document.getElementById('profileTemplateId').value || '',
        profileDraft: collectProfileDraftPayload()
    };
}

async function handleBodyActions(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const { action, id } = button.dataset;

    if (action === 'edit-profile') {
        const profile = appState.profiles.find((item) => item.id === id);
        fillProfileForm(profile);
        fillProjectForm(getProjectById(profile?.projectId) || getProjects()[0] || null);
        syncTemplateEditor(getTemplateById(profile?.templateId || ''));
        setView('create');
        return;
    }

    if (action === 'manage-profile-account') {
        const linkedAccounts = getAccountsByProfileId(id);
        if (linkedAccounts.length === 1) {
            fillAccountForm(linkedAccounts[0]);
        } else if (linkedAccounts.length > 1) {
            fillAccountForm(linkedAccounts[0]);
            showToast(`当前环境已绑定 ${linkedAccounts.length} 个账号，已打开最新一个。`);
        } else {
            fillAccountForm({
                profileId: id,
                status: 'active'
            });
        }
        setView('accounts');
        return;
    }

    if (action === 'clone-profile') {
        await window.xbrowser.cloneProfile(id);
        showToast('环境已克隆。');
        return;
    }

    if (action === 'export-profile') {
        const result = await window.xbrowser.exportProfiles({ ids: [id] });
        if (!result?.canceled) {
            showToast('环境导出完成。');
        }
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

    if (action === 'trash-profile') {
        if (!window.confirm('确定把这个环境移入回收站吗？')) return;
        await window.xbrowser.trashProfile(id);
        clearLaunchProgress(id);
        renderProfileTable();
        renderTrashTable();
        showToast('环境已移入回收站。');
        return;
    }

    if (action === 'restore-profile') {
        await window.xbrowser.restoreProfile(id);
        renderProfileTable();
        renderTrashTable();
        showToast('环境已恢复。');
        return;
    }

    if (action === 'destroy-profile') {
        if (!window.confirm('确定彻底删除这个环境吗？此操作无法恢复。')) return;
        await window.xbrowser.destroyProfile(id);
        clearLaunchProgress(id);
        renderTrashTable();
        showToast('环境已彻底删除。');
        return;
    }

    if (action === 'test-proxy') {
        await window.xbrowser.testProxy(id);
        showToast('代理检测完成。');
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

    if (action === 'toggle-extension') {
        const extension = getExtensions().find((item) => item.id === id);
        await window.xbrowser.toggleExtension({ id, enabled: !extension?.enabled });
        showToast(extension?.enabled ? '扩展已停用。' : '扩展已启用。');
        return;
    }

    if (action === 'assign-extension' || action === 'remove-extension') {
        const profileIds = getSelectedActiveProfileIds();
        if (!profileIds.length) {
            showToast('请先在首页勾选环境。');
            return;
        }

        const result = await window.xbrowser.batchAssignExtension({
            extensionId: id,
            profileIds,
            mode: action === 'remove-extension' ? 'remove' : 'add'
        });
        showToast(result.mode === 'remove'
            ? `已从 ${result.updated} 个环境移除扩展。`
            : `已分配到 ${result.updated} 个环境。`);
        return;
    }

    if (action === 'delete-extension') {
        if (!window.confirm('确定删除这个扩展吗？已绑定到环境的配置会一并移除。')) return;
        await window.xbrowser.deleteExtension(id);
        showToast('扩展已删除。');
        return;
    }

    if (action === 'edit-account') {
        const account = getAccounts().find((item) => item.id === id);
        fillAccountForm(account);
        setView('accounts');
        return;
    }

    if (action === 'delete-account') {
        if (!window.confirm('确定删除这个账号吗？')) return;
        await window.xbrowser.deleteAccount(id);
        if (document.getElementById('accountId').value === id) {
            fillAccountForm();
        }
        showToast('账号已删除。');
        return;
    }

    if (action === 'export-account-cookies') {
        const result = await window.xbrowser.exportAccountCookies({ accountId: id });
        if (!result?.canceled) {
            showToast(`已导出 ${result.exported} 条 Cookie。`);
        }
        return;
    }

    if (action === 'import-account-cookies') {
        const result = await window.xbrowser.importAccountCookies({ accountId: id });
        if (!result?.canceled) {
            const applyHint = result.applied ? '，并已写入绑定环境' : '';
            showToast(`已导入 ${result.imported} 条 Cookie${applyHint}。`);
        }
        return;
    }

    if (action === 'export-account-storage') {
        const result = await window.xbrowser.exportAccountStorage({ accountId: id });
        if (!result?.canceled) {
            showToast(`已导出 ${result.exportedOrigins} 个站点、${result.exportedItems} 项 LocalStorage。`);
        }
        return;
    }

    if (action === 'import-account-storage') {
        const result = await window.xbrowser.importAccountStorage({ accountId: id });
        if (!result?.canceled) {
            const applyHint = result.applied ? '，并已写入绑定环境' : '';
            showToast(`已导入 ${result.importedOrigins} 个站点、${result.importedItems} 项 LocalStorage${applyHint}。`);
        }
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
    if (!Array.isArray(appState.templates)) {
        appState.templates = await window.xbrowser.listTemplates();
    }
    if (!Array.isArray(appState.accounts)) {
        appState.accounts = await window.xbrowser.listAccounts();
    }
    homeProjectId = appState.settings.ui?.homeProjectId || 'all';
    initializeProfileSearchableOptions();
    bindProfileBasicSettings();
    syncProfileBasicSettingsVisibility();
    mountAgentSettingsFields();
    renderAll();

    const initialView = viewIds.includes(appState.settings.ui.activeView)
        ? appState.settings.ui.activeView
        : 'home';
    setView(initialView);

    fillProfileForm();
    fillProjectForm();
    fillAccountForm();
    syncTemplateEditor(null);
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

    const currentTemplate = getTemplateById(payload.templateId || '');
    await window.xbrowser.saveProfile(payload);
    fillProfileForm();
    syncTemplateEditor(currentTemplate);
    await randomizeFingerprintFields();
    setView('home');
    showToast('环境已保存。');
});

accountForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = collectAccountPayload();
    if (!payload.platform) {
        showToast('账号平台不能为空。');
        return;
    }
    if (!payload.username && !payload.email && !payload.phone) {
        showToast('至少填写用户名、邮箱或手机号。');
        return;
    }

    if (payload.id) {
        await window.xbrowser.updateAccount(payload);
        showToast('账号已更新。');
    } else {
        await window.xbrowser.createAccount(payload);
        showToast('账号已保存。');
    }

    fillAccountForm();
});

homeProjectFilterSelect.addEventListener('change', (event) => {
    homeProjectId = event.target.value || 'all';
    renderProfileTable();
});

projectEditorIdSelect.addEventListener('change', () => {
    if (!projectEditorIdSelect.value) {
        projectNameInput.value = '';
        projectColorInput.value = '#0f766e';
        projectNotesInput.value = '';
        deleteProjectBtn.disabled = true;
        return;
    }
    fillProjectForm(getProjectById(projectEditorIdSelect.value) || getProjects()[0] || null);
});

saveProjectBtn.addEventListener('click', async () => {
    const name = projectNameInput.value.trim();
    if (!name) {
        showToast('项目名称不能为空。');
        return;
    }

    const payload = {
        id: projectEditorIdSelect.value || undefined,
        name,
        color: projectColorInput.value,
        notes: projectNotesInput.value.trim()
    };
    const project = payload.id
        ? await window.xbrowser.updateProject(payload)
        : await window.xbrowser.createProject(payload);
    projectEditorIdSelect.dataset.pendingValue = project.id;
    profileProjectIdSelect.dataset.pendingValue = project.id;
    fillProjectForm(project);
    profileProjectIdSelect.value = project.id;
    showToast('项目已保存。');
});

deleteProjectBtn.addEventListener('click', async () => {
    const project = getProjectById(projectEditorIdSelect.value);
    if (!project || project.id === 'default') {
        showToast('默认项目不能删除。');
        return;
    }
    if (!window.confirm(`确定删除项目“${project.name}”吗？环境会回到默认项目。`)) return;

    await window.xbrowser.deleteProject(project.id);
    fillProjectForm(getProjects()[0] || null);
    profileProjectIdSelect.value = 'default';
    showToast('项目已删除。');
});

resetProjectBtn.addEventListener('click', () => {
    projectEditorIdSelect.value = '';
    projectNameInput.value = '';
    projectColorInput.value = '#0f766e';
    projectNotesInput.value = '';
    deleteProjectBtn.disabled = true;
});

resetAccountBtn.addEventListener('click', () => {
    fillAccountForm();
});

syncMasterProfileIdSelect.addEventListener('change', () => {
    renderSyncPanel();
});

startSyncBtn.addEventListener('click', async () => {
    const masterProfileId = syncMasterProfileIdSelect.value || '';
    const slaveProfileIds = Array.from(syncSlaveProfileList.querySelectorAll('.sync-slave-checkbox:checked')).map((input) => input.value);
    const eventTypes = Array.from(syncEventTypeList.querySelectorAll('.sync-event-type:checked')).map((input) => input.value);
    const result = await window.xbrowser.startSyncSession({
        masterProfileId,
        slaveProfileIds,
        eventTypes
    });
    appState.runtime.sync = result;
    renderSyncPanel();
    showToast(`同步器已启动，主窗口将同步到 ${result.slaveProfileIds.length} 个从窗口。`);
});

stopSyncBtn.addEventListener('click', async () => {
    const result = await window.xbrowser.stopSyncSession();
    appState.runtime.sync = result;
    renderSyncPanel();
    showToast('同步器已停止。');
});

selectAllProfilesInput.addEventListener('change', (event) => {
    const visibleProfiles = getVisibleHomeProfiles();
    if (event.target.checked) {
        visibleProfiles.forEach((profile) => selectedProfileIds.add(profile.id));
    } else {
        visibleProfiles.forEach((profile) => selectedProfileIds.delete(profile.id));
    }
    renderProfileTable();
});

clearProfileSelectionBtn.addEventListener('click', () => {
    selectedProfileIds.clear();
    renderProfileTable();
});

batchMoveBtn.addEventListener('click', async () => {
    const projectId = batchMoveProjectIdSelect.value || '';
    if (!projectId) {
        showToast('请先选择目标项目。');
        return;
    }
    const profileIds = Array.from(selectedProfileIds);
    if (!profileIds.length) {
        showToast('请先选择环境。');
        return;
    }

    const result = await window.xbrowser.moveProfilesToProject({ profileIds, projectId });
    selectedProfileIds.clear();
    batchMoveProjectIdSelect.value = '';
    renderProfileTable();
    showToast(`已移动 ${result.moved} 个环境。`);
});

batchBindProxyBtn.addEventListener('click', async () => {
    const selectedProxyId = batchProxyIdSelect.value || '';
    if (!selectedProxyId) {
        showToast('请先选择要批量绑定的代理。');
        return;
    }

    const profileIds = getSelectedActiveProfileIds();
    if (!profileIds.length) {
        showToast('请先选择环境。');
        return;
    }

    const result = await window.xbrowser.batchAssignProxy({
        profileIds,
        proxyId: selectedProxyId === '__direct__' ? '' : selectedProxyId
    });
    selectedProfileIds.clear();
    batchProxyIdSelect.value = '';
    renderProfileTable();
    showToast(result.proxyId ? `已为 ${result.updated} 个环境绑定代理。` : `已将 ${result.updated} 个环境切换为直连。`);
});

refreshProxyGeoBtn.addEventListener('click', async () => {
    const result = await window.xbrowser.refreshProxyGeo({});
    showToast(`已刷新 ${result.updated} 个代理的地区信息。`);
});

allocateProxyBtn.addEventListener('click', async () => {
    const profileIds = getSelectedActiveProfileIds();
    if (!profileIds.length) {
        showToast('请先在首页选择环境。');
        return;
    }

    const result = await window.xbrowser.allocateProxy({
        profileIds,
        mode: proxyAllocationModeSelect.value || 'manual',
        countryCode: proxyCountryFilterSelect.value || '',
        city: proxyCityFilterSelect.value || '',
        maxLatency: proxyLatencyFilterSelect.value || ''
    });
    showToast(`已按 ${result.mode} 为 ${result.assigned} 个环境分配代理。`);
});

batchCreateBtn.addEventListener('click', async () => {
    const payload = collectBatchCreatePayload();
    if (payload.count < 2) {
        showToast('批量创建数量至少为 2。');
        return;
    }

    const result = await window.xbrowser.batchCreateProfiles(payload);
    const proxyHint = result.proxyMode === 'round-robin'
        ? '已按代理列表轮询分配。'
        : (result.proxyMode === 'direct' ? '已按直连创建。' : '已沿用当前代理。');
    setView('home');
    showToast(`已批量创建 ${result.created} 个环境，${proxyHint}`);
});

templateSelect.addEventListener('change', () => {
    const template = getTemplateById(templateSelect.value);
    syncTemplateEditor(template);
});

applyTemplateBtn.addEventListener('click', () => {
    const template = getTemplateById(templateSelect.value);
    if (!template) {
        showToast('请先选择模板。');
        return;
    }

    fillProfileForm({
        ...clone(template.profileDraft || {}),
        id: '',
        templateId: template.id
    });
    setView('create');
    showToast('已套用模板，请确认环境名称后保存。');
});

saveTemplateBtn.addEventListener('click', async () => {
    const name = templateNameInput.value.trim();
    if (!name) {
        showToast('模板名称不能为空。');
        return;
    }

    const template = await window.xbrowser.saveTemplate({
        id: document.getElementById('templateEditorId').value || undefined,
        name,
        notes: templateNotesInput.value.trim(),
        profileDraft: collectProfileDraftPayload()
    });
    syncTemplateEditor(template);
    showToast('模板已保存。');
});

deleteTemplateBtn.addEventListener('click', async () => {
    const template = getTemplateById(templateSelect.value);
    if (!template) {
        showToast('请先选择模板。');
        return;
    }
    if (!window.confirm(`确定删除模板“${template.name}”吗？`)) return;

    await window.xbrowser.deleteTemplate(template.id);
    if (document.getElementById('profileTemplateId').value === template.id) {
        document.getElementById('profileTemplateId').value = '';
    }
    syncTemplateEditor(null);
    showToast('模板已删除。');
});

resetTemplateBtn.addEventListener('click', () => {
    syncTemplateEditor(null);
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

openAgentLaunchDialogBtn.addEventListener('click', () => {
    window.xbrowser.openAgentWindow();
});

document.getElementById('importProxyFileBtn').addEventListener('click', async () => {
    const result = await window.xbrowser.importProxyFile();
    if (!result?.canceled) {
        showToast(`已导入 ${result.added} 个代理。`);
    }
});

importExtensionBtn.addEventListener('click', async () => {
    const result = await window.xbrowser.importUnpackedExtension();
    if (!result?.canceled) {
        showToast(`扩展已导入：${result.name}`);
        setView('extensions');
    }
});

importCrxExtensionBtn.addEventListener('click', async () => {
    const result = await window.xbrowser.importCrxExtension();
    if (!result?.canceled) {
        showToast(`CRX 已导入：${result.name}`);
        setView('extensions');
    }
});

browserKernelMenuBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    setBrowserKernelMenuOpen(!browserKernelMenuOpen);
});

browserKernelMenu?.addEventListener('click', async (event) => {
    event.stopPropagation();
    const actionButton = event.target.closest('[data-browser-kernel-action]');
    if (!actionButton) {
        return;
    }

    const action = actionButton.dataset.browserKernelAction || '';
    const revision = actionButton.dataset.revision || '';
    if (!revision || action === 'none') {
        return;
    }

    if (action === 'install') {
        const browser = await window.xbrowser.installBrowserVersion({ revision });
        showToast(browser?.activeVersion ? `Installed and activated Chromium r${browser.activeVersion}` : `Installed Chromium r${revision}`);
        return;
    }

    if (action === 'activate') {
        const browser = await window.xbrowser.activateBrowserVersion({ revision });
        showToast(browser?.activeVersion ? `Activated Chromium r${browser.activeVersion}` : `Activated Chromium r${revision}`);
    }
});

refreshBrowserCatalogBtn?.addEventListener('click', async () => {
    const browser = await window.xbrowser.refreshBrowserCatalog();
    showToast(browser?.error ? `Chromium list refresh failed: ${browser.error}` : 'Chromium versions refreshed');
});

openBrowserInstallDirBtn?.addEventListener('click', () => {
    window.xbrowser.openBrowserDir();
});

document.getElementById('openDataDirBtn').addEventListener('click', () => {
    window.xbrowser.openDataDir();
});

document.addEventListener('click', (event) => {
    if (!event.target.closest('.topbar-kernel-wrap')) {
        setBrowserKernelMenuOpen(false);
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        setBrowserKernelMenuOpen(false);
    }
});

updateActionBtn?.addEventListener('click', async () => {
    const updater = getUpdaterState();
    if (updater.status !== 'downloaded' || !updater.canRestartToUpdate) {
        return;
    }
    showToast('正在重启并安装更新。');
    await window.xbrowser.installUpdate();
});

document.getElementById('resetFormBtn').addEventListener('click', async () => {
    fillProfileForm();
    await randomizeFingerprintFields();
});

document.getElementById('randomizeBtn').addEventListener('click', async () => {
    await randomizeFingerprintFields();
});

summaryRandomizeBtn?.addEventListener('click', async () => {
    await randomizeFingerprintFields();
});

copyProfileIdBtn?.addEventListener('click', async () => {
    const value = String(document.getElementById('profileId').value || '').trim();
    if (!value) {
        showToast('当前窗口还没有可复制的 ID。');
        return;
    }
    try {
        await navigator.clipboard.writeText(value);
        showToast('窗口 ID 已复制。');
    } catch (error) {
        showToast('复制失败，请稍后重试。');
    }
});

jumpToProxyBtn?.addEventListener('click', () => setView('proxies'));

clearSelectedProxyBtn?.addEventListener('click', () => {
    document.getElementById('profileProxyId').value = '';
    updateProfileDraftPreview();
});

jumpToAccountsBtn?.addEventListener('click', () => setView('accounts'));

document.getElementById('profilePlatform').addEventListener('change', async () => {
    await randomizeFingerprintFields();
});

document.querySelectorAll('.preset-url-btn').forEach((button) => {
    button.addEventListener('click', () => {
        document.getElementById('profileStartUrl').value = button.dataset.url;
        updateProfileDraftPreview();
    });
});

document.getElementById('gotoCreateBtn').addEventListener('click', () => setView('create'));
document.getElementById('importProfilesBtn').addEventListener('click', async () => {
    const result = await window.xbrowser.importProfiles();
    if (!result?.canceled) {
        const templateHint = result.templates ? `，同时导入 ${result.templates} 个模板` : '';
        showToast(`已导入 ${result.imported} 个环境${templateHint}。`);
    }
});
document.getElementById('exportProfilesBtn').addEventListener('click', async () => {
    const result = await window.xbrowser.exportProfiles({});
    if (!result?.canceled) {
        showToast(`已导出 ${result.exported} 个环境。`);
    }
});
document.getElementById('refreshHomeBtn').addEventListener('click', () => renderAll());

homeSearchInput.addEventListener('input', (event) => {
    homeSearch = event.target.value.trim().toLowerCase();
    renderProfileTable();
});

proxyCountryFilterSelect.addEventListener('change', (event) => {
    proxyCountryFilter = String(event.target.value || '').trim().toUpperCase();
    proxyCityFilter = '';
    renderProxyFilters();
    renderProxyTable();
});

proxyCityFilterSelect.addEventListener('change', (event) => {
    proxyCityFilter = String(event.target.value || '').trim();
    renderProxyTable();
});

proxyLatencyFilterSelect.addEventListener('change', (event) => {
    proxyLatencyFilter = String(event.target.value || '').trim();
    renderProxyTable();
});

proxyAllocationModeSelect.addEventListener('change', (event) => {
    window.xbrowser.saveSettings({
        proxyAllocation: {
            mode: event.target.value || 'manual'
        }
    }).catch(() => {});
});

profileTableBody.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.profile-select');
    if (!checkbox) return;

    if (checkbox.checked) {
        selectedProfileIds.add(checkbox.dataset.id);
    } else {
        selectedProfileIds.delete(checkbox.dataset.id);
    }
    syncProfileSelectionState();
});

document.querySelectorAll('.tab-chip').forEach((button) => {
    button.addEventListener('click', () => {
        homeFilter = button.dataset.filter;
        document.querySelectorAll('.tab-chip').forEach((item) => item.classList.toggle('active', item === button));
        renderProfileTable();
    });
});

profileForm.addEventListener('input', () => {
    if (document.activeElement?.classList?.contains('smart-select-search')) {
        return;
    }
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
    const previousUpdater = getUpdaterState();
    appState = state;

    const nextUpdater = getUpdaterState();
    const downloadToastKey = `downloaded:${nextUpdater.downloadedVersion || ''}`;
    if (nextUpdater.status === 'downloaded' && previousUpdater.status !== 'downloaded' && lastUpdaterToastKey !== downloadToastKey) {
        lastUpdaterToastKey = downloadToastKey;
        showToast(`新版本 ${nextUpdater.downloadedVersion ? `v${nextUpdater.downloadedVersion} ` : ''}已下载，退出应用时会自动安装。`);
    }

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
