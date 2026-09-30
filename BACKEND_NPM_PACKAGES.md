# Backend npm Packages Reference

**Project:** Incident Management Portal backend  
**Source:** `backend/package.json`  
**Module system:** CommonJS (`require`)  
**Node.js:** 18 or later

This guide documents every package declared in the backend manifest. The examples are deliberately small; the actual project adds validation, error handling, permissions, and configuration around them.

## Package map

| Area | Packages |
| --- | --- |
| API and security | `express`, `cors`, `helmet`, `express-rate-limit`, `express-validator` |
| Database and authentication | `mongoose`, `bcryptjs`, `jsonwebtoken`, `google-auth-library` |
| Files and cloud storage | `multer`, `@aws-sdk/client-s3` |
| Email and inbound intake | `nodemailer`, `imapflow`, `mailparser` |
| Jobs, integrations, and exports | `node-cron`, `axios`, `json2csv` |
| Configuration, logging, and API docs | `dotenv`, `morgan`, `swagger-jsdoc`, `swagger-ui-express` |
| Development | `nodemon` |

---

## `express` — `^5.2.1`

1. **What is it?** Express is a web framework for Node.js. It receives HTTP requests and sends HTTP responses.
2. **Why do we need it?** It provides the REST API used by the React frontend, external OAuth clients, email/webhook intake, and administrators.
3. **Basic syntax:**

   ```js
   const express = require('express');
   const app = express();
   app.get('/health', (req, res) => res.json({ ok: true }));
   ```

4. **How it works:** Request -> Express middleware -> matching route -> controller -> response/error middleware.
5. **Where is it used?** `backend/src/app.js` creates the app and mounts `/api/v1` routes; every file in `backend/src/routes/` creates an `express.Router()`.
6. **Important functions/methods:** `express()`, `express.Router()`, `app.use()`, `app.get()`, `app.post()`, `express.json()`, `express.urlencoded()`, and `express.raw()`.

## `cors` — `^2.8.6`

1. **What is it?** CORS middleware controls which browser origins may call this API.
2. **Why do we need it?** The frontend and backend can run on different origins, such as Vite on port 5173 and the API on port 5000.
3. **Basic syntax:**

   ```js
   const cors = require('cors');
   app.use(cors({ origin: ['http://localhost:5173'], credentials: true }));
   ```

4. **How it works:** It adds CORS response headers and answers browser preflight requests when an allowed origin makes a cross-origin call.
5. **Where is it used?** `backend/src/app.js` reads the configured `CLIENT_URL` values through `env.clientUrls`.
6. **Important functions/methods:** `cors(options)`; important options include `origin`, `credentials`, `methods`, and `allowedHeaders`.

## `helmet` — `^8.3.0`

1. **What is it?** Helmet is security-header middleware for Express.
2. **Why do we need it?** It helps browsers apply safer defaults, reducing exposure to common browser-side attacks and information leakage.
3. **Basic syntax:**

   ```js
   const helmet = require('helmet');
   app.use(helmet({ crossOriginResourcePolicy: false }));
   ```

4. **How it works:** Helmet sets headers such as `X-Content-Type-Options` and removes Express technology details from responses.
5. **Where is it used?** `backend/src/app.js` applies Helmet near the beginning of the middleware chain.
6. **Important functions/methods:** `helmet(options)`; common options include `contentSecurityPolicy`, `crossOriginResourcePolicy`, and `referrerPolicy`.

## `express-rate-limit` — `^8.6.2`

1. **What is it?** Middleware that limits how many requests a client may make in a time window.
2. **Why do we need it?** It protects the API from abuse and gives stricter protection to login, registration, and OAuth-token endpoints.
3. **Basic syntax:**

   ```js
   const rateLimit = require('express-rate-limit');
   const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 });
   app.use('/api', limiter);
   ```

4. **How it works:** The limiter identifies a client, counts requests during `windowMs`, and returns HTTP 429 after the configured `limit` is exceeded.
5. **Where is it used?** `backend/src/app.js` defines both the general `apiLimiter` and the tighter `authLimiter`.
6. **Important functions/methods:** `rateLimit(options)`; key options are `windowMs`, `limit`, `message`, `standardHeaders`, and `skip`.

## `express-validator` — `^7.3.2`

1. **What is it?** A request-validation library for Express.
2. **Why do we need it?** It prevents invalid IDs, malformed email addresses, unsupported enum values, and unsafe input from reaching controllers and MongoDB.
3. **Basic syntax:**

   ```js
   const { body, validationResult } = require('express-validator');
   router.post('/incidents', body('title').trim().isLength({ min: 5 }), validate);
   ```

4. **How it works:** Validation chains inspect `req.body`, `req.params`, or `req.query`; `validationResult(req)` collects failures for the validation middleware.
5. **Where is it used?** `backend/src/validators/` defines request rules and `backend/src/middleware/validate.js` returns validation errors.
6. **Important functions/methods:** `body()`, `param()`, `query()`, `validationResult()`, `.optional()`, `.isEmail()`, `.isMongoId()`, `.isIn()`, `.isLength()`, and `.customSanitizer()`.

## `mongoose` — `^9.9.4`

1. **What is it?** Mongoose is an object-data mapper for MongoDB.
2. **Why do we need it?** It gives the portal schemas, validation, indexes, relationships, hooks, and query methods for incidents, users, attachments, and all other persistent records.
3. **Basic syntax:**

   ```js
   const mongoose = require('mongoose');
   const incidentSchema = new mongoose.Schema({ title: String });
   const Incident = mongoose.model('Incident', incidentSchema);
   const incident = await Incident.create({ title: 'VPN unavailable' });
   ```

4. **How it works:** Mongoose connects to MongoDB, converts documents into model instances, validates data against schemas, and executes MongoDB queries.
5. **Where is it used?** `backend/src/config/db.js` connects to MongoDB; all files in `backend/src/models/` define schemas and models.
6. **Important functions/methods:** `mongoose.connect()`, `mongoose.Schema`, `mongoose.model()`, `Model.find()`, `findById()`, `create()`, `findByIdAndUpdate()`, `aggregate()`, `populate()`, `save()`, and `mongoose.Types.ObjectId.isValid()`.

## `bcryptjs` — `^3.0.3`

1. **What is it?** bcryptjs hashes passwords and secrets using the bcrypt algorithm.
2. **Why do we need it?** Passwords and OAuth client secrets must never be stored as readable plain text.
3. **Basic syntax:**

   ```js
   const bcrypt = require('bcryptjs');
   const hash = await bcrypt.hash(password, 10);
   const matches = await bcrypt.compare(password, hash);
   ```

4. **How it works:** Hashing adds a random salt and a work factor; comparison safely checks a supplied secret against its hash.
5. **Where is it used?** `backend/src/models/User.js` hashes and compares passwords. `backend/src/services/oauthService.js` and `models/OAuthClient.js` protect client secrets.
6. **Important functions/methods:** `hash(value, saltRounds)`, `compare(value, hash)`, and `genSalt()`.

## `jsonwebtoken` — `^9.0.3`

1. **What is it?** jsonwebtoken creates and verifies signed JSON Web Tokens (JWTs).
2. **Why do we need it?** Portal users receive JWTs after login; separately signed OAuth access tokens protect the public API.
3. **Basic syntax:**

   ```js
   const jwt = require('jsonwebtoken');
   const token = jwt.sign({ id: user._id }, secret, { expiresIn: '7d' });
   const payload = jwt.verify(token, secret);
   ```

4. **How it works:** The server signs claims with a secret. On a later request, it verifies the signature and expiration before trusting the claims.
5. **Where is it used?** `backend/src/utils/generateToken.js`, `middleware/auth.js`, `middleware/oauth.js`, and `services/oauthService.js`.
6. **Important functions/methods:** `jwt.sign()`, `jwt.verify()`, `jwt.decode()`, and options such as `expiresIn`, `issuer`, and `audience`.

## `google-auth-library` — `^11.0.2`

1. **What is it?** Google's Node.js authentication library.
2. **Why do we need it?** It implements the Google OAuth login flow without manually handling Google token exchange and ID-token verification.
3. **Basic syntax:**

   ```js
   const { OAuth2Client } = require('google-auth-library');
   const client = new OAuth2Client(clientId, clientSecret, redirectUri);
   const url = client.generateAuthUrl({ scope: ['openid', 'email', 'profile'] });
   ```

4. **How it works:** The user is redirected to Google, Google returns a code, and the backend exchanges/verifies it before locating or creating the portal user.
5. **Where is it used?** `backend/src/services/googleOAuthService.js` and the corresponding Google auth routes/controllers.
6. **Important functions/methods:** `new OAuth2Client()`, `generateAuthUrl()`, `getToken()`, `setCredentials()`, and `verifyIdToken()`.

## `multer` — `^2.2.0`

1. **What is it?** Multer parses `multipart/form-data`, the request format browsers use to upload files.
2. **Why do we need it?** Users can attach evidence to incidents and RCA records.
3. **Basic syntax:**

   ```js
   const multer = require('multer');
   const upload = multer({ storage: multer.memoryStorage() });
   router.post('/attachments', upload.array('files', 5), controller);
   ```

4. **How it works:** Multer reads multipart parts, applies file limits and filtering, then places file metadata and bytes in `req.file` or `req.files`.
5. **Where is it used?** `backend/src/middleware/upload.js` configures file filtering, 5-file limits, local disk storage, and memory storage for Wasabi; attachment routes use `upload.array('files', 5)`.
6. **Important functions/methods:** `multer(options)`, `multer.diskStorage()`, `multer.memoryStorage()`, `.single()`, `.array()`, `.fields()`, and `MulterError`.

## `@aws-sdk/client-s3` — `^3.1136.0`

1. **What is it?** The AWS SDK v3 S3 client. It also works with S3-compatible services such as Wasabi.
2. **Why do we need it?** It gives production attachments durable cloud storage instead of depending on local/serverless temporary disk.
3. **Basic syntax:**

   ```js
   const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
   const s3 = new S3Client({ region, endpoint, credentials });
   await s3.send(new PutObjectCommand({ Bucket, Key, Body: buffer }));
   ```

4. **How it works:** The client signs S3 API requests using configured credentials and sends commands to the bucket endpoint.
5. **Where is it used?** `backend/src/services/storageService.js` implements the Wasabi provider for uploads, downloads, and deletions.
6. **Important functions/methods:** `new S3Client()`, `.send()`, `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`, and client options `endpoint`, `credentials`, and `forcePathStyle`.

## `nodemailer` — `^9.0.5`

1. **What is it?** Nodemailer sends email from Node.js through SMTP or another supported transport.
2. **Why do we need it?** The portal sends notifications and supports a test-email script.
3. **Basic syntax:**

   ```js
   const nodemailer = require('nodemailer');
   const transport = nodemailer.createTransport({ host, port, auth: { user, pass } });
   await transport.sendMail({ to, subject: 'Incident updated', text: 'Your ticket changed.' });
   ```

4. **How it works:** A transport connects to the configured mail server, authenticates, submits the message, and returns delivery metadata.
5. **Where is it used?** `backend/src/services/emailService.js` creates and verifies the transport; notification services call it.
6. **Important functions/methods:** `createTransport()`, `transport.sendMail()`, and `transport.verify()`.

## `imapflow` — `^1.7.7`

1. **What is it?** ImapFlow is an IMAP client for reading mailboxes.
2. **Why do we need it?** A monitored inbox can create or update incidents from incoming emails.
3. **Basic syntax:**

   ```js
   const { ImapFlow } = require('imapflow');
   const client = new ImapFlow({ host, secure: true, auth: { user, pass } });
   await client.connect();
   const messages = await client.fetchAll([1], { source: true });
   ```

4. **How it works:** The service connects to IMAP, searches the inbox, fetches raw messages, processes them, then labels and marks processed messages as read.
5. **Where is it used?** `backend/src/services/emailIntakeService.js` and `backend/src/cron/emailIntakeJob.js`.
6. **Important functions/methods:** `new ImapFlow()`, `connect()`, `getMailboxLock()`, `search()`, `fetchAll()`, `messageFlagsAdd()`, and `logout()`.

## `mailparser` — `^3.9.19`

1. **What is it?** Mailparser converts raw RFC-822 email content into structured JavaScript data.
2. **Why do we need it?** The intake service needs the sender, recipients, subject, body, message ID, and attachments from an incoming email.
3. **Basic syntax:**

   ```js
   const { simpleParser } = require('mailparser');
   const parsed = await simpleParser(rawEmail);
   console.log(parsed.subject, parsed.attachments);
   ```

4. **How it works:** It parses MIME boundaries and headers, decoding text and attachment content into a structured object.
5. **Where is it used?** `backend/src/services/emailIntakeService.js` parses each fetched raw email before the incident-intake workflow.
6. **Important functions/methods:** `simpleParser()`; useful parsed fields include `from`, `to`, `subject`, `text`, `html`, `messageId`, and `attachments`.

## `node-cron` — `^4.6.0`

1. **What is it?** node-cron schedules JavaScript functions using cron expressions.
2. **Why do we need it?** The portal must regularly check overdue incidents, overdue action items, escalations, email intake, and Zoho synchronization without a user request.
3. **Basic syntax:**

   ```js
   const cron = require('node-cron');
   cron.schedule('*/20 * * * *', async () => { await checkOverdueIncidents(); });
   ```

4. **How it works:** node-cron interprets the schedule expression and invokes the supplied callback at the selected times while the server is running.
5. **Where is it used?** `backend/src/cron/` contains overdue-incident, action-item, escalation, email-intake, and Zoho-sync jobs started by `backend/server.js`.
6. **Important functions/methods:** `cron.schedule(expression, callback)`, plus returned task methods such as `.start()`, `.stop()`, and `.destroy()`.

## `axios` — `^1.20.0`

1. **What is it?** Axios is a promise-based HTTP client.
2. **Why do we need it?** The backend calls Zoho OAuth and Zoho People APIs to exchange tokens and synchronize people data.
3. **Basic syntax:**

   ```js
   const axios = require('axios');
   const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
   ```

4. **How it works:** Axios sends an HTTP request, resolves with a response object, and rejects the promise for network or unsuccessful HTTP responses.
5. **Where is it used?** `backend/src/services/zohoPeopleService.js` and the Zoho OAuth/synchronization services.
6. **Important functions/methods:** `axios.get()`, `axios.post()`, `axios.put()`, `axios.delete()`, `axios.create()`, and request options `headers`, `params`, and `data`.

## `json2csv` — `^6.0.0-alpha.2`

1. **What is it?** json2csv converts JavaScript objects into CSV text.
2. **Why do we need it?** Staff can export incident list data for reporting and analysis in spreadsheet tools.
3. **Basic syntax:**

   ```js
   const { Parser } = require('json2csv');
   const csv = new Parser({ fields: ['number', 'title', 'status'] }).parse(rows);
   ```

4. **How it works:** The parser reads selected object fields, generates a header row, escapes values, and returns a CSV string.
5. **Where is it used?** `backend/src/utils/csv.js`; `incidentController.js` uses this utility for incident CSV export.
6. **Important functions/methods:** `new Parser(options)`, `.parse(rows)`, and options `fields` and `withBOM`.

## `dotenv` — `^17.4.2`

1. **What is it?** dotenv loads key/value settings from a `.env` file into `process.env`.
2. **Why do we need it?** Database URLs, JWT secrets, mail credentials, OAuth values, and Wasabi credentials must be configurable and kept out of source code.
3. **Basic syntax:**

   ```js
   require('dotenv').config();
   const mongoUri = process.env.MONGO_URI;
   ```

4. **How it works:** It reads the local `.env` file once at startup and adds values to the Node.js process environment; deployment platforms normally inject equivalent environment variables.
5. **Where is it used?** At the top of `backend/server.js`, the seed script, and utility scripts.
6. **Important functions/methods:** `config()`, `parse()`, and options such as `path` and `override`.

## `morgan` — `^1.11.0`

1. **What is it?** Morgan is HTTP request-logging middleware for Express.
2. **Why do we need it?** Request logs help developers and operators diagnose failing endpoints, response status codes, and slow API calls.
3. **Basic syntax:**

   ```js
   const morgan = require('morgan');
   app.use(morgan('dev'));
   ```

4. **How it works:** For each request, Morgan builds a log line from a format and writes it to a stream or the console.
5. **Where is it used?** `backend/src/app.js` uses `dev` locally and `combined` in production, routing messages through the project logger.
6. **Important functions/methods:** `morgan(format, options)`; common formats are `dev`, `combined`, and `tiny`; options include `stream` and `skip`.

## `swagger-jsdoc` — `^6.3.0`

1. **What is it?** swagger-jsdoc generates an OpenAPI specification from JSDoc/OpenAPI comments and configuration.
2. **Why do we need it?** It produces a machine-readable contract for the portal REST API.
3. **Basic syntax:**

   ```js
   const swaggerJSDoc = require('swagger-jsdoc');
   const spec = swaggerJSDoc({ definition: { openapi: '3.0.0' }, apis: ['./src/routes/*.js'] });
   ```

4. **How it works:** It reads the configured API definition and annotation files, then combines them into one OpenAPI JSON object.
5. **Where is it used?** `backend/src/config/swagger.js` builds `swaggerSpec`, which `app.js` exposes as `/api-docs.json`.
6. **Important functions/methods:** `swaggerJSDoc(options)`; important options are `definition` and `apis`.

## `swagger-ui-express` — `^5.0.1`

1. **What is it?** swagger-ui-express serves an interactive Swagger UI page from an OpenAPI specification.
2. **Why do we need it?** Developers and approved API consumers can browse endpoints, schemas, and authentication requirements in the browser.
3. **Basic syntax:**

   ```js
   const swaggerUi = require('swagger-ui-express');
   app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
   ```

4. **How it works:** Express serves the Swagger UI assets, and the UI renders the OpenAPI document into interactive documentation.
5. **Where is it used?** `backend/src/app.js` mounts the documentation UI at `/api-docs`.
6. **Important functions/methods:** `swaggerUi.serve` and `swaggerUi.setup(spec, options)`.

## `nodemon` — `^3.1.14` (development dependency)

1. **What is it?** Nodemon restarts a Node.js process when project files change.
2. **Why do we need it?** It speeds up backend development because developers do not need to stop and manually restart the API after every edit.
3. **Basic syntax:**

   ```bash
   npx nodemon server.js
   ```

4. **How it works:** Nodemon watches files, stops the current Node process after a relevant change, and starts it again.
5. **Where is it used?** `backend/package.json` defines `npm run dev` as `nodemon server.js`.
6. **Important functions/methods:** CLI usage such as `nodemon server.js`, `--watch`, `--ignore`, `--ext`, and `--delay`.

## Dependency audit note

`backend/scripts/sendTestEmail.js` imports `validator` with `require('validator')`, but `validator` is **not declared** in `backend/package.json`. This may work only because it is installed transitively or exists locally. Add it as a direct dependency before relying on the script in another environment:

```bash
npm install validator
```

Node.js built-in modules such as `fs`, `path`, `crypto`, `os`, and `stream` are also used by the backend, but they are provided by Node.js and are not npm packages, so they are outside this package list.