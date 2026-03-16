const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const zlib = require('zlib');
const extractZip = require('extract-zip');

const MIHOMO_REPO = 'MetaCubeX/mihomo';
const MIHOMO_VERSION = process.env.XBROWSER_MIHOMO_VERSION || 'latest';
const RELEASE_API_URL = MIHOMO_VERSION
    && MIHOMO_VERSION !== 'latest'
    ? `https://api.github.com/repos/${MIHOMO_REPO}/releases/tags/${MIHOMO_VERSION}`
    : `https://api.github.com/repos/${MIHOMO_REPO}/releases/latest`;
const VERSION_FILE_NAME = '.mihomo-version.json';

function getTargetFileName() {
    return process.platform === 'win32' ? 'mihomo.exe' : 'mihomo';
}

function getPackedBinDir() {
    return path.join(process.resourcesPath || '', 'bin');
}

function getLocalBinDir(baseDir) {
    return path.join(baseDir, 'bin');
}

function getVersionFilePath(baseDir) {
    return path.join(getLocalBinDir(baseDir), VERSION_FILE_NAME);
}

function getPackedVersionFilePath() {
    return path.join(getPackedBinDir(), VERSION_FILE_NAME);
}

function getPlatformAssetName(version) {
    const platform = process.platform;
    const arch = process.arch;

    const table = {
        win32: {
            x64: `mihomo-windows-amd64-${version}.zip`,
            ia32: `mihomo-windows-386-${version}.zip`,
            arm64: `mihomo-windows-arm64-${version}.zip`
        },
        linux: {
            x64: `mihomo-linux-amd64-${version}.gz`,
            arm64: `mihomo-linux-arm64-${version}.gz`,
            arm: `mihomo-linux-armv7-${version}.gz`
        },
        darwin: {
            x64: `mihomo-darwin-amd64-${version}.gz`,
            arm64: `mihomo-darwin-arm64-${version}.gz`
        }
    };

    return table[platform]?.[arch] || '';
}

function getPreferredInstallDir(baseDir) {
    if (String(baseDir || '').toLowerCase().includes('app.asar')) {
        return getPackedBinDir();
    }
    return getLocalBinDir(baseDir);
}

function getPreferredInstallPath(baseDir) {
    return path.join(getPreferredInstallDir(baseDir), `${process.platform}-${process.arch}`, getTargetFileName());
}

function getPackedInstallPath() {
    return path.join(getPackedBinDir(), `${process.platform}-${process.arch}`, getTargetFileName());
}

function requestJson(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'User-Agent': 'XBrowseR',
                'Accept': 'application/vnd.github+json'
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

async function resolveLatestMihomoRelease() {
    const release = await requestJson(RELEASE_API_URL);
    const version = String(release?.tag_name || '').trim();
    const assetName = getPlatformAssetName(version);
    const asset = Array.isArray(release?.assets)
        ? release.assets.find((item) => item?.name === assetName)
        : null;

    if (!version) {
        throw new Error('Failed to resolve Mihomo version from release metadata');
    }

    if (!assetName || !asset?.browser_download_url) {
        throw new Error(`Mihomo asset not found for ${process.platform}-${process.arch} (${version})`);
    }

    return {
        version,
        assetName,
        downloadUrl: asset.browser_download_url
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

async function writeInstalledVersion(versionFilePath, version) {
    await fs.ensureDir(path.dirname(versionFilePath));
    await fs.writeJson(versionFilePath, {
        version,
        updatedAt: new Date().toISOString()
    }, { spaces: 2 });
}

async function extractArchive(archivePath, installPath) {
    const targetName = getTargetFileName();
    const tempDir = path.join(path.dirname(archivePath), `${path.basename(archivePath)}-extract`);
    await fs.remove(tempDir).catch(() => {});
    await fs.ensureDir(tempDir);

    if (archivePath.endsWith('.zip')) {
        await extractZip(archivePath, { dir: tempDir });
        const candidates = await fs.readdir(tempDir);
        const binaryFile = candidates.find((name) => {
            const lower = name.toLowerCase();
            const targetExt = path.extname(targetName).toLowerCase();
            return lower.includes('mihomo') && (!targetExt || lower.endsWith(targetExt));
        });
        if (!binaryFile) {
            throw new Error(`Mihomo binary not found in ${path.basename(archivePath)}`);
        }
        await fs.ensureDir(path.dirname(installPath));
        await fs.copy(path.join(tempDir, binaryFile), installPath, { overwrite: true });
    } else if (archivePath.endsWith('.gz')) {
        await fs.ensureDir(path.dirname(installPath));
        await new Promise((resolve, reject) => {
            const source = fs.createReadStream(archivePath);
            const target = fs.createWriteStream(installPath, { mode: 0o755 });
            source
                .pipe(zlib.createGunzip())
                .pipe(target)
                .on('finish', resolve)
                .on('error', reject);
        });
    } else {
        throw new Error(`Unsupported archive format: ${archivePath}`);
    }

    if (process.platform !== 'win32') {
        await fs.chmod(installPath, 0o755);
    }

    await fs.remove(tempDir).catch(() => {});
}

async function ensureBundledMihomo(baseDir, { force = false } = {}) {
    const release = await resolveLatestMihomoRelease();
    const installPath = getPreferredInstallPath(baseDir);
    const packedPath = getPackedInstallPath();
    const localVersionPath = getVersionFilePath(baseDir);
    const packedVersionPath = getPackedVersionFilePath();

    if (!force && await fs.pathExists(packedPath)) {
        const packedVersion = await readInstalledVersion(packedVersionPath);
        if (!packedVersion || packedVersion === release.version) {
            return packedPath;
        }
    }

    if (!force && await fs.pathExists(installPath)) {
        const localVersion = await readInstalledVersion(localVersionPath);
        if (localVersion === release.version) {
            return installPath;
        }
    }

    const archivePath = path.join(getPreferredInstallDir(baseDir), release.assetName);

    await downloadFile(release.downloadUrl, archivePath);
    await extractArchive(archivePath, installPath);
    await fs.remove(archivePath).catch(() => {});
    await writeInstalledVersion(localVersionPath, release.version);

    return installPath;
}

module.exports = {
    MIHOMO_VERSION,
    MIHOMO_REPO,
    RELEASE_API_URL,
    getLocalBinDir,
    getPackedBinDir,
    getPlatformAssetName,
    getPreferredInstallPath,
    resolveLatestMihomoRelease,
    ensureBundledMihomo
};
