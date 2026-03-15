const path = require('path');
const fs = require('fs-extra');

function escapeForScript(value) {
    return JSON.stringify(value);
}

function buildUserAgentData(fingerprint) {
    const ua = fingerprint.userAgent || '';
    const chromeMatch = ua.match(/Chrome\/(\d+)\.(\d+)\.(\d+)\.(\d+)/i);
    const major = chromeMatch ? chromeMatch[1] : '145';
    const platform = /Mac/i.test(fingerprint.platform) ? 'macOS' : 'Windows';
    const architecture = platform === 'macOS' && /Apple M\d/i.test(fingerprint.webglRenderer || '') ? 'arm' : 'x86';
    return {
        brands: [
            { brand: 'Chromium', version: major },
            { brand: 'Google Chrome', version: major },
            { brand: 'Not=A?Brand', version: '24' }
        ],
        mobile: false,
        platform,
        architecture,
        bitness: '64',
        formFactors: ['Desktop'],
        fullVersionList: [
            { brand: 'Chromium', version: major },
            { brand: 'Google Chrome', version: major },
            { brand: 'Not=A?Brand', version: '24' }
        ],
        model: '',
        platformVersion: platform === 'macOS' ? '10.15.7' : '10.0.0',
        uaFullVersion: chromeMatch ? `${chromeMatch[1]}.${chromeMatch[2]}.${chromeMatch[3]}.${chromeMatch[4]}` : '145.0.0.0',
        wow64: false
    };
}

function buildTimezoneOffsetMap() {
    return {
        UTC: 0,
        'Asia/Hong_Kong': -480,
        'Asia/Singapore': -480,
        'Europe/Amsterdam': -60,
        'America/New_York': 300
    };
}

function createPageScript(fingerprint) {
    const userAgentData = buildUserAgentData(fingerprint);
    const timezoneOffsets = buildTimezoneOffsetMap();

    return `
(() => {
    const fingerprint = ${escapeForScript(fingerprint)};
    const userAgentDataSeed = ${escapeForScript(userAgentData)};
    const timezoneOffsets = ${escapeForScript(timezoneOffsets)};

    const redefine = (target, key, getter) => {
        if (!target) return;
        try {
            Object.defineProperty(target, key, {
                configurable: true,
                enumerable: true,
                get: getter
            });
        } catch (error) {
        }
    };

    const redefineValue = (target, key, value) => redefine(target, key, () => value);
    const randomNoise = (seed, offset) => ((Math.sin(seed * 97 + offset * 31) + 1) / 2) * 0.0000001;
    const sanitizeCandidate = (candidate) => {
        if (!candidate) return candidate;
        let value = String(candidate);
        value = value.replace(/^a=/gm, '');
        if (/(^|\\s)typ host(\\s|$)/i.test(value)) return '';
        if (/(^|\\s)(10\\.|127\\.|172\\.(1[6-9]|2\\d|3[0-1])\\.|192\\.168\\.)/i.test(value)) return '';
        return value;
    };
    const sanitizeSdp = (sdp) => {
        if (!sdp) return sdp;
        return String(sdp)
            .split('\\n')
            .filter(line => {
                const trimmed = line.trim();
                if (!trimmed.startsWith('a=candidate:')) return true;
                return !!sanitizeCandidate(trimmed);
            })
            .join('\\n');
    };

    const mimeTypeArray = [];
    const pluginArray = [];

    fingerprint.plugins.forEach((pluginSeed, pluginIndex) => {
        const plugin = {
            name: pluginSeed.name,
            filename: pluginSeed.filename,
            description: pluginSeed.description,
            length: pluginSeed.mimeTypes.length,
            item(index) {
                return this[index] || null;
            },
            namedItem(name) {
                return Object.values(this).find(item => item && item.type === name) || null;
            }
        };

        pluginSeed.mimeTypes.forEach((mimeSeed, mimeIndex) => {
            const mimeType = {
                type: mimeSeed.type,
                suffixes: mimeSeed.suffixes,
                description: mimeSeed.description,
                enabledPlugin: plugin
            };
            plugin[mimeIndex] = mimeType;
            plugin[mimeSeed.type] = mimeType;
            mimeTypeArray.push(mimeType);
        });

        pluginArray.push(plugin);
    });

    pluginArray.forEach((plugin, index) => {
        pluginArray[index] = plugin;
        pluginArray[plugin.name] = plugin;
    });
    mimeTypeArray.forEach((mimeType, index) => {
        mimeTypeArray[index] = mimeType;
        mimeTypeArray[mimeType.type] = mimeType;
    });

    pluginArray.item = index => pluginArray[index] || null;
    pluginArray.namedItem = name => pluginArray[name] || null;
    pluginArray.refresh = () => undefined;
    mimeTypeArray.item = index => mimeTypeArray[index] || null;
    mimeTypeArray.namedItem = name => mimeTypeArray[name] || null;

    try {
        Object.setPrototypeOf(pluginArray, PluginArray.prototype);
        Object.setPrototypeOf(mimeTypeArray, MimeTypeArray.prototype);
        pluginArray.forEach(plugin => {
            Object.setPrototypeOf(plugin, Plugin.prototype);
            for (let i = 0; i < plugin.length; i++) {
                Object.setPrototypeOf(plugin[i], MimeType.prototype);
            }
        });
    } catch (error) {
    }

    const userAgentData = {
        brands: userAgentDataSeed.brands,
        mobile: userAgentDataSeed.mobile,
        platform: userAgentDataSeed.platform,
        getHighEntropyValues(hints = []) {
            const picked = {};
            for (const hint of hints) {
                if (hint in userAgentDataSeed) picked[hint] = userAgentDataSeed[hint];
            }
            return Promise.resolve(picked);
        },
        toJSON() {
            return {
                brands: this.brands,
                mobile: this.mobile,
                platform: this.platform
            };
        }
    };

    const connection = {
        downlink: fingerprint.connection.downlink,
        effectiveType: fingerprint.connection.effectiveType,
        rtt: fingerprint.connection.rtt,
        saveData: false,
        type: 'wifi',
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return false; }
    };

    const mediaDevices = {
        enumerateDevices() {
            return Promise.resolve(fingerprint.mediaDevices.map(device => ({
                deviceId: device.deviceId,
                groupId: '',
                kind: device.kind,
                label: device.label,
                toJSON() {
                    return {
                        deviceId: this.deviceId,
                        groupId: this.groupId,
                        kind: this.kind,
                        label: this.label
                    };
                }
            })));
        },
        getSupportedConstraints() {
            return {
                width: true,
                height: true,
                aspectRatio: true,
                frameRate: true,
                facingMode: true,
                resizeMode: true,
                sampleRate: true,
                sampleSize: true,
                echoCancellation: true,
                autoGainControl: true,
                noiseSuppression: true
            };
        },
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return false; }
    };

    redefineValue(Navigator.prototype, 'userAgent', fingerprint.userAgent);
    redefineValue(Navigator.prototype, 'appVersion', fingerprint.userAgent.replace(/^Mozilla\\//, '5.0 '));
    redefineValue(Navigator.prototype, 'platform', fingerprint.platform);
    redefineValue(Navigator.prototype, 'language', fingerprint.language);
    redefineValue(Navigator.prototype, 'languages', fingerprint.languages);
    redefineValue(Navigator.prototype, 'hardwareConcurrency', fingerprint.hardwareConcurrency);
    redefineValue(Navigator.prototype, 'deviceMemory', fingerprint.deviceMemory);
    redefineValue(Navigator.prototype, 'maxTouchPoints', fingerprint.maxTouchPoints || 0);
    redefineValue(Navigator.prototype, 'webdriver', false);
    redefineValue(Navigator.prototype, 'vendor', fingerprint.vendor || 'Google Inc.');
    redefineValue(Navigator.prototype, 'productSub', fingerprint.productSub || '20030107');
    redefineValue(Navigator.prototype, 'pdfViewerEnabled', fingerprint.pdfViewerEnabled !== false);
    redefineValue(Navigator.prototype, 'plugins', pluginArray);
    redefineValue(Navigator.prototype, 'mimeTypes', mimeTypeArray);
    redefineValue(Navigator.prototype, 'userAgentData', userAgentData);
    redefineValue(Navigator.prototype, 'connection', connection);
    redefineValue(Navigator.prototype, 'onLine', true);
    redefineValue(Navigator.prototype, 'mediaDevices', mediaDevices);
    redefineValue(Navigator.prototype, 'cookieEnabled', true);
    redefineValue(Navigator.prototype, 'doNotTrack', null);

    redefineValue(screen, 'width', fingerprint.screen.width);
    redefineValue(screen, 'height', fingerprint.screen.height);
    redefineValue(screen, 'availWidth', fingerprint.screen.width);
    redefineValue(screen, 'availHeight', Math.max(fingerprint.screen.height - 40, 600));
    redefineValue(screen, 'availLeft', 0);
    redefineValue(screen, 'availTop', 0);
    redefineValue(screen, 'colorDepth', fingerprint.colorDepth || 24);
    redefineValue(screen, 'pixelDepth', fingerprint.colorDepth || 24);
    redefineValue(window, 'outerWidth', fingerprint.screen.width);
    redefineValue(window, 'outerHeight', fingerprint.screen.height);
    redefineValue(window, 'devicePixelRatio', fingerprint.devicePixelRatio || 1);

    const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function (...args) {
        const result = originalResolvedOptions.apply(this, args);
        result.timeZone = fingerprint.timezone;
        result.locale = fingerprint.language;
        return result;
    };

    const originalTimezoneOffset = Date.prototype.getTimezoneOffset;
    Date.prototype.getTimezoneOffset = function () {
        if (fingerprint.timezone in timezoneOffsets) return timezoneOffsets[fingerprint.timezone];
        return originalTimezoneOffset.call(this);
    };

    const originalGetParameter = WebGLRenderingContext && WebGLRenderingContext.prototype.getParameter;
    if (originalGetParameter) {
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return fingerprint.webglVendor;
            if (parameter === 37446) return fingerprint.webglRenderer;
            return originalGetParameter.call(this, parameter);
        };
    }

    const originalGetParameter2 = WebGL2RenderingContext && WebGL2RenderingContext.prototype.getParameter;
    if (originalGetParameter2) {
        WebGL2RenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return fingerprint.webglVendor;
            if (parameter === 37446) return fingerprint.webglRenderer;
            return originalGetParameter2.call(this, parameter);
        };
    }

    const originalQuery = navigator.permissions && navigator.permissions.query;
    if (originalQuery) {
        navigator.permissions.query = (parameters) => {
            const name = parameters && parameters.name;
            if (name === 'notifications') return Promise.resolve({ state: Notification.permission });
            if (name === 'camera' || name === 'microphone' || name === 'geolocation') return Promise.resolve({ state: 'prompt' });
            return originalQuery.call(navigator.permissions, parameters);
        };
    }

    const chromeObject = window.chrome || {};
    chromeObject.runtime = chromeObject.runtime || {};
    chromeObject.app = chromeObject.app || {
        InstallState: {
            DISABLED: 'disabled',
            INSTALLED: 'installed',
            NOT_INSTALLED: 'not_installed'
        },
        RunningState: {
            CANNOT_RUN: 'cannot_run',
            READY_TO_RUN: 'ready_to_run',
            RUNNING: 'running'
        }
    };
    chromeObject.csi = chromeObject.csi || (() => ({
        onloadT: Date.now(),
        startE: performance.timeOrigin || Date.now(),
        pageT: Math.round(performance.now()),
        tran: 15
    }));
    chromeObject.loadTimes = chromeObject.loadTimes || (() => ({
        requestTime: (performance.timeOrigin || Date.now()) / 1000,
        startLoadTime: (performance.timeOrigin || Date.now()) / 1000,
        commitLoadTime: (performance.timeOrigin || Date.now()) / 1000,
        finishDocumentLoadTime: (performance.timeOrigin || Date.now()) / 1000,
        finishLoadTime: (performance.timeOrigin || Date.now()) / 1000,
        firstPaintTime: (performance.timeOrigin || Date.now()) / 1000,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        wasFetchedViaSpdy: false,
        wasNpnNegotiated: false,
        npnNegotiatedProtocol: 'unknown',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'http/1.1'
    }));
    redefineValue(window, 'chrome', chromeObject);

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
        try {
            const context = this.getContext('2d');
            if (context) {
                const { width, height } = this;
                if (width && height) {
                    context.save();
                    context.fillStyle = 'rgba(0,0,0,0.003)';
                    context.fillRect(Math.max(width - 1, 0), Math.max(height - 1, 0), 1, 1);
                    context.restore();
                }
            }
        } catch (error) {
        }
        return originalToDataURL.apply(this, args);
    };

    const originalGetImageData = CanvasRenderingContext2D && CanvasRenderingContext2D.prototype.getImageData;
    if (originalGetImageData) {
        CanvasRenderingContext2D.prototype.getImageData = function(...args) {
            const imageData = originalGetImageData.apply(this, args);
            for (let i = 0; i < imageData.data.length; i += 16) {
                imageData.data[i] = Math.min(255, imageData.data[i] + Math.floor(randomNoise(fingerprint.canvasNoise || 11, i) * 255));
            }
            return imageData;
        };
    }

    const originalGetChannelData = AudioBuffer && AudioBuffer.prototype.getChannelData;
    if (originalGetChannelData) {
        AudioBuffer.prototype.getChannelData = function(...args) {
            const channel = originalGetChannelData.apply(this, args);
            if (!channel.__xbrowserNoised) {
                const stride = Math.max(1, Math.floor(channel.length / 64));
                for (let i = 0; i < channel.length; i += stride) {
                    channel[i] = channel[i] + randomNoise(fingerprint.audioNoise || 7, i);
                }
                channel.__xbrowserNoised = true;
            }
            return channel;
        };
    }

    const originalGetFloatFrequencyData = AnalyserNode && AnalyserNode.prototype.getFloatFrequencyData;
    if (originalGetFloatFrequencyData) {
        AnalyserNode.prototype.getFloatFrequencyData = function(array) {
            originalGetFloatFrequencyData.call(this, array);
            const stride = Math.max(1, Math.floor(array.length / 48));
            for (let i = 0; i < array.length; i += stride) {
                array[i] = array[i] + randomNoise(fingerprint.audioNoise || 7, i) * 10;
            }
        };
    }

    if (window.speechSynthesis && typeof window.speechSynthesis.getVoices === 'function') {
        const originalGetVoices = window.speechSynthesis.getVoices.bind(window.speechSynthesis);
        window.speechSynthesis.getVoices = () => {
            const voices = originalGetVoices();
            if (voices && voices.length) return voices;
            return [{
                default: true,
                lang: fingerprint.language,
                localService: true,
                name: fingerprint.language.startsWith('zh') ? 'Microsoft Xiaoxiao' : 'Google US English',
                voiceURI: fingerprint.language.startsWith('zh') ? 'Microsoft Xiaoxiao Online (Natural)' : 'Google US English'
            }];
        };
    }

    const PeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (PeerConnection && PeerConnection.prototype) {
        const originalAddEventListener = PeerConnection.prototype.addEventListener;
        PeerConnection.prototype.addEventListener = function(type, listener, options) {
            if (type !== 'icecandidate' || typeof listener !== 'function') {
                return originalAddEventListener.call(this, type, listener, options);
            }
            const wrapped = (event) => {
                const candidate = event && event.candidate && sanitizeCandidate(event.candidate.candidate);
                if (event && event.candidate && !candidate) return;
                listener.call(this, event);
            };
            return originalAddEventListener.call(this, type, wrapped, options);
        };

        const originalCreateOffer = PeerConnection.prototype.createOffer;
        if (originalCreateOffer) {
            PeerConnection.prototype.createOffer = function(...args) {
                return originalCreateOffer.apply(this, args).then(description => {
                    if (!description || !description.sdp) return description;
                    return new RTCSessionDescription({
                        type: description.type,
                        sdp: sanitizeSdp(description.sdp)
                    });
                });
            };
        }

        const originalCreateAnswer = PeerConnection.prototype.createAnswer;
        if (originalCreateAnswer) {
            PeerConnection.prototype.createAnswer = function(...args) {
                return originalCreateAnswer.apply(this, args).then(description => {
                    if (!description || !description.sdp) return description;
                    return new RTCSessionDescription({
                        type: description.type,
                        sdp: sanitizeSdp(description.sdp)
                    });
                });
            };
        }

        const localDescriptionDescriptor = Object.getOwnPropertyDescriptor(PeerConnection.prototype, 'localDescription');
        if (localDescriptionDescriptor && localDescriptionDescriptor.get) {
            Object.defineProperty(PeerConnection.prototype, 'localDescription', {
                configurable: true,
                get() {
                    const description = localDescriptionDescriptor.get.call(this);
                    if (!description || !description.sdp) return description;
                    return new RTCSessionDescription({
                        type: description.type,
                        sdp: sanitizeSdp(description.sdp)
                    });
                }
            });
        }
    }
})();
`.trim();
}

async function ensureFingerprintExtension(baseDir, profileId, fingerprint) {
    const extensionDir = path.join(baseDir, 'data', 'profiles', profileId, 'fingerprint-extension');
    await fs.ensureDir(extensionDir);

    const manifest = {
        manifest_version: 3,
        name: `XBrowseR Fingerprint ${profileId}`,
        version: '1.0.0',
        minimum_chrome_version: '111',
        permissions: [],
        host_permissions: ['<all_urls>'],
        content_scripts: [{
            matches: ['<all_urls>'],
            js: ['page-script.js'],
            run_at: 'document_start',
            world: 'MAIN'
        }]
    };

    await Promise.all([
        fs.writeJson(path.join(extensionDir, 'manifest.json'), manifest, { spaces: 2 }),
        fs.writeFile(path.join(extensionDir, 'page-script.js'), createPageScript(fingerprint))
    ]);

    return extensionDir;
}

module.exports = {
    ensureFingerprintExtension,
};
