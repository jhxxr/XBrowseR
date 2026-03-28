const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const extractZip = require('extract-zip');

const BROWSER_NAME = process.env.XBROWSER_BROWSER_NAME || 'Custom Chromium';
const BROWSER_CONFIG_ENV = process.env.XBROWSER_BROWSER_CONFIG || '';
const BROWSER_BINARY_ENV = process.env.XBROWSER_BROWSER_BINARY || '';
const BROWSER_DOWNLOAD_URL_ENV = process.env.XBROWSER_BROWSER_DOWNLOAD_URL || '';
const BROWSER_VERSION_ENV = process.env.XBROWSER_BROWSER_VERSION || '';
const BROWSER_ARCHIVE_ROOT_ENV = process.env.XBROWSER_BROWSER_ARCHIVE_ROOT || '';
const BROWSER_EXECUTABLE_ENV = process.env.XBROWSER_BROWSER_EXECUTABLE || '';
const BROWSER_INSTALL_DIR_ENV = process.env.XBROWSER_BROWSER_INSTALL_DIR || 'chromium';
const VERSION_FILE_NAME = '.browser-version.json';
const DEFAULT_CONFIG_RELATIVE_PATH = path.join('build', 'browser-source.json');

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function unique(items = []) {
    return Array.from(new Set(items.filter(Boolean)));
}

function resolvePathFromBase(baseDir, targetPath = '') {
    const normalized = normalizeString(targetPath);
    if (!normalized) {
        return '';
    }
    if (path.isAbsolute(normalized)) {
        return normalized;
    }
    return path.join(baseDir, normalized);
}

function getPlatformId(platform = process.platform, arch = process.arch) {
    if (platform === 'win32') {
        if (arch === 'ia32') return 'win32';
        return 'win64';
    }
    if (platform === 'linux') {
        return arch === 'x64' ? 'linux64' : '';
    }
    if (platform === 'darwin') {
        if (arch === 'arm64') return 'mac-arm64';
        if (arch === 'x64') return 'mac-x64';
    }
    return '';
}

function getDefaultArchiveRoots(platformId = getPlatformId()) {
    const table = {
        win32: ['chromium-win32', 'chrome-win32', 'chrome-win'],
        win64: ['chromium-win64', 'chrome-win64', 'chrome-win'],
        linux64: ['chromium-linux64', 'chrome-linux64', 'chrome-linux'],
        'mac-arm64': ['Chromium.app', 'chrome-mac-arm64'],
        'mac-x64': ['Chromium.app', 'chrome-mac-x64']
    };

    return table[platformId] || [];
}

function getDefaultExecutableLeaves(platformId = getPlatformId()) {
    if (platformId === 'win32' || platformId === 'win64') {
        return ['chrome.exe', 'chromium.exe'];
    }

    if (platformId === 'linux64') {
        return ['chrome', 'chromium'];
    }

    return [
        path.join('Contents', 'MacOS', 'Chromium'),
        path.join('Contents', 'MacOS', 'Chromium Browser')
    ];
}

function getPackedBrowserDir(dirName = BROWSER_INSTALL_DIR_ENV || 'chromium') {
    if (!process.resourcesPath) {
        return '';
    }
    return path.join(process.resourcesPath, 'bin', dirName);
}

function getLocalBrowserDir(baseDir, dirName = BROWSER_INSTALL_DIR_ENV || 'chromium') {
    return path.join(baseDir, 'bin', dirName);
}

function getBrowserSourceConfigPath(baseDir) {
    return resolvePathFromBase(baseDir, BROWSER_CONFIG_ENV || DEFAULT_CONFIG_RELATIVE_PATH);
}

function readJsonSyncSafe(filePath) {
    try {
        if (!filePath || !fs.existsSync(filePath)) {
            return null;
        }
        return fs.readJsonSync(filePath);
    } catch (error) {
        return null;
    }
}

async function readJsonSafe(filePath) {
    try {
        if (!filePath || !(await fs.pathExists(filePath))) {
            return null;
        }
        return await fs.readJson(filePath);
    } catch (error) {
        return null;
    }
}

function normalizePlatformSource(source = {}, fallbackName = BROWSER_NAME) {
    return {
        name: normalizeString(source.name, fallbackName),
        installDir: normalizeString(source.installDir, BROWSER_INSTALL_DIR_ENV || 'chromium'),
        version: normalizeString(source.version),
        url: normalizeString(source.url),
        archiveRoot: normalizeString(source.archiveRoot),
        executable: normalizeString(source.executable),
        binary: normalizeString(source.binary)
    };
}

function resolvePlatformSourceFromEnv(baseDir) {
    const hasEnvSource = [
        process.env.XBROWSER_BROWSER_BINARY,
        process.env.XBROWSER_BROWSER_DOWNLOAD_URL,
        process.env.XBROWSER_BROWSER_VERSION,
        process.env.XBROWSER_BROWSER_ARCHIVE_ROOT,
        process.env.XBROWSER_BROWSER_EXECUTABLE,
        process.env.XBROWSER_BROWSER_INSTALL_DIR
    ].some((item) => normalizeString(item));

    if (!hasEnvSource) {
        return null;
    }

    return normalizePlatformSource({
        name: BROWSER_NAME,
        installDir: BROWSER_INSTALL_DIR_ENV || 'chromium',
        version: BROWSER_VERSION_ENV,
        url: BROWSER_DOWNLOAD_URL_ENV,
        archiveRoot: BROWSER_ARCHIVE_ROOT_ENV,
        executable: BROWSER_EXECUTABLE_ENV,
        binary: resolvePathFromBase(baseDir, BROWSER_BINARY_ENV)
    });
}

function resolvePlatformSourceFromConfig(baseDir, platformId, configPayload) {
    if (!isPlainObject(configPayload)) {
        return null;
    }

    const platforms = isPlainObject(configPayload.platforms) ? configPayload.platforms : {};
    const platformSource = isPlainObject(platforms[platformId]) ? platforms[platformId] : null;
    if (!platformSource) {
        return null;
    }

    const normalized = normalizePlatformSource({
        ...platformSource,
        name: normalizeString(platformSource.name, normalizeString(configPayload.name, BROWSER_NAME)),
        installDir: normalizeString(platformSource.installDir, normalizeString(configPayload.installDir, BROWSER_INSTALL_DIR_ENV || 'chromium'))
    });

    if (normalized.binary) {
        normalized.binary = resolvePathFromBase(baseDir, normalized.binary);
    }

    return normalized;
}

function resolvePlatformSourceSync(baseDir, platformId = getPlatformId()) {
    const envSource = resolvePlatformSourceFromEnv(baseDir);
    if (envSource) {
        return envSource;
    }

    return resolvePlatformSourceFromConfig(baseDir, platformId, readJsonSyncSafe(getBrowserSourceConfigPath(baseDir)));
}

async function resolvePlatformSource(baseDir, platformId = getPlatformId()) {
    const envSource = resolvePlatformSourceFromEnv(baseDir);
    if (envSource) {
        return envSource;
    }

    return resolvePlatformSourceFromConfig(baseDir, platformId, await readJsonSafe(getBrowserSourceConfigPath(baseDir)));
}

function hasConfiguredBrowserSource(baseDir, platformId = getPlatformId()) {
    const source = resolvePlatformSourceSync(baseDir, platformId);
    return !!source;
}

function getBrowserInstallDirNames(platformSource = null) {
    const installDirNames = [normalizeString(platformSource?.installDir, BROWSER_INSTALL_DIR_ENV || 'chromium')];

    if (!installDirNames.includes('chromium')) {
        installDirNames.push('chromium');
    }

    return unique(installDirNames);
}

function buildRelativeExecutableCandidates(platformId = getPlatformId(), platformSource = null) {
    const directExecutable = normalizeString(platformSource?.executable);
    const archiveRoots = unique([
        normalizeString(platformSource?.archiveRoot),
        ...getDefaultArchiveRoots(platformId)
    ]);
    const executableLeaves = getDefaultExecutableLeaves(platformId);
    const relatives = [];

    if (directExecutable) {
        relatives.push(path.normalize(directExecutable));
    }

    for (const archiveRoot of archiveRoots) {
        for (const executableLeaf of executableLeaves) {
            relatives.push(path.join(archiveRoot, executableLeaf));
        }
    }

    for (const executableLeaf of executableLeaves) {
        relatives.push(path.normalize(executableLeaf));
    }

    return unique(relatives);
}

function getExecutableCandidates(baseDir) {
    const platformId = getPlatformId();
    if (!platformId) {
        return [];
    }

    const platformSource = resolvePlatformSourceSync(baseDir, platformId);
    const explicitBinary = normalizeString(platformSource?.binary);
    const relativeExecutables = buildRelativeExecutableCandidates(platformId, platformSource);
    const installDirs = getBrowserInstallDirNames(platformSource);
    const candidates = [];

    if (explicitBinary) {
        candidates.push(explicitBinary);
    }

    for (const installDir of installDirs) {
        const localDir = getLocalBrowserDir(baseDir, installDir);
        const packedDir = getPackedBrowserDir(installDir);
        for (const relativeExecutable of relativeExecutables) {
            candidates.push(path.join(localDir, relativeExecutable));
            if (packedDir) {
                candidates.push(path.join(packedDir, relativeExecutable));
            }
        }
    }

    return unique(candidates);
}

function getVersionFileCandidates(baseDir) {
    const platformId = getPlatformId();
    const platformSource = resolvePlatformSourceSync(baseDir, platformId);
    const installDirs = getBrowserInstallDirNames(platformSource);
    const candidates = [];

    for (const installDir of installDirs) {
        const localDir = getLocalBrowserDir(baseDir, installDir);
        const packedDir = getPackedBrowserDir(installDir);
        candidates.push(path.join(localDir, VERSION_FILE_NAME));
        if (packedDir) {
            candidates.push(path.join(packedDir, VERSION_FILE_NAME));
        }
    }

    return unique(candidates);
}

async function readInstalledVersion(versionFilePath) {
    const payload = await readJsonSafe(versionFilePath);
    return normalizeString(payload?.version);
}

async function writeInstalledVersion(versionFilePath, metadata = {}) {
    await fs.ensureDir(path.dirname(versionFilePath));
    await fs.writeJson(versionFilePath, {
        name: normalizeString(metadata.name, BROWSER_NAME),
        version: normalizeString(metadata.version),
        platform: normalizeString(metadata.platform),
        url: normalizeString(metadata.url),
        archiveRoot: normalizeString(metadata.archiveRoot),
        executable: normalizeString(metadata.executable),
        updatedAt: new Date().toISOString()
    }, { spaces: 2 });
}

async function getInstalledBrowserVersion(baseDir) {
    const versionFiles = getVersionFileCandidates(baseDir);
    for (const versionFile of versionFiles) {
        const version = await readInstalledVersion(versionFile);
        if (version) {
            return version;
        }
    }
    return '';
}

function requestBinary(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'User-Agent': 'XBrowseR',
                'Accept': 'application/octet-stream'
            }
        }, async (response) => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                response.resume();
                try {
                    resolve(await requestBinary(response.headers.location));
                } catch (error) {
                    reject(error);
                }
                return;
            }

            if ((response.statusCode || 500) >= 400) {
                response.resume();
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            resolve(response);
        });

        request.on('error', reject);
    });
}

async function downloadFile(url, outputPath) {
    const response = await requestBinary(url);

    await fs.ensureDir(path.dirname(outputPath));

    await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(outputPath);
        response.pipe(fileStream);
        fileStream.on('finish', () => fileStream.close(resolve));
        fileStream.on('error', reject);
    });
}

function isZipArchive(filePath = '') {
    return /\.zip$/i.test(filePath);
}

function buildInstallPaths(baseDir, platformId, platformSource) {
    const installDirName = normalizeString(platformSource?.installDir, BROWSER_INSTALL_DIR_ENV || 'chromium');
    const installDir = String(baseDir || '').toLowerCase().includes('app.asar')
        ? getPackedBrowserDir(installDirName)
        : getLocalBrowserDir(baseDir, installDirName);
    const executableRelativePath = buildRelativeExecutableCandidates(platformId, platformSource)[0] || '';
    return {
        installDir,
        installDirName,
        installPath: executableRelativePath ? path.join(installDir, executableRelativePath) : '',
        versionFilePath: path.join(installDir, VERSION_FILE_NAME),
        executableRelativePath
    };
}

async function ensureBundledBrowser(baseDir, { force = false } = {}) {
    const platformId = getPlatformId();
    if (!platformId) {
        throw new Error(`Unsupported platform for bundled browser: ${process.platform}-${process.arch}`);
    }

    const platformSource = await resolvePlatformSource(baseDir, platformId);
    const explicitBinary = normalizeString(platformSource?.binary);
    if (explicitBinary) {
        if (await fs.pathExists(explicitBinary)) {
            return explicitBinary;
        }
        if (!platformSource?.url) {
            throw new Error(`Configured ${platformSource.name || BROWSER_NAME} executable not found: ${explicitBinary}`);
        }
    }

    const existingExecutable = resolveBrowserExecutable(baseDir);

    if (!platformSource?.url) {
        if (existingExecutable && !force) {
            return existingExecutable;
        }
        const setupMessage = platformSource
            ? `Configured ${platformSource.name || BROWSER_NAME} build not found. Stage it into bin/chromium or provide a download URL in ${DEFAULT_CONFIG_RELATIVE_PATH} / XBROWSER_BROWSER_* env vars.`
            : `No custom Chromium source configured. Add ${DEFAULT_CONFIG_RELATIVE_PATH} or set XBROWSER_BROWSER_* env vars.`;
        throw new Error(
            setupMessage
        );
    }

    if (!force && existingExecutable) {
        const installedVersion = await getInstalledBrowserVersion(baseDir);
        if (!platformSource.version || installedVersion === platformSource.version) {
            return existingExecutable;
        }
    }

    const { installDir, installPath, versionFilePath, executableRelativePath } = buildInstallPaths(baseDir, platformId, platformSource);
    const archiveRoot = normalizeString(platformSource.archiveRoot);
    const archiveFileName = path.basename(new URL(platformSource.url).pathname || '') || 'custom-chromium.zip';
    const archivePath = path.join(installDir, archiveFileName);

    await fs.ensureDir(installDir);
    if (archiveRoot) {
        await fs.remove(path.join(installDir, archiveRoot)).catch(() => {});
    }
    if (executableRelativePath && !archiveRoot) {
        await fs.remove(installPath).catch(() => {});
    }

    await downloadFile(platformSource.url, archivePath);

    if (!isZipArchive(archivePath)) {
        await fs.remove(archivePath).catch(() => {});
        throw new Error(`Unsupported Chromium archive format: ${archiveFileName}. Only .zip is supported.`);
    }

    await extractZip(archivePath, { dir: installDir });
    await fs.remove(archivePath).catch(() => {});

    if (process.platform !== 'win32' && installPath) {
        await fs.chmod(installPath, 0o755).catch(() => {});
    }

    if (!installPath || !(await fs.pathExists(installPath))) {
        throw new Error(`Bundled browser missing after extraction: ${installPath || installDir}`);
    }

    await writeInstalledVersion(versionFilePath, {
        name: platformSource.name || BROWSER_NAME,
        version: platformSource.version,
        platform: platformId,
        url: platformSource.url,
        archiveRoot,
        executable: executableRelativePath
    });

    return installPath;
}

function resolveBrowserExecutable(baseDir) {
    const candidates = getExecutableCandidates(baseDir);
    return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

module.exports = {
    BROWSER_NAME,
    VERSION_FILE_NAME,
    DEFAULT_CONFIG_RELATIVE_PATH,
    getPlatformId,
    getPackedBrowserDir,
    getLocalBrowserDir,
    getBrowserSourceConfigPath,
    getExecutableCandidates,
    resolveBrowserExecutable,
    getInstalledBrowserVersion,
    hasConfiguredBrowserSource,
    ensureBundledBrowser
};
