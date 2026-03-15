const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs-extra');
const { URL } = require('url');
const { spawn, execFile } = require('child_process');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const getPort = require('get-port');
const { v4: uuidv4 } = require('uuid');
const { WebSocket } = require('ws');

const { createStore } = require('./lib/store');
const { createAgentController } = require('./lib/ai-agent');
const { createEmptyAgentRuntimeState } = require('./lib/agent-runtime');
const { createFingerprint } = require('./lib/fingerprint');
const { parseProxyLink, parseSubscriptionContent, startCore, waitForMihomoReady, stopProcess, testProxyLatency, getBinaryPath } = require('./lib/mihomo');
const { ensureBundledMihomo, MIHOMO_VERSION } = require('./lib/mihomo-download');
const { ensureFingerprintExtension, createPageScript } = require('./lib/chrome-extension');
const { PROVIDER_FORMATS, buildProviderRecord, ensureAgentSettings, fetchModelsForProvider } = require('./lib/llm-provider');

const BASE_DIR = __dirname;
const store = createStore(BASE_DIR);
const PROFILE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let profiles = [];
let settings = null;
let mainWindow = null;
let agentWindow = null;
let apiServer = null;
let internalServer = null;
let internalServerPort = 0;
const runningProfiles = new Map();
let agentController = null;

function getLegacyStartPageUrl() {
    return `file:///${path.join(__dirname, 'app', 'startpage.html').replace(/\\/g, '/')}`;
}

function isBuiltInStartUrl(target = '') {
    if (!target) return true;
    const normalized = String(target).trim();
    if (!normalized) return true;
    if (normalized === getLegacyStartPageUrl()) return true;
    if (normalized.includes('/app/startpage.html')) return true;
    return /^https?:\/\/127\.0\.0\.1:\d+\/dashboard(?:\?.*)?$/i.test(normalized);
}

function getDefaultStartPageUrl(profileId = '') {
    if (!internalServerPort) {
        return getLegacyStartPageUrl();
    }
    const query = profileId ? `?id=${encodeURIComponent(profileId)}` : '';
    return `http://127.0.0.1:${internalServerPort}/dashboard${query}`;
}

function resolveBrowserExecutable() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Chromium\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    return candidates.find(candidate => fs.existsSync(candidate)) || '';
}

function generateProfileCode(existingProfiles = []) {
    const usedCodes = new Set(
        existingProfiles
            .map((profile) => String(profile?.code || '').trim().toUpperCase())
            .filter(Boolean)
    );

    for (let attempt = 0; attempt < 50; attempt += 1) {
        let suffix = '';
        for (let index = 0; index < 6; index += 1) {
            const next = Math.floor(Math.random() * PROFILE_CODE_ALPHABET.length);
            suffix += PROFILE_CODE_ALPHABET[next];
        }
        const code = suffix;
        if (!usedCodes.has(code)) {
            return code;
        }
    }

    return uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase();
}

function normalizeProfilesWithCodes(items = []) {
    const normalized = [];
    const usedCodes = new Set();

    for (const profile of items) {
        const next = { ...profile };
        const currentCode = String(next.code || '').trim().toUpperCase();
        if (!currentCode || usedCodes.has(currentCode)) {
            next.code = generateProfileCode(normalized);
        } else {
            next.code = currentCode;
        }
        usedCodes.add(next.code);
        normalized.push(next);
    }

    return normalized;
}

function buildProfile(input = {}) {
    const fingerprint = createFingerprint(input.fingerprint || {});
    const existing = input.id ? profiles.find((profile) => profile.id === input.id) : null;
    return {
        id: input.id || uuidv4(),
        code: input.code || existing?.code || generateProfileCode(profiles),
        name: input.name || `Window-${Date.now()}`,
        startUrl: input.startUrl || '',
        proxyId: input.proxyId || '',
        tags: Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(',').map(item => item.trim()).filter(Boolean),
        notes: input.notes || '',
        createdAt: input.createdAt || Date.now(),
        fingerprint,
    };
}

function mapCountryToLanguage(countryCode) {
    const table = {
        CN: 'zh-CN',
        HK: 'zh-HK',
        TW: 'zh-TW',
        JP: 'ja-JP',
        KR: 'ko-KR',
        SG: 'en-SG',
        US: 'en-US',
        GB: 'en-GB',
        NL: 'nl-NL',
        DE: 'de-DE',
        FR: 'fr-FR',
        IT: 'it-IT',
        ES: 'es-ES',
        PT: 'pt-PT',
        BR: 'pt-BR',
        RU: 'ru-RU',
        IN: 'en-IN',
        ID: 'id-ID',
        TH: 'th-TH',
        VN: 'vi-VN',
        MY: 'ms-MY',
        TR: 'tr-TR',
        PL: 'pl-PL',
        UA: 'uk-UA',
    };
    return table[countryCode] || 'en-US';
}

function requestJson(url, { proxyPort = null } = {}) {
    return new Promise((resolve) => {
        if (proxyPort) {
            const curlBinary = process.platform === 'win32' ? 'curl.exe' : 'curl';
            const args = [
                '--silent',
                '--show-error',
                '--location',
                '--max-time', '12',
                '--header', 'User-Agent: XBrowseR',
                '--proxy', `socks5h://127.0.0.1:${proxyPort}`,
                url
            ];

            execFile(curlBinary, args, { timeout: 14000 }, (error, stdout) => {
                if (error || !stdout) {
                    resolve(null);
                    return;
                }

                try {
                    resolve(JSON.parse(stdout));
                } catch (parseError) {
                    resolve(null);
                }
            });
            return;
        }

        const targetUrl = new URL(url);
        const transport = targetUrl.protocol === 'http:' ? http : https;
        const request = transport.get(url, {
            timeout: 6000,
            headers: { 'User-Agent': 'XBrowseR' }
        }, (response) => {
            if ((response.statusCode || 500) >= 400) {
                response.resume();
                resolve(null);
                return;
            }

            let raw = '';
            response.on('data', chunk => raw += chunk);
            response.on('end', () => {
                try {
                    resolve(JSON.parse(raw));
                } catch (error) {
                    resolve(null);
                }
            });
        });
        request.on('timeout', () => {
            request.destroy();
            resolve(null);
        });
        request.on('error', () => resolve(null));
    });
}

function pickLanguage(value, countryCode = '') {
    if (typeof value === 'string' && value.trim()) {
        return value.split(',').map(item => item.trim()).find(Boolean) || mapCountryToLanguage(countryCode);
    }
    return mapCountryToLanguage(countryCode);
}

function fetchGeoInfo({ proxyPort = null } = {}) {
    return (async () => {
        const ipSb = await requestJson('https://api.ip.sb/geoip', { proxyPort });
        if (ipSb?.ip && ipSb.country_code) {
            return {
                ip: ipSb.ip || '',
                city: ipSb.city || '',
                region: ipSb.region || '',
                country: ipSb.country || '',
                countryCode: ipSb.country_code || '',
                timezone: ipSb.timezone || '',
                language: mapCountryToLanguage(ipSb.country_code || ''),
                source: 'ip.sb'
            };
        }

        const ipapiCo = await requestJson('https://ipapi.co/json/', { proxyPort });
        if (ipapiCo?.ip && ipapiCo.country_code) {
            return {
                ip: ipapiCo.ip || '',
                city: ipapiCo.city || '',
                region: ipapiCo.region || '',
                country: ipapiCo.country_name || '',
                countryCode: ipapiCo.country_code || '',
                timezone: ipapiCo.timezone || '',
                language: pickLanguage(ipapiCo.languages, ipapiCo.country_code),
                source: 'ipapi.co'
            };
        }

        const ipapiIs = await requestJson('https://api.ipapi.is', { proxyPort });
        if (ipapiIs?.ip && ipapiIs.location?.country_code) {
            return {
                ip: ipapiIs.ip || '',
                city: ipapiIs.location?.city || '',
                region: ipapiIs.location?.state || '',
                country: ipapiIs.location?.country || '',
                countryCode: ipapiIs.location?.country_code || '',
                timezone: ipapiIs.location?.timezone || '',
                language: mapCountryToLanguage(ipapiIs.location?.country_code || ''),
                source: 'ipapi.is'
            };
        }

        const ipwhoIs = await requestJson('https://ipwho.is/', { proxyPort });
        if (ipwhoIs && ipwhoIs.success !== false) {
            return {
                ip: ipwhoIs.ip || '',
                city: ipwhoIs.city || '',
                region: ipwhoIs.region || '',
                country: ipwhoIs.country || '',
                countryCode: ipwhoIs.country_code || '',
                timezone: ipwhoIs.timezone?.id || ipwhoIs.timezone || '',
                language: mapCountryToLanguage(ipwhoIs.country_code || ''),
                source: 'ipwho.is'
            };
        }

        return null;
    })();
}

async function resolveLaunchFingerprint(profile, proxyPort = null) {
    const next = JSON.parse(JSON.stringify(profile.fingerprint || {}));
    const needsLanguage = !next.language || next.language === 'auto';
    const needsTimezone = !next.timezone || next.timezone === 'auto';

    if (needsLanguage || needsTimezone) {
        const geo = await fetchGeoInfo({ proxyPort });
        const hasTimezone = !!geo?.timezone;
        const hasLanguage = !!geo?.language;
        if (!geo || (needsTimezone && !hasTimezone) || (needsLanguage && !hasLanguage)) {
            throw new Error(proxyPort
                ? '代理出口定位失败，无法自动确定语言和时区'
                : '网络定位失败，无法自动确定语言和时区');
        }

        if (needsTimezone) next.timezone = geo.timezone;
        if (needsLanguage) next.language = geo.language;
    }

    if (!Array.isArray(next.languages) || !next.languages.length || next.languages[0] === 'auto') {
        next.languages = [next.language, next.language.split('-')[0]];
    }

    return next;
}

function proxyRecordFromParsed(proxy, meta = {}) {
    return {
        id: meta.id || uuidv4(),
        name: meta.name || proxy.name,
        url: meta.url || proxy.__raw || '',
        proxy,
        source: meta.source || 'manual',
        groupId: meta.groupId || 'manual',
        enabled: meta.enabled !== false,
        latency: meta.latency ?? null,
        updatedAt: Date.now(),
    };
}

function getProfile(id) {
    return profiles.find(profile => profile.id === id);
}

function getProxy(id) {
    return settings.proxies.find(proxy => proxy.id === id);
}

function getSubscription(id) {
    return settings.subscriptions.find(subscription => subscription.id === id);
}

function getAgentProvider(id) {
    return settings.agent.providers.find(provider => provider.id === id);
}

function getActiveAgentProvider() {
    return getAgentProvider(settings.agent.activeProviderId) || settings.agent.providers[0] || null;
}

function getAgentProviderByModel(model) {
    const targetModel = String(model || '').trim();
    if (!targetModel) {
        return null;
    }

    const active = getActiveAgentProvider();
    if (active?.model === targetModel) {
        return active;
    }

    return settings.agent.providers.find((provider) => provider.model === targetModel) || null;
}

function resolveRequestedAgentProvider(payload = {}) {
    const provider = payload?.providerId
        ? getAgentProvider(payload.providerId)
        : getAgentProviderByModel(payload?.model);

    if (!provider) {
        throw new Error('所选模型没有匹配到可用的供应商配置');
    }

    return provider;
}

function formatKernelSummary(fingerprint = {}) {
    const platform = fingerprint.platform === 'MacIntel' ? 'macOS' : 'Windows';
    const match = String(fingerprint.userAgent || '').match(/Chrome\/(\d+)/i);
    const version = match ? match[1] : '--';
    return `${platform} / ${version}`;
}

function emitLaunchProgress(payload = {}) {
    const windows = [mainWindow, agentWindow].filter((win) => win && !win.isDestroyed());
    windows.forEach((win) => win.webContents.send('launch-progress', payload));
}

function reportLaunchProgress(profile, requestId, progress, stage, detail = '', extra = {}) {
    emitLaunchProgress({
        profileId: profile.id,
        profileName: profile.name,
        requestId: requestId || '',
        progress,
        stage,
        detail,
        ...extra
    });
}

function requestJsonFromLocal(url, timeout = 1200) {
    return new Promise((resolve) => {
        const request = http.get(url, { timeout }, (response) => {
            if ((response.statusCode || 500) >= 400) {
                response.resume();
                resolve(null);
                return;
            }

            let raw = '';
            response.on('data', chunk => raw += chunk);
            response.on('end', () => {
                try {
                    resolve(JSON.parse(raw));
                } catch (error) {
                    resolve(null);
                }
            });
        });

        request.on('timeout', () => {
            request.destroy();
            resolve(null);
        });
        request.on('error', () => resolve(null));
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForBrowserWindowReady(debugPort, timeoutMs = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const targets = await requestJsonFromLocal(`http://127.0.0.1:${debugPort}/json/list`);
        if (Array.isArray(targets) && targets.some(target => target?.type === 'page')) {
            return true;
        }
        await sleep(180);
    }

    throw new Error('浏览器窗口未能在预期时间内完成启动');
}

async function waitForPageTarget(debugPort, timeoutMs = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const targets = await requestJsonFromLocal(`http://127.0.0.1:${debugPort}/json/list`);
        if (Array.isArray(targets)) {
            const pageTargets = targets.filter((target) =>
                target?.type === 'page'
                && target?.webSocketDebuggerUrl
                && !String(target.url || '').startsWith('chrome-extension://')
            );

            const preferredTarget = pageTargets.find((target) => String(target.url || '').startsWith('about:blank'))
                || pageTargets.find((target) => !String(target.url || '').startsWith('devtools://'))
                || pageTargets[0];

            if (preferredTarget) {
                return preferredTarget;
            }
        }

        await sleep(180);
    }

    throw new Error('浏览器调试页面未能及时就绪');
}

function buildUserAgentMetadata(fingerprint = {}) {
    const ua = String(fingerprint.userAgent || '');
    const chromeMatch = ua.match(/Chrome\/(\d+)\.(\d+)\.(\d+)\.(\d+)/i);
    const major = chromeMatch ? chromeMatch[1] : '145';
    const fullVersion = chromeMatch
        ? `${chromeMatch[1]}.${chromeMatch[2]}.${chromeMatch[3]}.${chromeMatch[4]}`
        : '145.0.0.0';
    const platform = /Mac/i.test(fingerprint.platform) ? 'macOS' : 'Windows';
    const architecture = platform === 'macOS' && /Apple M\d/i.test(fingerprint.webglRenderer || '') ? 'arm' : 'x86';

    return {
        brands: [
            { brand: 'Chromium', version: major },
            { brand: 'Google Chrome', version: major },
            { brand: 'Not=A?Brand', version: '24' }
        ],
        fullVersionList: [
            { brand: 'Chromium', version: fullVersion },
            { brand: 'Google Chrome', version: fullVersion },
            { brand: 'Not=A?Brand', version: '24.0.0.0' }
        ],
        platform,
        platformVersion: platform === 'macOS' ? '10.15.7' : '10.0.0',
        architecture,
        model: '',
        mobile: false,
        bitness: '64',
        wow64: false
    };
}

function createCdpSession(webSocketDebuggerUrl, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(webSocketDebuggerUrl);
        const pending = new Map();
        let nextCommandId = 0;
        let settled = false;

        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(connectTimer);
            callback(value);
        };

        const rejectPending = (error) => {
            for (const entry of pending.values()) {
                clearTimeout(entry.timer);
                entry.reject(error);
            }
            pending.clear();
        };

        const connectTimer = setTimeout(() => {
            const error = new Error('连接浏览器调试通道超时');
            rejectPending(error);
            try { socket.close(); } catch (closeError) { }
            finish(reject, error);
        }, timeoutMs);

        socket.on('open', () => {
            finish(resolve, {
                async send(method, params = {}, commandTimeoutMs = 5000) {
                    return new Promise((resolveCommand, rejectCommand) => {
                        const id = ++nextCommandId;
                        const timer = setTimeout(() => {
                            pending.delete(id);
                            rejectCommand(new Error(`浏览器调试命令超时: ${method}`));
                        }, commandTimeoutMs);

                        pending.set(id, {
                            resolve: (result) => {
                                clearTimeout(timer);
                                resolveCommand(result);
                            },
                            reject: (error) => {
                                clearTimeout(timer);
                                rejectCommand(error);
                            },
                            timer
                        });

                        try {
                            socket.send(JSON.stringify({ id, method, params }));
                        } catch (error) {
                            pending.delete(id);
                            clearTimeout(timer);
                            rejectCommand(error);
                        }
                    });
                },
                close() {
                    rejectPending(new Error('浏览器调试通道已关闭'));
                    try { socket.close(); } catch (error) { }
                }
            });
        });

        socket.on('message', (data) => {
            let payload = null;
            try {
                payload = JSON.parse(typeof data === 'string' ? data : data.toString());
            } catch (error) {
                return;
            }

            if (!payload || typeof payload.id !== 'number') {
                return;
            }

            const current = pending.get(payload.id);
            if (!current) {
                return;
            }

            pending.delete(payload.id);
            if (payload.error) {
                current.reject(new Error(payload.error.message || `浏览器调试命令失败: ${payload.error.code || 'unknown'}`));
                return;
            }
            current.resolve(payload.result);
        });

        socket.on('error', () => {
            const error = new Error('浏览器调试通道连接失败');
            rejectPending(error);
            finish(reject, error);
        });

        socket.on('close', () => {
            const error = new Error('浏览器调试通道已关闭');
            rejectPending(error);
            if (!settled) {
                finish(reject, error);
            }
        });
    });
}

async function primeInitialPageFingerprint(debugPort, fingerprint, destinationUrl) {
    const pageTarget = await waitForPageTarget(debugPort);
    const session = await createCdpSession(pageTarget.webSocketDebuggerUrl);
    const preloadScript = createPageScript(fingerprint);
    const acceptLanguage = Array.isArray(fingerprint.languages) && fingerprint.languages.length
        ? fingerprint.languages.join(',')
        : (fingerprint.language || 'en-US');

    try {
        await session.send('Page.enable');
        await session.send('Runtime.enable');
        await session.send('Network.enable');
        await session.send('Network.setUserAgentOverride', {
            userAgent: fingerprint.userAgent,
            acceptLanguage,
            platform: fingerprint.platform || 'Win32',
            userAgentMetadata: buildUserAgentMetadata(fingerprint)
        });

        if (fingerprint.language) {
            await session.send('Emulation.setLocaleOverride', {
                locale: fingerprint.language
            });
        }

        if (fingerprint.timezone) {
            await session.send('Emulation.setTimezoneOverride', {
                timezoneId: fingerprint.timezone
            });
        }

        await session.send('Page.addScriptToEvaluateOnNewDocument', {
            source: preloadScript
        });
        await session.send('Runtime.evaluate', {
            expression: preloadScript
        });
        await session.send('Page.navigate', {
            url: destinationUrl
        });
    } finally {
        session.close();
    }
}

async function buildDashboardPayload(profileId, { refresh = false } = {}) {
    const profile = getProfile(profileId);
    if (!profile) {
        return null;
    }

    const runtime = runningProfiles.get(profileId);
    const fingerprint = runtime?.launchFingerprint || profile.fingerprint || {};
    const timezone = fingerprint.timezone && fingerprint.timezone !== 'auto'
        ? fingerprint.timezone
        : (Intl.DateTimeFormat().resolvedOptions().timeZone || '--');
    const language = fingerprint.language && fingerprint.language !== 'auto' ? fingerprint.language : '--';
    const tags = Array.isArray(profile.tags) && profile.tags.length ? profile.tags.join(', ') : '--';

    return {
        ok: true,
        profile: {
            id: profile.id,
            name: profile.name || '窗口',
            notes: profile.notes || '--',
            project: '默认项目',
            tags
        },
        geo: {
            flag: '',
            location: '--',
            ip: '--',
            source: ''
        },
        fingerprint: {
            kernel: formatKernelSummary(fingerprint),
            language,
            timezone,
            userAgent: fingerprint.userAgent || '--'
        }
    };
}

async function saveAll() {
    await Promise.all([
        store.saveProfiles(profiles),
        store.saveSettings(settings)
    ]);
}

function buildState() {
    const activeProvider = getActiveAgentProvider();
    return {
        profiles: profiles.map(profile => ({
            ...profile,
            running: runningProfiles.has(profile.id)
        })),
        settings,
        runtime: {
            dataDir: store.dataDir,
            apiUrl: settings?.api?.enabled ? `http://127.0.0.1:${settings.api.port}` : '',
            mihomoBinary: getBinaryPath(BASE_DIR),
            mihomoReady: fs.existsSync(getBinaryPath(BASE_DIR)),
            browserBinary: resolveBrowserExecutable(),
            running: Array.from(runningProfiles.entries()).map(([id, runtime]) => ({
                id,
                port: runtime.port,
                debugPort: runtime.debugPort || null,
                url: runtime.url,
                pid: runtime.browserPid || null
            })),
            providerFormats: PROVIDER_FORMATS.map((item) => ({
                value: item.value,
                label: item.label,
                defaultBaseUrl: item.defaultBaseUrl
            })),
            agent: agentController ? agentController.getPublicState() : createEmptyAgentRuntimeState(),
            activeProvider: activeProvider ? {
                id: activeProvider.id,
                name: activeProvider.name,
                format: activeProvider.format,
                model: activeProvider.model
            } : null
        }
    };
}

function notifyState() {
    const payload = buildState();
    const windows = [mainWindow, agentWindow].filter((win) => win && !win.isDestroyed());
    windows.forEach((win) => win.webContents.send('state-updated', payload));
}

function notifyAgentEvent(payload) {
    const windows = [mainWindow, agentWindow].filter((win) => win && !win.isDestroyed());
    windows.forEach((win) => win.webContents.send('agent-event', payload));
}

function readRequestBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            if (!body) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                resolve({});
            }
        });
    });
}

async function stopProfile(profileId) {
    const runtime = runningProfiles.get(profileId);
    if (!runtime) return false;

    runningProfiles.delete(profileId);

    if (runtime.logFd) {
        try { fs.closeSync(runtime.logFd); } catch (error) { }
    }
    if (runtime.browserPid) {
        await stopProcess(runtime.browserPid);
    }
    if (runtime.corePid) {
        await stopProcess(runtime.corePid);
    }
    notifyState();
    return true;
}

async function clearProfileCache(profileId) {
    const profile = getProfile(profileId);
    if (!profile) {
        throw new Error('环境不存在');
    }

    if (runningProfiles.has(profileId)) {
        throw new Error('请先停止该环境，再清理缓存');
    }

    const userDataDir = path.join(store.dataDir, 'profiles', profile.id);
    const cacheTargets = [
        'Cache',
        'Code Cache',
        'GPUCache',
        'DawnCache',
        'GrShaderCache',
        path.join('Default', 'Cache'),
        path.join('Default', 'Code Cache'),
        path.join('Default', 'GPUCache'),
        path.join('Default', 'DawnCache'),
        path.join('Default', 'GrShaderCache'),
        path.join('Default', 'Service Worker', 'CacheStorage'),
        path.join('Default', 'Service Worker', 'ScriptCache'),
        path.join('Default', 'Network', 'Cache'),
    ];

    const removed = [];
    for (const relativePath of cacheTargets) {
        const targetPath = path.join(userDataDir, relativePath);
        if (await fs.pathExists(targetPath)) {
            await fs.remove(targetPath);
            removed.push(relativePath);
        }
    }

    return {
        ok: true,
        removed,
        cleared: removed.length
    };
}

async function openProfile(profileId, { requestId = '' } = {}) {
    const profile = getProfile(profileId);
    if (!profile) throw new Error('环境不存在');

    const existing = runningProfiles.get(profileId);
    if (existing?.browserPid) {
        reportLaunchProgress(profile, requestId, 100, 'completed', '窗口已在运行', { done: true });
        return existing;
    }

    reportLaunchProgress(profile, requestId, 6, 'prepare', '校验浏览器环境');

    const browserBinary = resolveBrowserExecutable();
    if (!browserBinary) {
        reportLaunchProgress(profile, requestId, 0, 'error', '未找到 Chrome 或 Chromium', { error: true, done: true });
        throw new Error('未找到 Chrome 或 Chromium 可执行文件');
    }

    if (!fs.existsSync(getBinaryPath(BASE_DIR))) {
        reportLaunchProgress(profile, requestId, 10, 'mihomo-download', `下载 Mihomo ${MIHOMO_VERSION}`);
        await ensureBundledMihomo(BASE_DIR);
    }

    let coreRuntime = null;
    let mixedPort = null;
    let controllerPort = null;
    let debugPort = null;
    const linkedProxy = profile.proxyId ? getProxy(profile.proxyId) : null;

    try {
        if (linkedProxy) {
            reportLaunchProgress(profile, requestId, 14, 'proxy-start', '启动代理内核');
            mixedPort = await getPort();
            controllerPort = await getPort();
            coreRuntime = await startCore({
                baseDir: BASE_DIR,
                runtimeDir: store.runtimeDir,
                profileId: profile.id,
                proxyInput: linkedProxy,
                mixedPort,
                controllerPort
            });
            await waitForMihomoReady({ mixedPort, controllerPort });
            reportLaunchProgress(profile, requestId, 34, 'proxy-ready', '代理通道已就绪');
        } else {
            reportLaunchProgress(profile, requestId, 20, 'proxy-skip', '无需代理，直接启动');
        }

        reportLaunchProgress(profile, requestId, linkedProxy ? 40 : 32, 'fingerprint', '解析启动指纹');
        const launchFingerprint = await resolveLaunchFingerprint(profile, mixedPort);

        reportLaunchProgress(profile, requestId, linkedProxy ? 54 : 48, 'storage', '准备独立数据目录');
        const userDataDir = path.join(store.dataDir, 'profiles', profile.id);
        await fs.ensureDir(userDataDir);

        reportLaunchProgress(profile, requestId, linkedProxy ? 68 : 62, 'extension', '生成指纹扩展');
        const extensionDir = await ensureFingerprintExtension(BASE_DIR, profile.id, launchFingerprint);
        const startUrl = isBuiltInStartUrl(profile.startUrl) ? getDefaultStartPageUrl(profile.id) : profile.startUrl;
        debugPort = await getPort();
        const runtime = {
            browserPid: null,
            browserBinary,
            extensionDir,
            corePid: coreRuntime?.process?.pid || null,
            logFd: coreRuntime?.logFd,
            port: mixedPort,
            controllerPort,
            debugPort,
            url: startUrl,
            launchFingerprint,
            dashboardGeo: null
        };

        runningProfiles.set(profile.id, runtime);

        const launchArgs = [
            `--user-data-dir=${userDataDir}`,
            `--window-size=${launchFingerprint.screen.width},${launchFingerprint.screen.height}`,
            `--lang=${launchFingerprint.language || 'en-US'}`,
            `--user-agent=${launchFingerprint.userAgent}`,
            `--remote-debugging-port=${debugPort}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-features=Translate,OptimizationHints,MediaRouter',
            '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
            `--disable-extensions-except=${extensionDir}`,
            `--load-extension=${extensionDir}`,
        ];

        if (linkedProxy && mixedPort) {
            launchArgs.push(`--proxy-server=socks5://127.0.0.1:${mixedPort}`);
        }

        launchArgs.push('about:blank');

        reportLaunchProgress(profile, requestId, linkedProxy ? 80 : 76, 'spawn', '拉起浏览器进程');
        const browserProcess = spawn(browserBinary, launchArgs, {
            detached: process.platform !== 'win32',
            stdio: 'ignore',
            windowsHide: false
        });

        runtime.browserPid = browserProcess.pid;
        browserProcess.unref();
        browserProcess.on('exit', () => {
            if (runningProfiles.has(profile.id)) {
                stopProfile(profile.id).catch(() => { });
            }
        });

        reportLaunchProgress(profile, requestId, linkedProxy ? 88 : 84, 'window-ready', '等待调试窗口就绪');
        await waitForBrowserWindowReady(debugPort);

        reportLaunchProgress(profile, requestId, linkedProxy ? 94 : 90, 'inject', '注入首屏指纹并跳转');
        await primeInitialPageFingerprint(debugPort, launchFingerprint, startUrl);

        profile.lastOpenedAt = Date.now();
        profile.fingerprint = {
            ...profile.fingerprint,
            language: profile.fingerprint.language || 'auto',
            timezone: profile.fingerprint.timezone || 'auto'
        };
        await store.saveProfiles(profiles);

        notifyState();
        reportLaunchProgress(profile, requestId, 100, 'completed', '窗口已打开', { done: true });
        return runningProfiles.get(profile.id);
    } catch (error) {
        if (runningProfiles.has(profile.id)) {
            await stopProfile(profile.id);
        } else if (coreRuntime?.process?.pid) {
            await stopProcess(coreRuntime.process.pid);
            if (coreRuntime.logFd) {
                try { fs.closeSync(coreRuntime.logFd); } catch (closeError) { }
            }
        }
        reportLaunchProgress(profile, requestId, 0, 'error', error.message || '启动失败', { error: true, done: true });
        throw error;
    }
}

async function importSubscription(payload = {}) {
    const name = payload.name || '订阅';
    const url = payload.url;
    if (!url) throw new Error('订阅地址不能为空');

    const res = await fetch(url, { headers: { 'User-Agent': 'Mihomo/XBrowseR' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const proxies = parseSubscriptionContent(text, name);

    const subscription = {
        id: payload.id || uuidv4(),
        name,
        url,
        lastUpdated: Date.now()
    };

    settings.subscriptions = settings.subscriptions.filter(item => item.id !== subscription.id);
    settings.subscriptions.unshift(subscription);
    settings.proxies = settings.proxies.filter(proxy => proxy.groupId !== subscription.id);
    settings.proxies.push(...proxies.map(proxy => proxyRecordFromParsed(proxy, {
        source: 'subscription',
        groupId: subscription.id
    })));

    await store.saveSettings(settings);
    notifyState();
    return subscription;
}

function createApiServer(port) {
    return http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const requestUrl = new URL(req.url, `http://127.0.0.1:${port}`);

        if (req.method === 'GET' && requestUrl.pathname === '/api/status') {
            res.end(JSON.stringify({ ok: true, runtime: buildState().runtime }));
            return;
        }

        if (req.method === 'GET' && requestUrl.pathname === '/api/profiles') {
            res.end(JSON.stringify(buildState().profiles));
            return;
        }

        if (req.method === 'GET' && requestUrl.pathname === '/api/proxies') {
            res.end(JSON.stringify(settings.proxies));
            return;
        }

        if (req.method === 'POST' && requestUrl.pathname === '/api/profiles') {
            const body = await readRequestBody(req);
            const profile = buildProfile(body);
            profiles.unshift(profile);
            await store.saveProfiles(profiles);
            notifyState();
            res.end(JSON.stringify(profile));
            return;
        }

        const openMatch = requestUrl.pathname.match(/^\/api\/profiles\/([^/]+)\/open$/);
        if (req.method === 'POST' && openMatch) {
            await openProfile(decodeURIComponent(openMatch[1]));
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        const stopMatch = requestUrl.pathname.match(/^\/api\/profiles\/([^/]+)\/stop$/);
        if (req.method === 'POST' && stopMatch) {
            await stopProfile(decodeURIComponent(stopMatch[1]));
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        const clearCacheMatch = requestUrl.pathname.match(/^\/api\/profiles\/([^/]+)\/clear-cache$/);
        if (req.method === 'POST' && clearCacheMatch) {
            const result = await clearProfileCache(decodeURIComponent(clearCacheMatch[1]));
            res.end(JSON.stringify(result));
            return;
        }

        if (req.method === 'GET' && requestUrl.pathname === '/mcp') {
            res.end(JSON.stringify({
                name: 'XBrowseR MCP',
                transport: 'http',
                endpoints: ['/api/status', '/api/profiles', '/api/proxies']
            }));
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ ok: false, error: '未找到接口' }));
    });
}

function createInternalServer() {
    return http.createServer(async (req, res) => {
        const requestUrl = new URL(req.url, `http://127.0.0.1:${internalServerPort || 0}`);

        if (req.method === 'GET' && requestUrl.pathname === '/dashboard') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(await fs.readFile(path.join(BASE_DIR, 'app', 'dashboard.html'), 'utf8'));
            return;
        }

        if (req.method === 'GET' && requestUrl.pathname === '/api/dashboard') {
            const profileId = requestUrl.searchParams.get('id') || '';
            const refresh = requestUrl.searchParams.get('refresh') === '1';
            const payload = await buildDashboardPayload(profileId, { refresh });

            res.writeHead(payload ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(payload || { ok: false, error: '环境不存在' }));
            return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('未找到资源');
    });
}

async function startInternalServer() {
    if (internalServer) {
        await new Promise(resolve => internalServer.close(resolve));
        internalServer = null;
        internalServerPort = 0;
    }

    internalServerPort = await getPort();
    internalServer = createInternalServer();
    await new Promise(resolve => internalServer.listen(internalServerPort, '127.0.0.1', resolve));
}

async function restartApiServer() {
    if (apiServer) {
        await new Promise(resolve => apiServer.close(resolve));
        apiServer = null;
    }
    if (!settings.api.enabled) {
        notifyState();
        return;
    }
    apiServer = createApiServer(settings.api.port);
    apiServer.listen(settings.api.port, '127.0.0.1', () => {
        notifyState();
    });
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1480,
        height: 940,
        minWidth: 1200,
        minHeight: 820,
        backgroundColor: '#06101b',
        title: 'XBrowseR',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function openAgentWindow() {
    if (agentWindow && !agentWindow.isDestroyed()) {
        agentWindow.focus();
        return agentWindow;
    }

    agentWindow = new BrowserWindow({
        width: 560,
        height: 820,
        minWidth: 460,
        minHeight: 640,
        backgroundColor: '#06101b',
        title: 'XBrowseR Agent',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    agentWindow.loadFile(path.join(__dirname, 'app', 'agent-window.html'));
    agentWindow.on('closed', () => {
        agentWindow = null;
    });

    return agentWindow;
}

app.whenReady().then(async () => {
    try {
        await ensureBundledMihomo(BASE_DIR);
    } catch (error) {
        console.error(`Failed to auto-download Mihomo ${MIHOMO_VERSION}:`, error);
    }

    profiles = normalizeProfilesWithCodes(await store.loadProfiles());
    settings = ensureAgentSettings(await store.loadSettings());
    await store.saveProfiles(profiles);
    await store.saveSettings(settings);

    agentController = createAgentController({
        getAgentSettings: () => ({
            provider: getActiveAgentProvider(),
            profiles,
            toolTimeoutMs: settings.agent.toolTimeoutMs
        }),
        getProfile: (profileId) => getProfile(profileId),
        ensureRuntime: async (profileId) => {
            if (!runningProfiles.has(profileId)) {
                await openProfile(profileId, { requestId: `agent-${Date.now()}` });
            }
            return runningProfiles.get(profileId) || null;
        },
        onLog: notifyAgentEvent,
        onStateChanged: notifyState
    });

    await startInternalServer();
    createMainWindow();
    await restartApiServer();

    ipcMain.handle('app:bootstrap', async () => buildState());
    ipcMain.handle('agent:window:open', async () => {
        openAgentWindow();
        return true;
    });
    ipcMain.handle('fingerprint:generate', async (event, payload) => {
        return createFingerprint(payload || {});
    });
    ipcMain.handle('profile:save', async (event, payload) => {
        const next = buildProfile(payload || {});
        const index = profiles.findIndex(profile => profile.id === next.id);
        if (index >= 0) profiles[index] = next;
        else profiles.unshift(next);
        await store.saveProfiles(profiles);
        notifyState();
        return next;
    });
    ipcMain.handle('profile:delete', async (event, id) => {
        await stopProfile(id);
        profiles = profiles.filter(profile => profile.id !== id);
        await store.saveProfiles(profiles);
        notifyState();
        return true;
    });
    ipcMain.handle('profile:clear-cache', async (event, id) => clearProfileCache(id));
    ipcMain.handle('profile:launch', async (event, payload) => {
        const profileId = typeof payload === 'string' ? payload : payload?.id;
        const requestId = typeof payload === 'string' ? '' : (payload?.requestId || '');
        await openProfile(profileId, { requestId });
        return true;
    });
    ipcMain.handle('profile:stop', async (event, id) => stopProfile(id));
    ipcMain.handle('proxy:add-manual', async (event, payload) => {
        const proxy = parseProxyLink(payload.url, payload.name || '手动节点');
        const record = proxyRecordFromParsed(proxy, {
            name: payload.name || proxy.name,
            url: payload.url,
            source: 'manual',
            groupId: 'manual'
        });
        settings.proxies.unshift(record);
        await store.saveSettings(settings);
        notifyState();
        return record;
    });
    ipcMain.handle('proxy:delete', async (event, id) => {
        settings.proxies = settings.proxies.filter(proxy => proxy.id !== id);
        profiles = profiles.map(profile => profile.proxyId === id ? { ...profile, proxyId: '' } : profile);
        await saveAll();
        notifyState();
        return true;
    });
    ipcMain.handle('proxy:test', async (event, id) => {
        const proxy = getProxy(id);
        if (!proxy) throw new Error('代理不存在');
        const mixedPort = await getPort();
        const controllerPort = await getPort();
        const result = await testProxyLatency({
            baseDir: BASE_DIR,
            runtimeDir: store.runtimeDir,
            proxyInput: proxy,
            mixedPort,
            controllerPort
        });
        proxy.latency = result.latency;
        proxy.updatedAt = Date.now();
        await store.saveSettings(settings);
        notifyState();
        return result;
    });
    ipcMain.handle('subscription:import', async (event, payload) => importSubscription(payload));
    ipcMain.handle('subscription:refresh', async (event, id) => {
        const subscription = getSubscription(id);
        if (!subscription) throw new Error('订阅不存在');
        return importSubscription(subscription);
    });
    ipcMain.handle('subscription:delete', async (event, id) => {
        settings.subscriptions = settings.subscriptions.filter(subscription => subscription.id !== id);
        settings.proxies = settings.proxies.filter(proxy => proxy.groupId !== id);
        profiles = profiles.map(profile => {
            const linked = getProxy(profile.proxyId);
            return linked ? profile : { ...profile, proxyId: '' };
        });
        await saveAll();
        notifyState();
        return true;
    });
    ipcMain.handle('proxy:import-file', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: '导入节点',
            properties: ['openFile'],
            filters: [
                { name: '支持的文件', extensions: ['txt', 'yaml', 'yml', 'json', 'conf'] }
            ]
        });
        if (canceled || !filePaths.length) return { canceled: true };
        const filePath = filePaths[0];
        const content = await fs.readFile(filePath, 'utf8');
        const proxies = parseSubscriptionContent(content, path.basename(filePath, path.extname(filePath)));
        const records = proxies.map(proxy => proxyRecordFromParsed(proxy, {
            source: 'file',
            groupId: 'manual'
        }));
        settings.proxies.unshift(...records);
        await store.saveSettings(settings);
        notifyState();
        return { canceled: false, added: records.length };
    });
    ipcMain.handle('agent:provider:save', async (event, payload) => {
        const record = buildProviderRecord(payload || {});
        const index = settings.agent.providers.findIndex((item) => item.id === record.id);
        if (index >= 0) {
            settings.agent.providers[index] = record;
        } else {
            settings.agent.providers.unshift(record);
        }

        if (!settings.agent.activeProviderId || payload?.setActive || !getAgentProvider(settings.agent.activeProviderId)) {
            settings.agent.activeProviderId = record.id;
        }

        await store.saveSettings(settings);
        notifyState();
        return record;
    });
    ipcMain.handle('agent:provider:delete', async (event, providerId) => {
        settings.agent.providers = settings.agent.providers.filter((item) => item.id !== providerId);
        settings = ensureAgentSettings(settings);
        await store.saveSettings(settings);
        notifyState();
        return true;
    });
    ipcMain.handle('agent:provider:set-active', async (event, providerId) => {
        if (!getAgentProvider(providerId)) {
            throw new Error('供应商配置不存在');
        }
        settings.agent.activeProviderId = providerId;
        await store.saveSettings(settings);
        notifyState();
        return getActiveAgentProvider();
    });
    ipcMain.handle('agent:provider:fetch-models', async (event, payload) => {
        const draft = buildProviderRecord(payload || {});
        const models = await fetchModelsForProvider(draft);
        const merged = Array.from(new Set([...(draft.models || []), ...models]));

        if (draft.id && getAgentProvider(draft.id)) {
            const target = getAgentProvider(draft.id);
            target.name = draft.name;
            target.format = draft.format;
            target.apiKey = draft.apiKey;
            target.baseUrl = draft.baseUrl;
            target.model = draft.model;
            target.models = merged;
            target.updatedAt = Date.now();
            await store.saveSettings(settings);
            notifyState();
        }

        return merged;
    });
    ipcMain.handle('agent:stop', async () => {
        return agentController.stopSession();
    });
    ipcMain.handle('agent:session:start', async (event, payload) => {
        return agentController.createSession({
            profileId: payload?.profileId,
            provider: resolveRequestedAgentProvider(payload),
            initialMessage: payload?.initialMessage || ''
        });
    });
    ipcMain.handle('agent:session:send', async (event, payload) => {
        return agentController.sendMessage({
            message: payload?.message || ''
        });
    });
    ipcMain.handle('agent:batch:start', async (event, payload) => {
        return agentController.startBatchRun({
            profileIds: payload?.profileIds || [],
            provider: resolveRequestedAgentProvider(payload),
            prompt: payload?.prompt || ''
        });
    });
    ipcMain.handle('agent:clear', async () => {
        return agentController.closeSession();
    });
    ipcMain.handle('agent:session:close', async () => {
        return agentController.closeSession();
    });
    ipcMain.handle('settings:save', async (event, payload) => {
        settings = {
            ...settings,
            ...payload,
            api: { ...settings.api, ...(payload.api || {}) },
            agent: { ...settings.agent, ...(payload.agent || {}) },
            ui: { ...settings.ui, ...(payload.ui || {}) }
        };
        settings = ensureAgentSettings(settings);
        await store.saveSettings(settings);
        await restartApiServer();
        notifyState();
        return settings;
    });
    ipcMain.handle('app:open-data-dir', async () => shell.openPath(store.dataDir));
});

app.on('window-all-closed', async () => {
    for (const id of Array.from(runningProfiles.keys())) {
        await stopProfile(id);
    }
    if (internalServer) {
        await new Promise(resolve => internalServer.close(resolve));
    }
    if (apiServer) {
        await new Promise(resolve => apiServer.close(resolve));
    }
    if (process.platform !== 'darwin') app.quit();
});
