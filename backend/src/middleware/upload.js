const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { env } = require("../config/env");
const ApiError = require("../utils/ApiError");

try {
    fs.mkdirSync(env.upload.dir, { recursive: true });
} catch (error) {
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
        const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
        const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : "";
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`);
    },
});

// Local uploads retain diskStorage; cloud uploads are stored after validation.
const activeStorage = env.storage.provider === "wasabi" ? multer.memoryStorage() : storage;

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
    storage: activeStorage,
    fileFilter,
    limits: {
        fileSize: env.upload.maxFileSizeMb * 1024 * 1024,
        files: 5,
    },
});
const removeFile = (storedName) => {
    if (!storedName) return;
    fs.promises.unlink(path.join(env.upload.dir, storedName)).catch(() => { });
};

module.exports = upload;
module.exports.upload = upload;
module.exports.removeFile = removeFile;
