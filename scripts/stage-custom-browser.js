const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const extractZip = require('extract-zip');

const {
    BROWSER_NAME,
    VERSION_FILE_NAME,
    DEFAULT_CONFIG_RELATIVE_PATH,
    getPlatformId
} = require('../lib/browser-download');

function printUsage(message = '') {
    if (message) {
        console.error(message);
        console.error('');
    }
    console.error('Usage: node scripts/stage-custom-browser.js --source <zip-or-dir> --version <version> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --source <path>         Required. Local zip file or extracted Chromium directory.');
    console.error('  --version <value>       Required. Version label written to metadata.');
    console.error(`  --name <value>          Optional. Browser name, default "${BROWSER_NAME}".`);
    console.error('  --target-dir <path>     Optional. Relative repo path, default "bin/chromium".');
    console.error('  --install-dir <name>    Optional. Config installDir, default "chromium".');
    console.error('  --executable <path>     Optional. Relative executable path inside the archive/folder.');
    console.error('  --archive-root <path>   Optional. Relative archive root folder.');
    console.error('  --config <path>         Optional. Config output path, default "build/browser-source.json".');
    console.error('  --no-write-config       Optional. Skip writing build/browser-source.json.');
}

function parseArgs(argv) {
    const result = {
        writeConfig: true
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = String(argv[index] || '').trim();
        if (!token) continue;

        if (token === '--no-write-config') {
            result.writeConfig = false;
            continue;
        }

        if (!token.startsWith('--')) {
            throw new Error(`Unexpected argument: ${token}`);
        }

        const key = token.slice(2);
        const value = argv[index + 1];
        if (typeof value !== 'string' || value.startsWith('--')) {
            throw new Error(`Missing value for --${key}`);
        }
        result[key] = value;
        index += 1;
    }

    if (!result.source) {
        throw new Error('Missing required --source');
    }
    if (!result.version) {
        throw new Error('Missing required --version');
    }

    return result;
}

function normalizeRelativePath(value = '') {
    return String(value || '')
        .replace(/[\\/]+/g, '/')
        .replace(/^\.\//, '')
        .trim();
}

function getDefaultExecutableCandidates(platformId = getPlatformId()) {
    if (platformId === 'win32' || platformId === 'win64') {
        return [
            'chrome-win64/chrome.exe',
            'chromium-win64/chrome.exe',
            'chrome-win32/chrome.exe',
            'chromium-win32/chrome.exe',
            'chrome.exe',
            'chromium.exe'
        ];
    }

    if (platformId === 'linux64') {
        return [
            'chromium-linux64/chrome',
            'chrome-linux64/chrome',
            'chrome',
            'chromium'
        ];
    }

    return [
        'Chromium.app/Contents/MacOS/Chromium',
        'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
    ];
}

async function collectFiles(rootDir) {
    const queue = [''];
    const files = [];

    while (queue.length) {
        const relativeDir = queue.shift();
        const absoluteDir = path.join(rootDir, relativeDir);
        const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
        for (const entry of entries) {
            const relativePath = path.join(relativeDir, entry.name);
            if (entry.isDirectory()) {
                queue.push(relativePath);
                continue;
            }
            files.push(normalizeRelativePath(relativePath));
        }
    }

    return files;
}

async function detectExecutable(rootDir, explicitExecutable = '') {
    if (explicitExecutable) {
        const normalized = normalizeRelativePath(explicitExecutable);
        if (await fs.pathExists(path.join(rootDir, normalized))) {
            return normalized;
        }
        throw new Error(`Explicit executable not found inside source: ${normalized}`);
    }

    const platformId = getPlatformId();
    const preferred = getDefaultExecutableCandidates(platformId);
    for (const candidate of preferred) {
        if (await fs.pathExists(path.join(rootDir, candidate))) {
            return normalizeRelativePath(candidate);
        }
    }

    const files = await collectFiles(rootDir);
    const suffixes = platformId === 'win64' || platformId === 'win32'
        ? ['/chrome.exe', '/chromium.exe']
        : (platformId === 'linux64' ? ['/chrome', '/chromium'] : ['/Contents/MacOS/Chromium']);

    const detected = files.find((filePath) => suffixes.some((suffix) => filePath.endsWith(suffix) || filePath === suffix.slice(1)));
    return detected || '';
}

function inferArchiveRoot(executablePath = '') {
    const normalized = normalizeRelativePath(executablePath);
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 1) {
        return '';
    }
    return parts.slice(0, -1).join('/');
}

async function prepareSourceDirectory(sourcePath) {
    const resolved = path.resolve(sourcePath);
    if (!(await fs.pathExists(resolved))) {
        throw new Error(`Source not found: ${resolved}`);
    }

    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
        return {
            rootDir: resolved,
            cleanup: async () => {}
        };
    }

    if (!/\.zip$/i.test(resolved)) {
        throw new Error(`Unsupported source format: ${resolved}. Use a directory or .zip archive.`);
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xbrowser-chromium-'));
    await extractZip(resolved, { dir: tempDir });
    return {
        rootDir: tempDir,
        cleanup: async () => {
            await fs.remove(tempDir).catch(() => {});
        }
    };
}

async function copyDirectoryContents(sourceDir, targetDir) {
    await fs.ensureDir(targetDir);
    const entries = await fs.readdir(sourceDir);
    for (const entry of entries) {
        await fs.copy(path.join(sourceDir, entry), path.join(targetDir, entry), {
            overwrite: true,
            errorOnExist: false
        });
    }
}

async function writeBrowserSourceConfig(repoRoot, args, executablePath, archiveRoot) {
    const installDir = String(args['install-dir'] || 'chromium').trim() || 'chromium';
    const configPath = path.resolve(repoRoot, args.config || DEFAULT_CONFIG_RELATIVE_PATH);
    const platformId = getPlatformId();
    const payload = {
        name: String(args.name || BROWSER_NAME).trim() || BROWSER_NAME,
        installDir,
        platforms: {
            [platformId]: {
                version: String(args.version || '').trim(),
                archiveRoot,
                executable: executablePath
            }
        }
    };

    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, payload, { spaces: 2 });
    return configPath;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const repoRoot = path.resolve(__dirname, '..');
    const installDir = String(args['install-dir'] || 'chromium').trim() || 'chromium';
    const targetDir = path.resolve(repoRoot, args['target-dir'] || path.join('bin', installDir));
    const source = await prepareSourceDirectory(args.source);

    try {
        const executablePath = await detectExecutable(source.rootDir, args.executable || '');
        if (!executablePath) {
            throw new Error('Unable to detect Chromium executable. Pass --executable explicitly.');
        }
        const archiveRoot = normalizeRelativePath(args['archive-root'] || inferArchiveRoot(executablePath));
        const stagedExecutablePath = path.join(targetDir, executablePath);

        await fs.remove(targetDir);
        await copyDirectoryContents(source.rootDir, targetDir);
        await fs.ensureDir(targetDir);
        await fs.writeJson(path.join(targetDir, VERSION_FILE_NAME), {
            name: String(args.name || BROWSER_NAME).trim() || BROWSER_NAME,
            version: String(args.version || '').trim(),
            platform: getPlatformId(),
            archiveRoot,
            executable: executablePath,
            updatedAt: new Date().toISOString()
        }, { spaces: 2 });

        if (!(await fs.pathExists(stagedExecutablePath))) {
            throw new Error(`Staged executable missing: ${stagedExecutablePath}`);
        }

        let configPath = '';
        if (args.writeConfig) {
            configPath = await writeBrowserSourceConfig(repoRoot, args, executablePath, archiveRoot);
        }

        console.log(`${args.name || BROWSER_NAME} staged successfully.`);
        console.log(`Target: ${targetDir}`);
        console.log(`Executable: ${stagedExecutablePath}`);
        if (configPath) {
            console.log(`Config: ${configPath}`);
        }
    } finally {
        await source.cleanup();
    }
}

main().catch((error) => {
    printUsage(error?.message || String(error));
    process.exitCode = 1;
});
