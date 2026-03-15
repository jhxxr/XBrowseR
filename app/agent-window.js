let appState = {
    profiles: [],
    settings: {
        agent: { providers: [], activeProviderId: '' }
    },
    runtime: {
        running: [],
        agent: { running: false, events: [] }
    }
};

const toastEl = document.getElementById('toast');
const agentStatusBadge = document.getElementById('agentStatusBadge');
const agentLaunchForm = document.getElementById('agentLaunchForm');
const agentLaunchModelSelect = document.getElementById('agentLaunchModel');
const agentLaunchProfileSelect = document.getElementById('agentLaunchProfile');
const agentLaunchMessageInput = document.getElementById('agentLaunchMessage');
const startAgentSessionBtn = document.getElementById('startAgentSessionBtn');
const agentCurrentModelEl = document.getElementById('agentCurrentModel');
const agentCurrentProfileEl = document.getElementById('agentCurrentProfile');
const agentCurrentPageEl = document.getElementById('agentCurrentPage');
const agentConversationList = document.getElementById('agentConversationList');
const agentComposerForm = document.getElementById('agentComposerForm');
const agentComposerInput = document.getElementById('agentComposerInput');
const sendAgentMessageBtn = document.getElementById('sendAgentMessageBtn');
const stopAgentBtn = document.getElementById('stopAgentBtn');
const closeAgentSessionBtn = document.getElementById('closeAgentSessionBtn');

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

function showToast(message) {
    toastEl.textContent = String(message || '发生未知错误');
    toastEl.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
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
        events: []
    };
}

function getRunning(profileId) {
    return (appState.runtime.running || []).find((item) => item.id === profileId);
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

function renderLaunchOptions() {
    const runtimeAgent = getAgentRuntime();
    const modelChoices = getAgentModelChoices();
    const selectedModel = modelChoices.some((item) => item.value === agentLaunchModelSelect.value)
        ? agentLaunchModelSelect.value
        : (runtimeAgent.providerId || getActiveProvider()?.id || modelChoices[0]?.value || '');

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

    startAgentSessionBtn.disabled = !modelChoices.length || !appState.profiles.length;
}

function renderSummary() {
    const runtimeAgent = getAgentRuntime();
    const hasSession = !!runtimeAgent.sessionId;
    const badgeText = runtimeAgent.running
        ? '执行中'
        : (hasSession ? '会话待命中' : '未启动');

    agentStatusBadge.textContent = badgeText;
    agentCurrentModelEl.textContent = runtimeAgent.model || getActiveProvider()?.model || '-';
    agentCurrentProfileEl.textContent = runtimeAgent.profileName || '-';
    agentCurrentPageEl.textContent = runtimeAgent.pageUrl || '-';

    stopAgentBtn.disabled = !runtimeAgent.running;
    closeAgentSessionBtn.disabled = !hasSession;
    sendAgentMessageBtn.disabled = !hasSession || runtimeAgent.running;
    agentComposerInput.disabled = !hasSession || runtimeAgent.running;
    agentComposerInput.placeholder = hasSession
        ? (runtimeAgent.running ? 'Agent 正在执行，请等待或先停止当前操作。' : '继续告诉 Agent 你想让这个窗口做什么')
        : '先启动一个窗口会话';
}

function renderConversation() {
    const runtimeAgent = getAgentRuntime();
    const events = Array.isArray(runtimeAgent.events) ? runtimeAgent.events : [];

    if (!events.length) {
        agentConversationList.innerHTML = runtimeAgent.sessionId
            ? '<div class="conversation-item"><div class="conversation-body">会话已建立。发送第一条消息，让 Agent 接管这个窗口。</div></div>'
            : '<div class="conversation-item"><div class="conversation-body">启动会话后，这里会持续显示对话、状态和浏览器动作。</div></div>';
        return;
    }

    agentConversationList.innerHTML = events.map((entry) => {
        let title = '状态';
        let body = entry.message || '';
        let className = '';

        if (entry.kind === 'message' && entry.role === 'user') {
            title = '你';
            body = entry.content || '';
            className = 'user';
        } else if (entry.kind === 'message' && entry.role === 'assistant') {
            title = 'Agent';
            body = entry.content || '';
            className = 'assistant';
        } else if (entry.kind === 'tool') {
            title = '工具';
        } else if (entry.level === 'error') {
            className = 'error';
        }

        return `
            <div class="conversation-item ${className}">
                <div class="conversation-meta">
                    <span>${escapeHtml(title)}</span>
                    <span>${escapeHtml(formatDate(entry.createdAt))}</span>
                </div>
                <div class="conversation-body">${escapeHtml(body)}</div>
            </div>
        `;
    }).join('');

    agentConversationList.scrollTop = agentConversationList.scrollHeight;
}

function renderAll() {
    renderLaunchOptions();
    renderSummary();
    renderConversation();
}

agentLaunchForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const providerId = agentLaunchModelSelect.value;
    const profileId = agentLaunchProfileSelect.value;
    const initialMessage = agentLaunchMessageInput.value.trim();

    if (!providerId) {
        showToast('请先选择一个模型。');
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

    agentLaunchMessageInput.value = '';
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

stopAgentBtn.addEventListener('click', async () => {
    await window.xbrowser.stopAgentTask();
});

closeAgentSessionBtn.addEventListener('click', async () => {
    if (!window.confirm('确定结束当前 Agent 会话吗？这不会关闭真实浏览器窗口。')) return;
    await window.xbrowser.closeAgentSession();
    agentComposerInput.value = '';
    showToast('Agent 会话已结束。');
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
