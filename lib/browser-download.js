const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const extractZip = require('extract-zip');

const CFT_CHANNEL = process.env.XBROWSER_CFT_CHANNEL || 'Stable';
const CFT_API_URL = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json';
const VERSION_FILE_NAME = '.chrome-version.json';

function getPackedBrowserDir() {
    return path.join(process.resourcesPath || '', 'bin', 'chrome');
}

function getLocalBrowserDir(baseDir) {
    return path.join(baseDir, 'bin', 'chrome');
}

function getVersionFilePath(baseDir) {
    return path.join(getLocalBrowserDir(baseDir), VERSION_FILE_NAME);
}

function getPackedVersionFilePath() {
    return path.join(getPackedBrowserDir(), VERSION_FILE_NAME);
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

function getArchiveFolderName(platformId = getPlatformId()) {
    const table = {
        win32: 'chrome-win32',
        win64: 'chrome-win64',
        linux64: 'chrome-linux64',
        'mac-arm64': 'chrome-mac-arm64',
        'mac-x64': 'chrome-mac-x64'
    };

    return table[platformId] || '';
}

function getExecutableRelativePath(platformId = getPlatformId()) {
    const folder = getArchiveFolderName(platformId);
    if (!folder) {
        return '';
    }

    if (platformId === 'win32' || platformId === 'win64') {
        return path.join(folder, 'chrome.exe');
    }

    if (platformId === 'linux64') {
        return path.join(folder, 'chrome');
    }

    return path.join(folder, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
}

function getPreferredBrowserDir(baseDir) {
    if (String(baseDir || '').toLowerCase().includes('app.asar')) {
        return getPackedBrowserDir();
    }
    return getLocalBrowserDir(baseDir);
}

function getExecutablePath(baseDir) {
    const relativePath = getExecutableRelativePath();
    return relativePath ? path.join(getPreferredBrowserDir(baseDir), relativePath) : '';
}

function getPackedExecutablePath() {
    const relativePath = getExecutableRelativePath();
    return relativePath ? path.join(getPackedBrowserDir(), relativePath) : '';
}

function getExecutableCandidates(baseDir) {
    const relativePath = getExecutableRelativePath();
    const candidates = [];

    if (relativePath) {
        candidates.push(path.join(getLocalBrowserDir(baseDir), relativePath));
        candidates.push(path.join(getPackedBrowserDir(), relativePath));
    }

    if (process.platform === 'win32') {
        candidates.push(
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Chromium\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
        );
    }

    return candidates;
}

function requestJson(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'User-Agent': 'XBrowseR',
                'Accept': 'application/json'
            }
        }, (response) => {
            if ((response.statusCode || 500) >= 400) {
                response.resume();
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            let raw = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => raw += chunk);
            response.on('end', () => {
                try {
                    resolve(JSON.parse(raw));
                } catch (error) {
                    reject(error);
                }
            });
        });

        request.on('error', reject);
    });
}

function downloadFile(url, outputPath) {
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
                    await downloadFile(response.headers.location, outputPath);
                    resolve();
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

            await fs.ensureDir(path.dirname(outputPath));
            const fileStream = fs.createWriteStream(outputPath);
            response.pipe(fileStream);
            fileStream.on('finish', () => fileStream.close(resolve));
            fileStream.on('error', reject);
        });

        request.on('error', reject);
    });
}

async function resolveChromeDownload(platformId = getPlatformId(), channel = CFT_CHANNEL) {
    const payload = await requestJson(CFT_API_URL);
    const channelRecord = payload?.channels?.[channel];
    const downloads = Array.isArray(channelRecord?.downloads?.chrome) ? channelRecord.downloads.chrome : [];
    const match = downloads.find((item) => item?.platform === platformId);

    if (!match?.url || !channelRecord?.version) {
        throw new Error(`Chrome for Testing asset not found for ${platformId} (${channel})`);
    }

    return {
        channel,
        version: channelRecord.version,
        url: match.url,
        platform: platformId
    };
}

async function readInstalledVersion(versionFilePath) {
    try {
        const payload = await fs.readJson(versionFilePath);
        return String(payload?.version || '').trim();
    } catch (error) {
        return '';
    }
}

async function writeInstalledVersion(versionFilePath, download) {
    await fs.ensureDir(path.dirname(versionFilePath));
    await fs.writeJson(versionFilePath, {
        version: download.version,
        channel: download.channel,
        platform: download.platform,
        updatedAt: new Date().toISOString()
    }, { spaces: 2 });
}

async function ensureBundledBrowser(baseDir, { force = false } = {}) {
    const platformId = getPlatformId();
    if (!platformId) {
        throw new Error(`Unsupported platform for bundled browser: ${process.platform}-${process.arch}`);
    }

    const download = await resolveChromeDownload(platformId);
    const installPath = getExecutablePath(baseDir);
    const packedPath = getPackedExecutablePath();
    const localVersionPath = getVersionFilePath(baseDir);
    const packedVersionPath = getPackedVersionFilePath();

    if (!force && packedPath && await fs.pathExists(packedPath)) {
        const packedVersion = await readInstalledVersion(packedVersionPath);
        if (!packedVersion || packedVersion === download.version) {
            return packedPath;
        }
    }

    if (!force && installPath && await fs.pathExists(installPath)) {
        const localVersion = await readInstalledVersion(localVersionPath);
        if (localVersion === download.version) {
            return installPath;
        }
    }

    const installRoot = path.dirname(path.dirname(installPath));
    const folderName = getArchiveFolderName(platformId);
    const folderPath = path.join(installRoot, folderName);
    const archivePath = path.join(installRoot, path.basename(new URL(download.url).pathname));

    await fs.ensureDir(installRoot);
    await fs.remove(folderPath).catch(() => {});
    await downloadFile(download.url, archivePath);
    await extractZip(archivePath, { dir: installRoot });
    await fs.remove(archivePath).catch(() => {});

    if (process.platform !== 'win32') {
        await fs.chmod(installPath, 0o755);
    }

    if (!(await fs.pathExists(installPath))) {
        throw new Error(`Bundled browser missing after extraction: ${installPath}`);
    }

    await writeInstalledVersion(localVersionPath, download);

    return installPath;
}

function resolveBrowserExecutable(baseDir) {
    const candidates = getExecutableCandidates(baseDir);
    return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

module.exports = {
    CFT_API_URL,
    CFT_CHANNEL,
    getArchiveFolderName,
    getExecutableCandidates,
    getExecutablePath,
    getLocalBrowserDir,
    getPackedBrowserDir,
    getPlatformId,
    resolveBrowserExecutable,
    resolveChromeDownload,
    ensureBundledBrowser
};
