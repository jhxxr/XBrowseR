function createEmptySyncState() {
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

function escapeForScript(value) {
    return JSON.stringify(value);
}

function buildSyncInjectionScript(eventTypes = []) {
    return `
(() => {
    if (window.__xbrowserSyncInstalled) return;
    window.__xbrowserSyncInstalled = true;
    const enabled = new Set(${escapeForScript(eventTypes)});
    const bindingName = '__xbrowserSyncEmit';
    const pendingInputs = new Map();
    const cssEscape = (value) => {
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(String(value));
        }
        return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
    };
    const safeText = (value) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, 120);
    const emit = (payload) => {
        if (typeof window[bindingName] !== 'function') return;
        try {
            window[bindingName](JSON.stringify({
                ...payload,
                href: location.href,
                title: document.title,
                timestamp: Date.now()
            }));
        } catch (error) {
        }
    };
    const buildSelector = (input) => {
        const element = input && input.nodeType === Node.ELEMENT_NODE
            ? input
            : (input && input.parentElement ? input.parentElement : null);
        if (!element || element === document.documentElement) {
            return 'html';
        }
        if (element.id) {
            return '#' + cssEscape(element.id);
        }
        const attrCandidates = [
            ['data-testid', element.getAttribute('data-testid')],
            ['data-test', element.getAttribute('data-test')],
            ['name', element.getAttribute('name')],
            ['aria-label', element.getAttribute('aria-label')]
        ];
        for (const [key, value] of attrCandidates) {
            if (value) {
                return '[' + key + '="' + String(value).replace(/"/g, '\\"') + '"]';
            }
        }
        const parts = [];
        let current = element;
        while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
            let part = current.tagName.toLowerCase();
            const siblings = current.parentElement
                ? Array.from(current.parentElement.children).filter((item) => item.tagName === current.tagName)
                : [];
            if (siblings.length > 1) {
                part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
            }
            parts.unshift(part);
            current = current.parentElement;
            if (current && current.id) {
                parts.unshift('#' + cssEscape(current.id));
                break;
            }
        }
        return parts.join(' > ');
    };
    const emitNavigation = (reason) => {
        if (!enabled.has('navigation')) return;
        emit({ type: 'navigation', reason, url: location.href });
    };
    if (enabled.has('navigation')) {
        const originalPushState = history.pushState.bind(history);
        history.pushState = function(...args) {
            const result = originalPushState(...args);
            emitNavigation('pushState');
            return result;
        };
        const originalReplaceState = history.replaceState.bind(history);
        history.replaceState = function(...args) {
            const result = originalReplaceState(...args);
            emitNavigation('replaceState');
            return result;
        };
        window.addEventListener('popstate', () => emitNavigation('popstate'), true);
        window.addEventListener('hashchange', () => emitNavigation('hashchange'), true);
    }
    if (enabled.has('click')) {
        document.addEventListener('click', (event) => {
            const target = event.target && event.target.closest
                ? event.target.closest('a,button,input,textarea,select,label,[role="button"],[onclick]')
                : null;
            if (!target) return;
            emit({
                type: 'click',
                selector: buildSelector(target),
                x: Number(event.clientX) || 0,
                y: Number(event.clientY) || 0,
                text: safeText(target.innerText || target.value || target.getAttribute('aria-label'))
            });
        }, true);
    }
    if (enabled.has('input')) {
        const flushInput = (selector, payload) => {
            pendingInputs.delete(selector);
            emit(payload);
        };
        const handleInput = (event) => {
            const target = event.target;
            if (!target || !target.tagName) return;
            if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) return;
            const selector = buildSelector(target);
            const payload = {
                type: 'input',
                selector,
                value: target.isContentEditable ? target.innerText : target.value,
                checked: !!target.checked,
                inputType: target.type || target.tagName.toLowerCase()
            };
            const timer = pendingInputs.get(selector);
            if (timer) {
                clearTimeout(timer);
            }
            pendingInputs.set(selector, setTimeout(() => flushInput(selector, payload), event.type === 'change' ? 0 : 180));
        };
        document.addEventListener('input', handleInput, true);
        document.addEventListener('change', handleInput, true);
    }
    if (enabled.has('scroll')) {
        let scrollTimer = null;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                emit({
                    type: 'scroll',
                    x: Math.round(window.scrollX || 0),
                    y: Math.round(window.scrollY || 0)
                });
            }, 120);
        }, true);
    }
})();
`.trim();
}

function createProfileSyncController(options = {}) {
    const {
        getProfile,
        getRuntime,
        ensureRuntime,
        waitForPageTarget,
        createCdpSession,
        onStateChanged
    } = options;

    let state = createEmptySyncState();
    let active = null;

    const notify = () => {
        if (typeof onStateChanged === 'function') {
            onStateChanged();
        }
    };

    const pushEvent = (payload) => {
        state.lastEvent = payload;
        state.events = [payload].concat(state.events || []).slice(0, 20);
    };

    const ensureSlaveState = (profileId) => {
        let current = state.slaves.find((item) => item.profileId === profileId);
        if (!current) {
            const profile = getProfile(profileId);
            current = {
                profileId,
                profileName: profile?.name || profileId,
                success: 0,
                error: 0,
                lastError: '',
                lastEventAt: null,
                lastClickAt: 0
            };
            state.slaves.push(current);
        }
        return current;
    };

    const buildReplayExpression = (event) => {
        if (event.type === 'navigation') {
            return `(() => {
                if (!${escapeForScript(event.url)}) return ({ ok: false, error: 'missing url' });
                if (location.href === ${escapeForScript(event.url)}) return ({ ok: true, skipped: true });
                location.href = ${escapeForScript(event.url)};
                return ({ ok: true });
            })()`;
        }

        if (event.type === 'click') {
            return `(() => {
                const selector = ${escapeForScript(event.selector || '')};
                const x = Number(${escapeForScript(event.x || 0)});
                const y = Number(${escapeForScript(event.y || 0)});
                let target = selector ? document.querySelector(selector) : null;
                if (!target && Number.isFinite(x) && Number.isFinite(y)) {
                    target = document.elementFromPoint(x, y);
                }
                if (!target) return ({ ok: false, error: 'element not found' });
                target.click();
                return ({ ok: true });
            })()`;
        }

        if (event.type === 'input') {
            return `(() => {
                const selector = ${escapeForScript(event.selector || '')};
                const value = ${escapeForScript(event.value || '')};
                const checked = ${escapeForScript(!!event.checked)};
                const target = selector ? document.querySelector(selector) : null;
                if (!target) return ({ ok: false, error: 'element not found' });
                if (target.type === 'checkbox' || target.type === 'radio') {
                    target.checked = checked;
                } else if (target.isContentEditable) {
                    target.innerText = value;
                } else {
                    target.value = value;
                }
                target.dispatchEvent(new Event('input', { bubbles: true }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
                return ({ ok: true });
            })()`;
        }

        if (event.type === 'scroll') {
            return `(() => {
                window.scrollTo(${Number(event.x) || 0}, ${Number(event.y) || 0});
                return ({ ok: true });
            })()`;
        }

        return '(() => ({ ok: false, error: "unsupported event" }))()';
    };

    const replayEventToSlave = async (slave, event) => {
        if (!slave?.session) {
            throw new Error('slave session unavailable');
        }
        const slaveState = ensureSlaveState(slave.profileId);

        if (event.type === 'navigation' && (Date.now() - Number(slaveState.lastClickAt || 0) < 1500)) {
            return { ok: true, skipped: true };
        }

        const expression = buildReplayExpression(event);
        const result = await slave.session.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true
        }, 7000);
        return result?.result?.value || { ok: true };
    };

    const handleSlaveResult = (profileId, result, error = null) => {
        const current = ensureSlaveState(profileId);
        current.lastEventAt = Date.now();
        if (error || result?.ok === false) {
            current.error += 1;
            current.lastError = error?.message || result?.error || '同步失败';
            state.counts.error += 1;
        } else {
            current.success += 1;
            current.lastError = '';
            state.counts.success += 1;
        }
    };

    const forwardEvent = async (event) => {
        if (!active?.running || !state.running) {
            return;
        }
        pushEvent(event);
        state.counts.total += 1;
        notify();

        const tasks = active.slaves.map(async (slave) => {
            const slaveState = ensureSlaveState(slave.profileId);
            if (event.type === 'click') {
                slaveState.lastClickAt = Date.now();
            }
            try {
                const result = await replayEventToSlave(slave, event);
                handleSlaveResult(slave.profileId, result, null);
            } catch (error) {
                handleSlaveResult(slave.profileId, null, error);
            }
        });
        await Promise.allSettled(tasks);
        notify();
    };

    const connectProfilePage = async (profileId) => {
        const runtime = getRuntime(profileId) || await ensureRuntime(profileId);
        if (!runtime?.debugPort) {
            throw new Error('调试端口不可用');
        }
        const target = await waitForPageTarget(runtime.debugPort);
        if (!target?.webSocketDebuggerUrl) {
            throw new Error('页面调试通道不可用');
        }
        const session = await createCdpSession(target.webSocketDebuggerUrl);
        await session.send('Page.enable');
        await session.send('Runtime.enable');
        return { runtime, session, target };
    };

    const stopSession = async () => {
        if (active?.masterSession) {
            try { active.masterSession.close(); } catch (error) { }
        }
        if (Array.isArray(active?.slaves)) {
            active.slaves.forEach((slave) => {
                try { slave.session?.close(); } catch (error) { }
            });
        }
        active = null;
        state = {
            ...state,
            running: false
        };
        notify();
        return getState();
    };

    const startSession = async (payload = {}) => {
        await stopSession();

        const masterProfileId = String(payload.masterProfileId || '').trim();
        const slaveProfileIds = Array.from(new Set(
            (Array.isArray(payload.slaveProfileIds) ? payload.slaveProfileIds : [])
                .map((item) => String(item || '').trim())
                .filter(Boolean)
        )).filter((profileId) => profileId !== masterProfileId);
        const eventTypes = Array.from(new Set(
            (Array.isArray(payload.eventTypes) ? payload.eventTypes : ['navigation', 'click', 'input'])
                .map((item) => String(item || '').trim())
                .filter((item) => ['navigation', 'click', 'input', 'scroll'].includes(item))
        ));

        if (!masterProfileId) {
            throw new Error('请选择主窗口');
        }
        if (!getProfile(masterProfileId)) {
            throw new Error('主窗口环境不存在');
        }
        if (!slaveProfileIds.length) {
            throw new Error('请至少选择一个从窗口');
        }
        if (!eventTypes.length) {
            throw new Error('请至少选择一种同步事件');
        }

        state = {
            ...createEmptySyncState(),
            id: `sync-${Date.now()}`,
            masterProfileId,
            slaveProfileIds,
            eventTypes,
            running: true,
            startedAt: Date.now(),
            slaves: slaveProfileIds.map((profileId) => ({
                profileId,
                profileName: getProfile(profileId)?.name || profileId,
                success: 0,
                error: 0,
                lastError: '',
                lastEventAt: null,
                lastClickAt: 0
            }))
        };

        try {
            const master = await connectProfilePage(masterProfileId);
            const slaves = [];
            for (const profileId of slaveProfileIds) {
                const connection = await connectProfilePage(profileId);
                slaves.push({
                    profileId,
                    session: connection.session,
                    runtime: connection.runtime
                });
            }

            active = {
                running: true,
                masterSession: master.session,
                slaves
            };

            const injectionScript = buildSyncInjectionScript(eventTypes);
            await master.session.send('Runtime.addBinding', { name: '__xbrowserSyncEmit' });
            await master.session.send('Page.addScriptToEvaluateOnNewDocument', { source: injectionScript });
            await master.session.send('Runtime.evaluate', { expression: injectionScript });
            master.session.on('Runtime.bindingCalled', (params) => {
                if (params?.name !== '__xbrowserSyncEmit' || !params?.payload) {
                    return;
                }
                try {
                    const payload = JSON.parse(params.payload);
                    if (!payload?.type || !eventTypes.includes(payload.type)) {
                        return;
                    }
                    forwardEvent(payload).catch(() => {});
                } catch (error) {
                }
            });
            master.session.on('Page.frameNavigated', (params) => {
                if (!state.running || !eventTypes.includes('navigation')) {
                    return;
                }
                if (params?.frame?.parentId) {
                    return;
                }
                const url = String(params?.frame?.url || '').trim();
                if (!/^https?:/i.test(url)) {
                    return;
                }
                forwardEvent({
                    type: 'navigation',
                    url,
                    reason: 'frameNavigated',
                    timestamp: Date.now()
                }).catch(() => {});
            });
        } catch (error) {
            await stopSession();
            throw error;
        }

        notify();
        return getState();
    };

    const getState = () => ({
        ...state,
        slaveProfileIds: Array.isArray(state.slaveProfileIds) ? [...state.slaveProfileIds] : [],
        eventTypes: Array.isArray(state.eventTypes) ? [...state.eventTypes] : [],
        counts: { ...(state.counts || {}) },
        slaves: Array.isArray(state.slaves) ? state.slaves.map((item) => ({
            profileId: item.profileId,
            profileName: item.profileName,
            success: item.success,
            error: item.error,
            lastError: item.lastError,
            lastEventAt: item.lastEventAt
        })) : [],
        events: Array.isArray(state.events) ? state.events.map((item) => ({ ...item })) : []
    });

    return {
        createEmptyState: createEmptySyncState,
        getState,
        startSession,
        stopSession
    };
}

module.exports = {
    createEmptySyncState,
    createProfileSyncController
};
