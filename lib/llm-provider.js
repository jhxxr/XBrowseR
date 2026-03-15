const { v4: uuidv4 } = require('uuid');

const PROVIDER_FORMATS = [
    {
        value: 'openai',
        label: 'OpenAI',
        defaultBaseUrl: 'https://api.openai.com/v1'
    },
    {
        value: 'openai-responses',
        label: 'OpenAI Responses',
        defaultBaseUrl: 'https://api.openai.com/v1'
    },
    {
        value: 'anthropic',
        label: 'Anthropic',
        defaultBaseUrl: 'https://api.anthropic.com/v1'
    },
    {
        value: 'gemini',
        label: 'Gemini',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta'
    }
];

function normalizeBaseUrl(value = '') {
    return String(value || '').trim().replace(/\/+$/, '');
}

function resolveProviderBaseUrl(input = {}) {
    const format = input?.format || 'openai';
    const raw = normalizeBaseUrl(input?.baseUrl || '');
    if (!raw) {
        return raw;
    }

    if (format === 'gemini') {
        if (/\/v1beta(?:$|\/)/i.test(raw)) {
            return raw;
        }
        return `${raw}/v1beta`;
    }

    if (/\/v\d+(?:beta)?(?:$|\/)/i.test(raw)) {
        return raw;
    }
    return `${raw}/v1`;
}

function getProviderFormatDefinition(format) {
    return PROVIDER_FORMATS.find((item) => item.value === format) || PROVIDER_FORMATS[0];
}

function buildProviderRecord(input = {}) {
    const definition = getProviderFormatDefinition(input.format || 'openai');
    const models = Array.isArray(input.models)
        ? Array.from(new Set(input.models.map((item) => String(item || '').trim()).filter(Boolean)))
        : [];

    return {
        id: input.id || uuidv4(),
        name: String(input.name || definition.label).trim() || definition.label,
        format: definition.value,
        apiKey: String(input.apiKey || '').trim(),
        baseUrl: resolveProviderBaseUrl({ format: definition.value, baseUrl: input.baseUrl || definition.defaultBaseUrl }),
        model: String(input.model || '').trim(),
        models,
        updatedAt: input.updatedAt || Date.now()
    };
}

function ensureAgentSettings(settings = {}) {
    const providers = Array.isArray(settings.agent?.providers)
        ? settings.agent.providers.map((item) => buildProviderRecord(item))
        : [];

    if (!providers.length) {
        const initial = buildProviderRecord({
            name: '默认 OpenAI',
            format: 'openai'
        });
        return {
            ...settings,
            agent: {
                providers: [initial],
                activeProviderId: initial.id,
                toolTimeoutMs: Math.max(5000, Number(settings.agent?.toolTimeoutMs) || 20000)
            }
        };
    }

    const activeProviderId = providers.some((item) => item.id === settings.agent?.activeProviderId)
        ? settings.agent.activeProviderId
        : providers[0].id;

    return {
        ...settings,
        agent: {
            providers,
            activeProviderId,
            toolTimeoutMs: Math.max(5000, Number(settings.agent?.toolTimeoutMs) || 20000)
        }
    };
}

async function readJsonResponse(response) {
    return response.json().catch(() => ({}));
}

async function fetchOpenAiModels(provider) {
    const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/models`, {
        headers: {
            Authorization: `Bearer ${provider.apiKey}`
        }
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
    }
    return Array.isArray(payload?.data)
        ? payload.data.map((item) => String(item?.id || '').trim()).filter(Boolean)
        : [];
}

async function fetchAnthropicModels(provider) {
    const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/models`, {
        headers: {
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01'
        }
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
    }
    return Array.isArray(payload?.data)
        ? payload.data.map((item) => String(item?.id || '').trim()).filter(Boolean)
        : [];
}

async function fetchGeminiModels(provider) {
    const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/models?key=${encodeURIComponent(provider.apiKey)}`);
    const payload = await readJsonResponse(response);
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
    }
    return Array.isArray(payload?.models)
        ? payload.models
            .map((item) => String(item?.name || '').replace(/^models\//, '').trim())
            .filter(Boolean)
        : [];
}

async function fetchModelsForProvider(provider) {
    if (!provider?.apiKey) {
        throw new Error('API Key 不能为空');
    }

    if (provider.format === 'anthropic') {
        return fetchAnthropicModels(provider);
    }

    if (provider.format === 'gemini') {
        return fetchGeminiModels(provider);
    }

    return fetchOpenAiModels(provider);
}

module.exports = {
    PROVIDER_FORMATS,
    buildProviderRecord,
    ensureAgentSettings,
    fetchModelsForProvider,
    getProviderFormatDefinition,
    normalizeBaseUrl,
    resolveProviderBaseUrl
};
