let appState = {
    profiles: [],
    settings: {
        agent: { providers: [], activeProviderId: '' }
    },
    runtime: {
        running: [],
        agent: { running: false, events: [], batch: { running: false, tasks: [] } }
    }
};

let agentMode = 'batch';
let selectedTaskId = '';
let selectedBatchProfileIds = new Set();

const toastEl = document.getElementById('toast');
const agentStatusBadge = document.getElementById('agentStatusBadge');
const modeBatchBtn = document.getElementById('modeBatchBtn');
const modeSingleBtn = document.getElementById('modeSingleBtn');
const launchTitle = document.getElementById('launchTitle');
const launchMeta = document.getElementById('launchMeta');
const agentLaunchModelSelect = document.getElementById('agentLaunchModel');
const agentLaunchProfileSelect = document.getElementById('agentLaunchProfile');
const agentLaunchMessageInput = document.getElementById('agentLaunchMessage');
const agentBatchPromptInput = document.getElementById('agentBatchPrompt');
const batchModeSection = document.getElementById('batchModeSection');
const singleModeSection = document.getElementById('singleModeSection');
const batchProfileGrid = document.getElementById('batchProfileGrid');
const selectAllProfilesBtn = document.getElementById('selectAllProfilesBtn');
const selectRunningProfilesBtn = document.getElementById('selectRunningProfilesBtn');
const clearSelectedProfilesBtn = document.getElementById('clearSelectedProfilesBtn');
const startBatchBtn = document.getElementById('startBatchBtn');
const startSingleSessionBtn = document.getElementById('startSingleSessionBtn');
const boardTitle = document.getElementById('boardTitle');
const boardMeta = document.getElementById('boardMeta');
const batchOverview = document.getElementById('batchOverview');
const batchBoard = document.getElementById('batchBoard');
const singleBoard = document.getElementById('singleBoard');
const singleTaskCard = document.getElementById('singleTaskCard');
const agentComposerForm = document.getElementById('agentComposerForm');
const agentComposerInput = document.getElementById('agentComposerInput');
const sendAgentMessageBtn = document.getElementById('sendAgentMessageBtn');
const stopAgentBtn = document.getElementById('stopAgentBtn');
const closeAgentSessionBtn = document.getElementById('closeAgentSessionBtn');
const detailTitle = document.getElementById('detailTitle');
const detailBadge = document.getElementById('detailBadge');
const agentCurrentModelEl = document.getElementById('agentCurrentModel');
const agentCurrentProfileEl = document.getElementById('agentCurrentProfile');
const agentCurrentPageEl = document.getElementById('agentCurrentPage');
const detailSummary = document.getElementById('detailSummary');
const detailEventList = document.getElementById('detailEventList');

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString();
}

function formatDuration(ms) {
    const value = Math.max(0, Number(ms) || 0);
    if (!value) return '-';
    if (value < 1000) return `${value}ms`;
    if (value < 60000) return `${(value / 1000).toFixed(1)}s`;
    return `${(value / 60000).toFixed(1)}m`;
}

function showToast(message) {
    toastEl.textContent = String(message || '发生未知错误');
    toastEl.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function getRunning(profileId) {
    return (appState.runtime.running || []).find((item) => item.id === profileId);
}

function getAgentProviders() {
    return appState.settings.agent?.providers || [];
}

function getActiveProvider() {
    const activeId = appState.settings.agent?.activeProviderId || '';
    return getAgentProviders().find((item) => item.id === activeId) || getAgentProviders()[0] || null;
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
        events: [],
        batch: {
            running: false,
            tasks: []
        }
    };
}

function getBatchState() {
    return getAgentRuntime().batch || {
        running: false,
        stopRequested: false,
        jobId: '',
        providerId: '',
        providerName: '',
        providerFormat: '',
        model: '',
        prompt: '',
        currentTaskId: '',
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
    };
}

function getBatchCounts(batch = getBatchState()) {
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

async function runUiAction(action) {
    try {
        await action();
    } catch (error) {
        console.error('[agent-window]', error);
        showToast(error?.message || 'Operation failed');
    }
}

function getAgentModelChoices() {
    return getAgentProviders()
        .filter((provider) => String(provider.model || '').trim())
        .map((provider) => ({
            value: provider.id,
            label: provider.name && provider.name !== provider.model
                ? `${provider.model} · ${provider.name}`
                : provider.model
        }));
}

function getSelectedTask() {
    if (agentMode !== 'batch') {
        return null;
    }
    return getBatchState().tasks.find((task) => task.id === selectedTaskId) || null;
}

function getSingleTaskSummary(runtimeAgent) {
    const lastAssistant = runtimeAgent.events
        .slice()
        .reverse()
        .find((entry) => entry.kind === 'message' && entry.role === 'assistant');
    const lastStatus = runtimeAgent.events
        .slice()
        .reverse()
        .find((entry) => entry.kind === 'status');

    return {
        title: runtimeAgent.profileName || '未启动会话',
        status: runtimeAgent.running ? 'running' : (runtimeAgent.sessionId ? 'success' : 'queued'),
        summary: lastAssistant?.content || lastStatus?.message || '启动单窗口会话后，这里会显示执行摘要。',
        pageUrl: runtimeAgent.pageUrl || '-'
    };
}

function syncSelections() {
    const validProfileIds = new Set(appState.profiles.map((profile) => profile.id));
    selectedBatchProfileIds = new Set(Array.from(selectedBatchProfileIds).filter((id) => validProfileIds.has(id)));

    const batch = getBatchState();
    const taskIds = new Set(batch.tasks.map((task) => task.id));
    if (!taskIds.has(selectedTaskId)) {
        selectedTaskId = batch.currentTaskId || batch.tasks[0]?.id || '';
    }
}

function renderMode() {
    const isBatch = agentMode === 'batch';
    modeBatchBtn.classList.toggle('active', isBatch);
    modeSingleBtn.classList.toggle('active', !isBatch);
    batchModeSection.classList.toggle('hidden', !isBatch);
    singleModeSection.classList.toggle('hidden', isBatch);
    batchBoard.classList.toggle('hidden', !isBatch);
    singleBoard.classList.toggle('hidden', isBatch);

    launchTitle.textContent = isBatch ? '批量任务启动器' : '单窗口高级会话';
    launchMeta.textContent = isBatch ? '多窗口是第一公民' : '精细接管单个窗口';
    boardTitle.textContent = isBatch ? '任务卡片' : '当前会话';
}

function renderLaunchOptions() {
    const runtimeAgent = getAgentRuntime();
    const batch = getBatchState();
    const modelChoices = getAgentModelChoices();
    const selectedModel = modelChoices.some((item) => item.value === agentLaunchModelSelect.value)
        ? agentLaunchModelSelect.value
        : (batch.providerId || runtimeAgent.providerId || getActiveProvider()?.id || modelChoices[0]?.value || '');

    if (!modelChoices.length) {
        agentLaunchModelSelect.innerHTML = '<option value="">暂无可用模型</option>';
        agentLaunchModelSelect.value = '';
    } else {
        agentLaunchModelSelect.innerHTML = modelChoices.map((choice) => `
            <option value="${choice.value}">${escapeHtml(choice.label)}</option>
        `).join('');
        agentLaunchModelSelect.value = selectedModel;
    }

    const selectedProfile = appState.profiles.some((item) => item.id === agentLaunchProfileSelect.value)
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
        agentLaunchProfileSelect.value = selectedProfile;
    }

    batchProfileGrid.innerHTML = appState.profiles.length
        ? appState.profiles.map((profile) => {
            const checked = selectedBatchProfileIds.has(profile.id) ? 'checked' : '';
            const runtime = getRunning(profile.id);
            return `
                <label class="profile-option">
                    <div class="profile-option-head">
                        <div class="profile-option-title">${escapeHtml(profile.name)}</div>
                        <input type="checkbox" data-profile-id="${profile.id}" ${checked}>
                    </div>
                    <div class="profile-option-meta">
                        ${runtime ? '运行中，可直接接管' : '未运行，将由 Agent 自动拉起'}<br>
                        ${escapeHtml(profile.startUrl || '使用默认起始页')}
                    </div>
                </label>
            `;
        }).join('')
        : '<div class="detail-summary">暂无窗口，请先在主界面创建指纹窗口。</div>';

    startBatchBtn.disabled = !modelChoices.length || !appState.profiles.length;
    startSingleSessionBtn.disabled = !modelChoices.length || !appState.profiles.length;
}

function renderStatus() {
    const runtimeAgent = getAgentRuntime();
    const batch = getBatchState();

    if (batch.running) {
        agentStatusBadge.textContent = '批量执行中';
    } else if (batch.tasks.length) {
        agentStatusBadge.textContent = '批量任务待命';
    } else if (runtimeAgent.running) {
        agentStatusBadge.textContent = '单窗口执行中';
    } else if (runtimeAgent.sessionId) {
        agentStatusBadge.textContent = '单窗口会话待命';
    } else {
        agentStatusBadge.textContent = '空闲';
    }

    stopAgentBtn.disabled = !runtimeAgent.running && !batch.running;
    closeAgentSessionBtn.disabled = !runtimeAgent.sessionId && !batch.tasks.length;
    sendAgentMessageBtn.disabled = agentMode !== 'single' || !runtimeAgent.sessionId || runtimeAgent.running || batch.running;
    agentComposerInput.disabled = sendAgentMessageBtn.disabled;
}

function renderBatchBoard() {
    const batch = getBatchState();
    if (!batch.tasks.length) {
        batchBoard.innerHTML = '<div class="detail-summary">输入一条批量任务说明，选择多个窗口后启动。每个窗口都会生成独立任务卡。</div>';
        return;
    }

    batchBoard.innerHTML = batch.tasks.map((task, index) => `
        <article class="task-card ${task.id === selectedTaskId ? 'active' : ''}" data-task-id="${task.id}">
            <div class="task-card-head">
                <div class="task-card-title">
                    <strong>Task ${index + 1} · ${escapeHtml(task.profileName)}</strong>
                    <div class="task-card-subtitle">${escapeHtml(task.pageUrl || '等待执行')}</div>
                </div>
                <span class="task-status ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span>
            </div>
            <div class="task-summary">${escapeHtml(task.summary || task.lastMessage || '等待模型规划')}</div>
            <div class="task-meta-row">
                <span class="task-chip">耗时 ${escapeHtml(formatDuration(task.durationMs))}</span>
                <span class="task-chip">事件 ${escapeHtml(String(task.events.length))}</span>
                <span class="task-chip">${escapeHtml(task.error ? '存在错误' : '可展开详情')}</span>
            </div>
        </article>
    `).join('');
}

function renderSingleBoard() {
    const runtimeAgent = getAgentRuntime();
    const summary = getSingleTaskSummary(runtimeAgent);

    singleTaskCard.innerHTML = `
        <div class="task-card-head">
            <div class="task-card-title">
                <strong>${escapeHtml(summary.title)}</strong>
                <div class="task-card-subtitle">${escapeHtml(summary.pageUrl)}</div>
            </div>
            <span class="task-status ${escapeHtml(summary.status)}">${escapeHtml(summary.status)}</span>
        </div>
        <div class="task-summary">${escapeHtml(summary.summary)}</div>
        <div class="task-meta-row">
            <span class="task-chip">事件 ${escapeHtml(String(runtimeAgent.events.length))}</span>
            <span class="task-chip">${escapeHtml(runtimeAgent.model || '未绑定模型')}</span>
        </div>
    `;
}

function getDetailPayload() {
    const runtimeAgent = getAgentRuntime();
    const batch = getBatchState();

    if (agentMode === 'batch') {
        const task = getSelectedTask();
        if (!task) {
            return {
                title: '任务详情',
                badge: batch.running ? '执行中' : '等待选择',
                summary: '选择一张任务卡，查看它的执行步骤、摘要和错误信息。',
                model: batch.model || runtimeAgent.model || '-',
                profile: '-',
                page: '-',
                events: []
            };
        }

        return {
            title: task.profileName,
            badge: task.status,
            summary: task.summary || task.error || task.lastMessage || '暂无摘要',
            model: batch.model || runtimeAgent.model || '-',
            profile: task.profileName,
            page: task.pageUrl || '-',
            events: task.events
        };
    }

    return {
        title: runtimeAgent.profileName || '单窗口会话',
        badge: runtimeAgent.running ? '执行中' : (runtimeAgent.sessionId ? '待命' : '未启动'),
        summary: getSingleTaskSummary(runtimeAgent).summary,
        model: runtimeAgent.model || getActiveProvider()?.model || '-',
        profile: runtimeAgent.profileName || '-',
        page: runtimeAgent.pageUrl || '-',
        events: runtimeAgent.events
    };
}

function renderDetail() {
    const detail = getDetailPayload();
    detailTitle.textContent = detail.title;
    detailBadge.textContent = detail.badge;
    agentCurrentModelEl.textContent = detail.model;
    agentCurrentProfileEl.textContent = detail.profile;
    agentCurrentPageEl.textContent = detail.page;
    detailSummary.textContent = detail.summary;

    if (!detail.events.length) {
        detailEventList.innerHTML = '<div class="detail-summary">这里会显示任务步骤、工具调用和状态变化。</div>';
        return;
    }

    detailEventList.innerHTML = detail.events.map((entry) => {
        let type = '';
        let label = '状态';
        let body = entry.message || '';

        if (entry.kind === 'message' && entry.role === 'user') {
            type = 'user';
            label = '你';
            body = entry.content || '';
        } else if (entry.kind === 'message' && entry.role === 'assistant') {
            type = 'assistant';
            label = 'Agent';
            body = entry.content || '';
        } else if (entry.kind === 'tool') {
            type = 'tool';
            label = '工具';
        } else if (entry.level === 'error') {
            type = 'error';
        }

        return `
            <article class="detail-event ${type}">
                <div class="detail-event-meta">
                    <span>${escapeHtml(label)}</span>
                    <span>${escapeHtml(formatDate(entry.createdAt))}</span>
                </div>
                <div class="detail-event-body">${escapeHtml(body)}</div>
            </article>
        `;
    }).join('');
}

function renderMode() {
    const isBatch = agentMode === 'batch';
    modeBatchBtn.classList.toggle('active', isBatch);
    modeSingleBtn.classList.toggle('active', !isBatch);
    batchModeSection.classList.toggle('hidden', !isBatch);
    singleModeSection.classList.toggle('hidden', isBatch);
    batchOverview.classList.toggle('hidden', !isBatch);
    batchBoard.classList.toggle('hidden', !isBatch);
    singleBoard.classList.toggle('hidden', isBatch);

    launchTitle.textContent = isBatch ? '批量任务启动器' : '单窗口高级会话';
    launchMeta.textContent = isBatch ? '多窗口是第一公民' : '精细接管单个窗口';
    boardTitle.textContent = isBatch ? '任务卡片' : '当前会话';
    closeAgentSessionBtn.textContent = isBatch ? '清空当前任务' : '结束当前会话';
}

function renderLaunchOptions() {
    const runtimeAgent = getAgentRuntime();
    const batch = getBatchState();
    const busy = runtimeAgent.running || batch.running;
    const modelChoices = getAgentModelChoices();
    const selectedModel = modelChoices.some((item) => item.value === agentLaunchModelSelect.value)
        ? agentLaunchModelSelect.value
        : (batch.providerId || runtimeAgent.providerId || getActiveProvider()?.id || modelChoices[0]?.value || '');

    if (!modelChoices.length) {
        agentLaunchModelSelect.innerHTML = '<option value="">暂无可用模型</option>';
        agentLaunchModelSelect.value = '';
    } else {
        agentLaunchModelSelect.innerHTML = modelChoices.map((choice) => `
            <option value="${choice.value}">${escapeHtml(choice.label)}</option>
        `).join('');
        agentLaunchModelSelect.value = selectedModel;
    }

    const selectedProfile = appState.profiles.some((item) => item.id === agentLaunchProfileSelect.value)
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
        agentLaunchProfileSelect.value = selectedProfile;
    }

    batchProfileGrid.innerHTML = appState.profiles.length
        ? appState.profiles.map((profile) => {
            const checked = selectedBatchProfileIds.has(profile.id) ? 'checked' : '';
            const runtime = getRunning(profile.id);
            return `
                <label class="profile-option">
                    <div class="profile-option-head">
                        <div class="profile-option-title">${escapeHtml(profile.name)}</div>
                        <input type="checkbox" data-profile-id="${profile.id}" ${checked}>
                    </div>
                    <div class="profile-option-meta">
                        ${runtime ? '运行中，可直接接管' : '未运行，将由 Agent 自动拉起'}<br>
                        ${escapeHtml(profile.startUrl || '使用默认起始页')}
                    </div>
                </label>
            `;
        }).join('')
        : '<div class="detail-summary">暂无窗口，请先在主界面创建指纹窗口。</div>';

    startBatchBtn.disabled = busy || !modelChoices.length || !appState.profiles.length;
    startSingleSessionBtn.disabled = busy || !modelChoices.length || !appState.profiles.length;
}

function renderStatus() {
    const runtimeAgent = getAgentRuntime();
    const batch = getBatchState();

    if (batch.running) {
        agentStatusBadge.textContent = batch.stopRequested ? '批量停止中' : '批量执行中';
    } else if (batch.tasks.length) {
        agentStatusBadge.textContent = '批量任务待命';
    } else if (runtimeAgent.running) {
        agentStatusBadge.textContent = '单窗口执行中';
    } else if (runtimeAgent.sessionId) {
        agentStatusBadge.textContent = '单窗口会话待命';
    } else {
        agentStatusBadge.textContent = '空闲';
    }

    if (agentMode === 'batch') {
        const counts = getBatchCounts(batch);
        boardMeta.textContent = batch.tasks.length
            ? `总 ${counts.total} · 运行 ${counts.running} · 成功 ${counts.success} · 异常 ${counts.error} · 停止 ${counts.stopped}`
            : '默认面向多窗口任务编排';
    } else {
        boardMeta.textContent = runtimeAgent.sessionId
            ? '持续对话模式，适合精细接管单个窗口'
            : '高级模式，仅操作一个窗口';
    }

    stopAgentBtn.disabled = !runtimeAgent.running && !batch.running;
    closeAgentSessionBtn.disabled = !runtimeAgent.sessionId && !batch.tasks.length;
    sendAgentMessageBtn.disabled = agentMode !== 'single' || !runtimeAgent.sessionId || runtimeAgent.running || batch.running;
    agentComposerInput.disabled = sendAgentMessageBtn.disabled;
}

function renderBatchOverview() {
    const batch = getBatchState();
    if (agentMode !== 'batch') {
        batchOverview.innerHTML = '';
        return;
    }

    const counts = getBatchCounts(batch);
    batchOverview.innerHTML = `
        <div class="overview-card">
            <div class="overview-label">Total</div>
            <div class="overview-value">${counts.total}</div>
        </div>
        <div class="overview-card">
            <div class="overview-label">Running</div>
            <div class="overview-value running">${counts.running}</div>
        </div>
        <div class="overview-card">
            <div class="overview-label">Success</div>
            <div class="overview-value success">${counts.success}</div>
        </div>
        <div class="overview-card">
            <div class="overview-label">Error</div>
            <div class="overview-value error">${counts.error}</div>
        </div>
        <div class="overview-card">
            <div class="overview-label">Stopped</div>
            <div class="overview-value stopped">${counts.stopped}</div>
        </div>
    `;
}

function renderBatchBoard() {
    const batch = getBatchState();
    if (!batch.tasks.length) {
        batchBoard.innerHTML = '<div class="detail-summary">输入一条批量任务说明，选择多个窗口后启动。每个窗口都会生成独立任务卡。</div>';
        return;
    }

    batchBoard.innerHTML = batch.tasks.map((task, index) => `
        <article class="task-card ${task.id === selectedTaskId ? 'active' : ''}" data-task-id="${task.id}">
            <div class="task-card-head">
                <div class="task-card-title">
                    <strong>Task ${index + 1} · ${escapeHtml(task.profileName)}</strong>
                    <div class="task-card-subtitle">${escapeHtml(task.pageUrl || '等待执行')}</div>
                </div>
                <span class="task-status ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span>
            </div>
            <div class="task-summary">${escapeHtml(task.summary || task.lastMessage || '等待模型规划')}</div>
            <div class="task-meta-row">
                <span class="task-chip">耗时 ${escapeHtml(formatDuration(task.durationMs))}</span>
                <span class="task-chip">事件 ${escapeHtml(String(task.events.length))}</span>
                <span class="task-chip">${escapeHtml(task.error ? '存在错误' : '可展开详情')}</span>
            </div>
        </article>
    `).join('');
}

function renderDetail() {
    const detail = getDetailPayload();
    detailTitle.textContent = detail.title;
    detailBadge.textContent = detail.badge;
    agentCurrentModelEl.textContent = detail.model;
    agentCurrentProfileEl.textContent = detail.profile;
    agentCurrentPageEl.textContent = detail.page;
    detailSummary.textContent = detail.summary;

    if (!detail.events.length) {
        detailEventList.innerHTML = '<div class="detail-summary">这里会显示任务步骤、工具调用和状态变化。</div>';
        return;
    }

    detailEventList.innerHTML = detail.events.map((entry) => {
        let type = '';
        let label = '状态';
        let body = entry.message || '';

        if (entry.kind === 'message' && entry.role === 'user') {
            type = 'user';
            label = '你';
            body = entry.content || '';
        } else if (entry.kind === 'message' && entry.role === 'assistant') {
            type = 'assistant';
            label = 'Agent';
            body = entry.content || '';
        } else if (entry.kind === 'tool') {
            type = 'tool';
            label = '工具';
        } else if (entry.level === 'warn') {
            type = 'warn';
        } else if (entry.level === 'error') {
            type = 'error';
        }

        return `
            <article class="detail-event ${type}">
                <div class="detail-event-meta">
                    <span>${escapeHtml(label)}</span>
                    <span>${escapeHtml(formatDate(entry.createdAt))}</span>
                </div>
                <div class="detail-event-body">${escapeHtml(body)}</div>
            </article>
        `;
    }).join('');
}

function renderAll() {
    syncSelections();
    renderMode();
    renderLaunchOptions();
    renderStatus();
    renderBatchOverview();
    renderBatchBoard();
    renderSingleBoard();
    renderDetail();
}

modeBatchBtn.addEventListener('click', () => {
    agentMode = 'batch';
    renderAll();
});

modeSingleBtn.addEventListener('click', () => {
    agentMode = 'single';
    renderAll();
});

batchProfileGrid.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[data-profile-id]');
    if (!checkbox) return;

    if (checkbox.checked) {
        selectedBatchProfileIds.add(checkbox.dataset.profileId);
    } else {
        selectedBatchProfileIds.delete(checkbox.dataset.profileId);
    }
});

selectAllProfilesBtn.addEventListener('click', () => {
    selectedBatchProfileIds = new Set(appState.profiles.map((profile) => profile.id));
    renderLaunchOptions();
});

selectRunningProfilesBtn.addEventListener('click', () => {
    selectedBatchProfileIds = new Set((appState.runtime.running || []).map((item) => item.id));
    renderLaunchOptions();
});

clearSelectedProfilesBtn.addEventListener('click', () => {
    selectedBatchProfileIds = new Set();
    renderLaunchOptions();
});

startBatchBtn.addEventListener('click', async () => {
    const providerId = agentLaunchModelSelect.value;
    const prompt = agentBatchPromptInput.value.trim();
    const profileIds = Array.from(selectedBatchProfileIds);

    if (!providerId) {
        showToast('请先选择模型。');
        return;
    }
    if (!profileIds.length) {
        showToast('请至少选择一个窗口。');
        return;
    }
    if (!prompt) {
        showToast('请输入批量任务说明。');
        return;
    }

    await window.xbrowser.startAgentBatch({
        providerId,
        profileIds,
        prompt
    });
    showToast('批量任务已启动。');
});

startSingleSessionBtn.addEventListener('click', async () => {
    const providerId = agentLaunchModelSelect.value;
    const profileId = agentLaunchProfileSelect.value;
    const initialMessage = agentLaunchMessageInput.value.trim();

    if (!providerId) {
        showToast('请先选择模型。');
        return;
    }
    if (!profileId) {
        showToast('请选择目标窗口。');
        return;
    }

    await window.xbrowser.startAgentSession({
        providerId,
        profileId,
        initialMessage
    });
    agentMode = 'single';
    agentLaunchMessageInput.value = '';
    showToast('单窗口会话已启动。');
});

batchBoard.addEventListener('click', (event) => {
    const card = event.target.closest('[data-task-id]');
    if (!card) return;
    selectedTaskId = card.dataset.taskId;
    renderAll();
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

stopAgentBtn.addEventListener('click', async () => {
    await window.xbrowser.stopAgentTask();
});

closeAgentSessionBtn.addEventListener('click', async () => {
    if (!window.confirm('确定清空当前任务或会话吗？这不会关闭真实浏览器窗口。')) return;
    await window.xbrowser.closeAgentSession();
    selectedTaskId = '';
    showToast('当前 Agent 任务已清空。');
});

function interceptUiEvent(element, eventName, handler) {
    element.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        runUiAction(() => handler(event));
    }, true);
}

interceptUiEvent(startBatchBtn, 'click', async () => {
    const providerId = agentLaunchModelSelect.value;
    const prompt = agentBatchPromptInput.value.trim();
    const profileIds = Array.from(selectedBatchProfileIds);

    if (!providerId) {
        showToast('请先选择模型。');
        return;
    }
    if (!profileIds.length) {
        showToast('请至少选择一个窗口。');
        return;
    }
    if (!prompt) {
        showToast('请输入批量任务说明。');
        return;
    }

    await window.xbrowser.startAgentBatch({
        providerId,
        profileIds,
        prompt
    });
    showToast('批量任务已启动。');
});

interceptUiEvent(startSingleSessionBtn, 'click', async () => {
    const providerId = agentLaunchModelSelect.value;
    const profileId = agentLaunchProfileSelect.value;
    const initialMessage = agentLaunchMessageInput.value.trim();

    if (!providerId) {
        showToast('请先选择模型。');
        return;
    }
    if (!profileId) {
        showToast('请选择目标窗口。');
        return;
    }

    await window.xbrowser.startAgentSession({
        providerId,
        profileId,
        initialMessage
    });
    agentMode = 'single';
    agentLaunchMessageInput.value = '';
    showToast('单窗口会话已启动。');
});

interceptUiEvent(agentComposerForm, 'submit', async () => {
    const message = agentComposerInput.value.trim();
    if (!message) {
        showToast('消息不能为空。');
        return;
    }

    await window.xbrowser.sendAgentSessionMessage({ message });
    agentComposerInput.value = '';
});

interceptUiEvent(stopAgentBtn, 'click', async () => {
    const stopped = await window.xbrowser.stopAgentTask();
    if (!stopped) {
        showToast('当前没有可停止的执行。');
        return;
    }
    showToast(agentMode === 'batch' ? '正在停止批量任务。' : '正在停止当前操作。');
});

interceptUiEvent(closeAgentSessionBtn, 'click', async () => {
    if (!window.confirm('确定清空当前任务或会话吗？这不会关闭真实浏览器窗口。')) return;
    await window.xbrowser.closeAgentSession();
    selectedTaskId = '';
    showToast('当前 Agent 任务已清空。');
});

window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    console.error('[agent-window:unhandledrejection]', event.reason);
    showToast(event.reason?.message || '操作失败');
});

window.xbrowser.onStateUpdated((state) => {
    appState = state;
    renderAll();
});

window.xbrowser.onAgentEvent((payload) => {
    if (payload?.kind === 'status' && payload.level === 'error') {
        console.error('[agent-event]', payload.message || payload);
    }
});

window.xbrowser.bootstrap()
    .then((state) => {
        appState = state;
        renderAll();
    })
    .catch((error) => showToast(error.message || '初始化失败'));
