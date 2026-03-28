const path = require('path');
const fs = require('fs-extra');

const SCHEMA_VERSION = 1;

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function createStore(baseDir) {
    const dataDir = path.join(baseDir, 'data');
    const profilesDir = path.join(dataDir, 'profiles');
    const accountsDir = path.join(dataDir, 'accounts');
    const extensionsDir = path.join(dataDir, 'extensions');
    const templatesDir = path.join(dataDir, 'templates');
    const trashDir = path.join(dataDir, 'trash');
    const profilesFile = path.join(dataDir, 'profiles.json');
    const templatesFile = path.join(templatesDir, 'index.json');
    const settingsFile = path.join(dataDir, 'settings.json');
    const runtimeDir = path.join(dataDir, 'runtime');

    fs.ensureDirSync(dataDir);
    fs.ensureDirSync(profilesDir);
    fs.ensureDirSync(accountsDir);
    fs.ensureDirSync(extensionsDir);
    fs.ensureDirSync(templatesDir);
    fs.ensureDirSync(trashDir);
    fs.ensureDirSync(runtimeDir);

    const defaultSettings = {
        schemaVersion: SCHEMA_VERSION,
        projects: [],
        extensions: [],
        proxies: [],
        proxyAllocation: {
            mode: 'manual'
        },
        subscriptions: [],
        browser: {
            source: 'official-chromium-snapshots',
            activeVersion: ''
        },
        api: {
            enabled: true,
            port: 23919
        },
        agent: {
            providers: [],
            activeProviderId: '',
            toolTimeoutMs: 20000,
            maxExecutionSteps: 10
        },
        ui: {
            activeView: 'home',
            homeProjectId: 'all'
        }
    };

    function normalizeListPayload(payload) {
        if (Array.isArray(payload)) {
            return {
                schemaVersion: SCHEMA_VERSION,
                items: payload
            };
        }

        if (!isPlainObject(payload)) {
            return {
                schemaVersion: SCHEMA_VERSION,
                items: []
            };
        }

        return {
            schemaVersion: Number(payload.schemaVersion) || SCHEMA_VERSION,
            items: Array.isArray(payload.items) ? payload.items : []
        };
    }

    function normalizeSettings(payload) {
        const source = isPlainObject(payload) ? payload : {};
        return {
            ...defaultSettings,
            ...source,
            schemaVersion: SCHEMA_VERSION,
            proxyAllocation: { ...defaultSettings.proxyAllocation, ...(source.proxyAllocation || {}) },
            browser: { ...defaultSettings.browser, ...(source.browser || {}) },
            api: { ...defaultSettings.api, ...(source.api || {}) },
            agent: { ...defaultSettings.agent, ...(source.agent || {}) },
            ui: { ...defaultSettings.ui, ...(source.ui || {}) }
        };
    }

    async function readJson(file, fallback) {
        if (!(await fs.pathExists(file))) {
            return fallback;
        }
        try {
            return await fs.readJson(file);
        } catch (error) {
            return fallback;
        }
    }

    return {
        dataDir,
        profilesDir,
        accountsDir,
        extensionsDir,
        templatesDir,
        trashDir,
        runtimeDir,
        profilesFile,
        templatesFile,
        settingsFile,
        async loadProfiles() {
            const payload = await readJson(profilesFile, { schemaVersion: SCHEMA_VERSION, items: [] });
            return normalizeListPayload(payload).items;
        },
        async saveProfiles(profiles) {
            await fs.writeJson(profilesFile, normalizeListPayload({
                schemaVersion: SCHEMA_VERSION,
                items: Array.isArray(profiles) ? profiles : []
            }), { spaces: 2 });
        },
        async loadTemplates() {
            const payload = await readJson(templatesFile, { schemaVersion: SCHEMA_VERSION, items: [] });
            return normalizeListPayload(payload).items;
        },
        async saveTemplates(templates) {
            await fs.writeJson(templatesFile, normalizeListPayload({
                schemaVersion: SCHEMA_VERSION,
                items: Array.isArray(templates) ? templates : []
            }), { spaces: 2 });
        },
        async loadSettings() {
            const settings = await readJson(settingsFile, defaultSettings);
            return normalizeSettings(settings);
        },
        async saveSettings(settings) {
            await fs.writeJson(settingsFile, normalizeSettings(settings), { spaces: 2 });
        }
    };
}

module.exports = {
    SCHEMA_VERSION,
    createStore
};
