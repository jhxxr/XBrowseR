const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const extractZip = require('extract-zip');

const BROWSER_NAME = 'Chromium';
const VERSION_FILE_NAME = '.browser-version.json';
const DEFAULT_CONFIG_RELATIVE_PATH = path.join('build', 'browser-source.json');
const OFFICIAL_BROWSER_SOURCE_ID = 'official-chromium-snapshots';
const OFFICIAL_BROWSER_SOURCE_NAME = 'Official Chromium Snapshots';
const OFFICIAL_BROWSER_BUCKET_URL = 'https://commondatastorage.googleapis.com/chromium-browser-snapshots';
const OFFICIAL_BROWSER_DIR_NAME = 'chromium';
const OFFICIAL_BROWSER_VARIANTS_DIR = 'official';

const BROWSER_CONFIG_ENV = process.env.XBROWSER_BROWSER_CONFIG || '';
const BROWSER_BINARY_ENV = process.env.XBROWSER_BROWSER_BINARY || '';
const BROWSER_DOWNLOAD_URL_ENV = process.env.XBROWSER_BROWSER_DOWNLOAD_URL || '';
const BROWSER_VERSION_ENV = process.env.XBROWSER_BROWSER_VERSION || '';
const BROWSER_ARCHIVE_ROOT_ENV = process.env.XBROWSER_BROWSER_ARCHIVE_ROOT || '';
const BROWSER_EXECUTABLE_ENV = process.env.XBROWSER_BROWSER_EXECUTABLE || '';
const BROWSER_INSTALL_DIR_ENV = process.env.XBROWSER_BROWSER_INSTALL_DIR || OFFICIAL_BROWSER_DIR_NAME;

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

function getOfficialSnapshotPlatform(platformId = getPlatformId()) {
    const table = {
        win32: 'Win',
        win64: 'Win_x64',
        linux64: 'Linux_x64',
        'mac-arm64': 'Mac_Arm',
        'mac-x64': 'Mac'
    };
    return table[platformId] || '';
}

function getOfficialArchiveRoot(platformId = getPlatformId()) {
    if (platformId === 'win32' || platformId === 'win64') {
        return 'chrome-win';
    }
    if (platformId === 'linux64') {
        return 'chrome-linux';
    }
    return 'chrome-mac';
}

function getOfficialExecutableRelativePath(platformId = getPlatformId()) {
    const archiveRoot = getOfficialArchiveRoot(platformId);
    if (!archiveRoot) {
        return '';
    }

    if (platformId === 'win32' || platformId === 'win64') {
        return path.join(archiveRoot, 'chrome.exe');
    }
    if (platformId === 'linux64') {
        return path.join(archiveRoot, 'chrome');
    }
    return path.join(archiveRoot, 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
}

function getOfficialArchiveName(platformId = getPlatformId()) {
    if (platformId === 'win32' || platformId === 'win64') {
        return 'chrome-win.zip';
    }
    if (platformId === 'linux64') {
        return 'chrome-linux.zip';
    }
    return 'chrome-mac.zip';
}

function getPackedBrowserDir(dirName = BROWSER_INSTALL_DIR_ENV || OFFICIAL_BROWSER_DIR_NAME) {
    if (!process.resourcesPath) {
        return '';
    }
    return path.join(process.resourcesPath, 'bin', dirName);
}

function getLocalBrowserDir(baseDir, dirName = BROWSER_INSTALL_DIR_ENV || OFFICIAL_BROWSER_DIR_NAME) {
    return path.join(baseDir, 'bin', dirName);
}

function getOfficialBrowserRoot(baseDir) {
    return path.join(getLocalBrowserDir(baseDir, OFFICIAL_BROWSER_DIR_NAME), OFFICIAL_BROWSER_VARIANTS_DIR);
}

function getOfficialBrowserVersionDir(baseDir, revision) {
    return path.join(getOfficialBrowserRoot(baseDir), String(revision || '').trim());
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

function requestText(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'User-Agent': 'XBrowseR',
                'Accept': '*/*'
            }
        }, (response) => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                response.resume();
                requestText(response.headers.location).then(resolve, reject);
                return;
            }

            if ((response.statusCode || 500) >= 400) {
                response.resume();
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            let raw = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => raw += chunk);
            response.on('end', () => resolve(raw));
        });

        request.on('error', reject);
    });
}

function requestBinary(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'User-Agent': 'XBrowseR',
                'Accept': 'application/octet-stream'
            }
        }, (response) => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                response.resume();
                requestBinary(response.headers.location).then(resolve, reject);
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

function reportProgress(callback, payload = {}) {
    if (typeof callback === 'function') {
        callback(payload);
    }
}

async function downloadFile(url, outputPath, { onProgress } = {}) {
    const response = await requestBinary(url);
    const total = Math.max(0, Number(response.headers['content-length']) || 0);
    let transferred = 0;

    await fs.ensureDir(path.dirname(outputPath));
    await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(outputPath);
        reportProgress(onProgress, {
            phase: 'download',
            percent: total > 0 ? 0 : null,
            transferred,
            total
        });
        response.on('data', (chunk) => {
            transferred += chunk.length;
            reportProgress(onProgress, {
                phase: 'download',
                percent: total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : null,
                transferred,
                total
            });
        });
        response.on('error', reject);
        response.pipe(fileStream);
        fileStream.on('finish', () => fileStream.close(resolve));
        fileStream.on('error', reject);
    });
    reportProgress(onProgress, {
        phase: 'download',
        percent: 100,
        transferred,
        total
    });
}

async function readInstalledVersion(versionFilePath) {
    const payload = await readJsonSafe(versionFilePath);
    return normalizeString(payload?.version);
}

async function writeInstalledVersion(versionFilePath, metadata = {}) {
    await fs.ensureDir(path.dirname(versionFilePath));
    await fs.writeJson(versionFilePath, {
        source: normalizeString(metadata.source, OFFICIAL_BROWSER_SOURCE_ID),
        name: normalizeString(metadata.name, BROWSER_NAME),
        version: normalizeString(metadata.version),
        revision: normalizeString(metadata.revision),
        platform: normalizeString(metadata.platform),
        url: normalizeString(metadata.url),
        archiveRoot: normalizeString(metadata.archiveRoot),
        executable: normalizeString(metadata.executable),
        installedAt: new Date().toISOString()
    }, { spaces: 2 });
}

function normalizePlatformSource(source = {}, fallbackName = BROWSER_NAME) {
    return {
        source: normalizeString(source.source),
        name: normalizeString(source.name, fallbackName),
        installDir: normalizeString(source.installDir, BROWSER_INSTALL_DIR_ENV || OFFICIAL_BROWSER_DIR_NAME),
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
        installDir: BROWSER_INSTALL_DIR_ENV || OFFICIAL_BROWSER_DIR_NAME,
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
        installDir: normalizeString(platformSource.installDir, normalizeString(configPayload.installDir, BROWSER_INSTALL_DIR_ENV || OFFICIAL_BROWSER_DIR_NAME))
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

function getConfiguredBrowserInstallDirNames(platformSource = null) {
    const installDirNames = [normalizeString(platformSource?.installDir, BROWSER_INSTALL_DIR_ENV || OFFICIAL_BROWSER_DIR_NAME)];

    if (!installDirNames.includes(OFFICIAL_BROWSER_DIR_NAME)) {
        installDirNames.push(OFFICIAL_BROWSER_DIR_NAME);
    }

    return unique(installDirNames);
}

function getConfiguredArchiveRoots(platformId = getPlatformId()) {
    const table = {
        win32: ['chromium-win32', 'chrome-win32', 'chrome-win'],
        win64: ['chromium-win64', 'chrome-win64', 'chrome-win'],
        linux64: ['chromium-linux64', 'chrome-linux64', 'chrome-linux'],
        'mac-arm64': ['Chromium.app', 'chrome-mac-arm64'],
        'mac-x64': ['Chromium.app', 'chrome-mac-x64']
    };

    return table[platformId] || [];
}

function getConfiguredExecutableLeaves(platformId = getPlatformId()) {
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

function buildConfiguredExecutableCandidates(platformId = getPlatformId(), platformSource = null) {
    const directExecutable = normalizeString(platformSource?.executable);
    const archiveRoots = unique([
        normalizeString(platformSource?.archiveRoot),
        ...getConfiguredArchiveRoots(platformId)
    ]);
    const executableLeaves = getConfiguredExecutableLeaves(platformId);
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

function getConfiguredExecutableCandidates(baseDir) {
    const platformId = getPlatformId();
    if (!platformId) {
        return [];
    }

    const platformSource = resolvePlatformSourceSync(baseDir, platformId);
    const explicitBinary = normalizeString(platformSource?.binary);
    const relativeExecutables = buildConfiguredExecutableCandidates(platformId, platformSource);
    const installDirs = getConfiguredBrowserInstallDirNames(platformSource);
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

function getConfiguredVersionFileCandidates(baseDir) {
    const platformId = getPlatformId();
    const platformSource = resolvePlatformSourceSync(baseDir, platformId);
    const installDirs = getConfiguredBrowserInstallDirNames(platformSource);
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

async function fetchLatestOfficialRevision(platformId = getPlatformId()) {
    const snapshotPlatform = getOfficialSnapshotPlatform(platformId);
    if (!snapshotPlatform) {
        throw new Error(`Official Chromium snapshots are not available for ${platformId}`);
    }
    return normalizeString(await requestText(`${OFFICIAL_BROWSER_BUCKET_URL}/${snapshotPlatform}/LAST_CHANGE`));
}

function parseRevisionListFromBucket(xmlText, snapshotPlatform) {
    const pattern = new RegExp(`<Prefix>${snapshotPlatform}/(\\d+)/<\\/Prefix>`, 'g');
    const revisions = [];
    let match = null;
    while ((match = pattern.exec(xmlText)) !== null) {
        revisions.push(match[1]);
    }
    return unique(revisions);
}

async function fetchAvailableOfficialBrowsers(limit = 20, platformId = getPlatformId()) {
    const snapshotPlatform = getOfficialSnapshotPlatform(platformId);
    if (!snapshotPlatform) {
        return [];
    }

    const latestRevision = await fetchLatestOfficialRevision(platformId);
    if (!latestRevision) {
        return [];
    }

    let prefixLength = Math.min(3, latestRevision.length);
    let revisions = [];

    while (prefixLength <= latestRevision.length) {
        const prefix = `${snapshotPlatform}/${latestRevision.slice(0, prefixLength)}`;
        const xmlText = await requestText(`${OFFICIAL_BROWSER_BUCKET_URL}/?prefix=${encodeURIComponent(prefix)}&delimiter=/`);
        revisions = parseRevisionListFromBucket(xmlText, snapshotPlatform)
            .sort((left, right) => Number(left) - Number(right));

        if (revisions.length < 1000 || prefixLength === latestRevision.length) {
            break;
        }
        prefixLength += 1;
    }

    if (!revisions.includes(latestRevision)) {
        revisions.push(latestRevision);
        revisions.sort((left, right) => Number(left) - Number(right));
    }

    return revisions.slice(-limit).reverse().map((revision, index) => ({
        id: revision,
        version: revision,
        label: index === 0 ? `r${revision} (latest)` : `r${revision}`,
        source: OFFICIAL_BROWSER_SOURCE_ID,
        url: `${OFFICIAL_BROWSER_BUCKET_URL}/${snapshotPlatform}/${revision}/${getOfficialArchiveName(platformId)}`,
        latest: index === 0
    }));
}

function normalizeInstalledBrowserRecord(rootDir, metadata = {}, fallbackRevision = '') {
    const platformId = getPlatformId();
    const executableRelativePath = normalizeString(metadata.executable, getOfficialExecutableRelativePath(platformId));
    const revision = normalizeString(metadata.revision || metadata.version, fallbackRevision);
    return {
        id: revision,
        revision,
        source: normalizeString(metadata.source, OFFICIAL_BROWSER_SOURCE_ID),
        name: normalizeString(metadata.name, BROWSER_NAME),
        version: normalizeString(metadata.version, revision),
        label: `r${revision}`,
        rootDir,
        archiveRoot: normalizeString(metadata.archiveRoot, getOfficialArchiveRoot(platformId)),
        executable: executableRelativePath,
        executablePath: executableRelativePath ? path.join(rootDir, executableRelativePath) : '',
        installedAt: normalizeString(metadata.installedAt)
    };
}

function listInstalledBrowsers(baseDir) {
    const installRoot = getOfficialBrowserRoot(baseDir);
    if (!fs.existsSync(installRoot)) {
        return [];
    }

    const records = [];
    for (const entry of fs.readdirSync(installRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
            continue;
        }
        const rootDir = path.join(installRoot, entry.name);
        const metadata = readJsonSyncSafe(path.join(rootDir, VERSION_FILE_NAME)) || {};
        const record = normalizeInstalledBrowserRecord(rootDir, metadata, entry.name);
        if (!record.id || !record.executablePath || !fs.existsSync(record.executablePath)) {
            continue;
        }
        records.push(record);
    }

    return records.sort((left, right) => Number(right.revision) - Number(left.revision));
}

function resolveInstalledBrowser(baseDir, activeVersion = '') {
    const installed = listInstalledBrowsers(baseDir);
    if (!installed.length) {
        return null;
    }

    const preferred = normalizeString(activeVersion);
    if (preferred) {
        const match = installed.find((item) => item.id === preferred || item.version === preferred);
        if (match) {
            return match;
        }
    }

    return installed[0];
}

async function installOfficialBrowserRevision(baseDir, revision, { force = false, onProgress } = {}) {
    const platformId = getPlatformId();
    const snapshotPlatform = getOfficialSnapshotPlatform(platformId);
    const archiveName = getOfficialArchiveName(platformId);
    const normalizedRevision = normalizeString(revision);

    if (!snapshotPlatform || !archiveName || !normalizedRevision) {
        throw new Error(`Unsupported official Chromium revision request for ${platformId}`);
    }

    const versionDir = getOfficialBrowserVersionDir(baseDir, normalizedRevision);
    const executableRelativePath = getOfficialExecutableRelativePath(platformId);
    const executablePath = path.join(versionDir, executableRelativePath);

    if (!force && fs.existsSync(executablePath)) {
        reportProgress(onProgress, {
            phase: 'completed',
            percent: 100,
            revision: normalizedRevision
        });
        return executablePath;
    }

    const downloadUrl = `${OFFICIAL_BROWSER_BUCKET_URL}/${snapshotPlatform}/${normalizedRevision}/${archiveName}`;
    const archivePath = path.join(getOfficialBrowserRoot(baseDir), `${normalizedRevision}.zip`);

    reportProgress(onProgress, {
        phase: 'prepare',
        percent: 2,
        revision: normalizedRevision
    });
    await fs.ensureDir(getOfficialBrowserRoot(baseDir));
    await fs.remove(versionDir).catch(() => {});
    await downloadFile(downloadUrl, archivePath, {
        onProgress: (payload) => reportProgress(onProgress, {
            ...payload,
            revision: normalizedRevision
        })
    });
    reportProgress(onProgress, {
        phase: 'extract',
        percent: 94,
        revision: normalizedRevision
    });
    await extractZip(archivePath, { dir: versionDir });
    await fs.remove(archivePath).catch(() => {});

    if (process.platform !== 'win32' && executablePath) {
        await fs.chmod(executablePath, 0o755).catch(() => {});
    }

    if (!(await fs.pathExists(executablePath))) {
        throw new Error(`Official Chromium executable missing after extraction: ${executablePath}`);
    }

    reportProgress(onProgress, {
        phase: 'finalize',
        percent: 98,
        revision: normalizedRevision
    });
    await writeInstalledVersion(path.join(versionDir, VERSION_FILE_NAME), {
        source: OFFICIAL_BROWSER_SOURCE_ID,
        name: OFFICIAL_BROWSER_SOURCE_NAME,
        version: normalizedRevision,
        revision: normalizedRevision,
        platform: platformId,
        url: downloadUrl,
        archiveRoot: getOfficialArchiveRoot(platformId),
        executable: executableRelativePath
    });

    reportProgress(onProgress, {
        phase: 'completed',
        percent: 100,
        revision: normalizedRevision
    });
    return executablePath;
}

async function ensureConfiguredBrowser(baseDir, platformSource, { force = false } = {}) {
    const platformId = getPlatformId();
    const explicitBinary = normalizeString(platformSource?.binary);
    if (explicitBinary) {
        if (await fs.pathExists(explicitBinary)) {
            return explicitBinary;
        }
        if (!platformSource?.url) {
            throw new Error(`Configured ${platformSource.name || BROWSER_NAME} executable not found: ${explicitBinary}`);
        }
    }

    const existingExecutable = getConfiguredExecutableCandidates(baseDir)
        .find((candidate) => candidate && fs.existsSync(candidate)) || '';

    if (!platformSource?.url) {
        if (existingExecutable && !force) {
            return existingExecutable;
        }
        return '';
    }

    if (!force && existingExecutable) {
        const versionFiles = getConfiguredVersionFileCandidates(baseDir);
        for (const versionFile of versionFiles) {
            const installedVersion = await readInstalledVersion(versionFile);
            if (!platformSource.version || installedVersion === platformSource.version) {
                return existingExecutable;
            }
        }
    }

    const installDirName = normalizeString(platformSource?.installDir, BROWSER_INSTALL_DIR_ENV || OFFICIAL_BROWSER_DIR_NAME);
    const installDir = String(baseDir || '').toLowerCase().includes('app.asar')
        ? getPackedBrowserDir(installDirName)
        : getLocalBrowserDir(baseDir, installDirName);
    const executableRelativePath = buildConfiguredExecutableCandidates(platformId, platformSource)[0] || '';
    const installPath = executableRelativePath ? path.join(installDir, executableRelativePath) : '';
    const archiveRoot = normalizeString(platformSource.archiveRoot);
    const archiveFileName = path.basename(new URL(platformSource.url).pathname || '') || 'chromium.zip';
    const archivePath = path.join(installDir, archiveFileName);

    await fs.ensureDir(installDir);
    if (archiveRoot) {
        await fs.remove(path.join(installDir, archiveRoot)).catch(() => {});
    }
    if (executableRelativePath && !archiveRoot) {
        await fs.remove(installPath).catch(() => {});
    }

    await downloadFile(platformSource.url, archivePath);
    await extractZip(archivePath, { dir: installDir });
    await fs.remove(archivePath).catch(() => {});

    if (process.platform !== 'win32' && installPath) {
        await fs.chmod(installPath, 0o755).catch(() => {});
    }

    if (!installPath || !(await fs.pathExists(installPath))) {
        throw new Error(`Configured browser missing after extraction: ${installPath || installDir}`);
    }

    await writeInstalledVersion(path.join(installDir, VERSION_FILE_NAME), {
        source: normalizeString(platformSource.source, 'custom'),
        name: platformSource.name || BROWSER_NAME,
        version: platformSource.version,
        platform: platformId,
        url: platformSource.url,
        archiveRoot,
        executable: executableRelativePath
    });

    return installPath;
}

function resolveBrowserExecutable(baseDir, options = {}) {
    const activeVersion = normalizeString(options.activeVersion);

    const configuredExecutable = getConfiguredExecutableCandidates(baseDir)
        .find((candidate) => candidate && fs.existsSync(candidate)) || '';
    if (configuredExecutable) {
        return configuredExecutable;
    }

    const installed = resolveInstalledBrowser(baseDir, activeVersion);
    return installed?.executablePath || '';
}

async function ensureBundledBrowser(baseDir, options = {}) {
    const { force = false, activeVersion = '' } = options;

    const platformId = getPlatformId();
    if (!platformId) {
        throw new Error(`Unsupported platform for bundled browser: ${process.platform}-${process.arch}`);
    }

    const platformSource = await resolvePlatformSource(baseDir, platformId);
    if (platformSource) {
        const configured = await ensureConfiguredBrowser(baseDir, platformSource, { force });
        if (configured) {
            return configured;
        }
    }

    const installed = resolveInstalledBrowser(baseDir, activeVersion);
    if (installed?.executablePath && !force) {
        return installed.executablePath;
    }

    const revisionToInstall = normalizeString(activeVersion) || await fetchLatestOfficialRevision(platformId);
    return installOfficialBrowserRevision(baseDir, revisionToInstall, { force });
}

async function getInstalledBrowserVersion(baseDir, options = {}) {
    const activeVersion = normalizeString(options.activeVersion);

    for (const versionFile of getConfiguredVersionFileCandidates(baseDir)) {
        const version = await readInstalledVersion(versionFile);
        if (version) {
            return version;
        }
    }

    const installed = resolveInstalledBrowser(baseDir, activeVersion);
    return installed?.version || '';
}

module.exports = {
    BROWSER_NAME,
    VERSION_FILE_NAME,
    DEFAULT_CONFIG_RELATIVE_PATH,
    OFFICIAL_BROWSER_SOURCE_ID,
    OFFICIAL_BROWSER_SOURCE_NAME,
    OFFICIAL_BROWSER_BUCKET_URL,
    getPlatformId,
    getPackedBrowserDir,
    getLocalBrowserDir,
    getOfficialBrowserRoot,
    getBrowserSourceConfigPath,
    hasConfiguredBrowserSource,
    listInstalledBrowsers,
    fetchLatestOfficialRevision,
    fetchAvailableOfficialBrowsers,
    installOfficialBrowserRevision,
    resolveBrowserExecutable,
    getInstalledBrowserVersion,
    ensureBundledBrowser
};
