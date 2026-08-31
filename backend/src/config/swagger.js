/**
 * Swagger / OpenAPI 3.0 documentation for the Incident Management Portal API.
 *
 * The whole specification lives in this single module, which app.js mounts at
 * `GET /api-docs` (Swagger UI) and `GET /api-docs.json` (the raw spec).
 *
 * Everything here is a *description* of the API - nothing in this file changes
 * how a request is handled. It is kept in sync with the actual routes
 * (src/routes), validators (src/validators) and models (src/models), so it
 * documents real endpoints and real field constraints. No endpoint, validation
 * rule or model is altered for the sake of documentation.
 *
 * Security: no secrets (JWT tokens, passwords, Mongo credentials or other
 * environment values) are embedded here. Protected routes simply declare the
 * `bearerAuth` http-scheme so Swagger UI renders an "Authorize" button; users
 * supply their own token obtained from `POST /api/v1/auth/login`.
 */

const swaggerJSDoc = require("swagger-jsdoc");
const { env } = require("./env");

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Incident Management Portal API",
            version: "1.0.0",
            description: `
REST API for the Incident Management Portal (MERN training project).

Every endpoint (except \`/api/health\` and the two public authentication
routes) responds with the same envelope:

- Success: \`{ "success": true, "message": "...", "data": { ... } }\`
- Failure: \`{ "success": false, "message": "...", "errors": [...] }\`
- Paginated lists return \`data: { items: [], pagination: { ... } }\`.

## Authentication

Almost all routes are protected. To call them from Swagger UI:

1. \`POST /api/v1/auth/login\` with an existing account to obtain a token
   (returned in \`data.token\`).
2. Click **Authorize** at the top of this page.
3. Paste the token (without any \`Bearer \` prefix) into the **Value** field.
4. Test the protected endpoints.

Tokens are passed as an \`Authorization: Bearer <token>\` header. Roles are
\`admin\`, \`support_agent\` and \`user\`; role requirements are noted per
endpoint and enforced by the backend regardless of the UI.
`,
        },
        servers: [
            // Relative server so the docs work identically in local development
            // and under a Vercel deployment without hardcoding a hostname.
            { url: "/api/v1", description: `${env.nodeEnv} API` },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
            schemas: {
                ApiResponse: {
                    type: "object",
                    description: "Standard success envelope returned by every endpoint.",
                    properties: {
                        success: { type: "boolean", example: true },
                        message: { type: "string", example: "Operation successful" },
                        data: { type: "object", nullable: true, description: "Payload; shape varies per endpoint." },
                    },
                    required: ["success", "message"],
                },
                ApiErrorResponse: {
                    type: "object",
                    description: "Standard error envelope.",
                    properties: {
                        success: { type: "boolean", example: false },
                        message: { type: "string", example: "Authentication required" },
                        errors: {
                            type: "array",
                            nullable: true,
                            description: "Field-level validation errors (HTTP 422) or null.",
                            items: {
                                type: "object",
                                properties: {
                                    field: { type: "string", example: "title" },
                                    message: { type: "string", example: "Title must be at least 5 characters" },
                                },
                            },
                        },
                    },
                    required: ["success", "message"],
                },
                Pagination: {
                    type: "object",
                    description: "Pagination metadata returned by list endpoints.",
                    properties: {
                        page: { type: "integer", example: 1 },
                        limit: { type: "integer", example: 10 },
                        total: { type: "integer", example: 42 },
                        totalPages: { type: "integer", example: 5 },
                        hasNextPage: { type: "boolean", example: true },
                        hasPrevPage: { type: "boolean", example: false },
                    },
                },
                PaginatedResponse: {
                    type: "object",
                    description: "Standard paginated-list success envelope.",
                    properties: {
                        success: { type: "boolean", example: true },
                        message: { type: "string", example: "Incidents retrieved" },
                        data: {
                            type: "object",
                            properties: {
                                items: { type: "array", items: { type: "object" } },
                                pagination: { $ref: "#/components/schemas/Pagination" },
                            },
                        },
                    },
                },

                // ------------------------------------------------------------------
                // Users & auth
                // ------------------------------------------------------------------
                User: {
                    type: "object",
                    description: "A user without any password material. The password hash never leaves the server.",
                    properties: {
                        _id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d6" },
                        name: { type: "string", example: "Karthik Kumar" },
                        email: { type: "string", example: "karthik@example.com" },
                        role: {
                            type: "string",
                            enum: ["admin", "support_agent", "user"],
                            example: "user",
                        },
                        isActive: { type: "boolean", example: true },
                        lastLoginAt: { type: "string", format: "date-time", nullable: true },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                    },
                },
                UserSummary: {
                    type: "object",
                    description: "A lightweight user representation returned in dropdown/list contexts.",
                    properties: {
                        _id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d6" },
                        name: { type: "string", example: "Rahul Agent" },
                        email: { type: "string", example: "rahul.agent@example.com" },
                        role: { type: "string", enum: ["admin", "support_agent", "user"] },
                        isActive: { type: "boolean", example: true },
                    },
                },
                AuthPayload: {
                    type: "object",
                    description: "Payload returned by register/login containing the user and a JWT.",
                    properties: {
                        user: { $ref: "#/components/schemas/User" },
                        token: { type: "string", description: "JWT used as `Authorization: Bearer <token>`." },
                    },
                },
                LoginRequest: {
                    type: "object",
                    required: ["email", "password"],
                    properties: {
                        email: { type: "string", format: "email", example: "karthik@example.com" },
                        password: { type: "string", format: "password", example: "Password123" },
                    },
                },
                RegisterRequest: {
                    type: "object",
                    required: ["name", "email", "password"],
                    properties: {
                        name: { type: "string", minLength: 2, maxLength: 80, example: "Karthik Kumar" },
                        email: { type: "string", format: "email", example: "karthik@example.com" },
                        password: {
                            type: "string",
                            format: "password",
                            minLength: 6,
                            maxLength: 72,
                            description: "At least one letter and one number. Registration always creates an End User regardless of any supplied role.",
                            example: "Password123",
                        },
                    },
                },
                UpdateProfileRequest: {
                    type: "object",
                    required: ["name"],
                    properties: {
                        name: { type: "string", minLength: 2, maxLength: 80, example: "Karthik R." },
                    },
                },
                ChangePasswordRequest: {
                    type: "object",
                    required: ["currentPassword", "newPassword"],
                    properties: {
                        currentPassword: { type: "string", format: "password", example: "Password123" },
                        newPassword: {
                            type: "string",
                            format: "password",
                            minLength: 6,
                            maxLength: 72,
                            description: "At least one letter and one number; must differ from the current password.",
                            example: "Password124",
                        },
                    },
                },
                CreateUserRequest: {
                    type: "object",
                    required: ["name", "email", "password"],
                    properties: {
                        name: { type: "string", minLength: 2, maxLength: 80, example: "Priya Agent" },
                        email: { type: "string", format: "email", example: "priya.agent@example.com" },
                        password: { type: "string", format: "password", minLength: 6, maxLength: 72, example: "Password123" },
                        role: {
                            type: "string",
                            enum: ["admin", "support_agent", "user"],
                            description: "Optional; defaults to `user`.",
                            example: "support_agent",
                        },
                    },
                },
                UpdateUserRequest: {
                    type: "object",
                    description: "All fields optional; only supplied fields are changed.",
                    properties: {
                        name: { type: "string", minLength: 2, maxLength: 80, example: "Priya Sharma" },
                        role: { type: "string", enum: ["admin", "support_agent", "user"], example: "support_agent" },
                        isActive: { type: "boolean", example: true },
                    },
                },
                ResetPasswordRequest: {
                    type: "object",
                    required: ["newPassword"],
                    properties: {
                        newPassword: { type: "string", format: "password", minLength: 6, maxLength: 72, example: "NewPassword123" },
                    },
                },
                UserStats: {
                    type: "object",
                    properties: {
                        reported: { type: "integer", example: 3 },
                        assigned: { type: "integer", example: 5 },
                        openAssigned: { type: "integer", example: 2 },
                    },
                },

                // ------------------------------------------------------------------
                // Categories & departments
                // ------------------------------------------------------------------
                Category: {
                    type: "object",
                    properties: {
                        _id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d7" },
                        name: { type: "string", maxLength: 60, example: "Network" },
                        description: { type: "string", maxLength: 200, example: "Network and connectivity issues" },
                        isActive: { type: "boolean", example: true },
                        createdBy: { type: "string", nullable: true, example: null },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                    },
                },
                CategoryWithCount: {
                    type: "object",
                    allOf: [{ $ref: "#/components/schemas/Category" }],
                    properties: {
                        incidentCount: { type: "integer", example: 12 },
                    },
                },
                CategoryCreateRequest: {
                    type: "object",
                    required: ["name"],
                    properties: {
                        name: { type: "string", minLength: 2, maxLength: 60, example: "Hardware" },
                        description: { type: "string", maxLength: 200, example: "Hardware failures and accessories" },
                    },
                },
                CategoryUpdateRequest: {
                    type: "object",
                    description: "All fields optional.",
                    properties: {
                        name: { type: "string", minLength: 2, maxLength: 60, example: "Hardware & Devices" },
                        description: { type: "string", maxLength: 200, example: "Hardware failures and peripherals" },
                        isActive: { type: "boolean", example: true },
                    },
                },
                DepartmentMember: {
                    type: "object",
                    properties: {
                        _id: { type: "string", example: "dept-user-id" },
                        user: { $ref: "#/components/schemas/UserSummary" },
                        department: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d8" },
                        isActive: { type: "boolean", example: true },
                        assignedBy: { type: "string", nullable: true },
                    },
                },
                Department: {
                    type: "object",
                    properties: {
                        _id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d8" },
                        title: { type: "string", minLength: 5, maxLength: 140, example: "Network Operations" },
                        description: { type: "string", minLength: 10, maxLength: 5000, example: "Handles network infrastructure incidents." },
                        categories: {
                            type: "array",
                            description: "Category ids owned by this department (populated with category objects in list/detail responses).",
                            items: { type: "string" },
                            example: ["64b8f0c2e4a9d1f2a3b4c5d7"],
                        },
                        isActive: { type: "boolean", example: true },
                        headOfDepartment: {
                            type: "string",
                            nullable: true,
                            description: "User id (populated with a user object in list/detail responses).",
                            example: "64b8f0c2e4a9d1f2a3b4c5d6",
                        },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                    },
                    required: ["title", "description"],
                },
                DepartmentCreateRequest: {
                    type: "object",
                    required: ["title", "description", "headOfDepartment", "categories", "members"],
                    properties: {
                        title: { type: "string", minLength: 5, maxLength: 140, example: "Desktop Support" },
                        description: { type: "string", minLength: 10, maxLength: 5000, example: "Provides end-user desktop and peripheral support." },
                        isActive: { type: "boolean", example: true },
                        headOfDepartment: { type: "string", description: "Must be one of the selected members and an active support agent.", example: "64b8f0c2e4a9d1f2a3b4c5d6" },
                        categories: {
                            type: "array",
                            minItems: 1,
                            items: { type: "string" },
                            description: "At least one existing category id.",
                            example: ["64b8f0c2e4a9d1f2a3b4c5d7"],
                        },
                        members: {
                            type: "array",
                            minItems: 1,
                            items: { type: "string" },
                            description: "At least one active support agent id. Members may belong to only one department.",
                            example: ["64b8f0c2e4a9d1f2a3b4c5d6"],
                        },
                    },
                },
                DepartmentUpdateRequest: {
                    type: "object",
                    description: "All fields optional; only supplied fields are changed. Unsupplied list fields retain their current values.",
                    properties: {
                        title: { type: "string", minLength: 5, maxLength: 140, example: "Desktop & Device Support" },
                        description: { type: "string", minLength: 10, maxLength: 5000, example: "Provides end-user device support." },
                        isActive: { type: "boolean", example: true },
                        headOfDepartment: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d6" },
                        categories: { type: "array", minItems: 1, items: { type: "string" } },
                        members: { type: "array", minItems: 1, items: { type: "string" } },
                    },
                },

                // ------------------------------------------------------------------
                // Incidents
                // ------------------------------------------------------------------
                Incident: {
                    type: "object",
                    description: "An incident. Reference fields (category, reportedBy, assignedTo, department) are populated with objects in list/detail responses.",
                    properties: {
                        _id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d9" },
                        incidentNumber: { type: "string", example: "INC-000001" },
                        title: { type: "string", minLength: 5, maxLength: 140, example: "Shared printer is offline" },
                        description: { type: "string", minLength: 10, maxLength: 5000, example: "The printer on floor 3 is not responding to print jobs." },
                        category: { type: "string", description: "Category id (populated in responses).", example: "64b8f0c2e4a9d1f2a3b4c5d7" },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"], example: "medium" },
                        priorityWeight: { type: "integer", example: 2 },
                        status: { type: "string", enum: ["new", "in_progress", "on_hold", "resolved", "closed"], example: "new" },
                        reportedBy: { type: "string", description: "User id (populated in responses)." },
                        assignedDepartment: { type: "string", nullable: true, description: "Department id." },
                        assignedTo: { type: "string", nullable: true, description: "User id (populated in responses)." },
                        department: { type: "string", nullable: true, description: "Triage department id (populated in responses)." },
                        dueBy: { type: "string", format: "date-time", nullable: true },
                        overdueNotifiedAt: { type: "string", format: "date-time", nullable: true },
                        resolvedAt: { type: "string", format: "date-time", nullable: true },
                        closedAt: { type: "string", format: "date-time", nullable: true },
                        resolutionNote: { type: "string", maxLength: 2000, example: "" },
                        commentCount: { type: "integer", example: 0 },
                        attachmentCount: { type: "integer", example: 0 },
                        isMajorIncident: { type: "boolean", example: false },
                        isOverdue: { type: "boolean", description: "Computed virtual; true when unresolved past the SLA deadline.", example: false },
                        hoursToDue: { type: "integer", nullable: true, description: "Computed virtual; whole hours to the SLA deadline." },
                        slaState: { type: "string", nullable: true, description: "Computed SLA state (e.g. on_track / at_risk / breached)." },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                    },
                    required: ["title", "description", "category"],
                },
                IncidentCreateRequest: {
                    type: "object",
                    required: ["title", "description", "category"],
                    properties: {
                        title: { type: "string", minLength: 5, maxLength: 140, example: "Shared printer is offline" },
                        description: { type: "string", minLength: 10, maxLength: 5000, example: "The printer on floor 3 is not responding to print jobs." },
                        category: { type: "string", description: "An active category id.", example: "64b8f0c2e4a9d1f2a3b4c5d7" },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Optional; defaults to `medium`.", example: "medium" },
                    },
                },
                IncidentUpdateRequest: {
                    type: "object",
                    description: "All fields optional; only descriptive fields are editable here (status and assignment have dedicated endpoints).",
                    properties: {
                        title: { type: "string", minLength: 5, maxLength: 140, example: "Shared printer is offline (updated)" },
                        description: { type: "string", minLength: 10, maxLength: 5000, example: "Updated description." },
                        category: { type: "string", description: "An active category id." },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                    },
                },
                UpdateStatusRequest: {
                    type: "object",
                    required: ["status"],
                    properties: {
                        status: {
                            type: "string",
                            enum: ["new", "in_progress", "on_hold", "resolved", "closed"],
                            description: "Legal transitions are enforced by the workflow rules.",
                            example: "resolved",
                        },
                        resolutionNote: {
                            type: "string",
                            maxLength: 2000,
                            description: "Required when moving to `resolved`; stored as free text.",
                            example: "Reseated the network cable.",
                        },
                        updateLinkedChildren: {
                            type: "boolean",
                            description: "Whether linked Child-Of incidents follow this status change.",
                            example: true,
                        },
                    },
                },
                AssignRequest: {
                    type: "object",
                    description: "Either field may be set to `null` to return the incident (or its department) to the queue.",
                    properties: {
                        assignedTo: { type: "string", nullable: true, description: "An active member of the incident's assigned department.", example: "64b8f0c2e4a9d1f2a3b4c5d6" },
                        department: { type: "string", nullable: true, description: "A department that handles the incident's category.", example: "64b8f0c2e4a9d1f2a3b4c5d8" },
                    },
                },
                AssignmentOptions: {
                    type: "object",
                    description: "Options for the assign endpoint.",
                    properties: {
                        departments: { type: "array", items: { type: "object" }, description: "Departments that handle the incident's category." },
                        agents: { type: "array", items: { type: "object" }, description: "Active members of the candidate departments." },
                    },
                },
                IncidentDetail: {
                    type: "object",
                    description: "Payload for the incident detail screen.",
                    properties: {
                        incident: { $ref: "#/components/schemas/Incident" },
                        comments: { type: "array", items: { $ref: "#/components/schemas/Comment" }, description: "Internal notes hidden from the reporter." },
                        activity: { type: "array", items: { $ref: "#/components/schemas/ActivityLogEntry" } },
                        attachments: { type: "array", items: { $ref: "#/components/schemas/Attachment" } },
                        correlation: {
                            type: "object",
                            properties: {
                                childCount: { type: "integer", example: 0 },
                                isMajorIncident: { type: "boolean", example: false },
                            },
                        },
                        rca: { $ref: "#/components/schemas/RootCauseAnalysis" },
                        permissions: {
                            type: "object",
                            description: "Mirrors the backend permission rules so the UI can enable/disable controls.",
                            properties: {
                                canEdit: { type: "boolean" },
                                canChangeStatus: { type: "boolean" },
                                canAssign: { type: "boolean" },
                                canDelete: { type: "boolean" },
                                canManageLinks: { type: "boolean" },
                                canUseInternalNotes: { type: "boolean" },
                            },
                        },
                    },
                },

                // ------------------------------------------------------------------
                // Comments
                // ------------------------------------------------------------------
                Comment: {
                    type: "object",
                    properties: {
                        _id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5da" },
                        incident: { type: "string", description: "Incident id." },
                        author: { type: "object", description: "User (populated in responses)." },
                        message: { type: "string", minLength: 1, maxLength: 2000, example: "Public update: the printer is back online." },
                        isInternal: { type: "boolean", description: "Visible only to Admins and Support Agents.", example: false },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                    },
                    required: ["message"],
                },
                CommentCreateRequest: {
                    type: "object",
                    required: ["message"],
                    properties: {
                        message: { type: "string", minLength: 1, maxLength: 2000, example: "Public update: the printer is back online." },
                        isInternal: { type: "boolean", description: "Optional; an End User requesting an internal note silently gets a normal comment.", example: false },
                    },
                },
                CommentUpdateRequest: {
                    type: "object",
                    required: ["message"],
                    properties: {
                        message: { type: "string", minLength: 1, maxLength: 2000, example: "Updated comment text." },
                    },
                },

                // ------------------------------------------------------------------
                // Attachments
                // ------------------------------------------------------------------
                Attachment: {
                    type: "object",
                    properties: {
                        _id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5db" },
                        incident: { type: "string", description: "Parent incident id." },
                        rca: { type: "string", nullable: true, description: "Optional linked RCA id." },
                        originalName: { type: "string", example: "screenshot.png" },
                        storedName: { type: "string", description: "Randomised server-side name; never exposed to clients." },
                        mimeType: { type: "string", example: "image/png" },
                        size: { type: "integer", example: 24576 },
                        uploadedBy: { type: "object", description: "User (populated in responses)." },
                        uploadedAt: { type: "string", format: "date-time" },
                        url: { type: "string", example: "/api/v1/attachments/64b8f0c2e4a9d1f2a3b4c5db/download" },
                    },
                },

                // ------------------------------------------------------------------
                // RCA
                // ------------------------------------------------------------------
                RootCauseAnalysis: {
                    type: "object",
                    description: "Root-Cause Analysis for an incident (one per incident).",
                    properties: {
                        _id: { type: "string" },
                        incident: { type: "string", description: "Incident id (unique)." },
                        rootCauseCategory: { type: "string", enum: ["people", "process", "technology", "vendor", "security", "other"], example: "technology" },
                        rootCauseDescription: { type: "string", maxLength: 5000, example: "Cable failure due to wear." },
                        why1: { type: "string", maxLength: 1000, default: "" },
                        why2: { type: "string", maxLength: 1000, default: "" },
                        why3: { type: "string", maxLength: 1000, default: "" },
                        why4: { type: "string", maxLength: 1000, default: "" },
                        why5: { type: "string", maxLength: 1000, default: "" },
                        contributingFactors: { type: "string", maxLength: 5000, default: "" },
                        correctiveActions: { type: "string", maxLength: 5000, default: "" },
                        preventiveActions: { type: "string", maxLength: 5000, default: "" },
                        status: { type: "string", enum: ["draft", "in_review", "approved", "returned"], default: "draft" },
                        author: { type: "object", description: "User." },
                        reviewedBy: { type: "object", nullable: true, description: "User." },
                        reviewComment: { type: "string", maxLength: 2000, default: "" },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                    },
                },
                RcaSaveRequest: {
                    type: "object",
                    description: "All fields optional when saving a draft.",
                    properties: {
                        rootCauseCategory: { type: "string", enum: ["people", "process", "technology", "vendor", "security", "other"] },
                        rootCauseDescription: { type: "string", maxLength: 5000 },
                        correctiveActions: { type: "string", maxLength: 5000 },
                        preventiveActions: { type: "string", maxLength: 5000 },
                    },
                },
                RcaReviewRequest: {
                    type: "object",
                    required: ["status"],
                    properties: {
                        status: { type: "string", enum: ["approved", "returned"], example: "approved" },
                        reviewComment: { type: "string", maxLength: 2000, nullable: true, example: "Looks good." },
                    },
                },
                RcaEvidence: {
                    type: "object",
                    description: "Evidence (attachments) attached to an RCA.",
                    properties: {
                        attachments: { type: "array", items: { $ref: "#/components/schemas/Attachment" } },
                    },
                },

                // ------------------------------------------------------------------
                // Incident links
                // ------------------------------------------------------------------
                IncidentLink: {
                    type: "object",
                    description: "A directional relationship between two incidents.",
                    properties: {
                        _id: { type: "string" },
                        fromIncidentId: { type: "object", description: "Source incident (populated)." },
                        toIncidentId: { type: "object", description: "Target incident (populated)." },
                        relationshipType: { type: "string", enum: ["Related", "Duplicate", "Caused-By", "Child-Of"], example: "Related" },
                        linkedBy: { type: "object", description: "User who created the link (populated)." },
                        createdAt: { type: "string", format: "date-time" },
                    },
                },
                LinkCreateRequest: {
                    type: "object",
                    required: ["toIncidentId", "relationshipType"],
                    properties: {
                        toIncidentId: { type: "string", description: "Target incident id (cannot equal the source)." },
                        relationshipType: { type: "string", enum: ["Related", "Duplicate", "Caused-By"], example: "Related" },
                    },
                },
                LinkedIncident: {
                    type: "object",
                    description: "An incident as it appears in the links list.",
                    properties: {
                        linkId: { type: "string" },
                        incident: { type: "object", description: "The linked incident." },
                        relationshipType: { type: "string", example: "Related" },
                        originalRelationshipType: { type: "string", example: "Related" },
                        linkedBy: { type: "object" },
                        createdAt: { type: "string", format: "date-time" },
                    },
                },
                CorrelationSuggestion: {
                    type: "object",
                    description: "A machine-generated suggestion that two incidents may be related.",
                    properties: {
                        _id: { type: "string" },
                        incidentId: { type: "string", description: "Source incident id." },
                        suggestedIncidentId: { type: "object", description: "Suggested related incident (populated)." },
                        score: { type: "number", example: 0.9 },
                        status: { type: "string", enum: ["pending", "accepted", "dismissed"], default: "pending" },
                        reviewedBy: { type: "string", nullable: true },
                        createdAt: { type: "string", format: "date-time" },
                    },
                },
                SuggestionReviewRequest: {
                    type: "object",
                    required: ["action"],
                    properties: {
                        action: { type: "string", enum: ["confirm", "dismiss"], example: "confirm" },
                        relationshipType: {
                            type: "string",
                            enum: ["Related", "Duplicate", "Caused-By"],
                            description: "Required when action is `confirm`.",
                            example: "Related",
                        },
                    },
                },

                // ------------------------------------------------------------------
                // Notifications & activity log
                // ------------------------------------------------------------------
                Notification: {
                    type: "object",
                    properties: {
                        _id: { type: "string" },
                        recipient: { type: "string", description: "User id." },
                        type: { type: "string", enum: ["incident_created", "incident_assigned", "status_changed", "comment_added", "incident_overdue"], example: "incident_assigned" },
                        title: { type: "string", example: "Incident assigned" },
                        body: { type: "string", default: "" },
                        incident: { type: "object", nullable: true, description: "Incident (populated with incidentNumber/title/status in the list)." },
                        isRead: { type: "boolean", example: false },
                        createdAt: { type: "string", format: "date-time" },
                    },
                },
                ActivityLogEntry: {
                    type: "object",
                    description: "Append-only audit entry for an incident.",
                    properties: {
                        _id: { type: "string" },
                        incident: { type: "string", description: "Incident id." },
                        action: { type: "string", enum: ["created", "status_changed", "priority_changed", "category_changed", "assigned", "unassigned", "reassigned", "department_changed", "updated", "commented", "attachment_added", "attachment_removed", "reopened", "linked", "unlinked"] },
                        performedBy: { type: "object", description: "User (populated)." },
                        field: { type: "string", nullable: true },
                        oldValue: { type: "string", nullable: true },
                        newValue: { type: "string", nullable: true },
                        note: { type: "string", nullable: true },
                        createdAt: { type: "string", format: "date-time" },
                    },
                },

                // ------------------------------------------------------------------
                // Dashboard
                // ------------------------------------------------------------------
                DashboardSummary: {
                    type: "object",
                    properties: {
                        counts: {
                            type: "object",
                            properties: {
                                total: { type: "integer" },
                                open: { type: "integer" },
                                new: { type: "integer" },
                                inProgress: { type: "integer" },
                                onHold: { type: "integer" },
                                resolved: { type: "integer" },
                                closed: { type: "integer" },
                                overdue: { type: "integer" },
                                unassigned: { type: "integer" },
                                assignedToMe: { type: "integer" },
                                reportedByMe: { type: "integer" },
                            },
                        },
                        byStatus: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, count: { type: "integer" } } } },
                        byPriority: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, count: { type: "integer" } } } },
                        resolution: { type: "object", properties: { resolvedCount: { type: "integer" }, averageHours: { type: "number" } } },
                        slaTargets: { type: "object", description: "SLA target hours keyed by priority." },
                    },
                },
                ChartData: {
                    type: "object",
                    properties: {
                        byCategory: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, count: { type: "integer" } } } },
                        trend: { type: "array", items: { type: "object", properties: { date: { type: "string" }, type: { type: "string" }, count: { type: "integer" } } } },
                        days: { type: "integer" },
                    },
                },
                RecentIncidents: {
                    type: "object",
                    properties: {
                        recent: { type: "array", items: { $ref: "#/components/schemas/Incident" } },
                        overdue: { type: "array", items: { $ref: "#/components/schemas/Incident" } },
                        myQueue: { type: "array", items: { $ref: "#/components/schemas/Incident" } },
                    },
                },
                WorkloadEntry: {
                    type: "object",
                    properties: {
                        agentId: { type: "string" },
                        name: { type: "string" },
                        email: { type: "string" },
                        role: { type: "string" },
                        total: { type: "integer" },
                        open: { type: "integer" },
                        overdue: { type: "integer" },
                    },
                },
                AdvancedAnalytics: {
                    type: "object",
                    properties: {
                        trend: { type: "array", items: { type: "object", properties: { date: { type: "string" }, count: { type: "integer" } } } },
                        rootCauses: { type: "array", items: { type: "object", properties: { category: { type: "string" }, count: { type: "integer" } } } },
                        majorIncidents: { type: "array", items: { type: "object", properties: { incidentId: { type: "string" }, incidentNumber: { type: "string" }, title: { type: "string" }, status: { type: "string" }, childCount: { type: "integer" } } } },
                        performance: { type: "array", items: { type: "object", properties: { agentId: { type: "string" }, name: { type: "string" }, resolved: { type: "integer" }, averageHours: { type: "number" }, slaCompliance: { type: "number" } } } },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],
        tags: [
            { name: "Auth", description: "Registration, login and the current-user account." },
            { name: "Users", description: "User administration (admin)." },
            { name: "Categories", description: "Incident category master list." },
            { name: "Departments", description: "Support departments and their memberships." },
            { name: "Incidents", description: "Incident lifecycle, workflow, export, RCA, comments, attachments and links." },
            { name: "Comments", description: "Comment editing/deletion." },
            { name: "Attachments", description: "Attachment download and deletion." },
            { name: "Dashboard", description: "Aggregations and analytics." },
            { name: "Notifications", description: "In-app notifications." },
            { name: "Meta", description: "Health and reference data." },
        ],
        paths: {
            // ==================================================================
            // Auth
            // ==================================================================
            "/auth/register": {
                post: {
                    tags: ["Auth"],
                    summary: "Register a new account",
                    description: "Public. Creates an End User account. A supplied `role` is ignored - elevated roles are granted only by an Admin through the Users API. Returns a JWT for the new account.",
                    security: [],
                    requestBody: {
                        required: true,
                        content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterRequest" } } },
                    },
                    responses: {
                        201: {
                            description: "Registration successful.",
                            content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/AuthPayload" } } } } },
                        },
                        409: { description: "An account with that email already exists.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed (missing/invalid fields).", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/auth/login": {
                post: {
                    tags: ["Auth"],
                    summary: "Login",
                    description: "Public. Returns the current user and a JWT. The same message is returned for an unknown email and a wrong password to prevent account enumeration.",
                    security: [],
                    requestBody: {
                        required: true,
                        content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } },
                    },
                    responses: {
                        200: {
                            description: "Login successful. Copy `data.token` and use it with the Authorize button.",
                            content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/AuthPayload" } } } } },
                        },
                        401: { description: "Invalid email or password.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Account deactivated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/auth/me": {
                get: {
                    tags: ["Auth"],
                    summary: "Get the current user",
                    description: "Requires authentication. Returns the profile of the signed-in user, used to restore a session from a stored token.",
                    responses: {
                        200: { description: "Profile retrieved.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } } } } } } },
                        401: { description: "Authentication required or token invalid/expired.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                patch: {
                    tags: ["Auth"],
                    summary: "Update the current user's profile",
                    description: "Requires authentication. Updates the display name of the signed-in user.",
                    requestBody: {
                        required: true,
                        content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateProfileRequest" } } },
                    },
                    responses: {
                        200: { description: "Profile updated.", content: { "application/json": { schema: { type: "object", properties: { data: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/auth/me/password": {
                patch: {
                    tags: ["Auth"],
                    summary: "Change the current user's password",
                    description: "Requires authentication. Requires the current password; returns a fresh JWT so the client stays signed in.",
                    requestBody: {
                        required: true,
                        content: { "application/json": { schema: { $ref: "#/components/schemas/ChangePasswordRequest" } } },
                    },
                    responses: {
                        200: { description: "Password updated; new token returned in `data.token`.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { token: { type: "string" } } } } } } } },
                        400: { description: "Current password incorrect or new password not different.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // Users
            // ==================================================================
            "/users": {
                get: {
                    tags: ["Users"],
                    summary: "List users (paginated)",
                    description: "Requires authentication and the `admin` role. Keyword search plus optional role/status filters.",
                    parameters: [
                        { name: "search", in: "query", required: false, schema: { type: "string" }, description: "Searches name and email (literal substring)." },
                        { name: "role", in: "query", required: false, schema: { type: "string", enum: ["admin", "support_agent", "user"] }, description: "Filter by role." },
                        { name: "isActive", in: "query", required: false, schema: { type: "string", enum: ["true", "false"] }, description: "Filter by active status." },
                        { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1 }, description: "Page number (default 1)." },
                        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 }, description: "Items per page (default 10)." },
                    ],
                    responses: {
                        200: { description: "Paginated list of users.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/User" } }, pagination: { $ref: "#/components/schemas/Pagination" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                post: {
                    tags: ["Users"],
                    summary: "Create a user",
                    description: "Requires authentication and the `admin` role. Creates a user with any role.",
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateUserRequest" } } } },
                    responses: {
                        201: { description: "User created.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        409: { description: "An account with that email already exists.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/users/assignable": {
                get: {
                    tags: ["Users"],
                    summary: "List assignable users",
                    description: "Requires authentication and the `admin` or `support_agent` role. Returns only id/name/email/role for active Admins and Support Agents (for the assign dropdown).",
                    responses: {
                        200: { description: "Assignable users.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { users: { type: "array", items: { $ref: "#/components/schemas/UserSummary" } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` or `support_agent` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/users/{id}": {
                get: {
                    tags: ["Users"],
                    summary: "Get a user with workload stats",
                    description: "Requires authentication and the `admin` role.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "User id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "User and stats.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { user: { $ref: "#/components/schemas/User" }, stats: { $ref: "#/components/schemas/UserStats" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "User not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                patch: {
                    tags: ["Users"],
                    summary: "Update a user",
                    description: "Requires authentication and the `admin` role. Updates name, role and/or active status.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "User id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateUserRequest" } } } },
                    responses: {
                        200: { description: "User updated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "User not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                delete: {
                    tags: ["Users"],
                    summary: "Deactivate a user",
                    description: "Requires authentication and the `admin` role. Soft-deletes by setting `isActive: false`. An admin cannot deactivate their own account.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "User id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "User deactivated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { user: { $ref: "#/components/schemas/User" }, deactivated: { type: "boolean" } } } } } } } },
                        400: { description: "An admin cannot deactivate their own account.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "User not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/users/{id}/password": {
                patch: {
                    tags: ["Users"],
                    summary: "Reset a user's password",
                    description: "Requires authentication and the `admin` role. Sets a new password for the user.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "User id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ResetPasswordRequest" } } } },
                    responses: {
                        200: { description: "Password reset.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "User not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // Categories
            // ==================================================================
            "/categories": {
                get: {
                    tags: ["Categories"],
                    summary: "List categories",
                    description: "Requires authentication. Returns the active category list used to populate incident forms. Open to any signed-in user.",
                    responses: {
                        200: { description: "List of categories.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { categories: { type: "array", items: { $ref: "#/components/schemas/Category" } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                post: {
                    tags: ["Categories"],
                    summary: "Create a category",
                    description: "Requires authentication and the `admin` role.",
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CategoryCreateRequest" } } } },
                    responses: {
                        201: { description: "Category created.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { category: { $ref: "#/components/schemas/Category" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        409: { description: "Category name already exists (case-insensitive).", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/categories/with-counts": {
                get: {
                    tags: ["Categories"],
                    summary: "List categories with incident counts",
                    description: "Requires authentication and the `admin` role. Returns categories enriched with the number of incidents per category.",
                    responses: {
                        200: { description: "Categories with counts.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { categories: { type: "array", items: { $ref: "#/components/schemas/CategoryWithCount" } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/categories/{id}": {
                patch: {
                    tags: ["Categories"],
                    summary: "Update a category",
                    description: "Requires authentication and the `admin` role. Any field optional.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Category id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CategoryUpdateRequest" } } } },
                    responses: {
                        200: { description: "Category updated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { category: { $ref: "#/components/schemas/Category" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Category not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                delete: {
                    tags: ["Categories"],
                    summary: "Delete a category",
                    description: "Requires authentication and the `admin` role. Deactivates if in use, otherwise deletes outright.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Category id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Category deleted/deactivated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { category: { $ref: "#/components/schemas/Category" }, deactivated: { type: "boolean" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Category not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // Departments
            // ==================================================================
            "/departments": {
                get: {
                    tags: ["Departments"],
                    summary: "List departments",
                    description: "Requires authentication and the `admin` role. Returns departments with populated categories/head and a member count.",
                    responses: {
                        200: { description: "List of departments.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { departments: { type: "array", items: { allOf: [{ $ref: "#/components/schemas/Department" }, { type: "object", properties: { memberCount: { type: "integer" } } }] } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                post: {
                    tags: ["Departments"],
                    summary: "Create a department",
                    description: "Requires authentication and the `admin` role. Creates the department and its member memberships.",
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/DepartmentCreateRequest" } } } },
                    responses: {
                        201: { description: "Department created.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { department: { $ref: "#/components/schemas/Department" } } } } } } } },
                        400: { description: "Invalid members/head/categories combination.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        409: { description: "Department title or a member already in another department.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/departments/{id}": {
                get: {
                    tags: ["Departments"],
                    summary: "Get a department",
                    description: "Requires authentication and the `admin` role. Returns the department with its members.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Department id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Department with members.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { department: { allOf: [{ $ref: "#/components/schemas/Department" }, { type: "object", properties: { members: { type: "array", items: { $ref: "#/components/schemas/DepartmentMember" } } } }] } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Department not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                patch: {
                    tags: ["Departments"],
                    summary: "Update a department",
                    description: "Requires authentication and the `admin` role. Any fields may be supplied.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Department id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/DepartmentUpdateRequest" } } } },
                    responses: {
                        200: { description: "Department updated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { department: { $ref: "#/components/schemas/Department" } } } } } } } },
                        400: { description: "Invalid members/head/categories combination.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Department not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        409: { description: "Department title or a member already in another department.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                delete: {
                    tags: ["Departments"],
                    summary: "Delete a department",
                    description: "Requires authentication and the `admin` role. Removes the department and its member memberships.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Department id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Department deleted.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Department not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // Incidents
            // ==================================================================
            "/incidents": {
                get: {
                    tags: ["Incidents"],
                    summary: "List incidents (paginated)",
                    description: "Requires authentication. Search, filter, sort and paginate. Each caller sees only the incidents their role permits.",
                    parameters: [
                        { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1 }, description: "Page number (default 1)." },
                        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 }, description: "Items per page (default 10)." },
                        { name: "search", in: "query", required: false, schema: { type: "string", maxLength: 140 }, description: "Literal substring search on title, description or incident number." },
                        { name: "status", in: "query", required: false, schema: { type: "string" }, description: "Comma-separated statuses, e.g. `new,in_progress`." },
                        { name: "priority", in: "query", required: false, schema: { type: "string" }, description: "Comma-separated priorities, e.g. `high,critical`." },
                        { name: "category", in: "query", required: false, schema: { type: "string" }, description: "Comma-separated category ids." },
                        { name: "assignedTo", in: "query", required: false, schema: { type: "string" }, description: "`me`, `unassigned`, or a user id." },
                        { name: "reportedBy", in: "query", required: false, schema: { type: "string" }, description: "`me` or a user id." },
                        { name: "overdue", in: "query", required: false, schema: { type: "string", enum: ["true"] }, description: "Filter to overdue incidents." },
                        { name: "open", in: "query", required: false, schema: { type: "string", enum: ["true"] }, description: "Filter to non-terminal (open) incidents." },
                        { name: "dateFrom", in: "query", required: false, schema: { type: "string", format: "date" }, description: "Created on or after this date." },
                        { name: "dateTo", in: "query", required: false, schema: { type: "string", format: "date" }, description: "Created on or before this date (inclusive)." },
                        { name: "sortBy", in: "query", required: false, schema: { type: "string", enum: ["createdAt", "updatedAt", "dueBy", "title", "status", "priority", "incidentNumber"] }, description: "Sort field (default createdAt)." },
                        { name: "sortOrder", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"] }, description: "Sort direction (default desc)." },
                    ],
                    responses: {
                        200: { description: "Paginated list of incidents.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Incident" } }, pagination: { $ref: "#/components/schemas/Pagination" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                post: {
                    tags: ["Incidents"],
                    summary: "Create an incident",
                    description: "Requires authentication. Any signed-in user may raise an incident; it is attributed to the caller.",
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/IncidentCreateRequest" } } } },
                    responses: {
                        201: { description: "Incident created.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { incident: { $ref: "#/components/schemas/Incident" } } } } } } } },
                        400: { description: "Inactive/non-existent category.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/incidents/export/csv": {
                get: {
                    tags: ["Incidents"],
                    summary: "Export incidents to CSV",
                    description: "Requires authentication. Returns a CSV file honouring the same list filters.",
                    parameters: [
                        { name: "status", in: "query", required: false, schema: { type: "string" } },
                        { name: "priority", in: "query", required: false, schema: { type: "string" } },
                        { name: "category", in: "query", required: false, schema: { type: "string" } },
                        { name: "assignedTo", in: "query", required: false, schema: { type: "string" } },
                        { name: "reportedBy", in: "query", required: false, schema: { type: "string" } },
                        { name: "search", in: "query", required: false, schema: { type: "string" } },
                    ],
                    responses: {
                        200: { description: "CSV file (Content-Type text/csv, Content-Disposition attachment).", content: { "text/csv": { schema: { type: "string" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/incidents/{id}": {
                get: {
                    tags: ["Incidents"],
                    summary: "Get an incident detail",
                    description: "Requires authentication. Returns the incident plus comments, activity, attachments, RCA, correlation and permission flags in one call.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Incident detail.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/IncidentDetail" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "You do not have access to this incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Incident not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                patch: {
                    tags: ["Incidents"],
                    summary: "Update an incident",
                    description: "Requires authentication. Edits descriptive fields only. Restricted to when the incident is new or unassigned.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/IncidentUpdateRequest" } } } },
                    responses: {
                        200: { description: "Incident updated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { incident: { $ref: "#/components/schemas/Incident" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "You can only edit this incident while it is unassigned or still New.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Incident not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                delete: {
                    tags: ["Incidents"],
                    summary: "Delete an incident (admin)",
                    description: "Requires authentication and the `admin` role. Permanently removes the incident and its child records.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Incident deleted.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Incident not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/incidents/{id}/status": {
                patch: {
                    tags: ["Incidents"],
                    summary: "Update an incident's status",
                    description: "Requires authentication. Moves the incident through the allowed workflow transitions; a resolution note is required when resolving.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateStatusRequest" } } } },
                    responses: {
                        200: { description: "Status changed.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { incident: { $ref: "#/components/schemas/Incident" } } } } } } } },
                        400: { description: "Illegal status transition.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "You cannot change the status of work assigned to someone else.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Incident not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/incidents/{id}/assignment-options": {
                get: {
                    tags: ["Incidents"],
                    summary: "Get assignment options",
                    description: "Requires authentication. Returns the departments and agents available for assigning this incident.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Assignment options.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/AssignmentOptions" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Incident not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/incidents/{id}/assign": {
                patch: {
                    tags: ["Incidents"],
                    summary: "Assign an incident",
                    description: "Requires authentication (admin or support agent within the team). Assigns a department and/or member. Setting a field to `null` returns the incident to the queue.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AssignRequest" } } } },
                    responses: {
                        200: { description: "Incident assigned.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { incident: { $ref: "#/components/schemas/Incident" } } } } } } } },
                        400: { description: "Rule violation (e.g. no department assigned yet, member not in the department, department does not handle the category).", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Permission denied (e.g. an End User or an agent assigning outside their team).", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Incident not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ------------------------------------------------------------------
            // RCA (under incidents)
            // ------------------------------------------------------------------
            "/incidents/{id}/rca": {
                get: {
                    tags: ["Incidents"],
                    summary: "Get the RCA for an incident",
                    description: "Requires authentication and access to the incident.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "RCA and its evidence.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { rca: { $ref: "#/components/schemas/RootCauseAnalysis" }, evidence: { $ref: "#/components/schemas/RcaEvidence" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "No access to this incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                put: {
                    tags: ["Incidents"],
                    summary: "Save an RCA draft",
                    description: "Requires authentication and access to the incident. Creates or updates the RCA (saved as a draft).",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RcaSaveRequest" } } } },
                    responses: {
                        200: { description: "RCA saved (draft).", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { rca: { $ref: "#/components/schemas/RootCauseAnalysis" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "No access to this incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/incidents/{id}/rca/submit": {
                post: {
                    tags: ["Incidents"],
                    summary: "Submit an RCA for review",
                    description: "Requires authentication and access to the incident. Moves the RCA from draft to in_review.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "RCA submitted for review.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { rca: { $ref: "#/components/schemas/RootCauseAnalysis" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "No access / not permitted.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/incidents/{id}/rca/review": {
                patch: {
                    tags: ["Incidents"],
                    summary: "Review an RCA",
                    description: "Requires authentication (admin/support agent reviewer). Approves or returns the RCA.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RcaReviewRequest" } } } },
                    responses: {
                        200: { description: "RCA approved or returned.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { rca: { $ref: "#/components/schemas/RootCauseAnalysis" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not permitted to review.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ------------------------------------------------------------------
            // Comments (under incidents)
            // ------------------------------------------------------------------
            "/incidents/{incidentId}/comments": {
                get: {
                    tags: ["Incidents"],
                    summary: "List an incident's comments",
                    description: "Requires authentication and access. Internal notes are hidden from the reporter.",
                    parameters: [{ name: "incidentId", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "List of comments.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { comments: { type: "array", items: { $ref: "#/components/schemas/Comment" } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "No access to this incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid incident id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                post: {
                    tags: ["Incidents"],
                    summary: "Add a comment to an incident",
                    description: "Requires authentication and access. An End User requesting an internal note silently gets a normal comment.",
                    parameters: [{ name: "incidentId", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CommentCreateRequest" } } } },
                    responses: {
                        201: { description: "Comment added.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { comment: { $ref: "#/components/schemas/Comment" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "No access to this incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ------------------------------------------------------------------
            // Attachments (under incidents)
            // ------------------------------------------------------------------
            "/incidents/{incidentId}/attachments": {
                get: {
                    tags: ["Incidents"],
                    summary: "List an incident's attachments",
                    description: "Requires authentication and access to the incident.",
                    parameters: [{ name: "incidentId", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "List of attachments.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { attachments: { type: "array", items: { $ref: "#/components/schemas/Attachment" } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "No access to this incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid incident id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                post: {
                    tags: ["Incidents"],
                    summary: "Upload attachments to an incident",
                    description: "Requires authentication and access. Accepts up to 5 files in a `multipart/form-data` request under the field name `files`.",
                    parameters: [{ name: "incidentId", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    requestBody: {
                        required: true,
                        content: {
                            "multipart/form-data": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        files: {
                                            type: "array",
                                            items: { type: "string", format: "binary" },
                                            description: "Up to 5 files.",
                                        },
                                    },
                                    required: ["files"],
                                },
                            },
                        },
                    },
                    responses: {
                        201: { description: "Attachments uploaded.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { attachments: { type: "array", items: { $ref: "#/components/schemas/Attachment" } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "No access to this incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid incident id / no files / file too large.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/incidents/{incidentId}/rca/{rcaId}/attachments": {
                get: {
                    tags: ["Incidents"],
                    summary: "List an RCA's attachments",
                    description: "Requires authentication and access to the incident. Returns attachments linked to a specific RCA.",
                    parameters: [
                        { name: "incidentId", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." },
                        { name: "rcaId", in: "path", required: true, schema: { type: "string" }, description: "RCA id (Mongo ObjectId)." },
                    ],
                    responses: {
                        200: { description: "List of attachments.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { attachments: { type: "array", items: { $ref: "#/components/schemas/Attachment" } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "No access to this incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid ids.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                post: {
                    tags: ["Incidents"],
                    summary: "Upload attachments to an RCA",
                    description: "Requires authentication and access. Accepts up to 5 files in `multipart/form-data` under the field name `files`.",
                    parameters: [
                        { name: "incidentId", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." },
                        { name: "rcaId", in: "path", required: true, schema: { type: "string" }, description: "RCA id (Mongo ObjectId)." },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            "multipart/form-data": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        files: { type: "array", items: { type: "string", format: "binary" }, description: "Up to 5 files." },
                                    },
                                    required: ["files"],
                                },
                            },
                        },
                    },
                    responses: {
                        201: { description: "Attachments uploaded.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { attachments: { type: "array", items: { $ref: "#/components/schemas/Attachment" } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "No access to this incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ------------------------------------------------------------------
            // Incident links (under incidents)
            // ------------------------------------------------------------------
            "/incidents/{id}/links": {
                get: {
                    tags: ["Incidents"],
                    summary: "List an incident's links",
                    description: "Requires authentication and access. Returns incidents linked to this one in either direction.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Linked incidents.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { links: { type: "array", items: { $ref: "#/components/schemas/LinkedIncident" } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "No access to this incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Incident not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                post: {
                    tags: ["Incidents"],
                    summary: "Link another incident",
                    description: "Requires authentication and the `admin` or `support_agent` role. Creates a directional link from this incident to another.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Source incident id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/LinkCreateRequest" } } } },
                    responses: {
                        200: { description: "Link created.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        400: { description: "Invalid relationship / self-link / duplicate.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Only admins and support agents can link incidents.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Source/target incident not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/incidents/{id}/links/{linkId}": {
                delete: {
                    tags: ["Incidents"],
                    summary: "Remove an incident link",
                    description: "Requires authentication. Removes the specified link between incidents.",
                    parameters: [
                        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Source incident id." },
                        { name: "linkId", in: "path", required: true, schema: { type: "string" }, description: "Link id (Mongo ObjectId)." },
                    ],
                    responses: {
                        200: { description: "Link removed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Incident or link not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid ids.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/incidents/{id}/correlation-suggestions": {
                get: {
                    tags: ["Incidents"],
                    summary: "List correlation suggestions",
                    description: "Requires authentication and access. Returns machine-generated suggestions of related incidents.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Correlation suggestions.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { suggestions: { type: "array", items: { $ref: "#/components/schemas/CorrelationSuggestion" } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/incidents/{id}/correlation-suggestions/{suggestionId}": {
                patch: {
                    tags: ["Incidents"],
                    summary: "Review a correlation suggestion",
                    description: "Requires authentication. Confirms (creating a link) or dismisses a correlation suggestion.",
                    parameters: [
                        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id." },
                        { name: "suggestionId", in: "path", required: true, schema: { type: "string" }, description: "Suggestion id (Mongo ObjectId)." },
                    ],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SuggestionReviewRequest" } } } },
                    responses: {
                        200: { description: "Suggestion confirmed or dismissed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // Comments (direct)
            // ==================================================================
            "/comments/{id}": {
                patch: {
                    tags: ["Comments"],
                    summary: "Update a comment",
                    description: "Requires authentication and ownership/authorization. Edits the comment text.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Comment id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CommentUpdateRequest" } } } },
                    responses: {
                        200: { description: "Comment updated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { comment: { $ref: "#/components/schemas/Comment" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Comment not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                delete: {
                    tags: ["Comments"],
                    summary: "Delete a comment",
                    description: "Requires authentication and ownership/authorization.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Comment id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Comment deleted.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Comment not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // Attachments (direct)
            // ==================================================================
            "/attachments/{id}/download": {
                get: {
                    tags: ["Attachments"],
                    summary: "Download an attachment",
                    description: "Requires authentication and access to the parent incident. Accepts the token as a query parameter (`?token=`) as well as the Bearer header, so files can open directly in a browser tab.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Attachment id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "The file streamed with its original name.", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "No access to the parent incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Attachment not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/attachments/{id}": {
                delete: {
                    tags: ["Attachments"],
                    summary: "Delete an attachment",
                    description: "Requires authentication and authorization to remove the attachment.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Attachment id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Attachment removed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "You cannot remove this attachment.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Attachment not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // Dashboard
            // ==================================================================
            "/dashboard/summary": {
                get: {
                    tags: ["Dashboard"],
                    summary: "Dashboard summary",
                    description: "Requires authentication. Counts, status/priority breakdown and resolution stats, scoped to what the caller may see.",
                    responses: {
                        200: { description: "Dashboard summary.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/DashboardSummary" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/dashboard/charts": {
                get: {
                    tags: ["Dashboard"],
                    summary: "Dashboard chart data",
                    description: "Requires authentication. Category split and a created/resolved daily trend.",
                    parameters: [{ name: "days", in: "query", required: false, schema: { type: "integer", minimum: 7, maximum: 90 }, description: "Number of days for the trend (default 30, clamped 7-90)." }],
                    responses: {
                        200: { description: "Chart data.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/ChartData" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/dashboard/recent": {
                get: {
                    tags: ["Dashboard"],
                    summary: "Recent incidents",
                    description: "Requires authentication. The recent, overdue and my-queue incident lists.",
                    parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 20 }, description: "Items per list (default 5, clamped 1-20)." }],
                    responses: {
                        200: { description: "Recent incidents.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/RecentIncidents" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/dashboard/advanced": {
                get: {
                    tags: ["Dashboard"],
                    summary: "Advanced analytics",
                    description: "Requires authentication. Filter-aware trend, root-cause breakdown, major incidents and agent performance.",
                    parameters: [
                        { name: "category", in: "query", required: false, schema: { type: "string" }, description: "Comma-separated category ids." },
                        { name: "priority", in: "query", required: false, schema: { type: "string" }, description: "Comma-separated priorities." },
                        { name: "dateFrom", in: "query", required: false, schema: { type: "string", format: "date" } },
                        { name: "dateTo", in: "query", required: false, schema: { type: "string", format: "date" } },
                    ],
                    responses: {
                        200: { description: "Advanced analytics.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/AdvancedAnalytics" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/dashboard/workload": {
                get: {
                    tags: ["Dashboard"],
                    summary: "Agent workload (admin)",
                    description: "Requires authentication and the `admin` role. Per-agent open/overdue workload.",
                    responses: {
                        200: { description: "Agent workload.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { workload: { type: "array", items: { $ref: "#/components/schemas/WorkloadEntry" } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // Notifications
            // ==================================================================
            "/notifications": {
                get: {
                    tags: ["Notifications"],
                    summary: "List notifications",
                    description: "Requires authentication. The caller's notifications, newest first (max 50).",
                    parameters: [
                        { name: "unreadOnly", in: "query", required: false, schema: { type: "string", enum: ["true"] }, description: "Return only unread notifications." },
                        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50 }, description: "Items to return (default 15, clamped 1-50)." },
                    ],
                    responses: {
                        200: { description: "Notifications and unread count.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { notifications: { type: "array", items: { $ref: "#/components/schemas/Notification" } }, unreadCount: { type: "integer" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/notifications/unread-count": {
                get: {
                    tags: ["Notifications"],
                    summary: "Unread notification count",
                    description: "Requires authentication. The caller's number of unread notifications (for the bell badge).",
                    responses: {
                        200: { description: "Unread count.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { unreadCount: { type: "integer" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/notifications/read-all": {
                patch: {
                    tags: ["Notifications"],
                    summary: "Mark all notifications as read",
                    description: "Requires authentication. Marks all of the caller's notifications as read.",
                    responses: {
                        200: { description: "All marked as read.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/notifications/{id}/read": {
                patch: {
                    tags: ["Notifications"],
                    summary: "Mark a notification as read",
                    description: "Requires authentication. Marks one of the caller's notifications as read. Scoped to the caller so another user's notification cannot be touched.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Notification id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Notification updated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { notification: { $ref: "#/components/schemas/Notification" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Notification not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/notifications/{id}": {
                delete: {
                    tags: ["Notifications"],
                    summary: "Delete a notification",
                    description: "Requires authentication. Deletes one of the caller's notifications.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Notification id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Notification removed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Notification not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // Meta (public helpers)
            // ==================================================================
            "/meta": {
                get: {
                    tags: ["Meta"],
                    summary: "Reference metadata",
                    description: "Public. Returns the reference data (statuses, priorities, roles, SLA targets, upload limits) used to build forms.",
                    security: [],
                    responses: {
                        200: { description: "Reference data.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object" } } } } } },
                    },
                },
            },
        },
    },
    // Scan our own JSDoc comments if any route files are annotated. None are
    // currently, so only the definition above contributes to the spec.
    apis: [],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
