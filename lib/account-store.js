const path = require('path');
const fs = require('fs-extra');

const { SCHEMA_VERSION } = require('./store');

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

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

function createAccountStore(baseDir) {
    const dataDir = path.join(baseDir, 'data');
    const accountsFile = path.join(dataDir, 'accounts.json');

    fs.ensureDirSync(dataDir);

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
        accountsFile,
        async loadAccounts() {
            const payload = await readJson(accountsFile, { schemaVersion: SCHEMA_VERSION, items: [] });
            return normalizeListPayload(payload).items;
        },
        async saveAccounts(accounts) {
            await fs.writeJson(accountsFile, normalizeListPayload({
                schemaVersion: SCHEMA_VERSION,
                items: Array.isArray(accounts) ? accounts : []
            }), { spaces: 2 });
        }
    };
}

module.exports = {
    createAccountStore
};
