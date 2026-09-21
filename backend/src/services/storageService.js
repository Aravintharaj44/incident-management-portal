const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { env } = require("../config/env");

const safeLocalPath = (key) => {
    const root = path.resolve(env.upload.dir);
    const target = path.resolve(root, key || "");
    if (target === root || !target.startsWith(`${root}${path.sep}`)) {
        const error = new Error("Invalid attachment path");
        error.code = "INVALID_STORAGE_KEY";
        throw error;
    }
    return target;
};

class LocalStorageProvider {
    async upload({ data, sourcePath, storedName }) {
        if (sourcePath) return { key: storedName };
        await fs.promises.mkdir(env.upload.dir, { recursive: true });
        await fs.promises.writeFile(safeLocalPath(storedName), data);
        return { key: storedName };
    }
    async download(key) {
        const filePath = safeLocalPath(key);
        try { await fs.promises.access(filePath, fs.constants.R_OK); } catch {
            const error = new Error("The stored file is missing from the server");
            error.code = "STORAGE_NOT_FOUND";
            throw error;
        }
        return fs.createReadStream(filePath);
    }
    async delete(key) {
        try { await fs.promises.unlink(safeLocalPath(key)); } catch {
            // Preserve the legacy best-effort local cleanup behavior.
        }
    }
}

const resolveWasabiEndpoint = ({ endpoint, region }) => {
    if (endpoint) return endpoint;
    return region.includes(".") ? `https://${region}` : `https://s3.${region}.wasabisys.com`;
};

class WasabiStorageProvider {
    constructor() {
        const config = env.storage.wasabi;
        this.bucket = config.bucketName;
        this.client = new S3Client({
            region: config.region.includes(".") ? "us-east-1" : config.region,
            endpoint: resolveWasabiEndpoint(config),
            credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
            forcePathStyle: true,
        });
    }
    async upload({ data, key, mimeType }) {
        await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: mimeType }));
        return { key };
    }
    async download(key) {
        try { return (await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))).Body; } catch (error) {
            if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) error.code = "STORAGE_NOT_FOUND";
            throw error;
        }
    }
    async delete(key) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
}

const providers = { local: new LocalStorageProvider() };
const providerFor = (provider) => {
    if (provider === "wasabi" && !providers.wasabi) providers.wasabi = new WasabiStorageProvider();
    return providers[provider || "local"];
};
const storageReference = (attachment) => ({ provider: attachment.storageProvider || "local", key: attachment.storageKey || attachment.storedName });
const buildWasabiKey = (incidentId, storedName) => `incidents/${String(incidentId)}/${storedName}`;
const upload = async ({ incidentId, storedName, mimeType, data, sourcePath }) => {
    const storageProvider = env.storage.provider;
    const key = storageProvider === "wasabi" ? buildWasabiKey(incidentId, storedName) : storedName;
    const result = await providerFor(storageProvider).upload({ data, sourcePath, storedName, mimeType, key });
    return { storageProvider, storageKey: result.key };
};
const download = (attachment) => { const { provider, key } = storageReference(attachment); return providerFor(provider).download(key); };
const remove = (attachment) => { const { provider, key } = storageReference(attachment); return providerFor(provider).delete(key); };
module.exports = { upload, download, delete: remove, storageReference, resolveWasabiEndpoint };