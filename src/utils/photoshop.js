const photoshop = require("photoshop");
const { executeAsModal } = photoshop.core;
const { batchPlay } = photoshop.action;
const app = photoshop.app;
const fs = require("uxp").storage.localFileSystem;
const formats = require("uxp").storage.formats;

// Global log function that will be set from App.jsx
let externalLog = null;
export function setLogFunction(fn) {
    externalLog = fn;
}
function log(msg) {
    if (externalLog) externalLog("[PS] " + msg);
    console.log("[PS] " + msg);
}

/**
 * Get current document dimensions (width, height, aspect ratio)
 */
export async function getDocumentDimensions() {
    return await executeAsModal(async () => {
        if (!app.activeDocument) {
            throw new Error("Không có document nào đang mở");
        }
        const doc = app.activeDocument;
        const width = doc.width;
        const height = doc.height;
        const aspectRatio = width / height;

        log("Document size: " + width + " x " + height + " (ratio: " + aspectRatio.toFixed(3) + ")");

        return {
            width: width,
            height: height,
            aspectRatio: aspectRatio,
            aspectRatioString: aspectRatio > 1 ? "landscape" : (aspectRatio < 1 ? "portrait" : "square")
        };
    }, { commandName: "Get Document Dimensions" });
}

/**
 * Capture current document as Base64 JPEG
 */
export async function getLayerAsBase64() {
    return await executeAsModal(async () => {
        if (!app.activeDocument) {
            throw new Error("Không có document nào đang mở");
        }

        const fileName = "gemini_capture_" + Date.now() + ".jpg";
        const tempFolder = await fs.getTemporaryFolder();
        const tempFile = await tempFolder.createEntry(fileName, { overwrite: true });
        const token = await fs.createSessionToken(tempFile);

        await batchPlay([{
            _obj: "save",
            as: {
                _obj: "JPEG",
                extendedQuality: 5,
                matte: { _enum: "matteColor", _value: "none" }
            },
            in: { _path: token, _kind: "local" },
            copy: true,
            lowerCase: true
        }], { synchronousExecution: true });

        const data = await tempFile.read({ format: formats.binary });
        let binary = '';
        const bytes = new Uint8Array(data);
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        try { await tempFile.delete(); } catch (e) { }
        return base64;
    }, { commandName: "Capture Image" });
}

/**
 * Place base64 image with detailed step-by-step logging
 */
export async function placeBase64(base64Str) {
    log("=== placeBase64 START ===");

    // Step 0: Check original document
    const originalDoc = app.activeDocument;
    if (!originalDoc) {
        throw new Error("Không có document để chèn ảnh");
    }
    const originalDocId = originalDoc.id;
    log("Step 0: Original doc ID = " + originalDocId);

    return await executeAsModal(async () => {
        try {
            // Step 1: Determine extension
            let ext = ".png";
            if (base64Str.indexOf("image/jpeg") >= 0) {
                ext = ".jpg";
            }
            log("Step 1: Extension = " + ext);

            // Step 2: Create file entry
            const fileName = "gemini_ai_" + Date.now() + ext;
            log("Step 2: Creating file: " + fileName);
            const tempFolder = await fs.getTemporaryFolder();
            const outputFile = await tempFolder.createEntry(fileName, { overwrite: true });
            log("Step 2: File created OK");

            // Step 3: Extract base64
            let b64 = base64Str;
            const idx = base64Str.indexOf(',');
            if (idx >= 0) {
                b64 = base64Str.substring(idx + 1);
            }
            log("Step 3: Base64 extracted, length = " + b64.length);

            // Step 4: Decode base64
            log("Step 4: Decoding base64...");
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) {
                bytes[i] = bin.charCodeAt(i);
            }
            log("Step 4: Decoded to " + bytes.length + " bytes");

            // Step 5: Write file
            log("Step 5: Writing file...");
            await outputFile.write(bytes, { format: formats.binary });
            log("Step 5: File written OK");

            // Step 6: Create token
            log("Step 6: Creating session token...");
            const token = await fs.createSessionToken(outputFile);
            log("Step 6: Token created: " + (token ? "OK" : "NULL"));

            // Step 7: Try placeEvent
            log("Step 7: Trying placeEvent...");
            try {
                const placeResult = await batchPlay([{
                    _obj: "placeEvent",
                    null: { _path: token, _kind: "local" },
                    linked: false
                }], { synchronousExecution: true });
                log("Step 7: placeEvent SUCCESS! Result: " + JSON.stringify(placeResult).substring(0, 100));

                // Cleanup
                setTimeout(async () => {
                    try { await outputFile.delete(); } catch (e) { }
                }, 3000);
                return "success_placeEvent";
            } catch (placeErr) {
                log("Step 7: placeEvent FAILED: " + (placeErr.message || placeErr.toString() || "unknown"));
            }

            // Step 8: Try open method
            log("Step 8: Trying open method...");
            try {
                const openResult = await batchPlay([{
                    _obj: "open",
                    null: { _path: token, _kind: "local" }
                }], { synchronousExecution: true });
                log("Step 8a: open SUCCESS: " + JSON.stringify(openResult).substring(0, 100));

                // Get current doc (should be new one)
                const newDoc = app.activeDocument;
                log("Step 8b: newDoc = " + (newDoc ? "exists, id=" + newDoc.id : "NULL"));

                if (newDoc && newDoc.id !== originalDocId) {
                    log("Step 8c: Checking layers...");
                    log("Step 8c: layers count = " + (newDoc.layers ? newDoc.layers.length : "undefined"));

                    if (newDoc.layers && newDoc.layers.length > 0) {
                        const layerId = newDoc.layers[0].id;
                        log("Step 8d: Layer ID = " + layerId);

                        // Duplicate
                        log("Step 8e: Duplicating layer...");
                        await batchPlay([{
                            _obj: "duplicate",
                            _target: [{ _ref: "layer", _id: layerId }],
                            to: { _ref: "document", _id: originalDocId },
                            name: "AI Generated"
                        }], { synchronousExecution: true });
                        log("Step 8e: Duplicate SUCCESS");
                    }

                    // Close
                    log("Step 8f: Closing new doc...");
                    await batchPlay([{
                        _obj: "close",
                        saving: { _enum: "yesNo", _value: "no" }
                    }], { synchronousExecution: true });
                    log("Step 8f: Close SUCCESS");
                }

                setTimeout(async () => {
                    try { await outputFile.delete(); } catch (e) { }
                }, 3000);
                return "success_open";
            } catch (openErr) {
                log("Step 8: open FAILED: " + (openErr.message || openErr.toString() || "unknown"));
            }

            // All methods failed
            throw new Error("Tất cả các phương pháp đều thất bại. File: " + fileName);

        } catch (err) {
            log("FATAL ERROR: " + (err.message || err.toString() || JSON.stringify(err)));
            throw err;
        }
    }, { commandName: "Place AI Image" });
}

/**
 * Read an image file and return base64 string
 */
export async function readFileAsBase64(file) {
    const data = await file.read({ format: formats.binary });
    let binary = '';
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Save base64 image data to a file in the specified folder
 */
export async function saveBase64ToFile(base64Data, outputFolder, fileName) {
    return await executeAsModal(async () => {
        try {
            log("Saving file: " + fileName);

            // Determine extension from data
            let ext = ".png";
            let b64 = base64Data;
            if (base64Data.indexOf("data:") === 0) {
                const idx = base64Data.indexOf(',');
                if (idx >= 0) {
                    if (base64Data.indexOf("image/jpeg") >= 0) ext = ".jpg";
                    b64 = base64Data.substring(idx + 1);
                }
            }

            // Ensure filename has extension
            if (!fileName.endsWith('.jpg') && !fileName.endsWith('.jpeg') && !fileName.endsWith('.png')) {
                fileName = fileName + ext;
            }

            const outputFile = await outputFolder.createEntry(fileName, { overwrite: true });

            // Decode base64 to bytes
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) {
                bytes[i] = bin.charCodeAt(i);
            }

            await outputFile.write(bytes, { format: formats.binary });
            log("Saved: " + fileName + " (" + bytes.length + " bytes)");
            return true;
        } catch (err) {
            log("Save error: " + (err.message || err.toString()));
            throw err;
        }
    }, { commandName: "Save Image File" });
}
