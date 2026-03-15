const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const http = require('http');
const net = require('net');
const os = require('os');
const { URL } = require('url');
const { spawn, exec } = require('child_process');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { getPackedBinDir } = require('./mihomo-download');

function safeBase64Decode(str) {
    if (!str) return '';
    let value = String(str).trim();
    const padding = value.length % 4;
    if (padding) value += '='.repeat(4 - padding);
    value = value.replace(/-/g, '+').replace(/_/g, '/');
    try {
        return Buffer.from(value, 'base64').toString('utf8');
    } catch (error) {
        return str;
    }
}

function sanitizeName(name, fallback = 'Node') {
    return String(name || fallback)
        .replace(/[,\[\]\{\}'"]/g, '_')
        .replace(/\s+/g, ' ')
        .trim() || fallback;
}

function uniqueName(name, usedNames) {
    let candidate = sanitizeName(name);
    if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
    }
    let suffix = 2;
    while (usedNames.has(`${candidate}-${suffix}`)) suffix++;
    candidate = `${candidate}-${suffix}`;
    usedNames.add(candidate);
    return candidate;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function stripInternal(proxy) {
    const next = clone(proxy);
    delete next.__raw;
    delete next.url;
    delete next.remark;
    return next;
}

function getParams(urlObj) {
    const params = {};
    urlObj.searchParams.forEach((value, key) => {
        params[key] = value;
    });
    return params;
}

function normalizeProxy(proxy, fallbackName = 'Node') {
    const next = stripInternal(proxy);
    next.name = sanitizeName(next.name || next.remark || fallbackName, fallbackName);
    if (next.type === 'socks') next.type = 'socks5';
    if (next.type === 'anytls') next.type = 'trojan';
    return next;
}

function parsePlugin(pluginValue) {
    if (!pluginValue) return {};
    const parts = pluginValue.split(';').filter(Boolean);
    const plugin = parts.shift();
    const kv = {};
    for (const part of parts) {
        const [key, ...rest] = part.split('=');
        kv[key] = rest.join('=');
    }
    if (plugin.includes('obfs')) {
        return {
            plugin: 'obfs',
            'plugin-opts': {
                mode: kv.obfs || 'http',
                host: kv['obfs-host'] || ''
            }
        };
    }
    return {
        plugin,
        'plugin-opts': kv
    };
}

function parseVmess(link, fallbackName) {
    const config = JSON.parse(safeBase64Decode(link.slice('vmess://'.length)));
    const network = config.net || 'tcp';
    const proxy = {
        name: sanitizeName(config.ps || fallbackName, fallbackName),
        type: 'vmess',
        server: config.add,
        port: Number(config.port),
        uuid: config.id,
        alterId: Number(config.aid || 0),
        cipher: config.scy || 'auto',
        udp: true,
        tls: config.tls === 'tls',
        servername: config.sni || config.host || undefined,
        'skip-cert-verify': true,
        network,
        'client-fingerprint': config.fp || 'chrome',
    };

    if (network === 'ws') {
        proxy['ws-opts'] = { path: config.path || '/', headers: { Host: config.host || '' } };
    } else if (network === 'grpc') {
        proxy['grpc-opts'] = { 'grpc-service-name': config.path || config.serviceName || '' };
    }

    proxy.__raw = link;
    return normalizeProxy(proxy, fallbackName);
}

function parseVless(link, fallbackName) {
    const urlObj = new URL(link);
    const params = getParams(urlObj);
    const network = params.type || 'tcp';
    const security = params.security || 'none';
    const proxy = {
        name: sanitizeName(decodeURIComponent(urlObj.hash.slice(1)) || fallbackName, fallbackName),
        type: 'vless',
        server: urlObj.hostname,
        port: Number(urlObj.port),
        uuid: urlObj.username,
        cipher: params.encryption || 'none',
        udp: true,
        tls: security === 'tls' || security === 'reality',
        servername: params.sni || params.host || urlObj.hostname,
        'skip-cert-verify': params.insecure === '1',
        network,
        flow: params.flow || undefined,
        'client-fingerprint': params.fp || undefined,
    };
    if (security === 'reality') {
        proxy['reality-opts'] = { 'public-key': params.pbk || '', 'short-id': params.sid || '' };
    }
    if (network === 'ws') {
        proxy['ws-opts'] = { path: params.path || '/', headers: { Host: params.host || params.sni || '' } };
    } else if (network === 'grpc') {
        proxy['grpc-opts'] = { 'grpc-service-name': params.serviceName || '' };
    }
    proxy.__raw = link;
    return normalizeProxy(proxy, fallbackName);
}

function parseTrojan(link, fallbackName) {
    const urlObj = new URL(link);
    const params = getParams(urlObj);
    const network = params.type || 'tcp';
    const proxy = {
        name: sanitizeName(decodeURIComponent(urlObj.hash.slice(1)) || fallbackName, fallbackName),
        type: 'trojan',
        server: urlObj.hostname,
        port: Number(urlObj.port),
        password: urlObj.username,
        udp: true,
        tls: true,
        sni: params.sni || urlObj.hostname,
        'skip-cert-verify': params.insecure === '1',
        network,
        'client-fingerprint': params.fp || 'chrome',
    };
    if (network === 'ws') {
        proxy['ws-opts'] = { path: params.path || '/', headers: { Host: params.host || urlObj.hostname } };
    } else if (network === 'grpc') {
        proxy['grpc-opts'] = { 'grpc-service-name': params.serviceName || '' };
    }
    proxy.__raw = link;
    return normalizeProxy(proxy, fallbackName);
}

function parseSS(link, fallbackName) {
    const urlObj = new URL(link);
    const rawUser = urlObj.password ? `${urlObj.username}:${urlObj.password}` : safeBase64Decode(urlObj.username);
    const separator = rawUser.indexOf(':');
    if (separator === -1) throw new Error('Invalid ss link');
    const proxy = {
        name: sanitizeName(decodeURIComponent(urlObj.hash.slice(1)) || fallbackName, fallbackName),
        type: 'ss',
        server: urlObj.hostname,
        port: Number(urlObj.port),
        cipher: rawUser.slice(0, separator),
        password: rawUser.slice(separator + 1),
        udp: true,
        ...parsePlugin(urlObj.searchParams.get('plugin'))
    };
    proxy.__raw = link;
    return normalizeProxy(proxy, fallbackName);
}

function parseSocks(link, fallbackName) {
    const urlObj = new URL(link);
    let username = decodeURIComponent(urlObj.username || '');
    let password = decodeURIComponent(urlObj.password || '');
    if (username && !password) {
        const decoded = safeBase64Decode(username);
        if (decoded.includes(':')) {
            const separator = decoded.indexOf(':');
            username = decoded.slice(0, separator);
            password = decoded.slice(separator + 1);
        }
    }
    const proxy = {
        name: sanitizeName(decodeURIComponent(urlObj.hash.slice(1)) || fallbackName, fallbackName),
        type: 'socks5',
        server: urlObj.hostname,
        port: Number(urlObj.port || 1080),
        udp: true,
    };
    if (username) proxy.username = username;
    if (password) proxy.password = password;
    proxy.__raw = link;
    return normalizeProxy(proxy, fallbackName);
}

function parseHttp(link, fallbackName) {
    const urlObj = new URL(link);
    const proxy = {
        name: sanitizeName(decodeURIComponent(urlObj.hash.slice(1)) || fallbackName, fallbackName),
        type: 'http',
        server: urlObj.hostname,
        port: Number(urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80)),
        tls: urlObj.protocol === 'https:'
    };
    if (urlObj.username) proxy.username = decodeURIComponent(urlObj.username);
    if (urlObj.password) proxy.password = decodeURIComponent(urlObj.password);
    proxy.__raw = link;
    return normalizeProxy(proxy, fallbackName);
}

function parseHysteria2(link, fallbackName) {
    const normalizedLink = link.startsWith('hy2://') ? `hysteria2://${link.slice('hy2://'.length)}` : link;
    const urlObj = new URL(normalizedLink);
    const params = getParams(urlObj);
    const proxy = {
        name: sanitizeName(decodeURIComponent(urlObj.hash.slice(1)) || fallbackName, fallbackName),
        type: 'hysteria2',
        server: urlObj.hostname,
        port: Number(urlObj.port),
        password: urlObj.username || '',
        sni: params.sni || urlObj.hostname,
        'skip-cert-verify': params.insecure === '1',
        obfs: params.obfs || undefined,
        'obfs-password': params['obfs-password'] || undefined,
        up: params.up || undefined,
        down: params.down || undefined,
        alpn: params.alpn ? params.alpn.split(',') : undefined,
    };
    proxy.__raw = link;
    return normalizeProxy(proxy, fallbackName);
}

function parseTuic(link, fallbackName) {
    const urlObj = new URL(link);
    const params = getParams(urlObj);
    const proxy = {
        name: sanitizeName(decodeURIComponent(urlObj.hash.slice(1)) || fallbackName, fallbackName),
        type: 'tuic',
        server: urlObj.hostname,
        port: Number(urlObj.port),
        uuid: urlObj.username,
        password: urlObj.password,
        sni: params.sni || urlObj.hostname,
        ip: params.ip || undefined,
        'skip-cert-verify': params.insecure === '1',
        'congestion-controller': params.congestion_control || 'bbr',
        'udp-relay-mode': params.udp_relay_mode || 'native',
        'reduce-rtt': true,
        'heartbeat-interval': 10000,
        'request-timeout': 8000,
    };
    proxy.__raw = link;
    return normalizeProxy(proxy, fallbackName);
}

function parseIpPort(link, fallbackName) {
    const parts = String(link).trim().split(':');
    if (parts.length !== 2 && parts.length !== 4) throw new Error('Unsupported proxy format');
    const proxy = {
        name: sanitizeName(fallbackName, fallbackName),
        type: 'socks5',
        server: parts[0],
        port: Number(parts[1]),
        udp: true,
    };
    if (parts.length === 4) {
        proxy.username = parts[2];
        proxy.password = parts[3];
    }
    proxy.__raw = link;
    return normalizeProxy(proxy, fallbackName);
}

function parseProxyLink(link, fallbackName = 'Node') {
    const input = String(link || '').trim();
    if (!input) throw new Error('Empty proxy');
    if (input.startsWith('vmess://')) return parseVmess(input, fallbackName);
    if (input.startsWith('vless://')) return parseVless(input, fallbackName);
    if (input.startsWith('trojan://')) return parseTrojan(input, fallbackName);
    if (input.startsWith('ss://')) return parseSS(input, fallbackName);
    if (input.startsWith('socks://') || input.startsWith('socks5://')) return parseSocks(input, fallbackName);
    if (input.startsWith('http://') || input.startsWith('https://')) return parseHttp(input, fallbackName);
    if (input.startsWith('hy2://') || input.startsWith('hysteria2://')) return parseHysteria2(input, fallbackName);
    if (input.startsWith('tuic://')) return parseTuic(input, fallbackName);
    if (input.includes(':') && !input.includes('://')) return parseIpPort(input, fallbackName);
    throw new Error('Unsupported proxy protocol');
}

function parseSubscriptionContent(content, fallbackPrefix = 'Node') {
    if (typeof content !== 'string' || !content.trim()) throw new Error('Empty subscription content');

    try {
        const parsed = yaml.load(content);
        if (parsed && Array.isArray(parsed.proxies)) {
            const used = new Set();
            return parsed.proxies.map((proxy, index) => {
                const next = normalizeProxy(proxy, `${fallbackPrefix} ${index + 1}`);
                next.name = uniqueName(next.name, used);
                return next;
            });
        }
    } catch (error) {
    }

    let decoded = content.trim();
    if (!decoded.includes('://')) {
        const maybe = safeBase64Decode(decoded);
        if (maybe && maybe !== decoded) decoded = maybe;
    }

    const used = new Set();
    const proxies = [];
    for (const line of decoded.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const proxy = parseProxyLink(trimmed, `${fallbackPrefix} ${proxies.length + 1}`);
            proxy.name = uniqueName(proxy.name, used);
            proxies.push(proxy);
        } catch (error) {
        }
    }

    if (!proxies.length) throw new Error('No valid mihomo nodes found');
    return proxies;
}

function resolveProxyInput(input, fallbackName = 'Node') {
    if (!input) throw new Error('Proxy is required');
    if (typeof input === 'string') return parseProxyLink(input, fallbackName);
    if (input.proxy) return normalizeProxy(input.proxy, input.name || input.remark || fallbackName);
    if (input.type) return normalizeProxy(input, fallbackName);
    if (input.url) return parseProxyLink(input.url, input.name || input.remark || fallbackName);
    throw new Error('Unsupported proxy input');
}

function buildConfigBase(logLevel) {
    return {
        'allow-lan': false,
        mode: 'rule',
        'log-level': logLevel,
        ipv6: false,
        proxies: [],
        'proxy-groups': [],
        rules: [],
    };
}

function generateMihomoConfig(proxyInput, mixedPort, controllerPort, upstreamProxy = null) {
    const usedNames = new Set();
    const proxy = resolveProxyInput(proxyInput, 'Profile Proxy');
    proxy.name = uniqueName(proxy.name, usedNames);

    const config = buildConfigBase('warning');
    config['mixed-port'] = mixedPort;
    config['external-controller'] = `127.0.0.1:${controllerPort}`;

    const proxies = [];
    if (upstreamProxy) {
        const dialer = resolveProxyInput(upstreamProxy, 'Dialer Proxy');
        dialer.name = uniqueName(dialer.name, usedNames);
        proxy['dialer-proxy'] = dialer.name;
        proxies.push(stripInternal(dialer));
    }
    proxies.push(stripInternal(proxy));

    config.proxies = proxies;
    config['proxy-groups'] = [{
        name: 'PROXY',
        type: 'select',
        proxies: [proxy.name]
    }];
    config.rules = ['MATCH,PROXY'];
    return config;
}

function getBinaryPath(baseDir) {
    const binaryName = process.platform === 'win32' ? 'mihomo.exe' : 'mihomo';
    const candidates = [
        path.join(baseDir, 'bin', `${process.platform}-${process.arch}`, binaryName),
        path.join(baseDir, 'bin', binaryName),
        path.join(getPackedBinDir(), `${process.platform}-${process.arch}`, binaryName),
        path.join(getPackedBinDir(), binaryName),
        path.join(baseDir, 'tosocket', 'bin', 'mihomo.exe')
    ];
    return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 8000, pollMs = 150) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();

        const attempt = () => {
            const socket = net.connect({ port, host });
            let settled = false;

            const finish = (handler, value) => {
                if (settled) return;
                settled = true;
                try {
                    socket.destroy();
                } catch (error) {
                }
                handler(value);
            };

            socket.setTimeout(Math.min(pollMs, 1000));
            socket.once('connect', () => finish(resolve, true));
            socket.once('timeout', () => finish(handleRetry));
            socket.once('error', () => finish(handleRetry));
        };

        const handleRetry = () => {
            if (Date.now() - startedAt >= timeoutMs) {
                reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
                return;
            }
            setTimeout(attempt, pollMs);
        };

        attempt();
    });
}

async function waitForMihomoReady({ mixedPort, controllerPort, timeoutMs = 8000 }) {
    await Promise.all([
        waitForPort(mixedPort, '127.0.0.1', timeoutMs),
        waitForPort(controllerPort, '127.0.0.1', timeoutMs)
    ]);
}

async function startCore({ baseDir, runtimeDir, profileId, proxyInput, upstreamProxy, mixedPort, controllerPort }) {
    const binaryPath = getBinaryPath(baseDir);
    if (!(await fs.pathExists(binaryPath))) {
        throw new Error(`Mihomo core not found: ${binaryPath}`);
    }

    const config = generateMihomoConfig(proxyInput, mixedPort, controllerPort, upstreamProxy);
    const configPath = path.join(runtimeDir, `${profileId}.yaml`);
    const logPath = path.join(runtimeDir, `${profileId}.log`);
    await fs.writeFile(configPath, yaml.dump(config, { lineWidth: -1, noRefs: true }));
    const logFd = fs.openSync(logPath, 'a');
    const child = spawn(binaryPath, ['-f', configPath], {
        cwd: path.dirname(binaryPath),
        stdio: ['ignore', logFd, logFd],
        windowsHide: true
    });

    return {
        binaryPath,
        configPath,
        logPath,
        logFd,
        process: child
    };
}

function stopProcess(pid) {
    return new Promise((resolve) => {
        if (!pid) {
            resolve();
            return;
        }
        if (os.platform() === 'win32') {
            exec(`taskkill /PID ${pid} /T /F`, () => resolve());
            return;
        }
        try {
            process.kill(-pid, 'SIGTERM');
        } catch (error) {
            try {
                process.kill(pid, 'SIGTERM');
            } catch (nestedError) {
            }
        }
        resolve();
    });
}

async function testProxyLatency({ baseDir, runtimeDir, proxyInput, mixedPort, controllerPort }) {
    const core = await startCore({
        baseDir,
        runtimeDir,
        profileId: `latency-${Date.now()}`,
        proxyInput,
        mixedPort,
        controllerPort
    });

    try {
        await waitForMihomoReady({ mixedPort, controllerPort });
        const start = Date.now();
        const agent = new SocksProxyAgent(`socks5://127.0.0.1:${mixedPort}`);
        const result = await new Promise((resolve) => {
            const req = http.get('http://cp.cloudflare.com/generate_204', { agent, timeout: 5000 }, (res) => {
                if (res.statusCode === 204) {
                    resolve({ ok: true, latency: Date.now() - start });
                } else {
                    resolve({ ok: false, latency: -1 });
                }
            });
            req.on('timeout', () => {
                req.destroy();
                resolve({ ok: false, latency: -1 });
            });
            req.on('error', () => resolve({ ok: false, latency: -1 }));
        });
        return result;
    } finally {
        await stopProcess(core.process.pid);
        try { fs.closeSync(core.logFd); } catch (error) { }
    }
}

module.exports = {
    getBinaryPath,
    parseProxyLink,
    parseSubscriptionContent,
    resolveProxyInput,
    generateMihomoConfig,
    startCore,
    waitForPort,
    waitForMihomoReady,
    stopProcess,
    testProxyLatency,
};
