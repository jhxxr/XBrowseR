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

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getUserAgentsForPlatform(platform) {
    return USER_AGENTS[platform] || USER_AGENTS.Win32;
}

function createFingerprint(input = {}) {
    const language = input.language === '' || input.language == null ? 'auto' : input.language;
    const resolution = input.screen?.width && input.screen?.height
        ? { width: Number(input.screen.width), height: Number(input.screen.height) }
        : randomItem(RESOLUTIONS);
    const platform = input.platform || randomItem(PLATFORMS);
    const userAgents = getUserAgentsForPlatform(platform);
    const connection = input.connection || randomItem(CONNECTIONS);

    const mediaDevices = input.mediaDevices || [
        { kind: 'audioinput', deviceId: `mic-${randomInt(1000, 9999)}`, label: platform === 'MacIntel' ? 'MacBook Microphone' : 'Microphone Array (Realtek Audio)' },
        { kind: 'audiooutput', deviceId: `speaker-${randomInt(1000, 9999)}`, label: platform === 'MacIntel' ? 'MacBook Speakers' : 'Speakers (Realtek Audio)' },
        { kind: 'videoinput', deviceId: `cam-${randomInt(1000, 9999)}`, label: platform === 'MacIntel' ? 'FaceTime HD Camera' : 'Integrated Camera' }
    ];

    const mimeTypes = [
        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' }
    ];

    const plugins = input.plugins || [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimeTypes },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: 'Portable Document Format', mimeTypes },
        { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimeTypes }
    ];

    return {
        userAgent: input.userAgent || randomItem(userAgents),
        language,
        languages: input.languages || (language === 'auto' ? [] : [language, language.split('-')[0]]),
        timezone: input.timezone === '' || input.timezone == null ? 'auto' : input.timezone,
        useProxyLocale: input.useProxyLocale !== false,
        platform,
        hardwareConcurrency: Number(input.hardwareConcurrency) || randomInt(4, 12),
        deviceMemory: Number(input.deviceMemory) || randomItem([4, 8, 16]),
        colorDepth: 24,
        maxTouchPoints: 0,
        devicePixelRatio: Number(input.devicePixelRatio) || randomItem(DEVICE_PIXEL_RATIOS),
        screen: resolution,
        vendor: 'Google Inc.',
        productSub: '20030107',
        pdfViewerEnabled: true,
        connection,
        mediaDevices,
        plugins,
        webglVendor: input.webglVendor || 'Google Inc. (Intel)',
        webglRenderer: input.webglRenderer || 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)',
        canvasNoise: Number(input.canvasNoise) || randomInt(1, 99),
        audioNoise: Number(input.audioNoise) || randomInt(1, 99),
    };
}

module.exports = {
    createFingerprint,
    getUserAgentsForPlatform,
};
