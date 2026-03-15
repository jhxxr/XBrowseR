const fingerprintArg = process.argv.find(arg => arg.startsWith('--xbrowser-fingerprint='));
const encodedFingerprint = fingerprintArg ? fingerprintArg.split('=')[1] : '';
const fingerprint = encodedFingerprint
    ? JSON.parse(Buffer.from(encodedFingerprint, 'base64url').toString('utf8'))
    : null;

if (fingerprint) {
    const redefine = (target, key, getter) => {
        try {
            Object.defineProperty(target, key, {
                configurable: true,
                get: getter
            });
        } catch (error) {
        }
    };

    const timezoneOffsets = {
        UTC: 0,
        'Asia/Hong_Kong': -480,
        'Asia/Singapore': -480,
        'Europe/Amsterdam': -60,
        'America/New_York': 300
    };

    redefine(window.Navigator.prototype, 'userAgent', () => fingerprint.userAgent);
    redefine(window.Navigator.prototype, 'language', () => fingerprint.language);
    redefine(window.Navigator.prototype, 'languages', () => fingerprint.languages);
    redefine(window.Navigator.prototype, 'platform', () => fingerprint.platform);
    redefine(window.Navigator.prototype, 'hardwareConcurrency', () => fingerprint.hardwareConcurrency);
    redefine(window.Navigator.prototype, 'deviceMemory', () => fingerprint.deviceMemory);
    redefine(window.Navigator.prototype, 'webdriver', () => false);
    redefine(window.Navigator.prototype, 'maxTouchPoints', () => fingerprint.maxTouchPoints || 0);

    redefine(window.Screen.prototype, 'width', () => fingerprint.screen.width);
    redefine(window.Screen.prototype, 'height', () => fingerprint.screen.height);
    redefine(window.Screen.prototype, 'availWidth', () => fingerprint.screen.width);
    redefine(window.Screen.prototype, 'availHeight', () => fingerprint.screen.height - 40);
    redefine(window.Screen.prototype, 'colorDepth', () => fingerprint.colorDepth || 24);
    redefine(window.Screen.prototype, 'pixelDepth', () => fingerprint.colorDepth || 24);

    const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions(...args) {
        const result = originalResolvedOptions.apply(this, args);
        result.timeZone = fingerprint.timezone;
        result.locale = fingerprint.language;
        return result;
    };

    const originalTimezoneOffset = Date.prototype.getTimezoneOffset;
    Date.prototype.getTimezoneOffset = function getTimezoneOffset() {
        return timezoneOffsets[fingerprint.timezone] ?? originalTimezoneOffset.call(this);
    };

    const overrideWebGL = (prototype) => {
        if (!prototype?.getParameter) return;
        const original = prototype.getParameter;
        prototype.getParameter = function getParameter(parameter) {
            if (parameter === 37445) return fingerprint.webglVendor;
            if (parameter === 37446) return fingerprint.webglRenderer;
            return original.call(this, parameter);
        };
    };

    overrideWebGL(window.WebGLRenderingContext?.prototype);
    overrideWebGL(window.WebGL2RenderingContext?.prototype);

    delete window.require;
    delete window.process;
    delete window.module;
}
