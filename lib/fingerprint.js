const { randomUUID } = require('crypto');

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

const LANGUAGES = ['en-US', 'en-GB', 'zh-CN', 'zh-HK', 'ja-JP'];
const TIMEZONES = ['UTC', 'Asia/Hong_Kong', 'Asia/Singapore', 'Europe/Amsterdam', 'America/New_York'];
const PLATFORMS = ['Win32', 'MacIntel'];
const RESOLUTIONS = [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 }
];
const DEVICE_PIXEL_RATIOS = [1, 1.25, 1.5];
const CONNECTIONS = [
    { effectiveType: '4g', rtt: 50, downlink: 10 },
    { effectiveType: '4g', rtt: 80, downlink: 8.5 },
    { effectiveType: '3g', rtt: 180, downlink: 2.2 }
];
const DEVICE_PRESETS = {
    Win32: [
        {
            id: 'win-ultrabook-hd',
            hardwareConcurrency: 8,
            deviceMemory: 8,
            devicePixelRatio: 1,
            screen: { width: 1366, height: 768 },
            connection: { effectiveType: '4g', rtt: 80, downlink: 8.5 },
            webglVendor: 'Google Inc. (Intel)',
            webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)',
            mediaDevices: [
                { kind: 'audioinput', deviceId: 'mic-6201', label: 'Microphone Array (Intel Smart Sound Technology)' },
                { kind: 'audiooutput', deviceId: 'speaker-6201', label: 'Speakers (Realtek Audio)' },
                { kind: 'videoinput', deviceId: 'cam-6201', label: 'Integrated Camera' }
            ]
        },
        {
            id: 'win-office-fhd',
            hardwareConcurrency: 8,
            deviceMemory: 16,
            devicePixelRatio: 1,
            screen: { width: 1920, height: 1080 },
            connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
            webglVendor: 'Google Inc. (Intel)',
            webglRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)',
            mediaDevices: [
                { kind: 'audioinput', deviceId: 'mic-xe01', label: 'Microphone Array (Realtek Audio)' },
                { kind: 'audiooutput', deviceId: 'speaker-xe01', label: 'Speakers (Realtek Audio)' },
                { kind: 'videoinput', deviceId: 'cam-xe01', label: 'Integrated Camera' }
            ]
        },
        {
            id: 'win-gaming-fhd',
            hardwareConcurrency: 16,
            deviceMemory: 16,
            devicePixelRatio: 1,
            screen: { width: 1920, height: 1080 },
            connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
            webglVendor: 'Google Inc. (NVIDIA)',
            webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
            mediaDevices: [
                { kind: 'audioinput', deviceId: 'mic-rtx1', label: 'Microphone (USB Audio Device)' },
                { kind: 'audiooutput', deviceId: 'speaker-rtx1', label: 'Speakers (High Definition Audio Device)' },
                { kind: 'videoinput', deviceId: 'cam-rtx1', label: 'HD Webcam' }
            ]
        },
        {
            id: 'win-creator-qhd',
            hardwareConcurrency: 20,
            deviceMemory: 32,
            devicePixelRatio: 1.25,
            screen: { width: 2560, height: 1440 },
            connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
            webglVendor: 'Google Inc. (NVIDIA)',
            webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)',
            mediaDevices: [
                { kind: 'audioinput', deviceId: 'mic-4070', label: 'Microphone (USB Audio Device)' },
                { kind: 'audiooutput', deviceId: 'speaker-4070', label: 'Speakers (USB Audio Device)' },
                { kind: 'videoinput', deviceId: 'cam-4070', label: '4K USB Camera' }
            ]
        },
        {
            id: 'win-budget-hdplus',
            hardwareConcurrency: 4,
            deviceMemory: 8,
            devicePixelRatio: 1,
            screen: { width: 1600, height: 900 },
            connection: { effectiveType: '3g', rtt: 180, downlink: 2.2 },
            webglVendor: 'Google Inc. (Intel)',
            webglRenderer: 'ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0)',
            mediaDevices: [
                { kind: 'audioinput', deviceId: 'mic-5201', label: 'Microphone Array (Realtek Audio)' },
                { kind: 'audiooutput', deviceId: 'speaker-5201', label: 'Speakers (Realtek Audio)' },
                { kind: 'videoinput', deviceId: 'cam-5201', label: 'Integrated Camera' }
            ]
        }
    ],
    MacIntel: [
        {
            id: 'mac-retina-classic',
            hardwareConcurrency: 8,
            deviceMemory: 8,
            devicePixelRatio: 2,
            screen: { width: 1440, height: 900 },
            connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
            webglVendor: 'Google Inc. (Apple)',
            webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
            mediaDevices: [
                { kind: 'audioinput', deviceId: 'mic-mac1', label: 'MacBook Pro Microphone' },
                { kind: 'audiooutput', deviceId: 'speaker-mac1', label: 'MacBook Pro Speakers' },
                { kind: 'videoinput', deviceId: 'cam-mac1', label: 'FaceTime HD Camera' }
            ]
        },
        {
            id: 'mac-retina-pro',
            hardwareConcurrency: 10,
            deviceMemory: 16,
            devicePixelRatio: 2,
            screen: { width: 1728, height: 1117 },
            connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
            webglVendor: 'Google Inc. (Apple)',
            webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',
            mediaDevices: [
                { kind: 'audioinput', deviceId: 'mic-mac2', label: 'MacBook Pro Microphone' },
                { kind: 'audiooutput', deviceId: 'speaker-mac2', label: 'MacBook Pro Speakers' },
                { kind: 'videoinput', deviceId: 'cam-mac2', label: 'FaceTime HD Camera' }
            ]
        },
        {
            id: 'mac-retina-max',
            hardwareConcurrency: 12,
            deviceMemory: 32,
            devicePixelRatio: 2,
            screen: { width: 1800, height: 1169 },
            connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
            webglVendor: 'Google Inc. (Apple)',
            webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)',
            mediaDevices: [
                { kind: 'audioinput', deviceId: 'mic-mac3', label: 'MacBook Pro Microphone' },
                { kind: 'audiooutput', deviceId: 'speaker-mac3', label: 'MacBook Pro Speakers' },
                { kind: 'videoinput', deviceId: 'cam-mac3', label: 'FaceTime HD Camera' }
            ]
        }
    ]
};
const FONT_PRESETS = {
    Win32: [
        'Arial',
        'Calibri',
        'Cambria',
        'Consolas',
        'Courier New',
        'Georgia',
        'Segoe UI',
        'Tahoma',
        'Times New Roman',
        'Trebuchet MS',
        'Verdana',
        'Microsoft YaHei UI'
    ],
    MacIntel: [
        'American Typewriter',
        'Arial',
        'Courier',
        'Geneva',
        'Helvetica Neue',
        'Menlo',
        'Monaco',
        'PingFang SC',
        'SF Pro Display',
        'Songti SC',
        'Times New Roman'
    ]
};

function hashString(input) {
    let hash = 2166136261;
    const text = String(input || '');
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createRng(seed) {
    let value = hashString(seed) || 1;
    return () => {
        value += 0x6D2B79F5;
        let next = value;
        next = Math.imul(next ^ (next >>> 15), next | 1);
        next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
        return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
}

function randomItem(items, rng = Math.random) {
    return items[Math.floor(rng() * items.length)];
}

function randomInt(min, max, rng = Math.random) {
    return Math.floor(rng() * (max - min + 1)) + min;
}

function getUserAgentsForPlatform(platform) {
    return USER_AGENTS[platform] || USER_AGENTS.Win32;
}

function getPresetForPlatform(platform, rng) {
    const presets = DEVICE_PRESETS[platform] || DEVICE_PRESETS.Win32;
    return randomItem(presets, rng);
}

function getPresetById(platform, presetId) {
    const presets = DEVICE_PRESETS[platform] || DEVICE_PRESETS.Win32;
    return presets.find((item) => item.id === presetId) || null;
}

function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeStringList(value) {
    if (Array.isArray(value)) {
        return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
    }
    if (typeof value === 'string') {
        return Array.from(new Set(value
            .split(/[\r\n,]+/)
            .map((item) => item.trim())
            .filter(Boolean)));
    }
    return [];
}

function buildDefaultSpeechVoices(language = 'en-US') {
    const lang = String(language || 'en-US').trim() || 'en-US';
    if (lang.startsWith('zh')) {
        return [
            {
                default: true,
                lang: 'zh-CN',
                localService: true,
                name: 'Microsoft Xiaoxiao Online (Natural)',
                voiceURI: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)'
            },
            {
                default: false,
                lang: 'zh-CN',
                localService: true,
                name: 'Microsoft Yunxi Online (Natural)',
                voiceURI: 'Microsoft Yunxi Online (Natural) - Chinese (Mainland)'
            }
        ];
    }
    if (lang.startsWith('ja')) {
        return [
            {
                default: true,
                lang: 'ja-JP',
                localService: true,
                name: 'Microsoft Nanami Online (Natural)',
                voiceURI: 'Microsoft Nanami Online (Natural) - Japanese (Japan)'
            }
        ];
    }
    return [
        {
            default: true,
            lang: 'en-US',
            localService: true,
            name: 'Microsoft Aria Online (Natural)',
            voiceURI: 'Microsoft Aria Online (Natural) - English (United States)'
        },
        {
            default: false,
            lang: 'en-US',
            localService: true,
            name: 'Google US English',
            voiceURI: 'Google US English'
        }
    ];
}

function normalizeSpeechVoices(value, fallbackLanguage = 'en-US') {
    if (Array.isArray(value) && value.length) {
        return value.map((item, index) => ({
            default: item?.default !== false && index === 0,
            lang: String(item?.lang || fallbackLanguage || 'en-US').trim() || 'en-US',
            localService: item?.localService !== false,
            name: String(item?.name || item?.voiceURI || `Voice-${index + 1}`).trim(),
            voiceURI: String(item?.voiceURI || item?.name || `Voice-${index + 1}`).trim()
        })).filter((item) => item.name && item.voiceURI);
    }
    return [];
}

function resolveGpuTier(renderer = '') {
    const value = String(renderer || '');
    if (/RTX 40|M3 Max|RX 7/i.test(value)) return 'high';
    if (/RTX|GeForce|Radeon|M[1-3] Pro|M[1-3]\b|Iris|Xe/i.test(value)) return 'medium';
    return 'low';
}

function buildWebgpuProfile(input = {}, renderer = '', vendor = '', gpuTier = 'medium') {
    const source = input && typeof input === 'object' ? input : {};
    const enabled = Object.prototype.hasOwnProperty.call(source, 'enabled')
        ? source.enabled !== false
        : true;
    const device = String(source.device || renderer || 'Default GPU').trim();
    const adapterVendor = String(source.vendor || vendor || 'Google Inc.').trim();
    const architecture = /Apple|Metal/i.test(device) ? 'apple-gpu' : (/NVIDIA|GeForce|RTX/i.test(device) ? 'nvidia' : (/Intel|Iris|UHD|HD/i.test(device) ? 'intel' : 'generic'));
    return {
        enabled,
        vendor: adapterVendor,
        architecture,
        device,
        description: String(source.description || `${gpuTier.toUpperCase()} tier adapter`).trim()
    };
}

function normalizeGeolocation(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const latitude = Number(source.latitude);
    const longitude = Number(source.longitude);
    const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
    let mode = String(source.mode || '').trim() || (hasCoords ? 'manual' : 'auto');
    if (!['auto', 'manual', 'block'].includes(mode)) {
        mode = hasCoords ? 'manual' : 'auto';
    }
    return {
        mode,
        latitude: hasCoords ? latitude : 0,
        longitude: hasCoords ? longitude : 0,
        accuracy: Math.max(1, Number(source.accuracy) || 30)
    };
}

function createFingerprint(input = {}) {
    const seed = input.seed || randomUUID();
    const rng = createRng(seed);
    const language = input.language === '' || input.language == null ? 'auto' : input.language;
    const platform = input.platform || randomItem(PLATFORMS, rng);
    const preset = getPresetById(platform, input.presetId) || getPresetForPlatform(platform, rng);
    const resolution = input.screen?.width && input.screen?.height
        ? { width: Number(input.screen.width), height: Number(input.screen.height) }
        : cloneValue(preset.screen || randomItem(RESOLUTIONS, rng));
    const userAgents = getUserAgentsForPlatform(platform);
    const connection = cloneValue(input.connection || preset.connection || randomItem(CONNECTIONS, rng));

    const mediaDevices = cloneValue(input.mediaDevices || preset.mediaDevices || [
        { kind: 'audioinput', deviceId: `mic-${randomInt(1000, 9999, rng)}`, label: platform === 'MacIntel' ? 'MacBook Microphone' : 'Microphone Array (Realtek Audio)' },
        { kind: 'audiooutput', deviceId: `speaker-${randomInt(1000, 9999, rng)}`, label: platform === 'MacIntel' ? 'MacBook Speakers' : 'Speakers (Realtek Audio)' },
        { kind: 'videoinput', deviceId: `cam-${randomInt(1000, 9999, rng)}`, label: platform === 'MacIntel' ? 'FaceTime HD Camera' : 'Integrated Camera' }
    ]);

    const mimeTypes = [
        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' }
    ];

    const plugins = cloneValue(input.plugins || [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimeTypes },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: 'Portable Document Format', mimeTypes },
        { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimeTypes }
    ]);
    const resolvedLanguage = language === 'auto' ? '' : language;
    const speechVoices = normalizeSpeechVoices(input.speechVoices, resolvedLanguage || 'en-US');
    const webglRenderer = input.webglRenderer || preset.webglRenderer || 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)';
    const webglVendor = input.webglVendor || preset.webglVendor || 'Google Inc. (Intel)';
    const gpuTier = String(input.gpuTier || resolveGpuTier(webglRenderer)).trim() || resolveGpuTier(webglRenderer);

    return {
        seed,
        presetId: input.presetId || preset.id,
        userAgent: input.userAgent || randomItem(userAgents, rng),
        language,
        languages: input.languages || (language === 'auto' ? [] : [language, language.split('-')[0]]),
        timezone: input.timezone === '' || input.timezone == null ? 'auto' : input.timezone,
        useProxyLocale: input.useProxyLocale !== false,
        platform,
        hardwareConcurrency: Number(input.hardwareConcurrency) || preset.hardwareConcurrency || randomInt(4, 12, rng),
        deviceMemory: Number(input.deviceMemory) || preset.deviceMemory || randomItem([4, 8, 16], rng),
        colorDepth: 24,
        maxTouchPoints: 0,
        devicePixelRatio: Number(input.devicePixelRatio) || preset.devicePixelRatio || randomItem(DEVICE_PIXEL_RATIOS, rng),
        screen: resolution,
        vendor: 'Google Inc.',
        productSub: '20030107',
        pdfViewerEnabled: true,
        connection,
        mediaDevices,
        plugins,
        webglVendor,
        webglRenderer,
        fonts: normalizeStringList(input.fonts).length ? normalizeStringList(input.fonts) : cloneValue(FONT_PRESETS[platform] || FONT_PRESETS.Win32),
        webrtcMode: ['proxy', 'disabled', 'real'].includes(String(input.webrtcMode || '').trim())
            ? String(input.webrtcMode).trim()
            : 'proxy',
        geolocation: normalizeGeolocation(input.geolocation || {}),
        clientRectsNoise: Number(input.clientRectsNoise) || randomInt(1, 9, rng),
        audioContextNoise: Number(input.audioContextNoise) || Number(input.audioNoise) || randomInt(1, 9, rng),
        speechVoices: speechVoices.length ? speechVoices : (resolvedLanguage ? buildDefaultSpeechVoices(resolvedLanguage) : []),
        gpuTier,
        webgpu: buildWebgpuProfile(input.webgpu || {}, webglRenderer, webglVendor, gpuTier),
        doNotTrack: String(input.doNotTrack || '').trim() === '1' ? '1' : '',
        canvasNoise: Number(input.canvasNoise) || randomInt(1, 99, rng),
        audioNoise: Number(input.audioNoise) || Number(input.audioContextNoise) || randomInt(1, 99, rng),
    };
}

module.exports = {
    createFingerprint,
    buildDefaultSpeechVoices,
    getUserAgentsForPlatform,
};
