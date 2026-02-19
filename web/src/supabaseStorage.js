// ========== Supabase Storage Helper (REST API only, no SDK needed) ==========

const BUCKET = 'photos';
const MAX_STORAGE_MB = 900; // Auto-cleanup when exceeding this

// Get config from localStorage
function getConfig() {
    const url = localStorage.getItem('supabase_url') || '';
    const key = localStorage.getItem('supabase_key') || '';
    return { url: url.replace(/\/$/, ''), key };
}

function saveConfig(url, key) {
    localStorage.setItem('supabase_url', url.replace(/\/$/, ''));
    localStorage.setItem('supabase_key', key);
}

function isConfigured() {
    const { url, key } = getConfig();
    return url.length > 10 && key.length > 10;
}

// ========== Storage API calls ==========

async function storageHeaders() {
    const { key } = getConfig();
    return {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
    };
}

function storageUrl(path) {
    const { url } = getConfig();
    return `${url}/storage/v1${path}`;
}

// Upload a base64 JPEG image to Supabase Storage
async function uploadImage(base64Data, filename) {
    if (!isConfigured()) return { error: 'Supabase chưa cấu hình' };

    try {
        // Convert base64 to Blob
        const byteChars = atob(base64Data);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
            byteArray[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        const headers = await storageHeaders();
        headers['Content-Type'] = 'image/jpeg';

        const res = await fetch(storageUrl(`/object/${BUCKET}/${filename}`), {
            method: 'POST',
            headers,
            body: blob,
        });

        if (res.status === 400) {
            // File exists, try upsert
            const res2 = await fetch(storageUrl(`/object/${BUCKET}/${filename}`), {
                method: 'PUT',
                headers,
                body: blob,
            });
            if (!res2.ok) return { error: `Upload failed: ${res2.status}` };
            return { success: true, filename, size: blob.size };
        }

        if (!res.ok) return { error: `Upload failed: ${res.status}` };
        return { success: true, filename, size: blob.size };
    } catch (e) {
        return { error: e.message };
    }
}

// List all files in bucket
async function listFiles(sortBy = 'created_at', order = 'asc') {
    if (!isConfigured()) return [];

    try {
        const headers = await storageHeaders();
        headers['Content-Type'] = 'application/json';

        const res = await fetch(storageUrl(`/object/list/${BUCKET}`), {
            method: 'POST',
            headers,
            body: JSON.stringify({
                prefix: '',
                limit: 1000,
                offset: 0,
                sortBy: { column: sortBy, order },
            }),
        });

        if (!res.ok) return [];
        const files = await res.json();
        // Filter out folder placeholders
        return files.filter(f => f.name && !f.name.endsWith('/'));
    } catch {
        return [];
    }
}

// Delete a file
async function deleteFile(filename) {
    if (!isConfigured()) return false;

    try {
        const headers = await storageHeaders();
        headers['Content-Type'] = 'application/json';

        const res = await fetch(storageUrl(`/object/${BUCKET}`), {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ prefixes: [filename] }),
        });

        return res.ok;
    } catch {
        return false;
    }
}

// Delete multiple files
async function deleteFiles(filenames) {
    if (!isConfigured() || filenames.length === 0) return false;

    try {
        const headers = await storageHeaders();
        headers['Content-Type'] = 'application/json';

        const res = await fetch(storageUrl(`/object/${BUCKET}`), {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ prefixes: filenames }),
        });

        return res.ok;
    } catch {
        return false;
    }
}

// Get public URL for a file
function getPublicUrl(filename) {
    const { url } = getConfig();
    return `${url}/storage/v1/object/public/${BUCKET}/${filename}`;
}

// Get total storage used (in MB)
async function getStorageUsed() {
    const files = await listFiles();
    const totalBytes = files.reduce((sum, f) => sum + (f.metadata?.size || 0), 0);
    return {
        totalMB: totalBytes / (1024 * 1024),
        totalFiles: files.length,
        files,
    };
}

// Auto-cleanup: delete oldest files until under limit
async function autoCleanup(logFn = null) {
    const { totalMB, files } = await getStorageUsed();

    if (totalMB < MAX_STORAGE_MB) {
        if (logFn) logFn(`Storage: ${totalMB.toFixed(1)}MB / ${MAX_STORAGE_MB}MB — OK`);
        return 0;
    }

    if (logFn) logFn(`⚠ Storage ${totalMB.toFixed(1)}MB > ${MAX_STORAGE_MB}MB — Cleaning up...`);

    // Sort by created_at ascending (oldest first)
    const sorted = files.sort((a, b) =>
        new Date(a.created_at || 0) - new Date(b.created_at || 0)
    );

    let currentMB = totalMB;
    const toDelete = [];

    for (const file of sorted) {
        if (currentMB < MAX_STORAGE_MB * 0.8) break; // Target 80% of limit
        toDelete.push(file.name);
        currentMB -= (file.metadata?.size || 0) / (1024 * 1024);
    }

    if (toDelete.length > 0) {
        await deleteFiles(toDelete);
        if (logFn) logFn(`🗑 Deleted ${toDelete.length} old files. Now ~${currentMB.toFixed(1)}MB`);
    }

    return toDelete.length;
}

// Upload with auto-cleanup
async function uploadWithCleanup(base64Data, filename, logFn = null) {
    // Check and cleanup before upload
    await autoCleanup(logFn);

    // Upload
    const result = await uploadImage(base64Data, filename);
    if (result.success && logFn) {
        logFn(`☁️ Uploaded: ${filename} (${(result.size / 1024).toFixed(0)}KB)`);
    }
    if (result.error && logFn) {
        logFn(`☁️ Upload failed: ${result.error}`);
    }
    return result;
}

// Test connection
async function testConnection() {
    if (!isConfigured()) return { ok: false, error: 'Chưa cấu hình' };

    try {
        const headers = await storageHeaders();
        headers['Content-Type'] = 'application/json';

        // Try listing bucket
        const res = await fetch(storageUrl(`/object/list/${BUCKET}`), {
            method: 'POST',
            headers,
            body: JSON.stringify({ prefix: '', limit: 1 }),
        });

        if (res.ok) return { ok: true };
        if (res.status === 404) return { ok: false, error: `Bucket "${BUCKET}" chưa tạo. Vào Supabase Dashboard > Storage > New Bucket > tên: photos` };
        if (res.status === 401) return { ok: false, error: 'API Key sai' };
        return { ok: false, error: `Error: ${res.status}` };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ========== Template Data Sync ==========
const TEMPLATE_DATA_FILE = '_config/templates.json';

// Save template data to Supabase as JSON file
async function saveTemplateConfig(templateData) {
    if (!isConfigured()) return { error: 'Not configured' };
    try {
        // Strip out refImages (too large) and thumbnails (too large) for config file
        // Only save metadata: name, prompt, description, icon, category, isCustom, bgColor
        const stripped = {};
        for (const [id, data] of Object.entries(templateData)) {
            stripped[id] = {};
            for (const key of ['name', 'prompt', 'description', 'icon', 'category', 'isCustom', 'bgColor']) {
                if (data[key] !== undefined) stripped[id][key] = data[key];
            }
        }
        const json = JSON.stringify(stripped, null, 2);
        const blob = new Blob([json], { type: 'application/json' });

        const headers = await storageHeaders();
        headers['Content-Type'] = 'application/json';

        // Try PUT (upsert) first
        let res = await fetch(storageUrl(`/object/${BUCKET}/${TEMPLATE_DATA_FILE}`), {
            method: 'PUT', headers, body: blob,
        });
        if (!res.ok) {
            // Try POST (create)
            res = await fetch(storageUrl(`/object/${BUCKET}/${TEMPLATE_DATA_FILE}`), {
                method: 'POST', headers, body: blob,
            });
        }
        return res.ok ? { success: true } : { error: `Save failed: ${res.status}` };
    } catch (e) {
        return { error: e.message };
    }
}

// Load template data from Supabase
async function loadTemplateConfig() {
    if (!isConfigured()) return null;
    try {
        const url = getPublicUrl(TEMPLATE_DATA_FILE);
        const res = await fetch(url + '?t=' + Date.now()); // cache bust
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// Save template thumbnail as separate image file
async function saveTemplateThumbnail(templateId, base64Data) {
    if (!isConfigured()) return { error: 'Not configured' };
    const filename = `_config/thumb_${templateId}.jpg`;
    // Convert to smaller image
    const byteChars = atob(base64Data);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: 'image/jpeg' });

    const headers = await storageHeaders();
    headers['Content-Type'] = 'image/jpeg';

    let res = await fetch(storageUrl(`/object/${BUCKET}/${filename}`), {
        method: 'PUT', headers, body: blob,
    });
    if (!res.ok) {
        res = await fetch(storageUrl(`/object/${BUCKET}/${filename}`), {
            method: 'POST', headers, body: blob,
        });
    }
    return res.ok ? { success: true, url: getPublicUrl(filename) } : { error: `Upload failed: ${res.status}` };
}

// Get template thumbnail URL
function getTemplateThumbnailUrl(templateId) {
    return getPublicUrl(`_config/thumb_${templateId}.jpg`);
}

export {
    getConfig,
    saveConfig,
    isConfigured,
    uploadImage,
    uploadWithCleanup,
    listFiles,
    deleteFile,
    deleteFiles,
    getPublicUrl,
    getStorageUsed,
    autoCleanup,
    testConnection,
    saveTemplateConfig,
    loadTemplateConfig,
    saveTemplateThumbnail,
    getTemplateThumbnailUrl,
    BUCKET,
    MAX_STORAGE_MB,
};
