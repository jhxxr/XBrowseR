const path = require('path');
const fs = require('fs-extra');
const { chromium } = require('playwright-core');
const { v4: uuidv4 } = require('uuid');
const { resolveProviderBaseUrl } = require('./llm-provider');
const { createEmptyAgentRuntimeState, createEmptyBatchState } = require('./agent-runtime');

const NAVIGATION_TIMEOUT_MS = 30000;
const TOOL_ACTION_TIMEOUT_MS = 20000;
const TOOL_WAIT_TIMEOUT_MS = 15000;
const TOOL_WAIT_MAX_TIMEOUT_MS = 30000;

function getToolTimeoutMs(agentSettings = {}) {
    const raw = Number(agentSettings?.toolTimeoutMs);
    return Math.max(5000, Math.min(60000, raw || TOOL_ACTION_TIMEOUT_MS));
}

function normalizeBaseUrl(value = '') {
    return String(value || '').trim().replace(/\/+$/, '');
}

function getProviderBaseUrl(provider) {
    return normalizeBaseUrl(resolveProviderBaseUrl(provider));
}

function parseJsonSafe(value, fallback = {}) {
    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function createAgentStoppedError(message = 'Agent run stopped') {
    const error = new Error(message);
    error.code = 'AGENT_STOPPED';
    return error;
}

function isAbortError(error) {
    return error?.name === 'AbortError' || /aborted|abort/i.test(String(error?.message || ''));
}

function isStopError(error) {
    return error?.code === 'AGENT_STOPPED' || isAbortError(error) || /stopped|stop/i.test(String(error?.message || ''));
}

function appendTaskEvent(task, payload = {}) {
    const entry = {
        id: payload.id || uuidv4(),
        sessionId: payload.sessionId || '',
        profileId: payload.profileId || task.profileId,
        createdAt: payload.createdAt || Date.now(),
        ...payload
    };

    task.events.push(entry);
    if (task.events.length > 160) {
        task.events.shift();
    }

    task.lastMessage = entry.content || entry.message || task.lastMessage || '';
    return entry;
}

function summarizeBatchTasks(tasks = []) {
    return tasks.reduce((summary, task) => {
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

function normalizeTextContent(content) {
    if (typeof content === 'string') {
        return content.trim();
    }
    if (Array.isArray(content)) {
        return content
            .map((item) => {
                if (typeof item === 'string') {
                    return item;
                }
                if (item?.type === 'text') {
                    return item.text || '';
                }
                return '';
            })
            .join('\n')
            .trim();
    }
    return '';
}

function summarizeArgs(args = {}) {
    return Object.entries(args)
        .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
        .join(', ');
}

function clampNumber(value, minimum, maximum, fallback) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
        return fallback;
    }
    return Math.max(minimum, Math.min(maximum, normalized));
}

function sanitizePathToken(value, fallback = 'item') {
    const normalized = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || fallback;
}

async function saveToolScreenshot(page, args = {}, options = {}, actionTimeoutMs = TOOL_ACTION_TIMEOUT_MS) {
    const runtimeDir = String(options.runtimeDir || '').trim() || path.join(process.cwd(), 'data', 'runtime');
    const profileToken = sanitizePathToken(options.profileId, 'shared');
    const sessionToken = sanitizePathToken(options.sessionId, 'session');
    const screenshotDir = path.join(runtimeDir, 'agent-screenshots', profileToken);
    const filePath = path.join(screenshotDir, `${sessionToken}-${Date.now()}.png`);

    await fs.ensureDir(screenshotDir);
    if (String(args.selector || '').trim()) {
        await page.locator(String(args.selector).trim()).first().screenshot({
            path: filePath,
            timeout: actionTimeoutMs
        });
    } else {
        await page.screenshot({
            path: filePath,
            fullPage: Boolean(args.fullPage),
            timeout: actionTimeoutMs
        });
    }

    return {
        ok: true,
        path: filePath,
        title: await page.title(),
        url: page.url(),
        selector: String(args.selector || '').trim() || '',
        fullPage: Boolean(args.fullPage)
    };
}

function buildBatchExportPayload(batchJob) {
    return {
        app: 'XBrowseR',
        kind: 'agent-batch-results',
        exportedAt: Date.now(),
        batch: {
            id: batchJob.id,
            running: !!batchJob.running,
            stopRequested: !!batchJob.stopRequested,
            prompt: batchJob.prompt,
            provider: {
                id: batchJob.provider?.id || '',
                name: batchJob.provider?.name || '',
                format: batchJob.provider?.format || '',
                model: batchJob.provider?.model || ''
            },
            concurrency: batchJob.concurrency || 1,
            maxRetries: batchJob.maxRetries || 0,
            failureStrategy: batchJob.failureStrategy || 'skip',
            counts: summarizeBatchTasks(batchJob.tasks),
            tasks: batchJob.tasks.map((task) => ({
                ...task,
                events: Array.isArray(task.events) ? task.events.slice() : []
            }))
        }
    };
}

function summarizeToolResult(result) {
    if (!result || typeof result !== 'object') {
        return String(result || '').trim().slice(0, 180);
    }

    if (result.ok === false) {
        return String(result.error || 'tool failed').trim().slice(0, 180);
    }

    if (typeof result.text === 'string' && result.text.trim()) {
        return result.text.replace(/\s+/g, ' ').trim().slice(0, 180);
    }

    const parts = [];
    if (typeof result.title === 'string' && result.title.trim()) parts.push(`title=${result.title.trim()}`);
    if (typeof result.url === 'string' && result.url.trim()) parts.push(`url=${result.url.trim()}`);
    if (typeof result.path === 'string' && result.path.trim()) parts.push(`path=${result.path.trim()}`);
    if (typeof result.selector === 'string' && result.selector.trim()) parts.push(`selector=${result.selector.trim()}`);
    if (typeof result.count === 'number') parts.push(`count=${result.count}`);
    if (typeof result.exists === 'boolean') parts.push(`exists=${result.exists}`);
    if (typeof result.visible === 'boolean') parts.push(`visible=${result.visible}`);
    if (typeof result.state === 'string' && result.state) parts.push(`state=${result.state}`);
    if (typeof result.filePath === 'string' && result.filePath.trim()) parts.push(`file=${result.filePath.trim()}`);

    return parts.join(', ').slice(0, 180);
}

function formatProviderError(provider, error) {
    const providerName = provider?.name || provider?.model || provider?.format || 'provider';
    const message = String(error?.message || 'request failed').trim();
    if (/401|unauthorized|invalid api key/i.test(message)) {
        return `${providerName}: API key 无效或缺失`;
    }
    if (/403|forbidden/i.test(message)) {
        return `${providerName}: 当前请求被拒绝`;
    }
    if (/404|model.*not found/i.test(message)) {
        return `${providerName}: 模型不存在或未开放`;
    }
    if (/429|rate limit|quota/i.test(message)) {
        return `${providerName}: 请求过快或额度不足`;
    }
    if (/timeout|timed out|etimedout/i.test(message)) {
        return `${providerName}: 请求超时`;
    }
    return `${providerName}: ${message}`.slice(0, 220);
}

function getToolSpecs() {
    return [
        {
            name: 'browser_snapshot',
            description: 'Read the current page and list interactive elements before deciding what to do next.',
            parameters: {
                type: 'object',
                properties: {
                    maxItems: {
                        type: 'integer',
                        minimum: 5,
                        maximum: 40,
                        description: 'Maximum number of interactive elements to include.'
                    }
                }
            }
        },
        {
            name: 'browser_navigate',
            description: 'Navigate the active page to a URL.',
            parameters: {
                type: 'object',
                required: ['url'],
                properties: {
                    url: {
                        type: 'string',
                        description: 'Absolute URL to open.'
                    }
                }
            }
        },
        {
            name: 'browser_click',
            description: 'Click a visible element by CSS selector.',
            parameters: {
                type: 'object',
                required: ['selector'],
                properties: {
                    selector: {
                        type: 'string',
                        description: 'CSS selector returned by browser_snapshot or known from the page.'
                    }
                }
            }
        },
        {
            name: 'browser_fill',
            description: 'Fill an input, textarea or editable field.',
            parameters: {
                type: 'object',
                required: ['selector', 'text'],
                properties: {
                    selector: {
                        type: 'string',
                        description: 'CSS selector of the target field.'
                    },
                    text: {
                        type: 'string',
                        description: 'Text to type into the field.'
                    }
                }
            }
        },
        {
            name: 'browser_press',
            description: 'Press a keyboard key on the active page.',
            parameters: {
                type: 'object',
                required: ['key'],
                properties: {
                    key: {
                        type: 'string',
                        description: 'Keyboard key such as Enter, Tab, Escape, Control+A.'
                    }
                }
            }
        },
        {
            name: 'browser_wait_for_text',
            description: 'Wait until target text appears on the page.',
            parameters: {
                type: 'object',
                required: ['text'],
                properties: {
                    text: {
                        type: 'string',
                        description: 'Text expected to appear.'
                    },
                    timeoutMs: {
                        type: 'integer',
                        minimum: 500,
                        maximum: 60000,
                        description: 'Maximum wait time in milliseconds.'
                    }
                }
            }
        },
        {
            name: 'browser_extract',
            description: 'Extract visible text from an element or the whole page.',
            parameters: {
                type: 'object',
                properties: {
                    selector: {
                        type: 'string',
                        description: 'CSS selector to extract from. Defaults to body.'
                    },
                    maxLength: {
                        type: 'integer',
                        minimum: 200,
                        maximum: 6000,
                        description: 'Maximum number of characters to return.'
                    }
                }
            }
        },
        {
            name: 'browser_screenshot',
            description: 'Save a screenshot of the current page or a target element.',
            parameters: {
                type: 'object',
                properties: {
                    selector: {
                        type: 'string',
                        description: 'Optional CSS selector for an element screenshot.'
                    },
                    fullPage: {
                        type: 'boolean',
                        description: 'Capture the full page when selector is not provided.'
                    }
                }
            }
        },
        {
            name: 'browser_element_exists',
            description: 'Check whether an element exists and whether it is visible.',
            parameters: {
                type: 'object',
                required: ['selector'],
                properties: {
                    selector: {
                        type: 'string',
                        description: 'CSS selector to check.'
                    }
                }
            }
        },
        {
            name: 'browser_fill_form',
            description: 'Fill multiple form fields in one step.',
            parameters: {
                type: 'object',
                required: ['fields'],
                properties: {
                    fields: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 20,
                        items: {
                            type: 'object',
                            required: ['selector', 'text'],
                            properties: {
                                selector: {
                                    type: 'string',
                                    description: 'CSS selector of the field.'
                                },
                                text: {
                                    type: 'string',
                                    description: 'Text to fill into the field.'
                                }
                            }
                        }
                    }
                }
            }
        },
        {
            name: 'browser_upload_file',
            description: 'Upload a local file through a file input element.',
            parameters: {
                type: 'object',
                required: ['selector', 'filePath'],
                properties: {
                    selector: {
                        type: 'string',
                        description: 'CSS selector of the file input element.'
                    },
                    filePath: {
                        type: 'string',
                        description: 'Local file path to upload.'
                    }
                }
            }
        },
        {
            name: 'browser_wait_for_selector',
            description: 'Wait until a selector reaches a target state.',
            parameters: {
                type: 'object',
                required: ['selector'],
                properties: {
                    selector: {
                        type: 'string',
                        description: 'CSS selector to wait for.'
                    },
                    state: {
                        type: 'string',
                        enum: ['attached', 'detached', 'visible', 'hidden'],
                        description: 'Desired selector state.'
                    },
                    timeoutMs: {
                        type: 'integer',
                        minimum: 500,
                        maximum: 60000,
                        description: 'Maximum wait time in milliseconds.'
                    }
                }
            }
        },
        {
            name: 'browser_get_page_info',
            description: 'Get the current page title and URL.',
            parameters: {
                type: 'object',
                properties: {}
            }
        }
    ];
}

function getSystemPrompt(session) {
    const profileText = session.profileName ? `Bound profile: ${session.profileName}.` : '';
    const providerText = session.provider?.model ? `Current model: ${session.provider.model}.` : '';
    return [
        'You are a browser automation agent inside XBrowseR.',
        'You are bound to a single browser profile session and should continue the conversation across turns.',
        'Use the provided browser tools to inspect the page before acting.',
        'Prefer small, safe actions and verify important state changes.',
        'If a tool fails, do not repeat the same selector blindly; inspect the page again and choose a different action.',
        'Keep your final user-facing answer concise and in Chinese.',
        profileText,
        providerText
    ].filter(Boolean).join(' ');
}

function toOpenAiTools() {
    return getToolSpecs().map((tool) => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }
    }));
}

function toAnthropicTools() {
    return getToolSpecs().map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters
    }));
}

function toGeminiTools() {
    return [{
        functionDeclarations: getToolSpecs().map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }))
    }];
}

function mapOpenAiMessages(history) {
    return history.map((item) => {
        if (item.role === 'tool') {
            return {
                role: 'tool',
                tool_call_id: item.tool_call_id,
                content: item.content,
                name: item.tool_name || undefined
            };
        }

        return {
            role: item.role,
            content: item.content || '',
            tool_calls: item.tool_calls
                ? item.tool_calls.map((toolCall) => ({
                    id: toolCall.id,
                    type: 'function',
                    function: {
                        name: toolCall.function.name,
                        arguments: toolCall.function.arguments || '{}'
                    }
                }))
                : undefined
        };
    });
}

function mapAnthropicMessages(history) {
    const messages = [];

    for (let index = 0; index < history.length; index += 1) {
        const item = history[index];
        if (item.role === 'user') {
            messages.push({
                role: 'user',
                content: [{ type: 'text', text: item.content || '' }]
            });
            continue;
        }

        if (item.role === 'assistant') {
            const content = [];
            if (item.content) {
                content.push({ type: 'text', text: item.content });
            }
            for (const toolCall of item.tool_calls || []) {
                content.push({
                    type: 'tool_use',
                    id: toolCall.id,
                    name: toolCall.function.name,
                    input: parseJsonSafe(toolCall.function.arguments, {})
                });
            }
            messages.push({ role: 'assistant', content });
            continue;
        }

        if (item.role === 'tool') {
            const content = [];
            while (index < history.length && history[index]?.role === 'tool') {
                const toolMessage = history[index];
                content.push({
                    type: 'tool_result',
                    tool_use_id: toolMessage.tool_call_id,
                    content: toolMessage.content
                });
                index += 1;
            }
            index -= 1;
            messages.push({ role: 'user', content });
        }
    }

    return messages;
}

function mapGeminiContents(history) {
    return history.map((item) => {
        if (item.role === 'user') {
            return {
                role: 'user',
                parts: [{ text: item.content || '' }]
            };
        }

        if (item.role === 'assistant') {
            const parts = [];
            if (item.content) {
                parts.push({ text: item.content });
            }
            for (const toolCall of item.tool_calls || []) {
                parts.push({
                    functionCall: {
                        name: toolCall.function.name,
                        args: parseJsonSafe(toolCall.function.arguments, {})
                    }
                });
            }
            return {
                role: 'model',
                parts
            };
        }

        return {
            role: 'user',
            parts: [{
                functionResponse: {
                    name: item.tool_name,
                    response: {
                        result: parseJsonSafe(item.content, { text: item.content })
                    }
                }
            }]
        };
    });
}

async function callOpenAiChat(provider, session, signal) {
    const response = await fetch(`${getProviderBaseUrl(provider)}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify({
            model: provider.model,
            temperature: 0.2,
            tools: toOpenAiTools(),
            tool_choice: 'auto',
            messages: [
                { role: 'system', content: getSystemPrompt(session) },
                ...mapOpenAiMessages(session.history)
            ]
        })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
    }

    const message = payload?.choices?.[0]?.message;
    if (!message) {
        throw new Error('模型没有返回有效消息');
    }

    return {
        content: normalizeTextContent(message.content),
        toolCalls: (message.tool_calls || []).map((item) => ({
            id: item.id || uuidv4(),
            function: {
                name: item.function.name,
                arguments: item.function.arguments || '{}'
            }
        }))
    };
}

function getTrailingToolMessages(history) {
    const items = [];
    for (let index = history.length - 1; index >= 0; index -= 1) {
        if (history[index]?.role !== 'tool') {
            break;
        }
        items.unshift(history[index]);
    }
    return items;
}

async function callOpenAiResponses(provider, session, signal) {
    const body = {
        model: provider.model,
        tools: toOpenAiTools(),
        temperature: 0.2
    };

    if (session.providerState.lastResponseId) {
        body.previous_response_id = session.providerState.lastResponseId;
        body.input = getTrailingToolMessages(session.history).map((item) => ({
            type: 'function_call_output',
            call_id: item.tool_call_id,
            output: item.content
        }));
    } else {
        body.instructions = getSystemPrompt(session);
        body.input = session.history
            .filter((item) => item.role === 'user' || item.role === 'assistant')
            .map((item) => ({
                role: item.role,
                content: [{
                    type: 'input_text',
                    text: item.content || ''
                }]
            }));
    }

    const response = await fetch(`${getProviderBaseUrl(provider)}/responses`, {
        method: 'POST',
        signal,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 404 || payload?.error?.code === 'bad_response_status_code') {
            return callOpenAiChat(provider, session, signal);
        }
        throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
    }

    session.providerState.lastResponseId = payload?.id || session.providerState.lastResponseId || '';
    const output = Array.isArray(payload?.output) ? payload.output : [];

    return {
        content: output
            .filter((item) => item.type === 'message')
            .flatMap((item) => item.content || [])
            .filter((item) => item.type === 'output_text')
            .map((item) => item.text || '')
            .join('\n')
            .trim(),
        toolCalls: output
            .filter((item) => item.type === 'function_call' && item.name)
            .map((item) => ({
                id: item.call_id || item.id || uuidv4(),
                function: {
                    name: item.name,
                    arguments: item.arguments || '{}'
                }
            }))
    };
}

async function callAnthropic(provider, session, signal) {
    const response = await fetch(`${getProviderBaseUrl(provider)}/messages`, {
        method: 'POST',
        signal,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: provider.model,
            max_tokens: 1400,
            temperature: 0.2,
            system: getSystemPrompt(session),
            tools: toAnthropicTools(),
            tool_choice: { type: 'auto' },
            messages: mapAnthropicMessages(session.history)
        })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
    }

    const contentBlocks = Array.isArray(payload?.content) ? payload.content : [];
    return {
        content: contentBlocks
            .filter((item) => item.type === 'text')
            .map((item) => item.text || '')
            .join('\n')
            .trim(),
        toolCalls: contentBlocks
            .filter((item) => item.type === 'tool_use')
            .map((item) => ({
                id: item.id || uuidv4(),
                function: {
                    name: item.name,
                    arguments: JSON.stringify(item.input || {})
                }
            }))
    };
}

async function callGemini(provider, session, signal) {
    const endpoint = `${getProviderBaseUrl(provider)}/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
    const response = await fetch(endpoint, {
        method: 'POST',
        signal,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{ text: getSystemPrompt(session) }]
            },
            contents: mapGeminiContents(session.history),
            tools: toGeminiTools(),
            toolConfig: {
                functionCallingConfig: {
                    mode: 'AUTO'
                }
            },
            generationConfig: {
                temperature: 0.2
            }
        })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
    }

    const parts = payload?.candidates?.[0]?.content?.parts || [];
    return {
        content: parts
            .filter((item) => typeof item.text === 'string')
            .map((item) => item.text)
            .join('\n')
            .trim(),
        toolCalls: parts
            .filter((item) => item.functionCall?.name)
            .map((item) => ({
                id: uuidv4(),
                function: {
                    name: item.functionCall.name,
                    arguments: JSON.stringify(item.functionCall.args || {})
                }
            }))
    };
}

async function callProvider(provider, session, signal) {
    if (!provider?.apiKey) {
        throw new Error('请先填写 Agent API Key');
    }
    if (!provider?.model) {
        throw new Error('Agent 模型不能为空');
    }
    if (!getProviderBaseUrl(provider)) {
        throw new Error('Agent Base URL 不能为空');
    }

    if (provider.format === 'anthropic') {
        return callAnthropic(provider, session, signal);
    }
    if (provider.format === 'gemini') {
        return callGemini(provider, session, signal);
    }
    if (provider.format === 'openai-responses') {
        return callOpenAiResponses(provider, session, signal);
    }
    return callOpenAiChat(provider, session, signal);
}

async function getAgentPage(browser) {
    const contexts = browser.contexts();
    const context = contexts[0] || await browser.newContext();
    const page = context.pages().find((item) => !item.isClosed()) || await context.newPage();
    await page.bringToFront().catch(() => {});
    return page;
}

async function createSnapshot(page, maxItems = 20) {
    return page.evaluate((limit) => {
        const cleanText = (value, max = 240) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
        const selectors = new Set();

        const buildSelector = (element) => {
            if (!(element instanceof Element)) {
                return '';
            }
            if (element.id) {
                return `#${CSS.escape(element.id)}`;
            }
            const testId = element.getAttribute('data-testid');
            if (testId) {
                return `[data-testid="${CSS.escape(testId)}"]`;
            }
            const name = element.getAttribute('name');
            if (name && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element.tagName)) {
                return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
            }
            const ariaLabel = element.getAttribute('aria-label');
            if (ariaLabel) {
                return `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`;
            }

            const parts = [];
            let current = element;
            while (current && current.nodeType === 1 && parts.length < 4) {
                const tag = current.tagName.toLowerCase();
                const siblings = current.parentElement
                    ? Array.from(current.parentElement.children).filter((item) => item.tagName === current.tagName)
                    : [];
                const position = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
                parts.unshift(`${tag}${position}`);
                current = current.parentElement;
                if (current?.id) {
                    parts.unshift(`#${CSS.escape(current.id)}`);
                    break;
                }
            }
            return parts.join(' > ');
        };

        const interactiveNodes = Array.from(document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[data-testid]'));
        const actions = [];

        for (const element of interactiveNodes) {
            if (actions.length >= limit) break;
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const rect = element.getBoundingClientRect();
            if (rect.width < 4 || rect.height < 4) continue;

            const selector = buildSelector(element);
            if (!selector || selectors.has(selector)) continue;
            selectors.add(selector);

            actions.push({
                selector,
                tag: element.tagName.toLowerCase(),
                type: element.getAttribute('type') || '',
                text: cleanText(element.innerText || element.value || element.getAttribute('aria-label') || element.getAttribute('placeholder') || ''),
                placeholder: cleanText(element.getAttribute('placeholder') || '', 120),
                href: element.getAttribute('href') || '',
                name: element.getAttribute('name') || ''
            });
        }

        return {
            title: document.title || '',
            url: window.location.href,
            bodyText: cleanText(document.body?.innerText || '', 4000),
            actions
        };
    }, Math.max(5, Math.min(40, Number(maxItems) || 20)));
}

async function runTool(page, name, args = {}, options = {}) {
    const actionTimeoutMs = getToolTimeoutMs(options.agentSettings);
    const navigationTimeoutMs = Math.max(NAVIGATION_TIMEOUT_MS, actionTimeoutMs);
    const waitDefaultTimeoutMs = Math.max(TOOL_WAIT_TIMEOUT_MS, actionTimeoutMs);
    const waitMaxTimeoutMs = Math.max(TOOL_WAIT_MAX_TIMEOUT_MS, actionTimeoutMs);
    if (name === 'browser_snapshot') {
        return createSnapshot(page, args.maxItems);
    }
    if (name === 'browser_navigate') {
        await page.goto(String(args.url || '').trim(), { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
        return createSnapshot(page, 12);
    }
    if (name === 'browser_click') {
        if (!String(args.selector || '').trim()) throw new Error('selector 不能为空');
        await page.locator(String(args.selector).trim()).first().click({ timeout: actionTimeoutMs });
        await page.waitForLoadState('domcontentloaded', { timeout: actionTimeoutMs }).catch(() => {});
        return { ok: true, selector: args.selector, url: page.url(), title: await page.title() };
    }
    if (name === 'browser_fill') {
        if (!String(args.selector || '').trim()) throw new Error('selector 不能为空');
        await page.locator(String(args.selector).trim()).first().fill(String(args.text || ''), { timeout: actionTimeoutMs });
        return { ok: true, selector: args.selector };
    }
    if (name === 'browser_press') {
        if (!String(args.key || '').trim()) throw new Error('key 不能为空');
        await page.keyboard.press(String(args.key).trim());
        await page.waitForLoadState('domcontentloaded', { timeout: actionTimeoutMs }).catch(() => {});
        return { ok: true, key: args.key, url: page.url() };
    }
    if (name === 'browser_wait_for_text') {
        if (!String(args.text || '').trim()) throw new Error('text 不能为空');
        const timeoutMs = Math.max(500, Math.min(waitMaxTimeoutMs, Number(args.timeoutMs) || waitDefaultTimeoutMs));
        await page.getByText(String(args.text).trim(), { exact: false }).first().waitFor({ timeout: timeoutMs });
        return { ok: true, text: args.text, timeoutMs };
    }
    if (name === 'browser_extract') {
        const selector = String(args.selector || 'body').trim() || 'body';
        const maxLength = Math.max(200, Math.min(6000, Number(args.maxLength) || 2400));
        const text = await page.locator(selector).first().innerText({ timeout: actionTimeoutMs });
        return { selector, text: String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength) };
    }
    throw new Error(`未知工具: ${name}`);
}

async function executeTool(page, name, args = {}, options = {}) {
    const actionTimeoutMs = getToolTimeoutMs(options.agentSettings);
    const navigationTimeoutMs = Math.max(NAVIGATION_TIMEOUT_MS, actionTimeoutMs);
    const waitDefaultTimeoutMs = Math.max(TOOL_WAIT_TIMEOUT_MS, actionTimeoutMs);
    const waitMaxTimeoutMs = Math.max(TOOL_WAIT_MAX_TIMEOUT_MS, actionTimeoutMs);

    if (name === 'browser_snapshot') {
        return createSnapshot(page, args.maxItems);
    }
    if (name === 'browser_navigate') {
        await page.goto(String(args.url || '').trim(), { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
        return createSnapshot(page, 12);
    }
    if (name === 'browser_click') {
        if (!String(args.selector || '').trim()) throw new Error('selector is required');
        await page.locator(String(args.selector).trim()).first().click({ timeout: actionTimeoutMs });
        await page.waitForLoadState('domcontentloaded', { timeout: actionTimeoutMs }).catch(() => {});
        return { ok: true, selector: args.selector, url: page.url(), title: await page.title() };
    }
    if (name === 'browser_fill') {
        if (!String(args.selector || '').trim()) throw new Error('selector is required');
        await page.locator(String(args.selector).trim()).first().fill(String(args.text || ''), { timeout: actionTimeoutMs });
        return { ok: true, selector: args.selector };
    }
    if (name === 'browser_press') {
        if (!String(args.key || '').trim()) throw new Error('key is required');
        await page.keyboard.press(String(args.key).trim());
        await page.waitForLoadState('domcontentloaded', { timeout: actionTimeoutMs }).catch(() => {});
        return { ok: true, key: args.key, url: page.url() };
    }
    if (name === 'browser_wait_for_text') {
        if (!String(args.text || '').trim()) throw new Error('text is required');
        const timeoutMs = Math.max(500, Math.min(waitMaxTimeoutMs, Number(args.timeoutMs) || waitDefaultTimeoutMs));
        await page.getByText(String(args.text).trim(), { exact: false }).first().waitFor({ timeout: timeoutMs });
        return { ok: true, text: args.text, timeoutMs };
    }
    if (name === 'browser_extract') {
        const selector = String(args.selector || 'body').trim() || 'body';
        const maxLength = Math.max(200, Math.min(6000, Number(args.maxLength) || 2400));
        const text = await page.locator(selector).first().innerText({ timeout: actionTimeoutMs });
        return { selector, text: String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength) };
    }
    if (name === 'browser_screenshot') {
        return saveToolScreenshot(page, args, options, actionTimeoutMs);
    }
    if (name === 'browser_element_exists') {
        const selector = String(args.selector || '').trim();
        if (!selector) throw new Error('selector is required');
        const locator = page.locator(selector).first();
        const count = await page.locator(selector).count();
        const visible = count > 0 ? await locator.isVisible().catch(() => false) : false;
        return { selector, exists: count > 0, visible, count };
    }
    if (name === 'browser_fill_form') {
        const fields = Array.isArray(args.fields) ? args.fields : [];
        if (!fields.length) throw new Error('fields is required');
        const filled = [];
        for (const field of fields.slice(0, 20)) {
            const selector = String(field?.selector || '').trim();
            if (!selector) throw new Error('field selector is required');
            const text = String(field?.text || '');
            await page.locator(selector).first().fill(text, { timeout: actionTimeoutMs });
            filled.push({ selector });
        }
        return { ok: true, count: filled.length, fields: filled };
    }
    if (name === 'browser_upload_file') {
        const selector = String(args.selector || '').trim();
        const rawFilePath = String(args.filePath || '').trim();
        if (!selector) throw new Error('selector is required');
        if (!rawFilePath) throw new Error('filePath is required');
        const resolvedPath = path.resolve(rawFilePath);
        if (!(await fs.pathExists(resolvedPath))) {
            throw new Error(`file not found: ${resolvedPath}`);
        }
        await page.locator(selector).first().setInputFiles(resolvedPath, { timeout: actionTimeoutMs });
        return { ok: true, selector, filePath: resolvedPath };
    }
    if (name === 'browser_wait_for_selector') {
        const selector = String(args.selector || '').trim();
        if (!selector) throw new Error('selector is required');
        const requestedState = String(args.state || '').trim();
        const state = ['attached', 'detached', 'visible', 'hidden'].includes(requestedState)
            ? requestedState
            : 'visible';
        const timeoutMs = Math.max(500, Math.min(waitMaxTimeoutMs, Number(args.timeoutMs) || waitDefaultTimeoutMs));
        await page.locator(selector).first().waitFor({ state, timeout: timeoutMs });
        return { ok: true, selector, state, timeoutMs };
    }
    if (name === 'browser_get_page_info') {
        return {
            title: await page.title(),
            url: page.url()
        };
    }

    throw new Error(`unknown tool: ${name}`);
}

function createAgentController(dependencies) {
    let activeSession = null;
    let activeBatchJob = null;

    function buildSession(profileId, profileName, provider) {
        return {
            id: uuidv4(),
            running: false,
            profileId,
            profileName,
            provider: { ...provider },
            history: [],
            providerState: {},
            events: [],
            browser: null,
            page: null,
            pageUrl: '',
            abortController: null,
            batchJobId: '',
            batchTaskId: ''
        };
    }

    function markPendingBatchTasks(batchJob, message = '批量任务已停止') {
        for (const task of batchJob.tasks) {
            if (task.status !== 'queued') {
                continue;
            }
            task.status = 'stopped';
            task.summary = message;
            task.error = '';
            task.endedAt = Date.now();
            task.durationMs = 0;
            appendTaskEvent(task, {
                kind: 'status',
                level: 'warn',
                message
            });
        }
    }

    function emitUpdate() {
        if (typeof dependencies.onStateChanged === 'function') {
            dependencies.onStateChanged();
        }
    }

    function emitEvent(entry) {
        if (typeof dependencies.onLog === 'function') {
            dependencies.onLog(entry);
        }
    }

    function pushEvent(session, payload = {}) {
        const entry = {
            id: uuidv4(),
            sessionId: session.id,
            profileId: session.profileId,
            createdAt: Date.now(),
            ...payload
        };
        session.events.push(entry);
        if (session.events.length > 160) {
            session.events.shift();
        }

        if (activeBatchJob?.id && session.batchJobId === activeBatchJob.id && session.batchTaskId) {
            const batchTask = activeBatchJob.tasks.find((item) => item.id === session.batchTaskId);
            if (batchTask) {
                appendTaskEvent(batchTask, {
                    ...entry,
                    taskId: batchTask.id,
                    batchId: activeBatchJob.id
                });
                batchTask.pageUrl = session.pageUrl || batchTask.pageUrl || '';
            }
        }

        emitEvent(entry);
        emitUpdate();
        return entry;
    }

    function getBatchPublicState() {
        if (!activeBatchJob) {
            return createEmptyBatchState({
                counts: summarizeBatchTasks()
            });
        }

        return createEmptyBatchState({
            running: activeBatchJob.running,
            stopRequested: !!activeBatchJob.stopRequested,
            jobId: activeBatchJob.id,
            providerId: activeBatchJob.provider.id,
            providerName: activeBatchJob.provider.name,
            providerFormat: activeBatchJob.provider.format,
            model: activeBatchJob.provider.model,
            prompt: activeBatchJob.prompt,
            concurrency: activeBatchJob.concurrency || 1,
            maxRetries: activeBatchJob.maxRetries || 0,
            failureStrategy: activeBatchJob.failureStrategy || 'skip',
            currentTaskId: activeBatchJob.currentTaskId,
            exportFilePath: activeBatchJob.exportFilePath || '',
            exportedAt: activeBatchJob.exportedAt || 0,
            counts: summarizeBatchTasks(activeBatchJob.tasks),
            tasks: activeBatchJob.tasks.map((task) => ({
                ...task,
                events: task.events.slice()
            }))
        });
    }

    function getPublicState() {
        if (!activeSession) {
            return createEmptyAgentRuntimeState({
                running: !!activeBatchJob?.running,
                mode: activeBatchJob ? 'batch' : 'idle',
                batch: getBatchPublicState()
            });
        }

        return createEmptyAgentRuntimeState({
            running: activeSession.running || !!activeBatchJob?.running,
            sessionId: activeSession.id,
            profileId: activeSession.profileId,
            profileName: activeSession.profileName,
            providerId: activeSession.provider.id,
            providerName: activeSession.provider.name,
            providerFormat: activeSession.provider.format,
            model: activeSession.provider.model,
            pageUrl: activeSession.pageUrl,
            events: activeSession.events,
            mode: activeBatchJob ? 'batch' : 'single',
            batch: getBatchPublicState()
        });
    }

    async function ensureSessionRuntime(session) {
        const runtime = await dependencies.ensureRuntime(session.profileId);
        if (!runtime?.debugPort) {
            throw new Error('目标环境未暴露调试端口');
        }

        session.debugPort = runtime.debugPort;
        session.browser = await chromium.connectOverCDP(`http://127.0.0.1:${runtime.debugPort}`);
        session.page = await getAgentPage(session.browser);
        session.pageUrl = session.page.url();
        return runtime;
    }

    async function clearActiveSession() {
        if (!activeSession) {
            return false;
        }

        if (activeSession.running && activeSession.abortController) {
            activeSession.abortController.abort();
        }

        if (activeSession.browser) {
            await activeSession.browser.close().catch(() => {});
        }

        activeSession = null;
        emitUpdate();
        return true;
    }

    async function closeSession() {
        if (activeBatchJob?.running || activeSession?.running) {
            throw new Error('请先停止当前执行，再清空批量任务或结束会话');
        }

        const hadState = !!activeSession || !!activeBatchJob;
        await clearActiveSession();
        activeBatchJob = null;
        emitUpdate();
        return hadState;
    }

    async function createSession(payload = {}) {
        const provider = payload.provider;
        const profileId = String(payload.profileId || '').trim();
        if (!profileId) {
            throw new Error('请选择目标环境');
        }
        if (!provider?.id || !provider?.model) {
            throw new Error('请选择可用模型');
        }

        const profile = dependencies.getProfile(profileId);
        if (!profile) {
            throw new Error('目标环境不存在');
        }

        if (activeBatchJob?.running) {
            throw new Error('当前有批量任务正在执行，请先停止后再切换到单窗口模式');
        }
        if (activeSession?.running) {
            throw new Error('当前 Agent 会话仍在执行中');
        }

        if (activeBatchJob) {
            activeBatchJob = null;
        }
        if (activeSession) {
            await clearActiveSession();
        }

        const session = buildSession(profileId, profile.name || profileId, provider);

        activeSession = session;
        emitUpdate();
        pushEvent(session, {
            kind: 'status',
            level: 'info',
            message: `已创建会话，目标窗口 ${session.profileName}，模型 ${session.provider.model}`
        });

        await ensureSessionRuntime(session);
        pushEvent(session, {
            kind: 'status',
            level: 'info',
            message: `已连接浏览器，调试端口 ${session.debugPort}`
        });

        if (payload.initialMessage) {
            await sendMessage({ message: payload.initialMessage });
        }

        return getPublicState();
    }

    async function runSessionMessage(session, message) {
        if (!session.page) {
            await ensureSessionRuntime(session);
        }

        session.running = true;
        session.abortController = new AbortController();
        session.pageUrl = session.page.url();
        session.history.push({ role: 'user', content: message });
        pushEvent(session, {
            kind: 'message',
            role: 'user',
            content: message
        });

        try {
            for (let step = 0; step < 10; step += 1) {
                if (session.abortController.signal.aborted) {
                    throw createAgentStoppedError(activeBatchJob?.running
                        ? (activeBatchJob.stopMessage || 'batch task stopped')
                        : 'agent session stopped');
                }

                pushEvent(session, {
                    kind: 'status',
                    level: 'info',
                    message: `requesting model decision, step ${step + 1}`
                });

                let assistantMessage;
                try {
                    assistantMessage = await callProvider(session.provider, session, session.abortController.signal);
                } catch (error) {
                    throw new Error(formatProviderError(session.provider, error));
                }
                session.pageUrl = session.page.url();

                if (assistantMessage.toolCalls.length) {
                    session.history.push({
                        role: 'assistant',
                        content: assistantMessage.content || '',
                        tool_calls: assistantMessage.toolCalls
                    });

                    for (const toolCall of assistantMessage.toolCalls) {
                        const toolName = toolCall.function.name;
                        const parsedArgs = parseJsonSafe(toolCall.function.arguments, {});
                        pushEvent(session, {
                            kind: 'tool',
                            level: 'tool',
                            message: `${toolName}${summarizeArgs(parsedArgs) ? `(${summarizeArgs(parsedArgs)})` : '()'}`
                        });

                        let result;
                        try {
                            result = await executeTool(session.page, toolName, parsedArgs, {
                                agentSettings: dependencies.getAgentSettings?.() || {},
                                runtimeDir: dependencies.runtimeDir || '',
                                profileId: session.profileId || '',
                                sessionId: session.id || ''
                            });
                        } catch (error) {
                            result = {
                                ok: false,
                                error: error?.message || 'tool execution failed',
                                tool: toolName,
                                args: parsedArgs
                            };
                        }

                        session.pageUrl = session.page.url();
                        if (result && result.ok === false) {
                            pushEvent(session, {
                                kind: 'status',
                                level: 'error',
                                message: `${toolName} failed: ${result.error || 'unknown error'}`
                            });
                        } else {
                            const resultSummary = summarizeToolResult(result);
                            if (resultSummary) {
                                pushEvent(session, {
                                    kind: 'status',
                                    level: 'info',
                                    message: `${toolName}: ${resultSummary}`
                                });
                            }
                        }

                        session.history.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            tool_name: toolName,
                            content: JSON.stringify(result)
                        });
                    }
                    continue;
                }

                const finalText = assistantMessage.content || 'task completed';
                session.history.push({ role: 'assistant', content: finalText });
                pushEvent(session, {
                    kind: 'message',
                    role: 'assistant',
                    content: finalText
                });
                return {
                    ok: true,
                    sessionId: session.id,
                    message: finalText
                };
            }

            throw new Error('agent reached the maximum execution steps');
        } catch (error) {
            const stopped = isStopError(error) || session.abortController?.signal?.aborted;
            const normalizedError = stopped
                ? createAgentStoppedError(activeBatchJob?.running
                    ? (activeBatchJob.stopMessage || 'batch task stopped')
                    : (error?.message || 'agent session stopped'))
                : error;

            pushEvent(session, {
                kind: 'status',
                level: stopped ? 'warn' : 'error',
                message: normalizedError.message || 'agent execution failed'
            });
            throw normalizedError;
        } finally {
            session.running = false;
            session.abortController = null;
            emitUpdate();
        }
    }

    async function sendMessage(payload = {}) {
        if (!activeSession) {
            throw new Error('请先启动 Agent 会话');
        }
        if (activeSession.running) {
            throw new Error('当前 Agent 正在执行，请先等待或停止');
        }

        const message = String(payload.message || '').trim();
        if (!message) {
            throw new Error('消息不能为空');
        }

        return runSessionMessage(activeSession, message);

        const session = activeSession;
        if (!session.page) {
            await ensureSessionRuntime(session);
        }

        session.running = true;
        session.abortController = new AbortController();
        session.pageUrl = session.page.url();
        session.history.push({ role: 'user', content: message });
        pushEvent(session, {
            kind: 'message',
            role: 'user',
            content: message
        });

        try {
            for (let step = 0; step < 10; step += 1) {
                if (session.abortController.signal.aborted) {
                    throw createAgentStoppedError(activeBatchJob?.running
                        ? (activeBatchJob.stopMessage || '批量任务已停止')
                        : 'Agent 会话已停止');
                }

                pushEvent(session, {
                    kind: 'status',
                    level: 'info',
                    message: `请求模型决策，第 ${step + 1} 轮`
                });

                const assistantMessage = await callProvider(session.provider, session, session.abortController.signal);
                session.pageUrl = session.page.url();

                if (assistantMessage.toolCalls.length) {
                    session.history.push({
                        role: 'assistant',
                        content: assistantMessage.content || '',
                        tool_calls: assistantMessage.toolCalls
                    });

                    for (const toolCall of assistantMessage.toolCalls) {
                        const toolName = toolCall.function.name;
                        const parsedArgs = parseJsonSafe(toolCall.function.arguments, {});
                        pushEvent(session, {
                            kind: 'tool',
                            level: 'tool',
                            message: `${toolName}${summarizeArgs(parsedArgs) ? `(${summarizeArgs(parsedArgs)})` : '()'}`
                        });

                        let result;
                        try {
                            result = await executeTool(session.page, toolName, parsedArgs, {
                                agentSettings: dependencies.getAgentSettings?.() || {},
                                runtimeDir: dependencies.runtimeDir || '',
                                profileId: session.profileId || '',
                                sessionId: session.id || ''
                            });
                        } catch (error) {
                            result = {
                                ok: false,
                                error: error?.message || 'tool execution failed',
                                tool: toolName,
                                args: parsedArgs
                            };
                        }

                        session.pageUrl = session.page.url();
                        if (result && result.ok === false) {
                            pushEvent(session, {
                                kind: 'status',
                                level: 'error',
                                message: `${toolName} failed: ${result.error || 'unknown error'}`
                            });
                        }

                        session.history.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            tool_name: toolName,
                            content: JSON.stringify(result)
                        });
                    }
                    continue;
                }

                const finalText = assistantMessage.content || '任务已执行完成';
                session.history.push({ role: 'assistant', content: finalText });
                pushEvent(session, {
                    kind: 'message',
                    role: 'assistant',
                    content: finalText
                });
                return {
                    ok: true,
                    sessionId: session.id,
                    message: finalText
                };
            }

            throw new Error('Agent 达到最大执行轮次，已中止');
        } catch (error) {
            const stopped = isStopError(error) || session.abortController?.signal?.aborted;
            const normalizedError = stopped
                ? createAgentStoppedError(activeBatchJob?.running
                    ? (activeBatchJob.stopMessage || '批量任务已停止')
                    : (error?.message || 'Agent 会话已停止'))
                : error;

            pushEvent(session, {
                kind: 'status',
                level: stopped ? 'warn' : 'error',
                message: normalizedError.message || 'Agent 执行失败'
            });
            throw normalizedError;
        } finally {
            session.running = false;
            session.abortController = null;
            emitUpdate();
        }
    }

    async function releaseSession(session) {
        if (!session) {
            return;
        }

        if (session.running && session.abortController) {
            session.abortController.abort();
        }
        if (session.browser) {
            await session.browser.close().catch(() => {});
        }

        session.browser = null;
        session.page = null;
        session.abortController = null;
    }

    async function runBatchTask(batchJob, task, provider, prompt) {
        task.status = 'running';
        task.startedAt = task.startedAt || Date.now();
        task.endedAt = 0;
        task.durationMs = 0;
        batchJob.currentTaskId = task.id;

        appendTaskEvent(task, {
            kind: 'status',
            level: 'info',
            message: `task started: ${task.profileName}`
        });
        emitUpdate();

        const profile = dependencies.getProfile(task.profileId);
        if (!profile) {
            task.status = 'error';
            task.error = 'profile not found';
            task.summary = task.error;
            if (batchJob.failureStrategy === 'stop') {
                batchJob.stopRequested = true;
                batchJob.stopMessage = batchJob.stopMessage || `batch stopped after failure: ${task.profileName}`;
            }
            task.endedAt = Date.now();
            task.durationMs = task.endedAt - task.startedAt;
            appendTaskEvent(task, {
                kind: 'status',
                level: 'error',
                message: task.error
            });
            emitUpdate();
            return;
        }

        const totalAttempts = Math.max(1, Number(batchJob.maxRetries || 0) + 1);

        try {
            for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
                if (batchJob.stopRequested) {
                    throw createAgentStoppedError(batchJob.stopMessage || 'batch task stopped');
                }

                task.attemptCount = attempt;
                task.retryCount = Math.max(0, attempt - 1);
                if (attempt > 1) {
                    appendTaskEvent(task, {
                        kind: 'status',
                        level: 'warn',
                        message: `retry ${task.retryCount}/${batchJob.maxRetries}`
                    });
                }

                const session = buildSession(task.profileId, profile.name || task.profileId, provider);
                session.batchJobId = batchJob.id;
                session.batchTaskId = task.id;
                batchJob.sessions.set(task.id, session);

                try {
                    pushEvent(session, {
                        kind: 'status',
                        level: 'info',
                        message: `batch session created: ${session.profileName}`
                    });
                    await ensureSessionRuntime(session);
                    pushEvent(session, {
                        kind: 'status',
                        level: 'info',
                        message: `browser connected: ${session.debugPort}`
                    });

                    await runSessionMessage(session, prompt);

                    const finalEntry = session.events
                        .slice()
                        .reverse()
                        .find((item) => item.kind === 'message' && item.role === 'assistant');

                    task.status = 'success';
                    task.summary = finalEntry?.content || task.lastMessage || 'task completed';
                    task.error = '';
                    task.pageUrl = session.pageUrl || '';
                    return;
                } catch (error) {
                    const stopped = batchJob.stopRequested || isStopError(error);
                    task.pageUrl = task.pageUrl || session.pageUrl || '';

                    if (stopped) {
                        task.status = 'stopped';
                        task.error = '';
                        task.summary = task.lastMessage || batchJob.stopMessage || 'batch task stopped';
                        return;
                    }

                    if (attempt < totalAttempts) {
                        appendTaskEvent(task, {
                            kind: 'status',
                            level: 'warn',
                            message: `attempt ${attempt} failed: ${error?.message || 'unknown error'}`
                        });
                        continue;
                    }

                    task.status = 'error';
                    task.error = error?.message || 'task failed';
                    task.summary = task.error;
                    if (batchJob.failureStrategy === 'stop') {
                        batchJob.stopRequested = true;
                        batchJob.stopMessage = batchJob.stopMessage || `batch stopped after failure: ${task.profileName}`;
                        for (const runningSession of batchJob.sessions.values()) {
                            if (runningSession.id !== session.id && runningSession.running && runningSession.abortController) {
                                runningSession.abortController.abort();
                            }
                        }
                    }
                    return;
                } finally {
                    batchJob.sessions.delete(task.id);
                    await releaseSession(session);
                    emitUpdate();
                }
            }
        } finally {
            task.endedAt = Date.now();
            task.durationMs = task.startedAt ? (task.endedAt - task.startedAt) : 0;
            emitUpdate();
        }
    }

    async function startBatchRun(payload = {}) {
        const provider = payload.provider;
        const prompt = String(payload.prompt || '').trim();
        const profileIds = Array.from(new Set((payload.profileIds || []).map((item) => String(item || '').trim()).filter(Boolean)));

        if (!provider?.id || !provider?.model) {
            throw new Error('请选择模型');
        }
        if (!prompt) {
            throw new Error('批量任务说明不能为空');
        }
        if (!profileIds.length) {
            throw new Error('请至少选择一个窗口');
        }
        if (activeBatchJob?.running) {
            throw new Error('当前已有批量任务正在执行');
        }
        if (activeSession?.running) {
            throw new Error('当前有单窗口会话正在执行');
        }

        const profiles = profileIds.map((id) => dependencies.getProfile(id)).filter(Boolean);
        if (!profiles.length) {
            throw new Error('未找到可用窗口');
        }

        if (activeSession) {
            await clearActiveSession();
        }

        activeBatchJob = {
            id: uuidv4(),
            running: true,
            stopRequested: false,
            stopMessage: '',
            prompt,
            provider: { ...provider },
            currentTaskId: '',
            tasks: profiles.map((profile) => ({
                id: uuidv4(),
                profileId: profile.id,
                profileName: profile.name || profile.id,
                status: 'queued',
                createdAt: Date.now(),
                startedAt: 0,
                endedAt: 0,
                durationMs: 0,
                pageUrl: '',
                summary: '',
                error: '',
                lastMessage: '',
                events: []
            }))
        };
        emitUpdate();

        const batchJob = activeBatchJob;

        for (const task of batchJob.tasks) {
            if (!activeBatchJob || activeBatchJob.id !== batchJob.id) {
                break;
            }
            if (batchJob.stopRequested) {
                break;
            }

            task.status = 'running';
            task.startedAt = Date.now();
            batchJob.currentTaskId = task.id;
            appendTaskEvent(task, {
                kind: 'status',
                level: 'info',
                message: `任务开始排队：${task.profileName}`
            });

            const profile = dependencies.getProfile(task.profileId);
            if (!profile) {
                task.status = 'error';
                task.error = '窗口不存在';
                task.summary = task.error;
                task.endedAt = Date.now();
                task.durationMs = task.endedAt - task.startedAt;
                appendTaskEvent(task, {
                    kind: 'status',
                    level: 'error',
                    message: task.error
                });
                emitUpdate();
                continue;
            }

            activeSession = buildSession(task.profileId, profile.name || task.profileId, provider);
            emitUpdate();

            try {
                pushEvent(activeSession, {
                    kind: 'status',
                    level: 'info',
                    message: `已创建批量任务会话：${activeSession.profileName}`
                });
                await ensureSessionRuntime(activeSession);
                pushEvent(activeSession, {
                    kind: 'status',
                    level: 'info',
                    message: `已连接浏览器，调试端口 ${activeSession.debugPort}`
                });

                if (batchJob.stopRequested) {
                    throw createAgentStoppedError(batchJob.stopMessage || '批量任务已停止');
                }

                await sendMessage({ message: prompt });

                if (batchJob.stopRequested) {
                    throw createAgentStoppedError(batchJob.stopMessage || '批量任务已停止');
                }

                const finalEntry = activeSession.events
                    .slice()
                    .reverse()
                    .find((item) => item.kind === 'message' && item.role === 'assistant');

                task.status = 'success';
                task.summary = finalEntry?.content || task.lastMessage || '任务已完成';
                task.error = '';
                task.pageUrl = activeSession.pageUrl;
            } catch (error) {
                const stopped = batchJob.stopRequested || isStopError(error);
                task.status = stopped ? 'stopped' : 'error';
                task.error = stopped ? '' : (error?.message || '任务失败');
                task.summary = stopped
                    ? (task.lastMessage || batchJob.stopMessage || '批量任务已停止')
                    : task.error;
            } finally {
                task.endedAt = Date.now();
                task.durationMs = task.startedAt ? (task.endedAt - task.startedAt) : 0;
                task.pageUrl = task.pageUrl || activeSession?.pageUrl || '';
                await clearActiveSession();
                emitUpdate();
            }
        }

        if (activeBatchJob && activeBatchJob.id === batchJob.id) {
            if (batchJob.stopRequested) {
                markPendingBatchTasks(batchJob, batchJob.stopMessage || '批量任务已停止');
            }
            batchJob.running = false;
            batchJob.currentTaskId = '';
        }

        emitUpdate();
        return getPublicState();
    }

    async function startConfiguredBatchRun(payload = {}) {
        const provider = payload.provider;
        const prompt = String(payload.prompt || '').trim();
        const profileIds = Array.from(new Set((payload.profileIds || []).map((item) => String(item || '').trim()).filter(Boolean)));
        const concurrency = clampNumber(payload.concurrency, 1, 5, 1);
        const maxRetries = clampNumber(payload.maxRetries, 0, 3, 0);
        const failureStrategy = String(payload.failureStrategy || '').trim() === 'stop' ? 'stop' : 'skip';

        if (!provider?.id || !provider?.model) {
            throw new Error('请选择模型');
        }
        if (!prompt) {
            throw new Error('批量任务说明不能为空');
        }
        if (!profileIds.length) {
            throw new Error('请至少选择一个窗口');
        }
        if (activeBatchJob?.running) {
            throw new Error('当前已有批量任务正在执行');
        }
        if (activeSession?.running) {
            throw new Error('当前有单窗口会话正在执行');
        }

        const profiles = profileIds.map((id) => dependencies.getProfile(id)).filter(Boolean);
        if (!profiles.length) {
            throw new Error('没有可用窗口');
        }

        if (activeSession) {
            await clearActiveSession();
        }

        activeBatchJob = {
            id: uuidv4(),
            running: true,
            stopRequested: false,
            stopMessage: '',
            prompt,
            provider: { ...provider },
            concurrency,
            maxRetries,
            failureStrategy,
            currentTaskId: '',
            exportFilePath: '',
            exportedAt: 0,
            sessions: new Map(),
            tasks: profiles.map((profile) => ({
                id: uuidv4(),
                profileId: profile.id,
                profileName: profile.name || profile.id,
                status: 'queued',
                createdAt: Date.now(),
                startedAt: 0,
                endedAt: 0,
                durationMs: 0,
                pageUrl: '',
                summary: '',
                error: '',
                lastMessage: '',
                attemptCount: 0,
                retryCount: 0,
                events: []
            }))
        };
        emitUpdate();

        const batchJob = activeBatchJob;
        let cursor = 0;
        const workerCount = Math.min(concurrency, batchJob.tasks.length);

        await Promise.all(Array.from({ length: workerCount }, async () => {
            while (true) {
                if (!activeBatchJob || activeBatchJob.id !== batchJob.id) {
                    return;
                }
                if (batchJob.stopRequested) {
                    return;
                }

                const task = batchJob.tasks[cursor];
                cursor += 1;
                if (!task) {
                    return;
                }

                await runBatchTask(batchJob, task, provider, prompt);
            }
        }));

        if (activeBatchJob && activeBatchJob.id === batchJob.id) {
            if (batchJob.stopRequested) {
                markPendingBatchTasks(batchJob, batchJob.stopMessage || '批量任务已停止');
            }
            batchJob.running = false;
            batchJob.currentTaskId = '';
        }

        emitUpdate();
        return getPublicState();
    }

    function getBatchExportPayload() {
        if (!activeBatchJob?.tasks?.length) {
            throw new Error('没有可导出的批量结果');
        }
        return buildBatchExportPayload(activeBatchJob);
    }

    function markBatchExport(filePath = '') {
        if (!activeBatchJob) {
            return;
        }
        activeBatchJob.exportFilePath = String(filePath || '').trim();
        activeBatchJob.exportedAt = Date.now();
        emitUpdate();
    }

    function stopSession() {
        if (activeBatchJob?.running) {
            activeBatchJob.stopRequested = true;
            activeBatchJob.stopMessage = activeBatchJob.stopMessage || '用户已请求停止批量任务';

            if (activeSession?.running && activeSession.abortController) {
                activeSession.abortController.abort();
                pushEvent(activeSession, {
                    kind: 'status',
                    level: 'warn',
                    message: activeBatchJob.stopMessage
                });
            } else if (activeBatchJob.currentTaskId) {
                const currentTask = activeBatchJob.tasks.find((item) => item.id === activeBatchJob.currentTaskId);
                if (currentTask) {
                    appendTaskEvent(currentTask, {
                        kind: 'status',
                        level: 'warn',
                        message: activeBatchJob.stopMessage
                    });
                }
            }

            for (const session of activeBatchJob.sessions?.values?.() || []) {
                if (session?.running && session.abortController) {
                    session.abortController.abort();
                }
            }

            emitUpdate();
            return true;
        }

        if (!activeSession?.running || !activeSession.abortController) {
            return false;
        }

        activeSession.abortController.abort();
        pushEvent(activeSession, {
            kind: 'status',
            level: 'warn',
            message: '正在停止当前操作'
        });
        return true;
    }

    return {
        getPublicState,
        createSession,
        sendMessage,
        startBatchRun: startConfiguredBatchRun,
        getBatchExportPayload,
        markBatchExport,
        stopSession,
        closeSession
    };
}

module.exports = {
    createAgentController
};
