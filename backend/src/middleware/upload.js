const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { env } = require("../config/env");
const ApiError = require("../utils/ApiError");

// Created at load time so the first upload cannot fail on a missing folder.
// fs.mkdirSync(env.upload.dir, { recursive: true });
try {
    fs.mkdirSync(env.upload.dir, { recursive: true });
} catch (error) {
    // Swallow here; multer's destination callback will surface a real
    // error to the request if the directory truly can't be created.
}

const storage = multer.diskStorage({
    // destination: (_req, _file, cb) => cb(null, env.upload.dir),
    destination: (_req, _file, cb) => {
        try {
            fs.mkdirSync(env.upload.dir, { recursive: true });
            cb(null, env.upload.dir);
        } catch (error) {
            cb(error);
        }
    },

    filename: (_req, file, cb) => {
        // The client-supplied name is never used on disk: a random name kills
        // path-traversal ("../../.env") and overwrite attacks in one step.
        // The original name is preserved in the Attachment document instead.
        const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
        const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : "";
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`);
    },
});

const fileFilter = (_req, file, cb) => {
    if (!env.upload.allowedMimeTypes.includes(file.mimetype)) {
        return cb(
            ApiError.badRequest(
                `File type '${file.mimetype}' is not allowed. Permitted types: ${env.upload.allowedMimeTypes.join(", ")}`
            )
        );
    }
    return cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: env.upload.maxFileSizeMb * 1024 * 1024,
        files: 5,
    },
});

/** Best-effort cleanup of orphaned files when a request fails after upload. */
const removeFile = (storedName) => {
    if (!storedName) return;
    fs.promises.unlink(path.join(env.upload.dir, storedName)).catch(() => { });
};

module.exports = upload;
module.exports.upload = upload;
module.exports.removeFile = removeFile;
