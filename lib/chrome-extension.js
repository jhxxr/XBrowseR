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

function createPageScript(fingerprint) {
    const userAgentData = buildUserAgentData(fingerprint);

    return `
(() => {
    const fingerprint = ${escapeForScript(fingerprint)};
    const userAgentDataSeed = ${escapeForScript(userAgentData)};

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
    const numericNoise = (seed, offset, scale = 1) => ((Math.sin(seed * 19 + offset * 13) + 1) / 2 - 0.5) * scale;
    const originalTimezoneOffset = Date.prototype.getTimezoneOffset;
    const buildTimeZoneAwareOptions = (options) => {
        const normalized = options && typeof options === 'object' ? { ...options } : {};
        if (!normalized.timeZone) {
            normalized.timeZone = fingerprint.timezone;
        }
        return normalized;
    };
    const resolveTimezoneOffsetMinutes = (date, timeZone) => {
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone,
                timeZoneName: 'shortOffset',
                hour: '2-digit'
            });
            const timeZoneName = formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || '';
            const match = timeZoneName.match(/^GMT([+-])(\\d{1,2})(?::?(\\d{2}))?$/i);
            if (!match) return null;

            const sign = match[1] === '+' ? -1 : 1;
            const hours = Number(match[2] || 0);
            const minutes = Number(match[3] || 0);
            return sign * ((hours * 60) + minutes);
        } catch (error) {
            return null;
        }
    };
    const shiftDateToSpoofedTimezone = (date) => {
        const realOffset = originalTimezoneOffset.call(date);
        const spoofedOffset = resolveTimezoneOffsetMinutes(date, fingerprint.timezone);
        if (typeof spoofedOffset !== 'number' || Number.isNaN(spoofedOffset)) {
            return new Date(date.getTime());
        }
        const deltaMinutes = realOffset - spoofedOffset;
        return new Date(date.getTime() + (deltaMinutes * 60 * 1000));
    };
    const buildSpoofedDateString = (date) => {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: fingerprint.timezone,
            weekday: 'short',
            month: 'short',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
            timeZoneName: 'long'
        });
        const parts = formatter.formatToParts(date);
        const readPart = (type) => parts.find((part) => part.type === type)?.value || '';
        const offsetMinutes = resolveTimezoneOffsetMinutes(date, fingerprint.timezone);
        const absoluteOffset = Math.abs(Number(offsetMinutes) || 0);
        const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
        const offsetRemainder = String(absoluteOffset % 60).padStart(2, '0');
        const sign = Number(offsetMinutes) <= 0 ? '+' : '-';
        const longName = readPart('timeZoneName') || fingerprint.timezone;
        return {
            dateString: [readPart('weekday'), readPart('month'), readPart('day'), readPart('year')].join(' ').trim(),
            timeString: [
                [readPart('hour'), readPart('minute'), readPart('second')].join(':'),
                'GMT' + sign + offsetHours + offsetRemainder,
                '(' + longName + ')'
            ].join(' ').trim()
        };
    };
    const sanitizeCandidate = (candidate) => {
        if (!candidate) return candidate;
        if (fingerprint.webrtcMode === 'disabled') return '';
        if (fingerprint.webrtcMode === 'real') return String(candidate);
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
    const fontSet = new Set((fingerprint.fonts || []).map(item => String(item || '').trim().toLowerCase()).filter(Boolean));
    const voiceSeed = Array.isArray(fingerprint.speechVoices) ? fingerprint.speechVoices : [];
    const geoSeed = fingerprint.geolocation || { mode: 'auto', latitude: 0, longitude: 0, accuracy: 30 };
    const mediaSeed = fingerprint.media || { audioEnabled: true, imageEnabled: true, videoEnabled: true };
    const windowSeed = fingerprint.window || {};
    const windowSizeMode = windowSeed.sizeMode === 'fullscreen' ? 'fullscreen' : 'custom';
    const windowOuterWidth = windowSizeMode === 'fullscreen'
        ? Number(fingerprint.screen.width)
        : Math.max(480, Number(windowSeed.width) || Number(fingerprint.screen.width) || 1280);
    const windowOuterHeight = windowSizeMode === 'fullscreen'
        ? Number(fingerprint.screen.height)
        : Math.max(480, Number(windowSeed.height) || Number(fingerprint.screen.height) || 900);
    const geoHasCoords = Number.isFinite(Number(geoSeed.latitude)) && Number.isFinite(Number(geoSeed.longitude))
        && (Number(geoSeed.latitude) || Number(geoSeed.longitude));
    const geoPermissionState = geoSeed.permission === 'block'
        ? 'denied'
        : (geoSeed.permission === 'prompt' ? 'prompt' : (geoHasCoords ? 'granted' : 'prompt'));
    const buildGeolocationPosition = () => ({
        coords: {
            latitude: Number(geoSeed.latitude),
            longitude: Number(geoSeed.longitude),
            accuracy: Math.max(1, Number(geoSeed.accuracy) || 30),
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
        },
        timestamp: Date.now()
    });
    const buildGeolocationError = () => ({
        code: 1,
        message: 'User denied Geolocation'
    });
    const isKnownFont = (fontValue = '') => {
        const tokens = String(fontValue || '')
            .replace(/["']/g, '')
            .split(',')
            .map(item => item.trim().toLowerCase())
            .filter(Boolean);
        return tokens.some(token => ['serif', 'sans-serif', 'monospace', 'system-ui'].includes(token) || fontSet.has(token));
    };

    const mimeTypeArray = [];
    const pluginArray = [];
    const originalMediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = originalMediaDevices && typeof originalMediaDevices.getUserMedia === 'function'
        ? originalMediaDevices.getUserMedia.bind(originalMediaDevices)
        : null;

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
            return Promise.resolve(fingerprint.mediaDevices
                .filter(device => {
                    if (!mediaSeed.audioEnabled && (device.kind === 'audioinput' || device.kind === 'audiooutput')) return false;
                    if (!mediaSeed.videoEnabled && device.kind === 'videoinput') return false;
                    return true;
                })
                .map(device => ({
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
        getUserMedia(constraints = {}) {
            const wantsAudio = !!constraints?.audio;
            const wantsVideo = !!constraints?.video;
            if ((wantsAudio && !mediaSeed.audioEnabled) || (wantsVideo && !mediaSeed.videoEnabled)) {
                return Promise.reject(new DOMException('Media capture disabled', 'NotAllowedError'));
            }
            if (originalGetUserMedia) {
                return originalGetUserMedia(constraints);
            }
            return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
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
    redefineValue(Navigator.prototype, 'doNotTrack', fingerprint.doNotTrack || null);
    redefineValue(window, 'doNotTrack', fingerprint.doNotTrack || null);

    redefineValue(screen, 'width', fingerprint.screen.width);
    redefineValue(screen, 'height', fingerprint.screen.height);
    redefineValue(screen, 'availWidth', fingerprint.screen.width);
    redefineValue(screen, 'availHeight', Math.max(fingerprint.screen.height - 40, 600));
    redefineValue(screen, 'availLeft', 0);
    redefineValue(screen, 'availTop', 0);
    redefineValue(screen, 'colorDepth', fingerprint.colorDepth || 24);
    redefineValue(screen, 'pixelDepth', fingerprint.colorDepth || 24);
    redefineValue(window, 'outerWidth', windowOuterWidth);
    redefineValue(window, 'outerHeight', windowOuterHeight);
    redefineValue(window, 'devicePixelRatio', fingerprint.devicePixelRatio || 1);

    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function (...args) {
        const result = originalResolvedOptions.apply(this, args);
        result.timeZone = fingerprint.timezone;
        result.locale = fingerprint.language;
        return result;
    };

    const SpoofedDateTimeFormat = function(locales, options) {
        return new OriginalDateTimeFormat(locales, buildTimeZoneAwareOptions(options));
    };
    SpoofedDateTimeFormat.prototype = OriginalDateTimeFormat.prototype;
    Object.defineProperty(SpoofedDateTimeFormat, 'name', { value: 'DateTimeFormat' });
    Object.defineProperty(SpoofedDateTimeFormat, 'length', { value: 0 });
    SpoofedDateTimeFormat.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf.bind(OriginalDateTimeFormat);
    Object.defineProperty(Intl, 'DateTimeFormat', {
        configurable: true,
        writable: true,
        value: SpoofedDateTimeFormat
    });

    Date.prototype.getTimezoneOffset = function () {
        const spoofedOffset = resolveTimezoneOffsetMinutes(this, fingerprint.timezone);
        if (typeof spoofedOffset === 'number' && !Number.isNaN(spoofedOffset)) return spoofedOffset;
        return originalTimezoneOffset.call(this);
    };

    const dateGetterMap = {
        getDate: Date.prototype.getDate,
        getDay: Date.prototype.getDay,
        getFullYear: Date.prototype.getFullYear,
        getHours: Date.prototype.getHours,
        getMilliseconds: Date.prototype.getMilliseconds,
        getMinutes: Date.prototype.getMinutes,
        getMonth: Date.prototype.getMonth,
        getSeconds: Date.prototype.getSeconds,
        getYear: Date.prototype.getYear
    };

    Object.entries(dateGetterMap).forEach(([name, originalMethod]) => {
        Date.prototype[name] = function(...args) {
            const shiftedDate = shiftDateToSpoofedTimezone(this);
            return originalMethod.apply(shiftedDate, args);
        };
    });

    const originalToLocaleString = Date.prototype.toLocaleString;
    Date.prototype.toLocaleString = function(locales, options) {
        return originalToLocaleString.call(this, locales, buildTimeZoneAwareOptions(options));
    };

    const originalToLocaleDateString = Date.prototype.toLocaleDateString;
    Date.prototype.toLocaleDateString = function(locales, options) {
        return originalToLocaleDateString.call(this, locales, buildTimeZoneAwareOptions(options));
    };

    const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
    Date.prototype.toLocaleTimeString = function(locales, options) {
        return originalToLocaleTimeString.call(this, locales, buildTimeZoneAwareOptions(options));
    };

    Date.prototype.toDateString = function() {
        return buildSpoofedDateString(this).dateString;
    };

    Date.prototype.toTimeString = function() {
        return buildSpoofedDateString(this).timeString;
    };

    Date.prototype.toString = function() {
        const rendered = buildSpoofedDateString(this);
        return [rendered.dateString, rendered.timeString].join(' ').trim();
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
            if (name === 'geolocation') return Promise.resolve({ state: geoPermissionState });
            if (name === 'camera' || name === 'microphone') return Promise.resolve({ state: 'prompt' });
            return originalQuery.call(navigator.permissions, parameters);
        };
    }

    if (navigator.geolocation) {
        const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition && navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
        const originalWatchPosition = navigator.geolocation.watchPosition && navigator.geolocation.watchPosition.bind(navigator.geolocation);
        const originalClearWatch = navigator.geolocation.clearWatch && navigator.geolocation.clearWatch.bind(navigator.geolocation);
        navigator.geolocation.getCurrentPosition = function(success, error, options) {
            if (geoSeed.permission === 'block') {
                if (typeof error === 'function') error(buildGeolocationError());
                return;
            }
            if (geoHasCoords) {
                if (typeof success === 'function') success(buildGeolocationPosition());
                return;
            }
            if (originalGetCurrentPosition) {
                return originalGetCurrentPosition(success, error, options);
            }
        };
        navigator.geolocation.watchPosition = function(success, error, options) {
            if (geoSeed.permission === 'block') {
                if (typeof error === 'function') error(buildGeolocationError());
                return 0;
            }
            if (geoHasCoords) {
                if (typeof success === 'function') success(buildGeolocationPosition());
                return Math.floor(Date.now() / 1000);
            }
            return originalWatchPosition ? originalWatchPosition(success, error, options) : 0;
        };
        navigator.geolocation.clearWatch = function(watchId) {
            if (originalClearWatch) {
                return originalClearWatch(watchId);
            }
        };
    }

    const originalMediaPlay = HTMLMediaElement && HTMLMediaElement.prototype.play;
    if (originalMediaPlay && (!mediaSeed.audioEnabled || !mediaSeed.videoEnabled)) {
        HTMLMediaElement.prototype.play = function(...args) {
            const isAudio = typeof HTMLAudioElement !== 'undefined' && this instanceof HTMLAudioElement;
            const isVideo = typeof HTMLVideoElement !== 'undefined' && this instanceof HTMLVideoElement;
            if ((isAudio && !mediaSeed.audioEnabled) || (isVideo && !mediaSeed.videoEnabled)) {
                try {
                    this.pause();
                } catch (error) {
                }
                return Promise.reject(new DOMException('Media playback disabled', 'NotAllowedError'));
            }
            return originalMediaPlay.apply(this, args);
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

    if (document.fonts && typeof document.fonts.check === 'function') {
        const originalFontCheck = document.fonts.check.bind(document.fonts);
        document.fonts.check = (font, text) => {
            if (isKnownFont(font)) return true;
            return originalFontCheck(font, text);
        };
    }

    if (typeof FontFaceSet !== 'undefined' && FontFaceSet.prototype?.check) {
        const originalFontFaceCheck = FontFaceSet.prototype.check;
        FontFaceSet.prototype.check = function(font, text) {
            if (isKnownFont(font)) return true;
            return originalFontFaceCheck.call(this, font, text);
        };
    }

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

    const applyRectNoise = (rect, seedOffset = 0) => {
        if (!rect || !Number(fingerprint.clientRectsNoise)) return rect;
        const scale = Math.max(0, Number(fingerprint.clientRectsNoise) || 0) * 0.01;
        const deltaX = numericNoise(fingerprint.clientRectsNoise || 1, seedOffset + 1, scale);
        const deltaY = numericNoise(fingerprint.clientRectsNoise || 1, seedOffset + 2, scale);
        if (typeof DOMRect !== 'undefined' && typeof DOMRect.fromRect === 'function') {
            return DOMRect.fromRect({
                x: rect.x + deltaX,
                y: rect.y + deltaY,
                width: rect.width,
                height: rect.height
            });
        }
        return {
            x: rect.x + deltaX,
            y: rect.y + deltaY,
            width: rect.width,
            height: rect.height,
            top: rect.top + deltaY,
            left: rect.left + deltaX,
            right: rect.right + deltaX,
            bottom: rect.bottom + deltaY,
            toJSON() {
                return this;
            }
        };
    };

    if (Element.prototype.getBoundingClientRect) {
        const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function(...args) {
            const rect = originalGetBoundingClientRect.apply(this, args);
            return applyRectNoise(rect, String(this.tagName || '').length);
        };
    }

    if (Range && Range.prototype.getBoundingClientRect) {
        const originalRangeRect = Range.prototype.getBoundingClientRect;
        Range.prototype.getBoundingClientRect = function(...args) {
            const rect = originalRangeRect.apply(this, args);
            return applyRectNoise(rect, 17);
        };
    }

    const originalGetChannelData = AudioBuffer && AudioBuffer.prototype.getChannelData;
    if (originalGetChannelData) {
        AudioBuffer.prototype.getChannelData = function(...args) {
            const channel = originalGetChannelData.apply(this, args);
            if (!channel.__xbrowserNoised) {
                const stride = Math.max(1, Math.floor(channel.length / 64));
                for (let i = 0; i < channel.length; i += stride) {
                    channel[i] = channel[i] + randomNoise(fingerprint.audioContextNoise || fingerprint.audioNoise || 7, i);
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
                array[i] = array[i] + randomNoise(fingerprint.audioContextNoise || fingerprint.audioNoise || 7, i) * 10;
            }
        };
    }

    if (window.speechSynthesis && typeof window.speechSynthesis.getVoices === 'function') {
        const originalGetVoices = window.speechSynthesis.getVoices.bind(window.speechSynthesis);
        window.speechSynthesis.getVoices = () => {
            const voices = originalGetVoices();
            if (voices && voices.length) return voices;
            return voiceSeed.length ? voiceSeed : [{
                default: true,
                lang: fingerprint.language,
                localService: true,
                name: fingerprint.language.startsWith('zh') ? 'Microsoft Xiaoxiao' : 'Google US English',
                voiceURI: fingerprint.language.startsWith('zh') ? 'Microsoft Xiaoxiao Online (Natural)' : 'Google US English'
            }];
        };
    }

    if (fingerprint.webgpu?.enabled !== false) {
        const gpuAdapter = {
            features: new Set(['depth-clip-control', 'texture-compression-bc']),
            limits: {
                maxTextureDimension1D: 8192,
                maxTextureDimension2D: 8192,
                maxBindGroups: 4
            },
            requestAdapterInfo() {
                return Promise.resolve({
                    vendor: fingerprint.webgpu.vendor || fingerprint.webglVendor,
                    architecture: fingerprint.webgpu.architecture || 'generic',
                    device: fingerprint.webgpu.device || fingerprint.webglRenderer,
                    description: fingerprint.webgpu.description || ((fingerprint.gpuTier || 'medium') + ' tier adapter')
                });
            },
            requestDevice() {
                return Promise.resolve({
                    label: fingerprint.webgpu.device || fingerprint.webglRenderer,
                    lost: Promise.resolve({ reason: 'destroyed', message: '' }),
                    queue: { submit() {}, onSubmittedWorkDone: () => Promise.resolve() },
                    destroy() {}
                });
            }
        };
        redefineValue(Navigator.prototype, 'gpu', {
            requestAdapter() {
                return Promise.resolve(gpuAdapter);
            },
            getPreferredCanvasFormat() {
                return 'bgra8unorm';
            }
        });
    } else {
        redefineValue(Navigator.prototype, 'gpu', undefined);
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

async function ensureFingerprintExtension(profileDataDir, profileId, fingerprint) {
    const extensionDir = path.join(profileDataDir, 'fingerprint-extension');
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
            all_frames: true,
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
    createPageScript,
    ensureFingerprintExtension,
};
