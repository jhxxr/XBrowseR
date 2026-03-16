const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs-extra');
const { URL } = require('url');
const { spawn, execFile } = require('child_process');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const getPort = require('get-port');
const { SocksProxyAgent } = require('socks-proxy-agent');
const extractZip = require('extract-zip');
const { v4: uuidv4 } = require('uuid');
const { WebSocket } = require('ws');

const { createStore } = require('./lib/store');
const { createAccountStore } = require('./lib/account-store');
const { createAgentController } = require('./lib/ai-agent');
const { createEmptyAgentRuntimeState } = require('./lib/agent-runtime');
const { createProfileSyncController, createEmptySyncState } = require('./lib/profile-sync');
const { createFingerprint, buildDefaultSpeechVoices } = require('./lib/fingerprint');
const { ensureBundledBrowser, resolveBrowserExecutable } = require('./lib/browser-download');
const { parseProxyLink, parseSubscriptionContent, startCore, waitForMihomoReady, stopProcess, getBinaryPath } = require('./lib/mihomo');
const { ensureBundledMihomo, MIHOMO_VERSION } = require('./lib/mihomo-download');
const { ensureFingerprintExtension, createPageScript } = require('./lib/chrome-extension');
const { PROVIDER_FORMATS, buildProviderRecord, ensureAgentSettings, fetchModelsForProvider } = require('./lib/llm-provider');

const BASE_DIR = __dirname;
const store = createStore(BASE_DIR);
const accountStore = createAccountStore(BASE_DIR);
const PROFILE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_PROJECT_ID = 'default';
const DEFAULT_PROJECT_COLOR = '#0f766e';

let profiles = [];
let templates = [];
let accounts = [];
let settings = null;
let mainWindow = null;
let agentWindow = null;
let apiServer = null;
let internalServer = null;
let internalServerPort = 0;
const runningProfiles = new Map();
let agentController = null;
let syncController = null;

function getDefaultProjectRecord() {
    return {
        id: DEFAULT_PROJECT_ID,
        name: '默认项目',
        color: DEFAULT_PROJECT_COLOR,
        notes: '',
        createdAt: 0
    };
}

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
        const next = normalizeProfileRecord(profile);
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

function normalizeProjectRecord(input = {}, existing = null) {
    const source = input && typeof input === 'object' ? input : {};
    const current = existing && typeof existing === 'object' ? existing : null;
    const fallback = source.id === DEFAULT_PROJECT_ID || current?.id === DEFAULT_PROJECT_ID
        ? getDefaultProjectRecord()
        : null;

    return {
        id: source.id || current?.id || fallback?.id || uuidv4(),
        name: String(source.name || current?.name || fallback?.name || '').trim(),
        color: String(source.color || current?.color || fallback?.color || DEFAULT_PROJECT_COLOR).trim() || DEFAULT_PROJECT_COLOR,
        notes: source.notes ?? current?.notes ?? fallback?.notes ?? '',
        createdAt: Number(source.createdAt) || current?.createdAt || fallback?.createdAt || Date.now()
    };
}

function normalizeProjects(items = []) {
    const normalized = [];
    const seen = new Set();

    for (const project of items) {
        const next = normalizeProjectRecord(project);
        if (!next.name || seen.has(next.id)) {
            continue;
        }
        seen.add(next.id);
        normalized.push(next);
    }

    if (!seen.has(DEFAULT_PROJECT_ID)) {
        normalized.unshift(getDefaultProjectRecord());
    } else {
        const index = normalized.findIndex((project) => project.id === DEFAULT_PROJECT_ID);
        normalized[index] = normalizeProjectRecord(normalized[index], getDefaultProjectRecord());
        if (index > 0) {
            const [defaultProject] = normalized.splice(index, 1);
            normalized.unshift(defaultProject);
        }
    }

    return normalized;
}

function ensureProjectSettings(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const next = {
        ...source,
        projects: normalizeProjects(source.projects || []),
        extensions: normalizeExtensions(source.extensions || []),
        proxies: normalizeProxies(source.proxies || []),
        proxyAllocation: normalizeProxyAllocation(source.proxyAllocation || {}),
        ui: {
            ...(source.ui || {})
        }
    };

    const homeProjectId = String(next.ui.homeProjectId || 'all');
    next.ui.homeProjectId = homeProjectId === 'all' || next.projects.some((project) => project.id === homeProjectId)
        ? homeProjectId
        : 'all';
    return next;
}

function normalizeProxyAllocation(input = {}, existing = null) {
    const source = input && typeof input === 'object' ? input : {};
    const current = existing && typeof existing === 'object' ? existing : null;
    const mode = String(source.mode || current?.mode || 'manual').trim() || 'manual';
    return {
        mode: ['manual', 'round-robin', 'sticky', 'geo-match'].includes(mode) ? mode : 'manual'
    };
}

function normalizeProfileRecord(input = {}, existing = null) {
    const source = input && typeof input === 'object' ? input : {};
    const current = existing && typeof existing === 'object' ? existing : null;
    const fingerprint = createFingerprint(source.fingerprint || current?.fingerprint || {});

    return {
        id: source.id || current?.id || uuidv4(),
        code: String(source.code || current?.code || '').trim().toUpperCase(),
        name: source.name || current?.name || `Window-${Date.now()}`,
        startUrl: source.startUrl ?? current?.startUrl ?? '',
        proxyId: source.proxyId ?? current?.proxyId ?? '',
        projectId: source.projectId ?? current?.projectId ?? DEFAULT_PROJECT_ID,
        templateId: source.templateId ?? current?.templateId ?? '',
        createdFrom: source.createdFrom ?? current?.createdFrom ?? '',
        archivedAt: Object.prototype.hasOwnProperty.call(source, 'archivedAt')
            ? source.archivedAt
            : (current?.archivedAt ?? null),
        tags: Array.isArray(source.tags)
            ? source.tags
            : String(source.tags ?? current?.tags ?? '')
                .split(',')
                .map(item => item.trim())
                .filter(Boolean),
        notes: source.notes ?? current?.notes ?? '',
        createdAt: Number(source.createdAt) || current?.createdAt || Date.now(),
        lastOpenedAt: Object.prototype.hasOwnProperty.call(source, 'lastOpenedAt')
            ? (source.lastOpenedAt || null)
            : (current?.lastOpenedAt || null),
        deletedAt: Object.prototype.hasOwnProperty.call(source, 'deletedAt')
            ? (source.deletedAt || null)
            : (current?.deletedAt || null),
        deletedFromProjectId: source.deletedFromProjectId ?? current?.deletedFromProjectId ?? '',
        extensionIds: Array.isArray(source.extensionIds)
            ? source.extensionIds.map((item) => String(item || '').trim()).filter(Boolean)
            : Array.isArray(current?.extensionIds)
                ? current.extensionIds.map((item) => String(item || '').trim()).filter(Boolean)
                : [],
        fingerprint,
    };
}

function buildProfile(input = {}) {
    const existing = input.id ? profiles.find((profile) => profile.id === input.id) : null;
    const next = normalizeProfileRecord(input, existing);
    next.projectId = settings?.projects?.length ? getProject(next.projectId).id : (next.projectId || DEFAULT_PROJECT_ID);
    next.extensionIds = Array.from(new Set((next.extensionIds || []).filter((extensionId) => !!getExtension(extensionId))));
    next.code = next.code || generateProfileCode(profiles);
    return next;
}

function buildProfileDraft(input = {}, existing = null) {
    const source = normalizeProfileRecord(input, existing);
    return {
        name: source.name || '',
        startUrl: source.startUrl || '',
        proxyId: source.proxyId || '',
        projectId: source.projectId || '',
        notes: source.notes || '',
        tags: Array.isArray(source.tags) ? source.tags : [],
        extensionIds: Array.isArray(source.extensionIds) ? source.extensionIds : [],
        fingerprint: source.fingerprint
    };
}

function normalizeTemplateRecord(input = {}, existing = null) {
    const source = input && typeof input === 'object' ? input : {};
    const current = existing && typeof existing === 'object' ? existing : null;

    return {
        id: source.id || current?.id || uuidv4(),
        name: String(source.name || current?.name || '').trim(),
        notes: source.notes ?? current?.notes ?? '',
        profileDraft: buildProfileDraft(source.profileDraft || {}, current?.profileDraft || {}),
        createdAt: Number(source.createdAt) || current?.createdAt || Date.now(),
        updatedAt: Date.now()
    };
}

function normalizeTemplates(items = []) {
    const seen = new Set();
    const normalized = [];

    for (const template of items) {
        const next = normalizeTemplateRecord(template);
        if (!next.name || seen.has(next.id)) {
            continue;
        }
        seen.add(next.id);
        normalized.push(next);
    }

    return normalized.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

function buildTemplate(input = {}) {
    const existing = input.id ? templates.find((template) => template.id === input.id) : null;
    const next = normalizeTemplateRecord(input, existing);
    if (!next.name) {
        throw new Error('模板名称不能为空');
    }
    return next;
}

function normalizeStructuredText(value) {
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

function normalizeAccountRecord(input = {}, existing = null) {
    const source = input && typeof input === 'object' ? input : {};
    const current = existing && typeof existing === 'object' ? existing : null;
    return {
        id: source.id || current?.id || uuidv4(),
        platform: String(source.platform ?? current?.platform ?? '').trim(),
        username: String(source.username ?? current?.username ?? '').trim(),
        password: String(source.password ?? current?.password ?? ''),
        email: String(source.email ?? current?.email ?? '').trim(),
        phone: String(source.phone ?? current?.phone ?? '').trim(),
        twoFactorSecret: String(source.twoFactorSecret ?? current?.twoFactorSecret ?? '').trim(),
        cookies: normalizeStructuredText(source.cookies ?? current?.cookies ?? ''),
        localStorage: normalizeStructuredText(source.localStorage ?? current?.localStorage ?? ''),
        notes: source.notes ?? current?.notes ?? '',
        profileId: String(source.profileId ?? current?.profileId ?? '').trim(),
        status: String(source.status ?? current?.status ?? 'active').trim() || 'active',
        createdAt: Number(source.createdAt) || current?.createdAt || Date.now(),
        updatedAt: Date.now()
    };
}

function normalizeAccounts(items = []) {
    const normalized = [];
    const seen = new Set();

    for (const account of items) {
        const next = normalizeAccountRecord(account);
        if ((!next.platform && !next.username && !next.email && !next.phone) || seen.has(next.id)) {
            continue;
        }
        seen.add(next.id);
        normalized.push(next);
    }

    return normalized.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

function normalizeExtensionRecord(input = {}, existing = null) {
    const source = input && typeof input === 'object' ? input : {};
    const current = existing && typeof existing === 'object' ? existing : null;
    return {
        id: source.id || current?.id || uuidv4(),
        name: String(source.name || current?.name || '').trim(),
        version: String(source.version || current?.version || '').trim(),
        sourceType: String(source.sourceType || current?.sourceType || 'unpacked').trim() || 'unpacked',
        path: String(source.path || current?.path || '').trim(),
        enabled: Object.prototype.hasOwnProperty.call(source, 'enabled')
            ? source.enabled !== false
            : current?.enabled !== false,
        scope: String(source.scope || current?.scope || 'profile').trim() || 'profile'
    };
}

function normalizeExtensions(items = []) {
    const normalized = [];
    const seen = new Set();
    for (const extension of items) {
        const next = normalizeExtensionRecord(extension);
        if (!next.name || !next.path || seen.has(next.id)) {
            continue;
        }
        seen.add(next.id);
        normalized.push(next);
    }
    return normalized.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

function getExtensions() {
    return normalizeExtensions(settings?.extensions || []);
}

function getExtension(extensionId) {
    return getExtensions().find((item) => item.id === extensionId) || null;
}

function parseStoredCookies(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (value && typeof value === 'object') {
        if (Array.isArray(value.cookies)) {
            return value.cookies;
        }
        return [];
    }

    const raw = String(value || '').trim();
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        if (parsed && Array.isArray(parsed.cookies)) {
            return parsed.cookies;
        }
    } catch (error) {
        return [];
    }

    return [];
}

function sanitizeCookieExportFileName(account = {}) {
    const name = [
        account.platform,
        account.username || account.email || account.phone || 'cookies'
    ].filter(Boolean).join('-');
    const normalized = sanitizeExportFileName(name || 'account-cookies');
    return normalized === 'xbrowser-profiles' ? 'account-cookies' : normalized;
}

function parseStoredLocalStorage(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (value && typeof value === 'object') {
        if (Array.isArray(value.origins)) {
            return value.origins;
        }
        if (value.origin && (Array.isArray(value.items) || Array.isArray(value.entries))) {
            return [value];
        }
        return [];
    }

    const raw = String(value || '').trim();
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        if (parsed && Array.isArray(parsed.origins)) {
            return parsed.origins;
        }
        if (parsed?.origin && (Array.isArray(parsed.items) || Array.isArray(parsed.entries))) {
            return [parsed];
        }
    } catch (error) {
        return [];
    }

    return [];
}

function normalizeLocalStorageEntries(items = []) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items.map((item) => {
        if (Array.isArray(item) && item.length >= 2) {
            return {
                key: String(item[0] ?? '').trim(),
                value: item[1] == null ? '' : String(item[1])
            };
        }

        if (item && typeof item === 'object') {
            return {
                key: String(item.key ?? '').trim(),
                value: item.value == null ? '' : String(item.value)
            };
        }

        return null;
    }).filter((item) => item && item.key);
}

function normalizeLocalStoragePayload(input) {
    return parseStoredLocalStorage(input).map((entry) => {
        const source = entry && typeof entry === 'object' ? entry : {};
        const origin = String(source.origin || source.securityOrigin || '').trim();
        const url = String(source.url || '').trim();
        const items = normalizeLocalStorageEntries(source.items || source.entries || []);
        if (!origin || !items.length) {
            return null;
        }
        return {
            origin,
            url,
            items
        };
    }).filter(Boolean);
}

function countLocalStorageItems(origins = []) {
    return origins.reduce((total, entry) => total + (Array.isArray(entry?.items) ? entry.items.length : 0), 0);
}

function sanitizeLocalStorageExportFileName(account = {}) {
    const name = [
        account.platform,
        account.username || account.email || account.phone || 'local-storage'
    ].filter(Boolean).join('-');
    const normalized = sanitizeExportFileName(name || 'account-local-storage');
    return normalized === 'xbrowser-profiles' ? 'account-local-storage' : normalized;
}

function normalizeCookieForImport(cookie = {}) {
    if (!cookie || typeof cookie !== 'object') {
        return null;
    }

    const name = String(cookie.name || '').trim();
    const value = cookie.value == null ? '' : String(cookie.value);
    const domain = String(cookie.domain || '').trim();
    const secure = Boolean(cookie.secure);
    const pathValue = String(cookie.path || '/').trim() || '/';
    const pathName = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
    const explicitUrl = String(cookie.url || '').trim();
    const host = domain.replace(/^\./, '');
    const url = explicitUrl || (host ? `${secure ? 'https' : 'http'}://${host}${pathName}` : '');

    if (!name || !url) {
        return null;
    }

    const normalized = {
        name,
        value,
        url,
        domain,
        path: pathName,
        secure,
        httpOnly: Boolean(cookie.httpOnly)
    };

    const expires = Number(cookie.expires);
    if (Number.isFinite(expires) && expires > 0) {
        normalized.expires = expires;
    }

    const sameSite = String(cookie.sameSite || '').trim();
    if (['Strict', 'Lax', 'None'].includes(sameSite)) {
        normalized.sameSite = sameSite;
    }

    const priority = String(cookie.priority || '').trim();
    if (['Low', 'Medium', 'High'].includes(priority)) {
        normalized.priority = priority;
    }

    if (cookie.sameParty === true) {
        normalized.sameParty = true;
    }

    const sourceScheme = String(cookie.sourceScheme || '').trim();
    if (['Unset', 'NonSecure', 'Secure'].includes(sourceScheme)) {
        normalized.sourceScheme = sourceScheme;
    }

    const sourcePort = Number(cookie.sourcePort);
    if (Number.isInteger(sourcePort) && sourcePort >= -1) {
        normalized.sourcePort = sourcePort;
    }

    return normalized;
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
                latitude: Number(ipSb.latitude || ipSb.lat) || 0,
                longitude: Number(ipSb.longitude || ipSb.lon) || 0,
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
                latitude: Number(ipapiCo.latitude) || 0,
                longitude: Number(ipapiCo.longitude) || 0,
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
                latitude: Number(ipapiIs.location?.latitude || ipapiIs.location?.lat) || 0,
                longitude: Number(ipapiIs.location?.longitude || ipapiIs.location?.lon) || 0,
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
                latitude: Number(ipwhoIs.latitude || ipwhoIs.lat) || 0,
                longitude: Number(ipwhoIs.longitude || ipwhoIs.lon) || 0,
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
    const geoMode = String(next.geolocation?.mode || 'auto').trim() || 'auto';
    const needsGeolocation = geoMode === 'auto' && (
        !Number.isFinite(Number(next.geolocation?.latitude))
        || !Number.isFinite(Number(next.geolocation?.longitude))
        || !(Number(next.geolocation?.latitude) || Number(next.geolocation?.longitude))
    );
    let geo = null;

    if (needsLanguage || needsTimezone || needsGeolocation) {
        geo = await fetchGeoInfo({ proxyPort });
        const hasTimezone = !!geo?.timezone;
        const hasLanguage = !!geo?.language;
        const hasCoordinates = Number.isFinite(Number(geo?.latitude)) && Number.isFinite(Number(geo?.longitude))
            && (Number(geo?.latitude) || Number(geo?.longitude));
        if (!geo || (needsTimezone && !hasTimezone) || (needsLanguage && !hasLanguage) || (needsGeolocation && !hasCoordinates)) {
            throw new Error(proxyPort
                ? '代理出口定位失败，无法自动确定语言和时区'
                : '网络定位失败，无法自动确定语言和时区');
        }

        if (needsTimezone) next.timezone = geo.timezone;
        if (needsLanguage) next.language = geo.language;
        if (needsGeolocation && hasCoordinates) {
            next.geolocation = {
                ...(next.geolocation || {}),
                mode: 'auto',
                latitude: Number(geo.latitude),
                longitude: Number(geo.longitude),
                accuracy: Math.max(1, Number(next.geolocation?.accuracy) || 30)
            };
        }
    }

    if (!Array.isArray(next.languages) || !next.languages.length || next.languages[0] === 'auto') {
        next.languages = [next.language, next.language.split('-')[0]];
    }

    if (!Array.isArray(next.speechVoices) || !next.speechVoices.length) {
        next.speechVoices = buildDefaultSpeechVoices(next.language || geo?.language || 'en-US');
    }

    return next;
}

function proxyRecordFromParsed(proxy, meta = {}) {
    return normalizeProxyRecord({
        id: meta.id || uuidv4(),
        name: meta.name || proxy.name,
        url: meta.url || proxy.__raw || '',
        proxy,
        source: meta.source || 'manual',
        groupId: meta.groupId || 'manual',
        provider: meta.provider || '',
        enabled: meta.enabled !== false,
        latency: meta.latency ?? null,
        city: meta.city || '',
        country: meta.country || '',
        countryCode: meta.countryCode || '',
        status: meta.status || 'unknown',
        lastCheckedAt: meta.lastCheckedAt ?? null,
        updatedAt: Date.now(),
    });
}

function normalizeProxyRecord(input = {}, existing = null) {
    const source = input && typeof input === 'object' ? input : {};
    const current = existing && typeof existing === 'object' ? existing : null;
    const latency = Number(source.latency ?? current?.latency);

    return {
        id: source.id || current?.id || uuidv4(),
        name: String(source.name || current?.name || '').trim(),
        url: String(source.url || current?.url || '').trim(),
        proxy: source.proxy || current?.proxy || null,
        source: String(source.source || current?.source || 'manual').trim() || 'manual',
        groupId: String(source.groupId || current?.groupId || 'manual').trim() || 'manual',
        provider: String(source.provider || current?.provider || '').trim(),
        enabled: Object.prototype.hasOwnProperty.call(source, 'enabled')
            ? source.enabled !== false
            : current?.enabled !== false,
        latency: Number.isFinite(latency) && latency > 0 ? latency : -1,
        city: String(source.city || current?.city || '').trim(),
        country: String(source.country || current?.country || '').trim(),
        countryCode: String(source.countryCode || current?.countryCode || '').trim().toUpperCase(),
        status: String(source.status || current?.status || 'unknown').trim() || 'unknown',
        lastCheckedAt: Object.prototype.hasOwnProperty.call(source, 'lastCheckedAt')
            ? (source.lastCheckedAt || null)
            : (current?.lastCheckedAt || null),
        updatedAt: Number(source.updatedAt) || current?.updatedAt || Date.now()
    };
}

function normalizeProxies(items = []) {
    const normalized = [];
    const seen = new Set();

    for (const proxy of items) {
        const next = normalizeProxyRecord(proxy);
        if (!next.id || !next.name || !next.proxy || seen.has(next.id)) {
            continue;
        }
        seen.add(next.id);
        normalized.push(next);
    }

    return normalized;
}

function getProxyFilters(payload = {}) {
    return {
        countryCode: String(payload.countryCode || '').trim().toUpperCase(),
        city: String(payload.city || '').trim().toLowerCase(),
        maxLatency: Math.max(0, Number(payload.maxLatency) || 0)
    };
}

function getAllocatableProxies(payload = {}) {
    const filters = getProxyFilters(payload);
    return settings.proxies.filter((proxy) => {
        if (!proxy || proxy.enabled === false || proxy.status === 'error') {
            return false;
        }
        if (filters.countryCode && String(proxy.countryCode || '').trim().toUpperCase() !== filters.countryCode) {
            return false;
        }
        if (filters.city && String(proxy.city || '').trim().toLowerCase() !== filters.city) {
            return false;
        }
        if (filters.maxLatency > 0 && (!(Number(proxy.latency) > 0) || Number(proxy.latency) > filters.maxLatency)) {
            return false;
        }
        return true;
    });
}

function hashText(value = '') {
    let hash = 0;
    const source = String(value || '');
    for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash);
}

async function measureProxyLatencyThroughPort(mixedPort) {
    const start = Date.now();
    const agent = new SocksProxyAgent(`socks5://127.0.0.1:${mixedPort}`);
    return new Promise((resolve) => {
        const req = http.get('http://cp.cloudflare.com/generate_204', { agent, timeout: 5000 }, (res) => {
            if (res.statusCode === 204) {
                resolve({ ok: true, latency: Date.now() - start });
                return;
            }
            resolve({ ok: false, latency: -1 });
        });
        req.on('timeout', () => {
            req.destroy();
            resolve({ ok: false, latency: -1 });
        });
        req.on('error', () => resolve({ ok: false, latency: -1 }));
    });
}

async function inspectProxy(proxyInput) {
    const mixedPort = await getPort();
    const controllerPort = await getPort();
    const core = await startCore({
        baseDir: BASE_DIR,
        runtimeDir: store.runtimeDir,
        profileId: `proxy-check-${Date.now()}`,
        proxyInput,
        mixedPort,
        controllerPort
    });

    try {
        await waitForMihomoReady({ mixedPort, controllerPort });
        const [latency, geo] = await Promise.all([
            measureProxyLatencyThroughPort(mixedPort),
            fetchGeoInfo({ proxyPort: mixedPort }).catch(() => null)
        ]);
        return { latency, geo };
    } finally {
        await stopProcess(core.process.pid);
        try { fs.closeSync(core.logFd); } catch (error) { }
    }
}

async function refreshProxyGeo(payload = {}) {
    const ids = Array.isArray(payload.ids)
        ? payload.ids.map((item) => String(item || '').trim()).filter(Boolean)
        : (payload.id ? [String(payload.id).trim()] : settings.proxies.map((proxy) => proxy.id));

    const targets = ids.length
        ? settings.proxies.filter((proxy) => ids.includes(proxy.id))
        : [];

    if (!targets.length) {
        throw new Error('没有可检测的代理');
    }

    let updated = 0;
    for (const proxy of targets) {
        const result = await inspectProxy(proxy);
        proxy.latency = result.latency?.latency ?? -1;
        proxy.city = result.geo?.city || '';
        proxy.country = result.geo?.country || '';
        proxy.countryCode = result.geo?.countryCode || '';
        proxy.status = result.latency?.ok ? 'ok' : 'error';
        proxy.lastCheckedAt = Date.now();
        updated += 1;
    }

    await store.saveSettings(settings);
    notifyState();
    return { updated };
}

function getProfile(id) {
    return profiles.find(profile => profile.id === id);
}

function getAccount(id) {
    return accounts.find((account) => account.id === id);
}

function getAccountsByProfileId(profileId) {
    return accounts.filter((account) => account.profileId === profileId);
}

function getPrimaryAccountForProfile(profileId) {
    return getAccountsByProfileId(profileId)[0] || null;
}

function sanitizeAccountBindings(items = []) {
    return items.map((account) => {
        const profile = getProfile(account.profileId);
        return {
            ...account,
            profileId: profile && !profile.deletedAt ? profile.id : ''
        };
    });
}

function buildAccount(input = {}) {
    const existing = input.id ? accounts.find((account) => account.id === input.id) : null;
    const next = normalizeAccountRecord(input, existing);

    if (!next.platform) {
        throw new Error('账号平台不能为空');
    }

    if (!next.username && !next.email && !next.phone) {
        throw new Error('至少填写用户名、邮箱或手机号');
    }

    const profile = getProfile(next.profileId);
    next.profileId = profile && !profile.deletedAt ? profile.id : '';
    return next;
}

async function updateAccountRecord(accountId, patch = {}) {
    const existing = getAccount(accountId);
    if (!existing) {
        throw new Error('账号不存在');
    }

    const next = normalizeAccountRecord({
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt
    }, existing);

    accounts = normalizeAccounts(accounts.map((account) => (
        account.id === accountId ? next : account
    )));
    await accountStore.saveAccounts(accounts);
    notifyState();
    return next;
}

async function bindAccountProfile(payload = {}) {
    const account = getAccount(payload.accountId);
    if (!account) {
        throw new Error('账号不存在');
    }

    const profileId = String(payload.profileId || '').trim();
    if (!profileId) {
        return updateAccountRecord(account.id, { profileId: '' });
    }

    const profile = getProfile(profileId);
    if (!profile || profile.deletedAt) {
        throw new Error('目标环境不存在');
    }

    return updateAccountRecord(account.id, { profileId: profile.id });
}

function getProject(projectId = DEFAULT_PROJECT_ID) {
    return settings.projects.find((project) => project.id === projectId)
        || settings.projects.find((project) => project.id === DEFAULT_PROJECT_ID)
        || getDefaultProjectRecord();
}

async function createProject(payload = {}) {
    const next = normalizeProjectRecord(payload);
    if (!next.name) {
        throw new Error('项目名称不能为空');
    }

    settings.projects = normalizeProjects([...settings.projects, next]);
    await store.saveSettings(settings);
    notifyState();
    return next;
}

async function updateProject(payload = {}) {
    const existing = settings.projects.find((project) => project.id === payload?.id);
    if (!existing) {
        throw new Error('项目不存在');
    }

    const next = normalizeProjectRecord(payload, existing);
    if (!next.name) {
        throw new Error('项目名称不能为空');
    }

    settings.projects = normalizeProjects(settings.projects.map((project) => (
        project.id === next.id ? next : project
    )));
    await store.saveSettings(settings);
    notifyState();
    return next;
}

async function deleteProject(projectId) {
    if (!projectId || projectId === DEFAULT_PROJECT_ID) {
        throw new Error('默认项目不能删除');
    }

    if (!settings.projects.some((project) => project.id === projectId)) {
        return true;
    }

    settings.projects = normalizeProjects(settings.projects.filter((project) => project.id !== projectId));
    profiles = profiles.map((profile) => (
        profile.projectId === projectId
            ? { ...profile, projectId: DEFAULT_PROJECT_ID }
            : profile
    ));

    if (settings.ui?.homeProjectId === projectId) {
        settings.ui.homeProjectId = 'all';
    }

    await Promise.all([
        store.saveSettings(settings),
        store.saveProfiles(profiles)
    ]);
    notifyState();
    return true;
}

async function importUnpackedExtension() {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '导入扩展目录',
        properties: ['openDirectory']
    });
    if (canceled || !filePaths.length) {
        return { canceled: true };
    }

    const sourceDir = filePaths[0];
    return importExtensionFromDirectory(sourceDir, { sourceType: 'unpacked' });
}

async function readExtensionManifestFromDir(extensionDir) {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    if (!(await fs.pathExists(manifestPath))) {
        throw new Error('所选扩展缺少 manifest.json');
    }

    try {
        const manifest = await fs.readJson(manifestPath);
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
            throw new Error('invalid manifest');
        }
        return manifest;
    } catch (error) {
        throw new Error('manifest.json 无法解析');
    }
}

async function resolveExtensionDisplayName(manifest = {}, extensionDir, fallbackLabel = '') {
    const fallbackName = String(fallbackLabel || path.basename(extensionDir)).trim() || path.basename(extensionDir);
    const rawName = String(manifest?.name || manifest?.short_name || fallbackName).trim();
    const match = rawName.match(/^__MSG_(.+)__$/);
    if (!match || !manifest?.default_locale) {
        return rawName || fallbackName;
    }

    const messageKey = match[1];
    const localeFiles = [
        path.join(extensionDir, '_locales', manifest.default_locale, 'messages.json'),
        path.join(extensionDir, '_locales', manifest.default_locale.replace('-', '_'), 'messages.json'),
        path.join(extensionDir, '_locales', manifest.default_locale.replace('_', '-'), 'messages.json')
    ];

    for (const localeFile of localeFiles) {
        if (!(await fs.pathExists(localeFile))) {
            continue;
        }
        try {
            const messages = await fs.readJson(localeFile);
            const message = messages?.[messageKey]?.message;
            if (message) {
                return String(message).trim() || fallbackName;
            }
        } catch (error) {
            continue;
        }
    }

    return fallbackName;
}

async function storeImportedExtensionRecord({
    extensionDir,
    sourceType = 'unpacked',
    targetDir = '',
    fallbackName = ''
}) {
    const manifest = await readExtensionManifestFromDir(extensionDir);
    const normalizedTargetDir = targetDir || path.join(store.extensionsDir, uuidv4());
    const record = normalizeExtensionRecord({
        id: path.basename(normalizedTargetDir),
        name: await resolveExtensionDisplayName(manifest, extensionDir, fallbackName),
        version: manifest?.version || '0.0.0',
        sourceType,
        scope: 'profile'
    });

    const extension = normalizeExtensionRecord({
        ...record,
        path: normalizedTargetDir,
        enabled: true
    });
    settings.extensions = normalizeExtensions([extension, ...getExtensions()]);
    await store.saveSettings(settings);
    notifyState();
    return extension;
}

async function importExtensionFromDirectory(sourceDir, options = {}) {
    const sourceType = String(options.sourceType || 'unpacked').trim() || 'unpacked';
    const record = normalizeExtensionRecord({
        sourceType,
        scope: 'profile'
    });
    const targetDir = path.join(store.extensionsDir, record.id);

    await readExtensionManifestFromDir(sourceDir);
    await fs.remove(targetDir);
    await fs.copy(sourceDir, targetDir, {
        overwrite: true,
        errorOnExist: false
    });

    try {
        return await storeImportedExtensionRecord({
            extensionDir: targetDir,
            sourceType,
            targetDir,
            fallbackName: path.basename(sourceDir)
        });
    } catch (error) {
        await fs.remove(targetDir).catch(() => {});
        throw error;
    }
}

function findCrxZipOffset(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        return -1;
    }
    return buffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}

async function importCrxExtension() {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '导入 CRX 扩展',
        properties: ['openFile'],
        filters: [
            { name: 'Chrome 扩展', extensions: ['crx'] }
        ]
    });
    if (canceled || !filePaths.length) {
        return { canceled: true };
    }

    const sourcePath = filePaths[0];
    const sourceBuffer = await fs.readFile(sourcePath);
    const zipOffset = findCrxZipOffset(sourceBuffer);
    if (zipOffset < 0) {
        throw new Error('无法解析 CRX 文件');
    }

    const record = normalizeExtensionRecord({
        sourceType: 'crx',
        scope: 'profile'
    });
    const targetDir = path.join(store.extensionsDir, record.id);
    const tempZipPath = path.join(store.runtimeDir, `extension-${record.id}.zip`);

    await fs.remove(targetDir);
    await fs.ensureDir(targetDir);
    await fs.writeFile(tempZipPath, sourceBuffer.subarray(zipOffset));

    try {
        await extractZip(tempZipPath, { dir: targetDir });
        return await storeImportedExtensionRecord({
            extensionDir: targetDir,
            sourceType: 'crx',
            targetDir,
            fallbackName: path.basename(sourcePath, path.extname(sourcePath))
        });
    } catch (error) {
        await fs.remove(targetDir).catch(() => {});
        throw new Error(error?.message || 'CRX 解包失败');
    } finally {
        await fs.remove(tempZipPath).catch(() => {});
    }
}

async function batchAssignExtension(payload = {}) {
    const extension = getExtension(payload.extensionId);
    if (!extension) {
        throw new Error('扩展不存在');
    }

    const mode = payload.mode === 'remove' ? 'remove' : 'add';
    const profileIds = Array.isArray(payload.profileIds)
        ? Array.from(new Set(payload.profileIds.map((item) => String(item || '').trim()).filter(Boolean)))
        : [];

    if (!profileIds.length) {
        throw new Error('请先选择环境');
    }

    let updated = 0;
    profiles = profiles.map((profile) => {
        if (profile.deletedAt || !profileIds.includes(profile.id)) {
            return profile;
        }

        const extensionIds = Array.isArray(profile.extensionIds)
            ? profile.extensionIds.filter((extensionId) => !!getExtension(extensionId))
            : [];
        const hasBound = extensionIds.includes(extension.id);
        if ((mode === 'add' && hasBound) || (mode === 'remove' && !hasBound)) {
            return profile;
        }

        updated += 1;
        return {
            ...profile,
            extensionIds: mode === 'remove'
                ? extensionIds.filter((extensionId) => extensionId !== extension.id)
                : Array.from(new Set(extensionIds.concat(extension.id)))
        };
    });

    if (!updated) {
        throw new Error(mode === 'remove' ? '所选环境没有绑定这个扩展' : '所选环境都已绑定这个扩展');
    }

    await store.saveProfiles(profiles);
    notifyState();
    return {
        extensionId: extension.id,
        updated,
        mode
    };
}

async function toggleExtension(payload = {}) {
    const existing = getExtension(payload?.id);
    if (!existing) {
        throw new Error('扩展不存在');
    }

    const enabled = typeof payload.enabled === 'boolean' ? payload.enabled : !existing.enabled;
    settings.extensions = normalizeExtensions(getExtensions().map((extension) => (
        extension.id === existing.id
            ? { ...extension, enabled }
            : extension
    )));
    await store.saveSettings(settings);
    notifyState();
    return getExtension(existing.id);
}

async function deleteExtension(extensionId) {
    const existing = getExtension(extensionId);
    if (!existing) {
        throw new Error('扩展不存在');
    }

    settings.extensions = normalizeExtensions(getExtensions().filter((extension) => extension.id !== extensionId));
    profiles = profiles.map((profile) => ({
        ...profile,
        extensionIds: Array.isArray(profile.extensionIds)
            ? profile.extensionIds.filter((id) => id !== extensionId)
            : []
    }));

    if (existing.path && await fs.pathExists(existing.path)) {
        await fs.remove(existing.path);
    }

    await Promise.all([
        store.saveSettings(settings),
        store.saveProfiles(profiles)
    ]);
    notifyState();
    return true;
}

async function trashProfile(profileId) {
    const profile = getProfile(profileId);
    if (!profile) {
        throw new Error('环境不存在');
    }

    await stopProfile(profileId);
    profile.deletedAt = Date.now();
    profile.deletedFromProjectId = profile.projectId || DEFAULT_PROJECT_ID;
    profile.projectId = DEFAULT_PROJECT_ID;
    await store.saveProfiles(profiles);
    notifyState();
    return true;
}

async function restoreProfile(profileId) {
    const profile = getProfile(profileId);
    if (!profile) {
        throw new Error('环境不存在');
    }

    profile.deletedAt = null;
    profile.projectId = getProject(profile.deletedFromProjectId || DEFAULT_PROJECT_ID).id;
    profile.deletedFromProjectId = '';
    await store.saveProfiles(profiles);
    notifyState();
    return true;
}

async function destroyProfile(profileId) {
    await stopProfile(profileId);
    profiles = profiles.filter((profile) => profile.id !== profileId);
    accounts = normalizeAccounts(accounts.map((account) => (
        account.profileId === profileId
            ? { ...account, profileId: '' }
            : account
    )));
    await Promise.all([
        store.saveProfiles(profiles),
        accountStore.saveAccounts(accounts)
    ]);
    notifyState();
    return true;
}

async function createAccount(payload = {}) {
    const next = buildAccount(payload);
    accounts = normalizeAccounts([next, ...accounts]);
    await accountStore.saveAccounts(accounts);
    notifyState();
    return next;
}

async function updateAccount(payload = {}) {
    const existing = getAccount(payload?.id);
    if (!existing) {
        throw new Error('账号不存在');
    }

    const next = buildAccount(payload);
    accounts = normalizeAccounts(accounts.map((account) => (
        account.id === next.id ? next : account
    )));
    await accountStore.saveAccounts(accounts);
    notifyState();
    return next;
}

async function deleteAccount(accountId) {
    const existing = getAccount(accountId);
    if (!existing) {
        throw new Error('账号不存在');
    }

    accounts = normalizeAccounts(accounts.filter((account) => account.id !== accountId));
    await accountStore.saveAccounts(accounts);
    notifyState();
    return true;
}

async function moveProfilesToProject(payload = {}) {
    const targetProjectId = getProject(payload.projectId).id;
    const profileIds = Array.isArray(payload.profileIds) ? payload.profileIds.filter(Boolean) : [];
    if (!profileIds.length) {
        throw new Error('请先选择要移动的环境');
    }

    let moved = 0;
    profiles = profiles.map((profile) => {
        if (profile.deletedAt || !profileIds.includes(profile.id) || profile.projectId === targetProjectId) {
            return profile;
        }
        moved += 1;
        return {
            ...profile,
            projectId: targetProjectId
        };
    });

    if (!moved) {
        throw new Error('没有可移动的环境');
    }

    await store.saveProfiles(profiles);
    notifyState();
    return {
        moved,
        projectId: targetProjectId
    };
}

async function batchAssignProxy(payload = {}) {
    const proxyId = String(payload.proxyId || '').trim();
    const profileIds = Array.isArray(payload.profileIds)
        ? Array.from(new Set(payload.profileIds.map((item) => String(item || '').trim()).filter(Boolean)))
        : [];

    if (proxyId && !getProxy(proxyId)) {
        throw new Error('代理不存在');
    }
    if (!profileIds.length) {
        throw new Error('请先选择环境');
    }

    let updated = 0;
    profiles = profiles.map((profile) => {
        if (profile.deletedAt || !profileIds.includes(profile.id)) {
            return profile;
        }
        if ((profile.proxyId || '') === proxyId) {
            return profile;
        }
        updated += 1;
        return {
            ...profile,
            proxyId
        };
    });

    if (!updated) {
        throw new Error(proxyId ? '所选环境都已绑定这个代理' : '所选环境已经是直连');
    }

    await store.saveProfiles(profiles);
    notifyState();
    return {
        updated,
        proxyId
    };
}

async function allocateProxy(payload = {}) {
    const mode = normalizeProxyAllocation({
        mode: payload.mode || settings.proxyAllocation?.mode || 'manual'
    }).mode;
    const profileIds = Array.isArray(payload.profileIds)
        ? Array.from(new Set(payload.profileIds.map((item) => String(item || '').trim()).filter(Boolean)))
        : [];
    const filters = getProxyFilters(payload);

    if (!profileIds.length) {
        throw new Error('请先选择环境');
    }
    if (mode === 'manual') {
        throw new Error('手动模式请使用批量绑定代理');
    }
    if (mode === 'geo-match' && !filters.countryCode && !filters.city) {
        throw new Error('地区匹配模式至少要指定国家或城市');
    }

    const eligibleProxies = getAllocatableProxies(filters);
    if (!eligibleProxies.length) {
        throw new Error('没有符合条件的可用代理');
    }

    let assigned = 0;
    let roundRobinIndex = 0;
    profiles = profiles.map((profile) => {
        if (profile.deletedAt || !profileIds.includes(profile.id)) {
            return profile;
        }

        let nextProxy = null;
        if (mode === 'sticky') {
            nextProxy = eligibleProxies[hashText(profile.id) % eligibleProxies.length];
        } else {
            nextProxy = eligibleProxies[roundRobinIndex % eligibleProxies.length];
            roundRobinIndex += 1;
        }

        if (!nextProxy || profile.proxyId === nextProxy.id) {
            return profile;
        }

        assigned += 1;
        return {
            ...profile,
            proxyId: nextProxy.id
        };
    });

    if (!assigned) {
        throw new Error('所选环境已经满足当前分配结果');
    }

    settings.proxyAllocation = normalizeProxyAllocation({ mode });
    await Promise.all([
        store.saveProfiles(profiles),
        store.saveSettings(settings)
    ]);
    notifyState();
    return {
        assigned,
        mode,
        matched: eligibleProxies.length
    };
}

async function cloneProfile(profileId) {
    const source = getProfile(profileId);
    if (!source) {
        throw new Error('环境不存在');
    }

    const profileName = String(source.name || '').trim() || '未命名环境';
    const next = buildProfile({
        name: `${profileName}-副本`,
        startUrl: source.startUrl,
        proxyId: source.proxyId,
        projectId: source.projectId,
        templateId: source.templateId,
        createdFrom: source.id,
        archivedAt: null,
        tags: JSON.parse(JSON.stringify(source.tags || [])),
        notes: source.notes || '',
        fingerprint: JSON.parse(JSON.stringify(source.fingerprint || {})),
        lastOpenedAt: null
    });

    profiles.unshift(next);
    await store.saveProfiles(profiles);
    notifyState();
    return next;
}

function buildBatchProfileName(prefix, index, total) {
    const width = Math.max(2, String(total || 0).length);
    return `${prefix}-${String(index + 1).padStart(width, '0')}`;
}

function buildBatchFingerprint(baseFingerprint = {}, randomizeFingerprint = true) {
    const source = baseFingerprint && typeof baseFingerprint === 'object'
        ? JSON.parse(JSON.stringify(baseFingerprint))
        : {};

    if (!randomizeFingerprint) {
        return createFingerprint(source);
    }

    return createFingerprint({
        platform: source.platform,
        language: source.language,
        timezone: source.timezone,
        useProxyLocale: source.useProxyLocale !== false
    });
}

async function batchCreateProfiles(payload = {}) {
    const count = Math.max(0, Math.min(50, Number(payload.count) || 0));
    if (count < 2) {
        throw new Error('批量创建数量至少为 2');
    }

    const profileDraft = payload.profileDraft && typeof payload.profileDraft === 'object'
        ? payload.profileDraft
        : {};
    const namePrefix = String(payload.namePrefix || profileDraft.name || '').trim() || 'Batch';
    const proxyMode = payload.proxyMode === 'round-robin'
        ? 'round-robin'
        : (payload.proxyMode === 'direct' ? 'direct' : 'current');
    const inheritTags = payload.inheritTags !== false;
    const randomizeFingerprint = payload.randomizeFingerprint !== false;
    const roundRobinProxyIds = proxyMode === 'round-robin'
        ? settings.proxies.filter((proxy) => proxy.enabled !== false).map((proxy) => proxy.id).filter(Boolean)
        : [];
    const proxyModeUsed = proxyMode === 'round-robin' && !roundRobinProxyIds.length
        ? 'direct'
        : proxyMode;
    const batch = [];

    for (let index = 0; index < count; index += 1) {
        const proxyId = proxyModeUsed === 'round-robin'
            ? roundRobinProxyIds[index % roundRobinProxyIds.length]
            : (proxyModeUsed === 'current' ? (profileDraft.proxyId || '') : '');

        batch.push(buildProfile({
            name: buildBatchProfileName(namePrefix, index, count),
            startUrl: profileDraft.startUrl || '',
            proxyId,
            projectId: profileDraft.projectId || '',
            templateId: payload.templateId || '',
            tags: inheritTags ? JSON.parse(JSON.stringify(profileDraft.tags || [])) : [],
            notes: profileDraft.notes || '',
            fingerprint: buildBatchFingerprint(profileDraft.fingerprint || {}, randomizeFingerprint)
        }));
    }

    profiles = normalizeProfilesWithCodes([...batch, ...profiles]);
    const createdProfiles = profiles.slice(0, batch.length);
    await store.saveProfiles(profiles);
    notifyState();
    return {
        created: createdProfiles.length,
        proxyMode: proxyModeUsed,
        profiles: createdProfiles
    };
}

function sanitizeExportFileName(name = '') {
    const normalized = String(name || '')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return normalized || 'xbrowser-profiles';
}

function buildProfileExportPackage(profileItems = []) {
    const relatedTemplates = [];
    const seenTemplateIds = new Set();

    for (const profile of profileItems) {
        if (!profile?.templateId || seenTemplateIds.has(profile.templateId)) {
            continue;
        }
        const template = templates.find((item) => item.id === profile.templateId);
        if (!template) {
            continue;
        }
        seenTemplateIds.add(template.id);
        relatedTemplates.push(JSON.parse(JSON.stringify(template)));
    }

    return {
        app: 'XBrowseR',
        kind: 'profiles',
        schemaVersion: 1,
        exportedAt: Date.now(),
        profiles: JSON.parse(JSON.stringify(profileItems)),
        templates: relatedTemplates
    };
}

async function exportProfilesPackage(payload = {}) {
    const ids = Array.isArray(payload.ids) ? payload.ids.filter(Boolean) : [];
    const profileItems = ids.length
        ? profiles.filter((profile) => ids.includes(profile.id))
        : profiles.filter((profile) => !profile.deletedAt);

    if (!profileItems.length) {
        throw new Error('没有可导出的环境');
    }

    const packagePayload = buildProfileExportPackage(profileItems);
    const fileName = profileItems.length === 1
        ? `${sanitizeExportFileName(profileItems[0].name || 'profile')}.json`
        : `xbrowser-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    const defaultPath = path.join(app.getPath('documents'), fileName);
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: '导出环境',
        defaultPath,
        filters: [
            { name: 'JSON 文件', extensions: ['json'] }
        ]
    });

    if (canceled || !filePath) {
        return { canceled: true, exported: 0 };
    }

    await fs.writeJson(filePath, packagePayload, { spaces: 2 });
    return {
        canceled: false,
        exported: profileItems.length,
        filePath
    };
}

function parseImportedProfilesPayload(payload) {
    if (Array.isArray(payload)) {
        return {
            profiles: payload,
            templates: []
        };
    }

    if (!payload || typeof payload !== 'object') {
        return {
            profiles: [],
            templates: []
        };
    }

    const profileItems = Array.isArray(payload.profiles)
        ? payload.profiles
        : (Array.isArray(payload.items) ? payload.items : []);
    if (profileItems.length) {
        return {
            profiles: profileItems,
            templates: Array.isArray(payload.templates) ? payload.templates : []
        };
    }

    if (payload.id || payload.name || payload.fingerprint) {
        return {
            profiles: [payload],
            templates: []
        };
    }

    return {
        profiles: [],
        templates: Array.isArray(payload.templates) ? payload.templates : []
    };
}

async function importProfilesPackage() {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '导入环境',
        properties: ['openFile'],
        filters: [
            { name: 'JSON 文件', extensions: ['json'] }
        ]
    });

    if (canceled || !filePaths.length) {
        return { canceled: true, imported: 0, templates: 0 };
    }

    const filePath = filePaths[0];
    const payload = await fs.readJson(filePath);
    const parsed = parseImportedProfilesPayload(payload);
    if (!parsed.profiles.length) {
        throw new Error('导入文件中没有可用的环境数据');
    }

    const templateIdMap = new Map();
    const importedTemplates = [];
    for (const item of parsed.templates) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const next = buildTemplate({
            name: item.name,
            notes: item.notes || '',
            profileDraft: JSON.parse(JSON.stringify(item.profileDraft || {})),
            createdAt: item.createdAt
        });
        importedTemplates.push(next);
        if (item.id) {
            templateIdMap.set(item.id, next.id);
        }
    }

    const importedProfiles = [];
    for (const item of parsed.profiles) {
        if (!item || typeof item !== 'object') {
            continue;
        }

        const mappedTemplateId = item.templateId
            ? (templateIdMap.get(item.templateId) || (templates.some((template) => template.id === item.templateId) ? item.templateId : ''))
            : '';
        const proxyId = item.proxyId && getProxy(item.proxyId) ? item.proxyId : '';

        importedProfiles.push(buildProfile({
            name: item.name,
            startUrl: item.startUrl,
            proxyId,
            projectId: item.projectId || '',
            templateId: mappedTemplateId,
            createdFrom: item.createdFrom || item.id || '',
            archivedAt: null,
            tags: Array.isArray(item.tags) ? JSON.parse(JSON.stringify(item.tags)) : (item.tags || ''),
            notes: item.notes || '',
            createdAt: item.createdAt,
            fingerprint: JSON.parse(JSON.stringify(item.fingerprint || {})),
            lastOpenedAt: null
        }));
    }

    if (!importedProfiles.length) {
        throw new Error('导入文件中没有可用的环境数据');
    }

    templates = normalizeTemplates([...importedTemplates, ...templates]);
    profiles = normalizeProfilesWithCodes([...importedProfiles, ...profiles]);
    await Promise.all([
        store.saveTemplates(templates),
        store.saveProfiles(profiles)
    ]);
    notifyState();

    return {
        canceled: false,
        imported: importedProfiles.length,
        templates: importedTemplates.length,
        filePath
    };
}

async function saveTemplate(payload = {}) {
    const next = buildTemplate(payload);
    const index = templates.findIndex((template) => template.id === next.id);
    if (index >= 0) {
        templates[index] = next;
    } else {
        templates.unshift(next);
    }

    templates = normalizeTemplates(templates);
    await store.saveTemplates(templates);
    notifyState();
    return next;
}

async function deleteTemplate(templateId) {
    if (!templates.some((template) => template.id === templateId)) {
        return true;
    }

    templates = templates.filter((template) => template.id !== templateId);
    profiles = profiles.map((profile) => (
        profile.templateId === templateId
            ? { ...profile, templateId: '' }
            : profile
    ));

    await Promise.all([
        store.saveTemplates(templates),
        store.saveProfiles(profiles)
    ]);
    notifyState();
    return true;
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
        const eventListeners = new Map();
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
                on(method, listener) {
                    if (!eventListeners.has(method)) {
                        eventListeners.set(method, new Set());
                    }
                    eventListeners.get(method).add(listener);
                    return () => {
                        const listeners = eventListeners.get(method);
                        if (!listeners) {
                            return;
                        }
                        listeners.delete(listener);
                        if (!listeners.size) {
                            eventListeners.delete(method);
                        }
                    };
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

            if (!payload) {
                return;
            }

            if (typeof payload.id !== 'number') {
                const listeners = eventListeners.get(payload.method);
                if (listeners?.size) {
                    listeners.forEach((listener) => {
                        try {
                            listener(payload.params || {});
                        } catch (error) {
                        }
                    });
                }
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

async function withProfileCdpSession(profileId, callback) {
    const profile = getProfile(profileId);
    if (!profile) {
        throw new Error('环境不存在');
    }
    if (profile.deletedAt) {
        throw new Error('环境已在回收站，请先恢复后再操作');
    }

    let runtime = runningProfiles.get(profileId);
    if (!runtime) {
        runtime = await openProfile(profileId, { requestId: `account-cookie-${Date.now()}` });
    }

    if (!runtime?.debugPort) {
        throw new Error('未能连接到环境调试端口');
    }

    const pageTarget = await waitForPageTarget(runtime.debugPort);
    const session = await createCdpSession(pageTarget.webSocketDebuggerUrl);

    try {
        await session.send('Page.enable');
        await session.send('Network.enable');
        return await callback(session, profile, runtime);
    } finally {
        session.close();
    }
}

async function captureProfileCookies(profileId) {
    return withProfileCdpSession(profileId, async (session) => {
        const result = await session.send('Network.getAllCookies');
        return Array.isArray(result?.cookies) ? result.cookies : [];
    });
}

async function applyProfileCookies(profileId, cookies = []) {
    const normalizedCookies = Array.isArray(cookies)
        ? cookies.map((cookie) => normalizeCookieForImport(cookie)).filter(Boolean)
        : [];

    if (!normalizedCookies.length) {
        throw new Error('Cookie 文件内容为空或格式不支持');
    }

    return withProfileCdpSession(profileId, async (session) => {
        await session.send('Network.clearBrowserCookies');
        await session.send('Network.setCookies', {
            cookies: normalizedCookies
        });
        return normalizedCookies.length;
    });
}

async function captureProfileLocalStorage(profileId) {
    const profile = getProfile(profileId);
    if (!profile) {
        throw new Error('环境不存在');
    }
    if (profile.deletedAt) {
        throw new Error('环境已在回收站，请先恢复后再操作');
    }

    let runtime = runningProfiles.get(profileId);
    if (!runtime) {
        runtime = await openProfile(profileId, { requestId: `account-storage-${Date.now()}` });
    }

    if (!runtime?.debugPort) {
        throw new Error('未能连接到环境调试端口');
    }

    const targets = await requestJsonFromLocal(`http://127.0.0.1:${runtime.debugPort}/json/list`, 1800);
    const pageTargets = Array.isArray(targets)
        ? targets.filter((target) => (
            target?.type === 'page'
            && target?.webSocketDebuggerUrl
            && /^https?:\/\//i.test(String(target.url || ''))
            && !/^https?:\/\/127\.0\.0\.1:\d+\/dashboard/i.test(String(target.url || ''))
        ))
        : [];

    const storages = [];
    for (const target of pageTargets) {
        const session = await createCdpSession(target.webSocketDebuggerUrl);
        try {
            await session.send('Runtime.enable');
            const result = await session.send('Runtime.evaluate', {
                expression: `(() => ({
                    origin: location.origin,
                    url: location.href,
                    items: Object.keys(localStorage).map((key) => ({
                        key,
                        value: localStorage.getItem(key)
                    }))
                }))()`,
                returnByValue: true
            });
            const payload = result?.result?.value;
            const normalized = normalizeLocalStoragePayload(payload);
            if (normalized.length) {
                storages.push(...normalized);
            }
        } finally {
            session.close();
        }
    }

    const deduped = [];
    const seenOrigins = new Set();
    for (const storage of storages) {
        if (!storage.items.length || seenOrigins.has(storage.origin)) {
            continue;
        }
        seenOrigins.add(storage.origin);
        deduped.push(storage);
    }

    if (!deduped.length) {
        throw new Error('未找到可导出的 LocalStorage，请先在绑定环境中打开目标站点');
    }

    return deduped;
}

async function applyProfileLocalStorage(profileId, origins = []) {
    const storages = normalizeLocalStoragePayload(origins);
    if (!storages.length) {
        throw new Error('LocalStorage 文件内容为空或格式不支持');
    }

    return withProfileCdpSession(profileId, async (session) => {
        await session.send('DOMStorage.enable');

        let importedItems = 0;
        for (const storage of storages) {
            const storageId = {
                securityOrigin: storage.origin,
                isLocalStorage: true
            };

            await session.send('DOMStorage.clear', { storageId });
            for (const item of storage.items) {
                await session.send('DOMStorage.setDOMStorageItem', {
                    storageId,
                    key: item.key,
                    value: item.value
                });
                importedItems += 1;
            }
        }

        return {
            origins: storages.length,
            items: importedItems
        };
    });
}

async function exportAccountCookies(payload = {}) {
    const account = getAccount(payload.accountId);
    if (!account) {
        throw new Error('账号不存在');
    }

    let cookies = [];
    if (account.profileId) {
        cookies = await captureProfileCookies(account.profileId);
        if (cookies.length) {
            await updateAccountRecord(account.id, {
                cookies: JSON.stringify(cookies, null, 2)
            });
        }
    }

    if (!cookies.length) {
        cookies = parseStoredCookies(account.cookies);
    }

    if (!cookies.length) {
        throw new Error('当前账号还没有可导出的 Cookie');
    }

    const defaultPath = path.join(
        app.getPath('documents'),
        `${sanitizeCookieExportFileName(account)}.cookies.json`
    );
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: '导出 Cookie',
        defaultPath,
        filters: [
            { name: 'Cookie JSON', extensions: ['json'] }
        ]
    });

    if (canceled || !filePath) {
        return { canceled: true };
    }

    await fs.writeJson(filePath, {
        schemaVersion: 1,
        type: 'xbrowser-account-cookies',
        exportedAt: Date.now(),
        accountId: account.id,
        platform: account.platform,
        profileId: account.profileId || '',
        cookies
    }, { spaces: 2 });

    return {
        canceled: false,
        exported: cookies.length,
        filePath
    };
}

async function importAccountCookies(payload = {}) {
    const account = getAccount(payload.accountId);
    if (!account) {
        throw new Error('账号不存在');
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '导入 Cookie',
        properties: ['openFile'],
        filters: [
            { name: 'Cookie JSON', extensions: ['json'] }
        ]
    });

    if (canceled || !filePaths.length) {
        return { canceled: true };
    }

    const filePath = filePaths[0];
    const raw = await fs.readJson(filePath);
    const cookies = parseStoredCookies(raw)
        .map((cookie) => normalizeCookieForImport(cookie))
        .filter(Boolean);

    if (!cookies.length) {
        throw new Error('Cookie 文件内容为空或格式不支持');
    }

    let applied = false;
    if (account.profileId) {
        await applyProfileCookies(account.profileId, cookies);
        applied = true;
    }

    await updateAccountRecord(account.id, {
        cookies: JSON.stringify(cookies, null, 2)
    });

    return {
        canceled: false,
        imported: cookies.length,
        applied
    };
}

async function exportAccountLocalStorage(payload = {}) {
    const account = getAccount(payload.accountId);
    if (!account) {
        throw new Error('账号不存在');
    }

    let origins = [];
    if (account.profileId) {
        origins = await captureProfileLocalStorage(account.profileId);
        if (origins.length) {
            await updateAccountRecord(account.id, {
                localStorage: JSON.stringify({ origins }, null, 2)
            });
        }
    }

    if (!origins.length) {
        origins = normalizeLocalStoragePayload(account.localStorage);
    }

    if (!origins.length) {
        throw new Error('当前账号还没有可导出的 LocalStorage');
    }

    const defaultPath = path.join(
        app.getPath('documents'),
        `${sanitizeLocalStorageExportFileName(account)}.local-storage.json`
    );
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: '导出 LocalStorage',
        defaultPath,
        filters: [
            { name: 'LocalStorage JSON', extensions: ['json'] }
        ]
    });

    if (canceled || !filePath) {
        return { canceled: true };
    }

    await fs.writeJson(filePath, {
        schemaVersion: 1,
        type: 'xbrowser-account-local-storage',
        exportedAt: Date.now(),
        accountId: account.id,
        platform: account.platform,
        profileId: account.profileId || '',
        origins
    }, { spaces: 2 });

    return {
        canceled: false,
        exportedOrigins: origins.length,
        exportedItems: countLocalStorageItems(origins),
        filePath
    };
}

async function importAccountLocalStorage(payload = {}) {
    const account = getAccount(payload.accountId);
    if (!account) {
        throw new Error('账号不存在');
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '导入 LocalStorage',
        properties: ['openFile'],
        filters: [
            { name: 'LocalStorage JSON', extensions: ['json'] }
        ]
    });

    if (canceled || !filePaths.length) {
        return { canceled: true };
    }

    const filePath = filePaths[0];
    const raw = await fs.readJson(filePath);
    const origins = normalizeLocalStoragePayload(raw);

    if (!origins.length) {
        throw new Error('LocalStorage 文件内容为空或格式不支持');
    }

    let applied = false;
    if (account.profileId) {
        await applyProfileLocalStorage(account.profileId, origins);
        applied = true;
    }

    await updateAccountRecord(account.id, {
        localStorage: JSON.stringify({ origins }, null, 2)
    });

    return {
        canceled: false,
        importedOrigins: origins.length,
        importedItems: countLocalStorageItems(origins),
        applied
    };
}

async function autoInjectAccountAssets(profileId) {
    const account = getPrimaryAccountForProfile(profileId);
    if (!account) {
        return {
            accountId: '',
            cookies: 0,
            storageOrigins: 0,
            storageItems: 0,
            injected: false
        };
    }

    let injected = false;
    let cookieCount = 0;
    let storageOrigins = 0;
    let storageItems = 0;

    const cookies = parseStoredCookies(account.cookies)
        .map((cookie) => normalizeCookieForImport(cookie))
        .filter(Boolean);
    if (cookies.length) {
        cookieCount = await applyProfileCookies(profileId, cookies);
        injected = true;
    }

    const origins = normalizeLocalStoragePayload(account.localStorage);
    if (origins.length) {
        const result = await applyProfileLocalStorage(profileId, origins);
        storageOrigins = Number(result?.origins || 0);
        storageItems = Number(result?.items || 0);
        injected = true;
    }

    if (injected) {
        await withProfileCdpSession(profileId, async (session) => {
            await session.send('Page.reload', { ignoreCache: false });
            return true;
        });
    }

    return {
        accountId: account.id,
        cookies: cookieCount,
        storageOrigins,
        storageItems,
        injected
    };
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

        if (fingerprint.geolocation?.mode === 'block') {
            try {
                await session.send('Emulation.clearGeolocationOverride');
            } catch (error) {
            }
        } else if (Number.isFinite(Number(fingerprint.geolocation?.latitude)) && Number.isFinite(Number(fingerprint.geolocation?.longitude))) {
            await session.send('Emulation.setGeolocationOverride', {
                latitude: Number(fingerprint.geolocation.latitude),
                longitude: Number(fingerprint.geolocation.longitude),
                accuracy: Math.max(1, Number(fingerprint.geolocation.accuracy) || 30)
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
            project: getProject(profile.projectId).name,
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
        store.saveTemplates(templates),
        store.saveSettings(settings),
        accountStore.saveAccounts(accounts)
    ]);
}

function buildState() {
    const activeProvider = getActiveAgentProvider();
    return {
        profiles: profiles.map(profile => ({
            ...profile,
            running: runningProfiles.has(profile.id)
        })),
        templates,
        accounts,
        settings,
        runtime: {
            dataDir: store.dataDir,
            apiUrl: settings?.api?.enabled ? `http://127.0.0.1:${settings.api.port}` : '',
            mihomoBinary: getBinaryPath(BASE_DIR),
            mihomoReady: fs.existsSync(getBinaryPath(BASE_DIR)),
            browserBinary: resolveBrowserExecutable(BASE_DIR),
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
            sync: syncController ? syncController.getState() : createEmptySyncState(),
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
    if (profile.deletedAt) throw new Error('环境已在回收站，请先恢复后再启动');

    const existing = runningProfiles.get(profileId);
    if (existing?.browserPid) {
        reportLaunchProgress(profile, requestId, 100, 'completed', '窗口已在运行', { done: true });
        return existing;
    }

    reportLaunchProgress(profile, requestId, 6, 'prepare', '校验浏览器环境');

    let browserBinary = resolveBrowserExecutable(BASE_DIR);
    if (!browserBinary) {
        reportLaunchProgress(profile, requestId, 8, 'browser-download', '准备内置浏览器内核');
        await ensureBundledBrowser(BASE_DIR);
        browserBinary = resolveBrowserExecutable(BASE_DIR);
    }
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
        const profileExtensions = (profile.extensionIds || [])
            .map((extensionId) => getExtension(extensionId))
            .filter((extension) => extension && extension.enabled && extension.path && fs.existsSync(extension.path));
        const extensionDirs = [extensionDir].concat(profileExtensions.map((extension) => extension.path));
        const startUrl = isBuiltInStartUrl(profile.startUrl) ? getDefaultStartPageUrl(profile.id) : profile.startUrl;
        debugPort = await getPort();
        const runtime = {
            browserPid: null,
            browserBinary,
            extensionDir,
            extensionDirs,
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
            `--disable-extensions-except=${extensionDirs.join(',')}`,
            `--load-extension=${extensionDirs.join(',')}`,
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

        const boundAccount = getPrimaryAccountForProfile(profile.id);
        if (boundAccount) {
            reportLaunchProgress(profile, requestId, 96, 'account-assets', '同步已绑定账号数据');
            try {
                const injection = await autoInjectAccountAssets(profile.id);
                if (injection.injected) {
                    reportLaunchProgress(
                        profile,
                        requestId,
                        98,
                        'account-assets-ready',
                        `已注入账号数据：Cookie ${injection.cookies} 条，Storage ${injection.storageOrigins} 站点/${injection.storageItems} 项`
                    );
                } else {
                    reportLaunchProgress(profile, requestId, 98, 'account-assets-skip', '已绑定账号，但没有可注入的数据');
                }
            } catch (error) {
                reportLaunchProgress(profile, requestId, 98, 'account-assets-error', `账号自动注入失败：${error.message || 'unknown'}`);
            }
        }

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
        groupId: subscription.id,
        provider: subscription.name
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
            nodeIntegration: false,
            sandbox: false
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
            nodeIntegration: false,
            sandbox: false
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
    templates = normalizeTemplates(await store.loadTemplates());
    settings = ensureProjectSettings(ensureAgentSettings(await store.loadSettings()));
    accounts = sanitizeAccountBindings(normalizeAccounts(await accountStore.loadAccounts()));
    profiles = normalizeProfilesWithCodes(profiles.map((profile) => ({
        ...profile,
        projectId: getProject(profile.projectId).id,
        extensionIds: Array.isArray(profile.extensionIds)
            ? profile.extensionIds.filter((extensionId) => !!getExtension(extensionId))
            : []
    })));
    await store.saveProfiles(profiles);
    await store.saveTemplates(templates);
    await store.saveSettings(settings);
    await accountStore.saveAccounts(accounts);

    agentController = createAgentController({
        runtimeDir: store.runtimeDir,
        getAgentSettings: () => ({
            provider: getActiveAgentProvider(),
            profiles,
            toolTimeoutMs: settings.agent.toolTimeoutMs,
            maxExecutionSteps: settings.agent.maxExecutionSteps
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
    syncController = createProfileSyncController({
        getProfile: (profileId) => getProfile(profileId),
        getRuntime: (profileId) => runningProfiles.get(profileId) || null,
        ensureRuntime: async (profileId) => {
            if (!runningProfiles.has(profileId)) {
                await openProfile(profileId, { requestId: `sync-${Date.now()}` });
            }
            return runningProfiles.get(profileId) || null;
        },
        waitForPageTarget: async (debugPort) => waitForPageTarget(debugPort),
        createCdpSession: async (webSocketDebuggerUrl) => createCdpSession(webSocketDebuggerUrl),
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
    ipcMain.handle('profile:clone', async (event, id) => cloneProfile(id));
    ipcMain.handle('profile:batch-create', async (event, payload) => batchCreateProfiles(payload || {}));
    ipcMain.handle('profile:export', async (event, payload) => exportProfilesPackage(payload || {}));
    ipcMain.handle('profile:import', async () => importProfilesPackage());
    ipcMain.handle('profile:trash', async (event, id) => trashProfile(id));
    ipcMain.handle('profile:restore', async (event, id) => restoreProfile(id));
    ipcMain.handle('profile:destroy', async (event, id) => destroyProfile(id));
    ipcMain.handle('profile:move-to-project', async (event, payload) => moveProfilesToProject(payload || {}));
    ipcMain.handle('profile:delete', async (event, id) => trashProfile(id));
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
            groupId: 'manual',
            provider: payload.name || '手动导入'
        });
        settings.proxies.unshift(record);
        await store.saveSettings(settings);
        notifyState();
        return record;
    });
    ipcMain.handle('proxy:batch-assign', async (event, payload) => batchAssignProxy(payload || {}));
    ipcMain.handle('proxy:refresh-geo', async (event, payload) => refreshProxyGeo(payload || {}));
    ipcMain.handle('proxy:allocate', async (event, payload) => allocateProxy(payload || {}));
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
        await refreshProxyGeo({ id });
        return getProxy(id);
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
    ipcMain.handle('template:list', async () => templates);
    ipcMain.handle('template:save', async (event, payload) => saveTemplate(payload || {}));
    ipcMain.handle('template:delete', async (event, id) => deleteTemplate(id));
    ipcMain.handle('project:create', async (event, payload) => createProject(payload || {}));
    ipcMain.handle('project:update', async (event, payload) => updateProject(payload || {}));
    ipcMain.handle('project:delete', async (event, id) => deleteProject(id));
    ipcMain.handle('extension:list', async () => getExtensions());
    ipcMain.handle('extension:import-unpacked', async () => importUnpackedExtension());
    ipcMain.handle('extension:import-crx', async () => importCrxExtension());
    ipcMain.handle('extension:toggle', async (event, payload) => toggleExtension(payload || {}));
    ipcMain.handle('extension:batch-assign', async (event, payload) => batchAssignExtension(payload || {}));
    ipcMain.handle('extension:delete', async (event, id) => deleteExtension(id));
    ipcMain.handle('account:list', async () => accounts);
    ipcMain.handle('account:create', async (event, payload) => createAccount(payload || {}));
    ipcMain.handle('account:update', async (event, payload) => updateAccount(payload || {}));
    ipcMain.handle('account:delete', async (event, id) => deleteAccount(id));
    ipcMain.handle('account:bind-profile', async (event, payload) => bindAccountProfile(payload || {}));
    ipcMain.handle('account:import-cookies', async (event, payload) => importAccountCookies(payload || {}));
    ipcMain.handle('account:export-cookies', async (event, payload) => exportAccountCookies(payload || {}));
    ipcMain.handle('account:import-storage', async (event, payload) => importAccountLocalStorage(payload || {}));
    ipcMain.handle('account:export-storage', async (event, payload) => exportAccountLocalStorage(payload || {}));
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
        const providerName = path.basename(filePath, path.extname(filePath));
        const proxies = parseSubscriptionContent(content, providerName);
        const records = proxies.map(proxy => proxyRecordFromParsed(proxy, {
            source: 'file',
            groupId: 'manual',
            provider: providerName
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
        settings = ensureProjectSettings(ensureAgentSettings(settings));
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
            prompt: payload?.prompt || '',
            concurrency: payload?.concurrency,
            maxRetries: payload?.maxRetries,
            failureStrategy: payload?.failureStrategy
        });
    });
    ipcMain.handle('agent:batch:export', async () => {
        const exportPayload = agentController.getBatchExportPayload();
        const fileName = `xbrowser-agent-batch-${new Date().toISOString().slice(0, 10)}.json`;
        const defaultPath = path.join(app.getPath('documents'), fileName);
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: '导出 Agent 批量结果',
            defaultPath,
            filters: [
                { name: 'JSON 文件', extensions: ['json'] }
            ]
        });

        if (canceled || !filePath) {
            return { canceled: true, exported: 0 };
        }

        await fs.writeJson(filePath, exportPayload, { spaces: 2 });
        agentController.markBatchExport(filePath);
        return {
            canceled: false,
            exported: exportPayload.batch?.tasks?.length || 0,
            filePath
        };
    });
    ipcMain.handle('sync:start', async (event, payload) => syncController.startSession(payload || {}));
    ipcMain.handle('sync:stop', async () => syncController.stopSession());
    ipcMain.handle('sync:get-state', async () => syncController.getState());
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
            proxyAllocation: { ...(settings.proxyAllocation || {}), ...(payload.proxyAllocation || {}) },
            api: { ...settings.api, ...(payload.api || {}) },
            agent: { ...settings.agent, ...(payload.agent || {}) },
            ui: { ...settings.ui, ...(payload.ui || {}) }
        };
        settings = ensureProjectSettings(ensureAgentSettings(settings));
        await store.saveSettings(settings);
        await restartApiServer();
        notifyState();
        return settings;
    });
    ipcMain.handle('app:open-data-dir', async () => shell.openPath(store.dataDir));
});

app.on('window-all-closed', async () => {
    if (syncController) {
        await syncController.stopSession();
    }
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
