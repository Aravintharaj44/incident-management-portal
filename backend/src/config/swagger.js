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

### OAuth 2.0 (FR5-02) - public Tickets, Contacts and Articles APIs

External systems can call the Tickets (\`/tickets\`), Contacts (\`/contacts\`,
FR5-04) and Knowledge Base Articles (\`/articles\`, FR5-07) endpoints with a
machine token instead of a portal login:

1. \`POST /api/v1/oauth/token\` with \`grant_type=client_credentials\` and the
   client credentials (HTTP Basic or \`client_id\`/\`client_secret\` fields).
2. Use the returned \`access_token\` as \`Authorization: Bearer <token>\`,
   or click **Authorize** and choose the *OAuth2* flow with your client id and
   secret.

Access tokens are short-lived (default 3600s), signed with a separate secret,
and never interchangeable with portal JWTs. The granted scopes (FR5-03) decide
which endpoints a token can call - the Contacts API currently requires
\`contacts.READ\`. Create clients with \`npm run oauth:create-client\`.
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
                oauth2: {
                    type: "oauth2",
                    description:
                        "OAuth 2.0 client-credentials grant (FR5-02/FR5-03). Obtain a token from POST /api/v1/oauth/token using the client id and client secret. The granted scopes determine which endpoints the token can access.",
                    flows: {
                        clientCredentials: {
                            tokenUrl: "/api/v1/oauth/token",
                            scopes: {
                                "tickets.READ": "Read access to tickets (GET /tickets)",
                                "tickets.WRITE": "Write access to tickets (POST/PUT/PATCH/DELETE /tickets)",
                                "tickets.ALL": "Full access to tickets (implies READ + WRITE)",
                                "contacts.READ": "Read access to contacts (FR5-04)",
                                "agents.READ": "Read access to agents (FR5-05)",
                                "articles.READ": "Read access to articles (FR5-07)",
                            },
                        },
                    },
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
                OAuthTokenResponse: {
                    type: "object",
                    description: "Standard OAuth 2.0 token response (RFC 6749 section 5.1).",
                    properties: {
                        access_token: { type: "string", description: "The short-lived bearer access token." },
                        token_type: { type: "string", example: "Bearer" },
                        expires_in: { type: "integer", description: "Lifetime of the token in seconds.", example: 3600 },
                        scope: { type: "string", description: "Space-delimited list of granted scopes.", example: "tickets.READ tickets.WRITE" },
                    },
                    required: ["access_token", "token_type", "expires_in", "scope"],
                },
                OAuthErrorResponse: {
                    type: "object",
                    description: "OAuth 2.0 error response (RFC 6749 section 5.2).",
                    properties: {
                        error: { type: "string", enum: ["invalid_request", "invalid_client", "unsupported_grant_type", "invalid_scope"] },
                        error_description: { type: "string" },
                    },
                    required: ["error"],
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
                        problemId: { type: "string", nullable: true, description: "Problem id (populated with problemNumber/title/status in detail). Set when this incident is grouped under a Problem (FR4-04)." },
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
                        problem: { type: "object", nullable: true, description: "The problem this incident is grouped under, if any (populated)." },
                        rcaSource: { type: "string", enum: ["problem", "incident"], description: "Where the displayed RCA comes from - the incident's own RCA, or its linked problem's (FR4-04 fallback)." },
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
                                canManageProblems: { type: "boolean", description: "Whether this user may link/unlink incidents to problems (Staff)." },
                            },
                        },
                    },
                },

                // ------------------------------------------------------------------
                // Tickets (FR5-01) - Zoho Desk-compatible adapter over Incidents
                // ------------------------------------------------------------------
                Ticket: {
                    type: "object",
                    description: "A Zoho Desk-compatible ticket. This is an adapter representation of an Incident; the Incident remains the source of truth.",
                    properties: {
                        id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d9" },
                        ticketNumber: { type: "string", nullable: true, description: "The incident reference number.", example: "INC-000001" },
                        subject: { type: "string", minLength: 5, maxLength: 140, example: "Shared printer is offline" },
                        description: { type: "string", minLength: 10, maxLength: 5000, example: "The printer on floor 3 is not responding to print jobs." },
                        status: { type: "string", enum: ["new", "in_progress", "on_hold", "resolved", "closed"], example: "new" },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"], example: "medium" },
                        requester: {
                            type: "object",
                            nullable: true,
                            description: "The reporter (populated).",
                            properties: {
                                id: { type: "string" },
                                name: { type: "string" },
                                email: { type: "string" },
                                role: { type: "string", enum: ["admin", "support_agent", "user"] },
                            },
                        },
                        assignee: {
                            type: "object",
                            nullable: true,
                            description: "The assigned user (populated), or null when unassigned.",
                            properties: {
                                id: { type: "string" },
                                name: { type: "string" },
                                email: { type: "string" },
                                role: { type: "string", enum: ["admin", "support_agent", "user"] },
                            },
                        },
                        category: {
                            type: "object",
                            nullable: true,
                            description: "The incident category (populated).",
                            properties: {
                                id: { type: "string" },
                                name: { type: "string" },
                            },
                        },
                        department: {
                            type: "object",
                            nullable: true,
                            description: "The triage department (populated), or null when unassigned.",
                            properties: {
                                id: { type: "string" },
                                title: { type: "string" },
                            },
                        },
                        dueTime: { type: "string", format: "date-time", nullable: true, description: "SLA deadline derived from priority." },
                        slaState: { type: "string", nullable: true, description: "Computed SLA state (on_track / at_risk / breached / met / none)." },
                        isOverdue: { type: "boolean", description: "Computed; true when unresolved past the SLA deadline." },
                        resolutionNote: { type: "string", maxLength: 2000, example: "" },
                        resolvedAt: { type: "string", format: "date-time", nullable: true },
                        closedAt: { type: "string", format: "date-time", nullable: true },
                        commentCount: { type: "integer", example: 0 },
                        attachmentCount: { type: "integer", example: 0 },
                        isMajorIncident: { type: "boolean", example: false },
                        createdTime: { type: "string", format: "date-time", description: "When the incident was created." },
                        modifiedTime: { type: "string", format: "date-time", description: "When the incident was last updated." },
                    },
                    required: ["subject", "description", "category"],
                },
                TicketCreateRequest: {
                    type: "object",
                    required: ["subject", "description", "category"],
                    properties: {
                        subject: { type: "string", minLength: 5, maxLength: 140, example: "Shared printer is offline" },
                        description: { type: "string", minLength: 10, maxLength: 5000, example: "The printer on floor 3 is not responding to print jobs." },
                        category: { type: "string", description: "An active category id.", example: "64b8f0c2e4a9d1f2a3b4c5d7" },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Optional; defaults to `medium`.", example: "medium" },
                    },
                    description: "Any `requester`/`reportedBy` field is ignored - the requester is always the authenticated caller.",
                },
                TicketUpdateRequest: {
                    type: "object",
                    description: "All fields optional for PATCH (only supplied fields change). PUT requires subject, description and category. Only these descriptive fields are supported; status, assignment, department, requester and timestamps are not editable via this API.",
                    properties: {
                        subject: { type: "string", minLength: 5, maxLength: 140, example: "Shared printer is offline (updated)" },
                        description: { type: "string", minLength: 10, maxLength: 5000, example: "Updated description." },
                        category: { type: "string", description: "An active category id." },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                    },
                },

                // ------------------------------------------------------------------
                // Contacts (FR5-04) - adapter over the existing User model
                // ------------------------------------------------------------------
                Contact: {
                    type: "object",
                    description: "A public contact. Contacts are an adapter representation of an End User (`role: \"user\"`); the User document remains the source of truth. Internal fields (password, password hash, role, login metadata, Mongo internals) are never exposed.",
                    properties: {
                        id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d9" },
                        name: { type: "string", minLength: 2, maxLength: 80, example: "Karthik Rao" },
                        email: { type: "string", format: "email", example: "karthik@zybisys.com" },
                        isActive: { type: "boolean", example: true },
                        createdAt: { type: "string", format: "date-time", description: "When the contact (user) was created." },
                        updatedAt: { type: "string", format: "date-time", description: "When the contact was last updated." },
                    },
                    required: ["name", "email"],
                },
                ContactCreateRequest: {
                    type: "object",
                    required: ["name", "email"],
                    description: "Creates an End User contact. A random portal password is generated server-side and never returned; `role`/`password`/`lastLoginAt` fields in the body are ignored.",
                    properties: {
                        name: { type: "string", minLength: 2, maxLength: 80, example: "Isabella Fernandes" },
                        email: { type: "string", format: "email", example: "isabella@zybisys.com" },
                        isActive: { type: "boolean", description: "Optional; defaults to `true`.", example: true },
                    },
                },
                ContactUpdateRequest: {
                    type: "object",
                    description: "PUT requires `name` and `email` (full replacement of the supported fields); `isActive` is optional. Role, password and login metadata are never writable through this API. A duplicate email on change is rejected with 409.",
                    properties: {
                        name: { type: "string", minLength: 2, maxLength: 80, example: "Isabella R. Fernandes" },
                        email: { type: "string", format: "email", example: "isabella.r@zybisys.com" },
                        isActive: { type: "boolean", example: true },
                    },
                },

                // ------------------------------------------------------------------
                // Articles (FR5-07)
                // ------------------------------------------------------------------
                Article: {
                    type: "object",
                    description: "A publicly-visible Knowledge Base article. Reuses the existing KnowledgeBaseArticle model - only `published` articles are exposed. Internal Mongo/audit fields (`_id`, `authorID`, `deletedAt`, vote metadata) are never returned.",
                    properties: {
                        id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d9" },
                        title: { type: "string", example: "VPN Connection Drops After 5 Minutes" },
                        body: { type: "string", description: "The article body (the model field is `body`; there is no `content`/`summary` field)." },
                        status: { type: "string", enum: ["draft", "published", "retired", "archived"], example: "published", description: "Always `published` on this surface - non-published articles are not returned." },
                        tags: { type: "array", items: { type: "string" }, example: ["vpn", "network", "firewall"] },
                        categories: { type: "array", description: "The article's categories (populated from the shared Category model).", items: { $ref: "#/components/schemas/ArticleCategory" } },
                        author: { $ref: "#/components/schemas/ArticleAuthor" },
                        helpfulCount: { type: "integer", example: 5 },
                        notHelpfulCount: { type: "integer", example: 1 },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                    },
                    required: ["title", "status"],
                },
                ArticleCategory: {
                    type: "object",
                    description: "A category reference populated from the Category model.",
                    properties: {
                        id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d8" },
                        name: { type: "string", example: "Network" },
                    },
                },
                ArticleAuthor: {
                    type: "object",
                    description: "The article author, populated from the shared User model.",
                    properties: {
                        id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d7" },
                        name: { type: "string", example: "Rahul Verma" },
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
                    description: "Root-Cause Analysis for an incident OR a problem (V4). Exactly one anchor is set - either `incident` or `problem`.",
                    properties: {
                        _id: { type: "string" },
                        incident: { type: "string", nullable: true, description: "Incident id (unique, sparse)." },
                        problem: { type: "string", nullable: true, description: "Problem id (unique, sparse). Set when this RCA belongs to a Problem (FR4-06)." },
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
                // Problems & Known Errors (V4 - FR4)
                // ------------------------------------------------------------------
                Problem: {
                    type: "object",
                    description: "A problem groups related incidents and tracks their shared root cause. Staff-only (Admins and Support Agents).",
                    properties: {
                        _id: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5dc" },
                        problemNumber: { type: "string", example: "PRB-000001" },
                        title: { type: "string", minLength: 5, maxLength: 140, example: "Recurring VPN connectivity failures" },
                        description: { type: "string", minLength: 10, maxLength: 5000, example: "Intermittent VPN disconnections across a team." },
                        status: { type: "string", enum: ["new", "investigating", "known_error", "resolved"], example: "new" },
                        category: { type: "string", nullable: true, description: "Category id (populated in responses)." },
                        ownerId: { type: "string", nullable: true, description: "User id; must be an active Admin or Support Agent (populated in responses)." },
                        rcaId: { type: "string", nullable: true, description: "Problem-scoped RCA id (when one exists)." },
                        workaround: { type: "string", maxLength: 3000, description: "Temporary workaround, surfaced in the Known Error Database.", example: "" },
                        resolvedAt: { type: "string", format: "date-time", nullable: true },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                    },
                    required: ["title", "description"],
                },
                ProblemCreateRequest: {
                    type: "object",
                    required: ["title", "description"],
                    properties: {
                        title: { type: "string", minLength: 5, maxLength: 140, example: "Payroll portal report outages" },
                        description: { type: "string", minLength: 10, maxLength: 5000, example: "Intermittent 500 errors on the Monthly Summary report under load." },
                        ownerId: { type: "string", nullable: true, description: "An active Admin or Support Agent id; assigns the problem owner." },
                        workaround: { type: "string", maxLength: 3000, description: "Optional workaround.", example: "" },
                        incidentIds: { type: "array", items: { type: "string" }, description: "Optional; existing incident ids to group under the new problem immediately.", example: [] },
                        category: { type: "string", description: "Optional category id; derived from the grouped incidents when supplied." },
                    },
                },
                ProblemUpdateRequest: {
                    type: "object",
                    description: "All fields optional; only descriptive fields are editable here (status and owner have dedicated endpoints).",
                    properties: {
                        title: { type: "string", minLength: 5, maxLength: 140, example: "Recurring VPN connectivity failures (updated)" },
                        description: { type: "string", minLength: 10, maxLength: 5000, example: "Updated description." },
                        workaround: { type: "string", maxLength: 3000, example: "Use the backup concentrator profile." },
                    },
                },
                ProblemStatusRequest: {
                    type: "object",
                    required: ["status"],
                    properties: {
                        status: {
                            type: "string",
                            enum: ["new", "investigating", "known_error", "resolved"],
                            description: "Legal transitions are enforced: New -> Investigating/Known Error/Resolved; Investigating -> Known Error/Resolved/New; Known Error -> Resolved/Investigating; Resolved -> Investigating/Known Error.",
                            example: "known_error",
                        },
                    },
                },
                ProblemOwnerRequest: {
                    type: "object",
                    required: ["ownerId"],
                    properties: {
                        ownerId: { type: "string", description: "An active Admin or Support Agent id.", example: "64b8f0c2e4a9d1f2a3b4c5d6" },
                    },
                },
                ProblemLinkRequest: {
                    type: "object",
                    required: ["incidentId"],
                    properties: {
                        incidentId: { type: "string", description: "The incident to group under this problem. It must not be linked to another problem.", example: "64b8f0c2e4a9d1f2a3b4c5d9" },
                    },
                },
                ProblemDetail: {
                    type: "object",
                    description: "Payload for the problem detail screen.",
                    properties: {
                        problem: { $ref: "#/components/schemas/Problem" },
                        incidents: { type: "array", items: { $ref: "#/components/schemas/Incident" }, description: "Incidents grouped under this problem." },
                        rca: { $ref: "#/components/schemas/RootCauseAnalysis" },
                        activity: { type: "array", items: { $ref: "#/components/schemas/ActivityLogEntry" } },
                        permissions: {
                            type: "object",
                            properties: {
                                canManage: { type: "boolean" },
                                isAdmin: { type: "boolean" },
                            },
                        },
                    },
                },
                ProblemSuggestion: {
                    type: "object",
                    description: "FR4-02 auto-suggestion result, reusing the V3 correlation criteria (same category within the correlation window).",
                    properties: {
                        incident: { type: "object", description: "The incident the suggestion was requested for." },
                        suggestion: {
                            type: "object",
                            properties: {
                                canCreate: { type: "boolean", description: "True when at least two related incidents were found (enough to group)." },
                                message: { type: "string" },
                                relatedIncidents: {
                                    type: "array",
                                    items: { type: "object", properties: { incidentId: { type: "string" }, incidentNumber: { type: "string" }, title: { type: "string" }, status: { type: "string" } } },
                                },
                            },
                        },
                    },
                },
                KnownError: {
                    type: "object",
                    description: "A problem in Known Error status, as surfaced by the Known Error Database.",
                    properties: {
                        problem: { $ref: "#/components/schemas/Problem" },
                        rca: { $ref: "#/components/schemas/RootCauseAnalysis" },
                        incidents: { type: "array", items: { $ref: "#/components/schemas/Incident" } },
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
                    description: "Append-only audit entry for an incident or a problem (V4).",
                    properties: {
                        _id: { type: "string" },
                        incident: { type: "string", nullable: true, description: "Incident id; set for incident activity." },
                        problem: { type: "string", nullable: true, description: "Problem id; set for problem activity (FR4)." },
                        action: { type: "string", enum: ["created", "status_changed", "priority_changed", "category_changed", "assigned", "unassigned", "reassigned", "department_changed", "updated", "commented", "attachment_added", "attachment_removed", "reopened", "linked", "unlinked", "problem_created", "problem_updated", "problem_status_changed", "problem_owner_changed", "incident_problem_linked", "incident_problem_unlinked"] },
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
                // ------------------------------------------------------------------
                // On-Call scheduling (FR4-21..25)
                // ------------------------------------------------------------------
                EscalationStep: {
    type: "object",
    description: "One rung of the escalation chain, in order.",
    properties: {
        step: { type: "integer", description: "Order in the chain: 1 = Primary On-Call, 2 = Team Lead, 3 = Admin/Manager, etc.", example: 1 },
        user: { type: "string", description: "User id (populated with name/email/role in responses).", example: "64b8f0c2e4a9d1f2a3b4c5d6" },
    },
    required: ["step", "user"],
                },
OnCallSchedule: {
    type: "object",
    description: "A configured on-call shift with its escalation chain.",
    properties: {
        _id: { type: "string" },
        department: { type: "string", description: "Department id (populated with name in responses)." },
        category: { type: "string", nullable: true, description: "Optional category id (populated with name in responses); when set, this schedule only applies to incidents in this category." },
        startTime: { type: "string", format: "date-time" },
        endTime: { type: "string", format: "date-time" },
        ackWindowMinutes: { type: "integer", description: "Minutes an assignee has to acknowledge before escalation (FR4-23).", default: 15, example: 15 },
        escalationChain: { type: "array", items: { $ref: "#/components/schemas/EscalationStep" } },
        createdBy: { type: "string", description: "User id (populated in responses)." },
        isActive: { type: "boolean", default: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
    },
},
OnCallRosterCreateRequest: {
    type: "object",
    required: ["department", "startTime", "endTime", "escalationChain"],
    properties: {
        department: { type: "string", description: "Department id.", example: "64b8f0c2e4a9d1f2a3b4c5d8" },
        category: { type: "string", nullable: true, description: "Optional category id to scope this schedule to." },
        startTime: { type: "string", format: "date-time" },
        endTime: { type: "string", format: "date-time" },
        ackWindowMinutes: { type: "integer", description: "Optional; defaults to 15.", example: 15 },
        escalationChain: {
            type: "array",
            minItems: 1,
            description: "Ordered list of escalation steps; must not be empty.",
            items: {
                type: "object",
                required: ["step", "user"],
                properties: {
                    step: { type: "integer", example: 1 },
                    user: { type: "string", example: "64b8f0c2e4a9d1f2a3b4c5d6" },
                },
            },
        },
    },
},

// ------------------------------------------------------------------
// Webhook intake (FR4-17)
// ------------------------------------------------------------------
WebhookIngestResponse: {
    type: "object",
    description: "Response for a processed monitoring webhook. Always returns 2xx to the sending vendor so it does not retry indefinitely; failures are captured in the Intake queue instead of surfaced as an HTTP error.",
    properties: {
        success: { type: "boolean" },
        message: { type: "string", example: "Incident created from webhook alert." },
        data: {
            type: "object",
            nullable: true,
            properties: {
                incidentId: { type: "string", nullable: true },
                created: { type: "boolean", nullable: true, description: "True if a new incident was created; false if an existing incident was updated (duplicate alert)." },
            },
        },
    },
},

// ------------------------------------------------------------------
// Intake failure review (FR4-20)
// ------------------------------------------------------------------
IntakeLog: {
    type: "object",
    description: "A malformed or unparseable email/webhook payload captured for manual review.",
    properties: {
        _id: { type: "string" },
        source: { type: "string", enum: ["Email", "Webhook"], example: "Webhook" },
        vendor: { type: "string", description: "Monitoring vendor that sent the payload, when the source is Webhook.", example: "datadog" },
        status: { type: "string", enum: ["Failed", "Reviewed", "Resolved", "flagged", "failed", "reviewed", "resolved"], description: "Note: values are currently written in mixed casing by different code paths (e.g. new failures are stored as lowercase `flagged`).", example: "flagged" },
        errorReason: { type: "string", maxLength: 2000, example: "Unsupported vendor \"foo\"." },
        rawPayload: { type: "object", description: "The original payload body, stored as-is for troubleshooting." },
        resolvedIncidentId: { type: "string", nullable: true, description: "Incident id, set once this entry is resolved into an incident." },
        reviewedBy: { type: "string", nullable: true, description: "User id (populated in responses)." },
        reviewedAt: { type: "string", format: "date-time", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
    },
},
IntakeResolveRequest: {
    type: "object",
    properties: {
        resolvedIncidentId: { type: "string", nullable: true, description: "Optional; the incident this failed payload was manually turned into.", example: "64b8f0c2e4a9d1f2a3b4c5d9" },
    },
},
            },
            examples: {
                NotAuthenticatedExample: {
                    summary: "Not authenticated",
                    value: { success: false, message: "Authentication required", errors: null },
                },
                ForbiddenExample: {
                    summary: "Forbidden - wrong role",
                    value: { success: false, message: "Forbidden: You do not have permission to access this resource.", errors: null },
                },
                NotFoundExample: {
                    summary: "Resource not found",
                    value: { success: false, message: "Resource not found", errors: null },
                },
                ValidationErrorExample: {
                    summary: "Validation failed",
                    value: {
                        success: false,
                        message: "Validation failed",
                        errors: [{ field: "title", message: "Title must be at least 5 characters" }],
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
            { name: "Tickets", description: "Zoho Desk-compatible ticket API (FR5-01/FR5-03) - an adapter over the existing Incident resource. Accepts a portal login JWT OR an OAuth 2.0 access token with the required scope." },
            { name: "Articles", description: "Public Knowledge Base Articles API (FR5-07) - read-only, over the existing KnowledgeBaseArticle resource. Returns only published articles to callers with the `articles.READ` scope." },
            { name: "OAuth", description: "OAuth 2.0 token endpoint (FR5-02/FR5-03) for the public REST API. Supports scoped access control." },
            { name: "Problems", description: "Problem Management and the Known Error Database (V4 - FR4). Includes problem<->incident linking and problem-scoped RCA." },
            { name: "Comments", description: "Comment editing/deletion." },
            { name: "Attachments", description: "Attachment download and deletion." },
            { name: "Dashboard", description: "Aggregations and analytics." },
            { name: "Notifications", description: "In-app notifications." },
            { name: "Meta", description: "Health and reference data." },
            { name: "OnCall", description: "On-call roster scheduling, escalation chains and incident acknowledgement (FR4-21..25)." },
            { name: "Webhooks", description: "Inbound monitoring-alert webhook intake (FR4-17). Verified by HMAC signature, not a bearer token." },
            { name: "Intake", description: "Manual review queue for email/webhook payloads that failed automatic ingestion (FR4-20)." },
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
            // Incident <-> Problem linking (V4 - FR4-04)
            // ------------------------------------------------------------------
            "/incidents/{id}/problem": {
                post: {
                    tags: ["Incidents"],
                    summary: "Link this incident to a problem",
                    description: "Staff only (Admins and Support Agents). Groups this incident under an existing problem. An incident already linked to another problem must be unlinked first.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProblemLinkRequest" } } } },
                    responses: {
                        200: { description: "Incident linked to the problem.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { incident: { $ref: "#/components/schemas/Incident" } } } } } } } },
                        400: { description: "Already linked (to this or another problem), or an invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Incident or problem not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                delete: {
                    tags: ["Incidents"],
                    summary: "Unlink this incident from its problem",
                    description: "Staff only. Detaches the incident without deleting it.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id." }],
                    responses: {
                        200: { description: "Incident removed from the problem.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { incident: { $ref: "#/components/schemas/Incident" } } } } } } } },
                        400: { description: "Incident is not linked to a problem.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
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
            // OAuth 2.0 (FR5-02) - client-credentials token endpoint
            // ==================================================================
            "/oauth/token": {
                post: {
                    tags: ["OAuth"],
                    summary: "Obtain an access token (client-credentials grant)",
                    description:
                        "Public. FR5-02/FR5-03 client-credentials flow for the public REST API. Authenticate with the client_id/client_secret via HTTP Basic (preferred) and/or the `client_id`/`client_secret` fields. Optionally supply a `scope` parameter (space-delimited) to request specific scopes; the client may only request scopes it has been assigned. Returns a short-lived bearer token usable with the Tickets endpoints. Errors follow RFC 6749 (`error`/`error_description`).",
                    security: [],
                    requestBody: {
                        required: true,
                        content: {
                            "application/x-www-form-urlencoded": {
                                schema: {
                                    type: "object",
                                    required: ["grant_type"],
                                    properties: {
                                        grant_type: { type: "string", enum: ["client_credentials"], description: "Only client_credentials is supported." },
                                        client_id: { type: "string", description: "Client id (alternative to HTTP Basic)." },
                                        client_secret: { type: "string", description: "Client secret (alternative to HTTP Basic)." },
                                        scope: { type: "string", description: "Space-delimited list of requested scopes (FR5-03). If omitted, all of the client's assigned scopes are granted. Case-sensitive." },
                                    },
                                },
                            },
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["grant_type"],
                                    properties: {
                                        grant_type: { type: "string", enum: ["client_credentials"] },
                                        client_id: { type: "string" },
                                        client_secret: { type: "string" },
                                        scope: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: "A bearer access token with granted scopes.", content: { "application/json": { schema: { $ref: "#/components/schemas/OAuthTokenResponse" } } } },
                        400: { description: "Invalid request - missing/unsupported grant_type or invalid_scope.", content: { "application/json": { schema: { $ref: "#/components/schemas/OAuthErrorResponse" } } } },
                        401: { description: "Client credentials are missing or invalid.", content: { "application/json": { schema: { $ref: "#/components/schemas/OAuthErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // Tickets (FR5-01) - Zoho Desk-compatible adapter over Incidents
            // ==================================================================
            "/tickets": {
                get: {
                    tags: ["Tickets"],
                    summary: "List tickets (paginated, limit/from)",
                    description: "Requires authentication (portal JWT or OAuth 2.0 bearer token with `tickets.READ` or `tickets.ALL` scope). Returns incidents as Zoho Desk-compatible tickets, honouring the same visibility and filter rules as the incident list. Pagination uses `from`/`limit`.",
                    security: [{ bearerAuth: [] }, { oauth2: ["tickets.READ"] }],
                    parameters: [
                        { name: "from", in: "query", required: false, schema: { type: "integer", minimum: 0 }, description: "Zero-based offset (default 0)." },
                        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 }, description: "Items per page (default 10, capped at 100)." },
                        { name: "search", in: "query", required: false, schema: { type: "string", maxLength: 140 }, description: "Literal substring search on subject, description or ticket number." },
                        { name: "status", in: "query", required: false, schema: { type: "string" }, description: "Comma-separated statuses, e.g. `new,in_progress`." },
                        { name: "priority", in: "query", required: false, schema: { type: "string" }, description: "Comma-separated priorities, e.g. `high,critical`." },
                        { name: "category", in: "query", required: false, schema: { type: "string" }, description: "Comma-separated category ids." },
                        { name: "assignedTo", in: "query", required: false, schema: { type: "string" }, description: "`me`, `unassigned`, or a user id." },
                        { name: "reportedBy", in: "query", required: false, schema: { type: "string" }, description: "`me` or a user id." },
                        { name: "overdue", in: "query", required: false, schema: { type: "string", enum: ["true"] }, description: "Filter to overdue tickets." },
                        { name: "open", in: "query", required: false, schema: { type: "string", enum: ["true"] }, description: "Filter to non-terminal (open) tickets." },
                        { name: "sortOrder", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"] }, description: "Sort direction (default desc by creation time)." },
                    ],
                    responses: {
                        200: { description: "Paginated list of tickets.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { tickets: { type: "array", items: { $ref: "#/components/schemas/Ticket" } }, count: { type: "integer" }, from: { type: "integer" }, limit: { type: "integer" }, pagination: { type: "object", properties: { count: { type: "integer" }, from: { type: "integer" }, limit: { type: "integer" }, totalPages: { type: "integer" }, hasNextPage: { type: "boolean" }, hasPrevPage: { type: "boolean" } } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Insufficient OAuth scope (valid token but missing `tickets.READ`).", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                post: {
                    tags: ["Tickets"],
                    summary: "Create a ticket",
                    description: "Requires authentication (portal JWT or OAuth 2.0 bearer token with `tickets.WRITE` or `tickets.ALL` scope). Creates an Incident from the ticket representation. The requester is always the signed-in caller (never read from the body).",
                    security: [{ bearerAuth: [] }, { oauth2: ["tickets.WRITE"] }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TicketCreateRequest" } } } },
                    responses: {
                        201: { description: "Ticket created.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { ticket: { $ref: "#/components/schemas/Ticket" } } } } } } } },
                        400: { description: "Inactive/non-existent category.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/tickets/{id}": {
                get: {
                    tags: ["Tickets"],
                    summary: "Get a ticket",
                    description: "Requires authentication (portal JWT or OAuth 2.0 bearer token with `tickets.READ` or `tickets.ALL` scope). Returns one incident mapped to a ticket, with requester, assignee, category and department populated. A user cannot view a ticket they are not allowed to see.",
                    security: [{ bearerAuth: [] }, { oauth2: ["tickets.READ"] }],
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident/ticket id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Ticket retrieved.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { ticket: { $ref: "#/components/schemas/Ticket" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "You do not have access to this ticket, or insufficient OAuth scope.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Ticket not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                put: {
                    tags: ["Tickets"],
                    summary: "Replace a ticket (supported fields)",
                    description: "Requires authentication (portal JWT or OAuth 2.0 bearer token with `tickets.WRITE` or `tickets.ALL` scope). Full replacement of the supported descriptive fields: subject, description, category and priority. Status, assignment, department and requester are workflow concerns and are deliberately NOT editable here. Requires all supported fields to be supplied.",
                    security: [{ bearerAuth: [] }, { oauth2: ["tickets.WRITE"] }],
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident/ticket id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TicketUpdateRequest" } } } },
                    responses: {
                        200: { description: "Ticket updated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { ticket: { $ref: "#/components/schemas/Ticket" } } } } } } } },
                        400: { description: "Missing required field or no changes supplied.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "You can only edit this ticket while it is unassigned or still New; or staff-only priority change.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Ticket not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                patch: {
                    tags: ["Tickets"],
                    summary: "Update a ticket (supported fields)",
                    description: "Requires authentication (portal JWT or OAuth 2.0 bearer token with `tickets.WRITE` or `tickets.ALL` scope). Partial update - only the supplied supported fields change. Never allows arbitrary Mongo fields, _id/createdAt/audit manipulation, reporter spoofing, or assignment/department changes.",
                    security: [{ bearerAuth: [] }, { oauth2: ["tickets.WRITE"] }],
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident/ticket id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TicketUpdateRequest" } } } },
                    responses: {
                        200: { description: "Ticket updated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { ticket: { $ref: "#/components/schemas/Ticket" } } } } } } } },
                        400: { description: "No changes were supplied.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "You can only edit this ticket while it is unassigned or still New; or staff-only priority change.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Ticket not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                delete: {
                    tags: ["Tickets"],
                    summary: "Delete a ticket (admin)",
                    description: "Requires authentication (portal JWT or OAuth 2.0 bearer token with `tickets.ALL` scope) and the `admin` role. Permanently removes the underlying incident and its child records (same cleanup rules as incident deletion).",
                    security: [{ bearerAuth: [] }, { oauth2: ["tickets.ALL"] }],
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident/ticket id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Ticket deleted.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Ticket not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // Contacts (FR5-04)
            // ==================================================================
            "/contacts": {
                get: {
                    tags: ["Contacts"],
                    summary: "List contacts (paginated, limit/from)",
                    description: "Requires authentication (portal JWT or OAuth 2.0 bearer token with `contacts.READ` scope). Returns End Users as public contacts, adapted from the existing User model (no duplicate records). Pagination uses `from`/`limit`.",
                    security: [{ bearerAuth: [] }, { oauth2: ["contacts.READ"] }],
                    parameters: [
                        { name: "from", in: "query", required: false, schema: { type: "integer", minimum: 0 }, description: "Zero-based offset (default 0)." },
                        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 }, description: "Items per page (default 10, capped at 100)." },
                        { name: "search", in: "query", required: false, schema: { type: "string", maxLength: 140 }, description: "Literal substring search on contact name or email." },
                        { name: "sortOrder", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"] }, description: "Sort direction (default desc by creation time)." },
                    ],
                    responses: {
                        200: { description: "Paginated list of contacts.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { contacts: { type: "array", items: { $ref: "#/components/schemas/Contact" } }, count: { type: "integer" }, from: { type: "integer" }, limit: { type: "integer" }, pagination: { type: "object", properties: { count: { type: "integer" }, from: { type: "integer" }, limit: { type: "integer" }, totalPages: { type: "integer" }, hasNextPage: { type: "boolean" }, hasPrevPage: { type: "boolean" } } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Insufficient OAuth scope (valid token but missing `contacts.READ`).", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                post: {
                    tags: ["Contacts"],
                    summary: "Create a contact",
                    description: "Requires authentication (portal JWT or OAuth 2.0 bearer token with `contacts.READ` scope). Creates an End User contact backed by the shared User collection. A random portal password is generated server-side and never returned; role, password and login metadata in the body are ignored.",
                    security: [{ bearerAuth: [] }, { oauth2: ["contacts.READ"] }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ContactCreateRequest" } } } },
                    responses: {
                        201: { description: "Contact created.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { contact: { $ref: "#/components/schemas/Contact" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        409: { description: "A contact with that email already exists.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/contacts/{id}": {
                get: {
                    tags: ["Contacts"],
                    summary: "Get a contact",
                    description: "Requires authentication (portal JWT or OAuth 2.0 bearer token with `contacts.READ` scope). Returns one End User contact. Staff users are not contacts, so their ids return 404 on this surface.",
                    security: [{ bearerAuth: [] }, { oauth2: ["contacts.READ"] }],
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Contact/user id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Contact retrieved.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { contact: { $ref: "#/components/schemas/Contact" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Insufficient OAuth scope.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Contact not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                put: {
                    tags: ["Contacts"],
                    summary: "Replace a contact (supported fields)",
                    description: "Requires authentication (portal JWT or OAuth 2.0 bearer token with `contacts.READ` scope). Full replacement of the supported contact fields: name, email and optionally isActive. Role, password and login metadata are never writable through this API.",
                    security: [{ bearerAuth: [] }, { oauth2: ["contacts.READ"] }],
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Contact/user id (Mongo ObjectId)." }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ContactUpdateRequest" } } } },
                    responses: {
                        200: { description: "Contact updated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { contact: { $ref: "#/components/schemas/Contact" } } } } } } } },
                        400: { description: "Missing required field or no changes supplied.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Insufficient OAuth scope.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Contact not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        409: { description: "A contact with that email already exists.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // Articles (FR5-07) - public Knowledge Base Articles API
            // ==================================================================
            "/articles": {
                get: {
                    tags: ["Articles"],
                    summary: "List published Knowledge Base articles (paginated, with search/category filters)",
                    description: "Requires authentication (portal JWT or OAuth 2.0 bearer token with `articles.READ` scope). Returns only published Knowledge Base articles using the existing KnowledgeBaseArticle model. Drafts, retired, archived and soft-deleted articles are never exposed. Search reuses the existing KB search behaviour (case-insensitive match on title, body and tags).",
                    security: [{ bearerAuth: [] }, { oauth2: ["articles.READ"] }],
                    parameters: [
                        { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1 }, description: "Page number (default 1)." },
                        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 }, description: "Items per page (default 10, capped at 100)." },
                        { name: "search", in: "query", required: false, schema: { type: "string", maxLength: 140 }, description: "Case-insensitive search on article title, body or tags." },
                        { name: "categoryId", in: "query", required: false, schema: { type: "string" }, description: "Filter to articles in the given category (Mongo ObjectId)." },
                        { name: "sortOrder", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"] }, description: "Sort direction (default desc by creation time)." },
                    ],
                    responses: {
                        200: { description: "Paginated list of published articles.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Article" } }, pagination: { type: "object", properties: { page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" }, hasNextPage: { type: "boolean" }, hasPrevPage: { type: "boolean" } } } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Insufficient OAuth scope (valid token but missing `articles.READ`).", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid query parameters.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/articles/{id}": {
                get: {
                    tags: ["Articles"],
                    summary: "Get one published Knowledge Base article",
                    description: "Requires authentication (portal JWT or OAuth 2.0 bearer token with `articles.READ` scope). Returns a single published article. Drafts, retired, archived and soft-deleted articles are not exposed - they return 404. An invalid id returns a validation error.",
                    security: [{ bearerAuth: [] }, { oauth2: ["articles.READ"] }],
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Article id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Article retrieved.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { article: { $ref: "#/components/schemas/Article" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Insufficient OAuth scope.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Article not found (or not published).", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Invalid id.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
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
            // Problems & Known Errors (V4 - FR4)
            // ==================================================================
            "/problems": {
                get: {
                    tags: ["Problems"],
                    summary: "List problems",
                    description: "Staff only. Search, filter (status/owner/category), sort and paginate the problem queue.",
                    parameters: [
                        { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "Page number." },
                        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 }, description: "Items per page." },
                        { name: "search", in: "query", schema: { type: "string" }, description: "Free text across title, description, reference and workaround." },
                        { name: "status", in: "query", schema: { type: "string", enum: ["new", "investigating", "known_error", "resolved"] }, description: "Filter by status; comma-separated values supported." },
                        { name: "ownerId", in: "query", schema: { type: "string" }, description: "Filter by owner id, or `me` for problems owned by the caller." },
                        { name: "category", in: "query", schema: { type: "string" }, description: "Filter by category id." },
                        { name: "sortBy", in: "query", schema: { type: "string", enum: ["createdAt", "updatedAt", "title", "status", "problemNumber"] } },
                        { name: "sortOrder", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
                    ],
                    responses: {
                        200: { description: "Paginated list of problems.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Problem" } }, pagination: { $ref: "#/components/schemas/Pagination" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                post: {
                    tags: ["Problems"],
                    summary: "Create a problem",
                    description: "Staff only. Creates a problem and optionally groups supplied incidents under it, deriving the category from the incidents when present.",
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProblemCreateRequest" } } } },
                    responses: {
                        201: { description: "Problem created.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { problem: { $ref: "#/components/schemas/Problem" } } } } } } } },
                        400: { description: "Invalid owner or one or more incidents do not exist.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff, or no access to one of the selected incidents.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/problems/suggestions/incidents/{incidentId}": {
                get: {
                    tags: ["Problems"],
                    summary: "Suggest a problem for an incident (FR4-02)",
                    description: "Staff only. Auto-suggestion that reuses the existing V3 correlation criteria (same category within the correlation window). It only suggests - it never creates a Problem.",
                    parameters: [{ name: "incidentId", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Suggestion generated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/ProblemSuggestion" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff, or no access to the incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Incident not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/problems/{id}": {
                get: {
                    tags: ["Problems"],
                    summary: "Get a problem with its linked incidents, RCA and activity",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Problem id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Problem detail.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/ProblemDetail" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Problem not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                patch: {
                    tags: ["Problems"],
                    summary: "Update a problem's descriptive fields",
                    description: "Staff only. Title, description and workaround only.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProblemUpdateRequest" } } } },
                    responses: {
                        200: { description: "Problem updated.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { problem: { $ref: "#/components/schemas/Problem" } } } } } } } },
                        400: { description: "No changes supplied.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                delete: {
                    tags: ["Problems"],
                    summary: "Delete a problem (Admin only)",
                    description: "Detaches all linked incidents (they are kept) and removes the problem, its problem-scoped RCA and problem activity.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        200: { description: "Problem deleted.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not an administrator.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Problem not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/problems/{id}/status": {
                patch: {
                    tags: ["Problems"],
                    summary: "Change a problem's status",
                    description: "Staff only. Legal transitions are enforced. Moving to `resolved` sets `resolvedAt`; leaving `resolved` clears it.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProblemStatusRequest" } } } },
                    responses: {
                        200: { description: "Status changed.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { problem: { $ref: "#/components/schemas/Problem" } } } } } } } },
                        400: { description: "Invalid transition.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/problems/{id}/owner": {
                patch: {
                    tags: ["Problems"],
                    summary: "Change a problem's owner (FR4-05)",
                    description: "Staff only. The new owner must be an active Admin or Support Agent.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProblemOwnerRequest" } } } },
                    responses: {
                        200: { description: "Owner changed.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { problem: { $ref: "#/components/schemas/Problem" } } } } } } } },
                        400: { description: "Already owned by that user, or the owner is not an active Admin/Agent.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/problems/{id}/incidents": {
                post: {
                    tags: ["Problems"],
                    summary: "Link an incident to this problem (FR4-04)",
                    description: "Staff only. Groups an existing incident under this problem. The incident must not already be linked to another problem.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProblemLinkRequest" } } } },
                    responses: {
                        200: { description: "Incident linked.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        400: { description: "Already linked (to this or another problem).", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff, or no access to the incident.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Problem or incident not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/problems/{id}/incidents/{incidentId}": {
                delete: {
                    tags: ["Problems"],
                    summary: "Unlink an incident from this problem",
                    description: "Staff only. Detaches the incident without deleting it.",
                    parameters: [
                        { name: "id", in: "path", required: true, schema: { type: "string" } },
                        { name: "incidentId", in: "path", required: true, schema: { type: "string" }, description: "Incident id." },
                    ],
                    responses: {
                        200: { description: "Incident removed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } } },
                        400: { description: "The incident is not linked to this problem.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/problems/{id}/rca": {
                get: {
                    tags: ["Problems"],
                    summary: "Get a problem's RCA (FR4-06)",
                    description: "Staff only. Returns the problem-scoped RCA, which reuses the existing RootCauseAnalysis structure.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        200: { description: "RCA (draft, empty when none exists).", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/RootCauseAnalysis" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                put: {
                    tags: ["Problems"],
                    summary: "Save a problem's RCA draft",
                    description: "Staff only. Same fields and workflow as an incident's RCA.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RcaSaveRequest" } } } },
                    responses: {
                        200: { description: "RCA saved.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/RootCauseAnalysis" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/problems/{id}/rca/submit": {
                post: {
                    tags: ["Problems"],
                    summary: "Submit a problem's RCA for review",
                    description: "Staff only. Moves the RCA from `draft` to `in_review`.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        200: { description: "RCA submitted.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/RootCauseAnalysis" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/problems/{id}/rca/review": {
                patch: {
                    tags: ["Problems"],
                    summary: "Review (approve/return) a problem's RCA",
                    description: "Admin only. Approves or returns an RCA that is `in_review`.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RcaReviewRequest" } } } },
                    responses: {
                        200: { description: "RCA reviewed.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/RootCauseAnalysis" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not an administrator.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/known-errors": {
                get: {
                    tags: ["Problems"],
                    summary: "List known errors (FR4-03)",
                    description: "Staff only. Returns only problems in `known_error` status, searchable across title, reference, description and workaround.",
                    parameters: [
                        { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
                        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
                        { name: "search", in: "query", schema: { type: "string" } },
                    ],
                    responses: {
                        200: { description: "Paginated list of known errors.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Problem" } }, pagination: { $ref: "#/components/schemas/Pagination" } } } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/known-errors/{id}": {
                get: {
                    tags: ["Problems"],
                    summary: "Get a known error",
                    description: "Staff only. Returns the problem, its workaround, RCA and linked incidents. A non-Known-Error id returns 404.",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Problem id (Mongo ObjectId)." }],
                    responses: {
                        200: { description: "Known error detail.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/KnownError" } } } } } },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not staff.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Known error not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },

            // ==================================================================
            // CSAT / Surveys (FR4-26..29)
            // ==================================================================
            "/surveys/csat": {
                get: {
                    tags: ["CSAT"],
                    summary: "CSAT statistics",
                    description: "Admin and Agent. Returns overall average rating, response count, breakdowns by agent/department/category, and the count of incidents flagged for manager follow-up.",
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: "CSAT statistics.",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: { type: "boolean" },
                                            message: { type: "string" },
                                            data: {
                                                type: "object",
                                                properties: {
                                                    overall: { type: "object", properties: { avgRating: { type: "number", nullable: true }, responseCount: { type: "integer" } } },
                                                    byAgent: { type: "array", items: { type: "object", properties: { agentId: { type: "string" }, agentName: { type: "string" }, avgRating: { type: "number" }, responseCount: { type: "integer" } } } },
                                                    byDepartment: { type: "array", items: { type: "object", properties: { departmentId: { type: "string" }, departmentName: { type: "string" }, avgRating: { type: "number" }, responseCount: { type: "integer" } } } },
                                                    byCategory: { type: "array", items: { type: "object", properties: { categoryId: { type: "string" }, categoryName: { type: "string" }, avgRating: { type: "number" }, responseCount: { type: "integer" } } } },
                                                    followUpCount: { type: "integer" },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not admin or agent.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/surveys/csat/trend": {
                get: {
                    tags: ["CSAT"],
                    summary: "CSAT trend over time",
                    description: "Admin and Agent. Returns daily average CSAT rating and response count for the given number of past days.",
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: "days", in: "query", schema: { type: "integer", minimum: 1, maximum: 365, default: 30 }, description: "Number of past days to include." },
                    ],
                    responses: {
                        200: {
                            description: "CSAT trend data.",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: { type: "boolean" },
                                            message: { type: "string" },
                                            data: {
                                                type: "object",
                                                properties: {
                                                    trend: {
                                                        type: "array",
                                                        items: {
                                                            type: "object",
                                                            properties: {
                                                                date: { type: "string", format: "date", example: "2026-09-01" },
                                                                avgRating: { type: "number", example: 4.25 },
                                                                responseCount: { type: "integer", example: 8 },
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        403: { description: "Not admin or agent.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
            },
            "/surveys/{token}": {
                get: {
                    tags: ["CSAT"],
                    summary: "Retrieve a survey by token",
                    description: "Public. Returns the survey incident info and status. If the survey is already completed, indicates so.",
                    security: [],
                    parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" }, description: "Secure survey token." }],
                    responses: {
                        200: { description: "Survey retrieved.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { survey: { type: "object", properties: { incident: { type: "object" }, status: { type: "string" } } } } } } } } } },
                        404: { description: "Survey not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                    },
                },
                post: {
                    tags: ["CSAT"],
                    summary: "Submit a survey response",
                    description: "Public. Submits rating (1-5) and optional comments. A survey can only be submitted once. Rating below the configurable threshold flags the incident for manager follow-up.",
                    security: [],
                    parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" }, description: "Secure survey token." }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["rating"],
                                    properties: {
                                        rating: { type: "integer", minimum: 1, maximum: 5, description: "CSAT rating from 1 (very dissatisfied) to 5 (very satisfied)." },
                                        comments: { type: "string", maxLength: 5000, description: "Optional free-text feedback." },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: "Survey submitted.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { survey: { type: "object", properties: { id: { type: "string" }, rating: { type: "integer" }, comments: { type: "string" }, status: { type: "string" }, submittedAt: { type: "string", format: "date-time" } } } } } } } } } },
                        400: { description: "Survey already submitted or invalid rating.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        404: { description: "Survey not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
                        422: { description: "Validation failed.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
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
            // ==================================================================
// On-Call (FR4-21..25)
// ==================================================================
"/on-call/roster": {
    post: {
        tags: ["OnCall"],
        summary: "Create an on-call roster (FR4-21)",
        description: "Requires authentication and the `admin` role. Configures a shift window, optional category scope, acknowledgement window and escalation chain.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/OnCallRosterCreateRequest" } } } },
        responses: {
            201: { description: "Roster configured.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { schedule: { $ref: "#/components/schemas/OnCallSchedule" } } } } } } } },
            400: { description: "Missing department, shift window, or an empty escalation chain.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } },
            401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotAuthenticatedExample" } } } } },
            403: { description: "Requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/ForbiddenExample" } } } } },
        },
    },
},
"/on-call/calendar": {
    get: {
        tags: ["OnCall"],
        summary: "Get the on-call calendar view (FR4-25)",
        description: "Requires authentication. Open to any signed-in role (Admin, Support Agent, or End User). Returns active schedules, optionally filtered by department and/or date range.",
        parameters: [
            { name: "department", in: "query", required: false, schema: { type: "string" }, description: "Filter by department id." },
            { name: "start", in: "query", required: false, schema: { type: "string", format: "date-time" }, description: "Include schedules overlapping on/after this time. Must be supplied together with `end`." },
            { name: "end", in: "query", required: false, schema: { type: "string", format: "date-time" }, description: "Include schedules overlapping on/before this time. Must be supplied together with `start`." },
        ],
        responses: {
            200: { description: "Active schedules matching the filters.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { schedules: { type: "array", items: { $ref: "#/components/schemas/OnCallSchedule" } } } } } } } } },
            401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotAuthenticatedExample" } } } } },
        },
    },
},
"/on-call/incidents/{id}/acknowledge": {
    post: {
        tags: ["OnCall"],
        summary: "Acknowledge an incident (FR4-23)",
        description: "Requires authentication. Not currently role- or assignment-restricted beyond being signed in - any authenticated user can acknowledge any incident id. Stamps `acknowledgedAt`/`acknowledgedBy` and sets `isAcknowledged: true`, intended to stop further escalation.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Incident id (Mongo ObjectId)." }],
        responses: {
            200: { description: "Incident acknowledged.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/Incident" } } } } } },
            401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotAuthenticatedExample" } } } } },
            404: { description: "Incident not found.", content: { "application/json": { schema: { type: "object", properties: { message: { type: "string", example: "Incident not found" } } } } } },
            500: { description: "Server error (including an internal-consistency check failing to persist the acknowledgement).", content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" } } } } } },
        },
    },
},

// ==================================================================
// Webhooks (FR4-17)
// ==================================================================
"/webhooks/monitoring/{vendor}": {
    // This route is mounted at app.use("/api/webhooks", ...) in app.js,
    // registered BEFORE express.json() so it can verify the raw request
    // body. It sits outside the /api/v1 base every other path in this spec
    // uses, so this path-level `servers` override points Swagger UI at the
    // correct absolute URL for this one path only.
    servers: [{ url: "/api", description: "Non-versioned API root (webhooks only)" }],
    post: {
        tags: ["Webhooks"],
        summary: "Receive a monitoring-tool alert webhook",
        description:
            "Public endpoint (no bearer token) intended for server-to-server calls from monitoring vendors. Mounted outside the versioned `/api/v1` API, at `/api/webhooks/monitoring/{vendor}`, and registered before the global JSON body parser so its signature can be verified against the raw request bytes. On success, normalizes the vendor-specific payload into a common alert shape (title, description, priority, a vendor-scoped dedupe key) and creates an Incident, or updates the existing one if the dedupe key matches a prior alert. Malformed or unparseable payloads are NOT rejected with an error status; they are accepted and logged to the Intake queue for manual review, so the sending vendor does not endlessly retry.",
        security: [],
        parameters: [
            { name: "vendor", in: "path", required: true, schema: { type: "string", enum: ["datadog", "alertmanager", "generic"] }, description: "The sending monitoring tool. Any other value is rejected with 400. Each vendor expects a different payload shape - see the request body examples." },
        ],
        requestBody: {
            required: true,
            description: "Raw vendor-specific alert payload, shape depends on the `vendor` path parameter.",
            content: {
                "application/json": {
                    schema: { type: "object" },
                    examples: {
                        datadog: {
                            summary: "Datadog monitor webhook",
                            description: "Standard Datadog webhook integration payload. Requires at least `alert_id` or `title`. `alert_type` maps to priority (critical/error/warning/info); anything unrecognized defaults to medium.",
                            value: {
                                title: "CPU usage alert on web-01",
                                body: "CPU usage has exceeded 90% for 5 minutes.",
                                alert_type: "error",
                                alert_id: "12345",
                                alert_scope: "host:web-01",
                            },
                        },
                        alertmanager: {
                            summary: "Prometheus Alertmanager webhook_config",
                            description: "Standard Alertmanager webhook_config payload. Requires a `fingerprint` on the firing alert, or a top-level `groupKey`, for deduplication. `labels.severity` maps to priority.",
                            value: {
                                status: "firing",
                                groupKey: "{}:{alertname=\"HighMemoryUsage\"}",
                                commonLabels: { alertname: "HighMemoryUsage", severity: "critical" },
                                commonAnnotations: { summary: "Memory usage above threshold", description: "Node memory usage is above 95%." },
                                alerts: [
                                    {
                                        status: "firing",
                                        fingerprint: "a1b2c3d4",
                                        labels: { alertname: "HighMemoryUsage", severity: "critical" },
                                        annotations: { summary: "Memory usage above threshold", description: "Node memory usage is above 95%." },
                                    },
                                ],
                            },
                        },
                        generic: {
                            summary: "Generic fallback shape",
                            description: "For any monitoring tool without a dedicated adapter. Requires `title`/`name`/`summary` AND `dedupeKey`/`id`/`alertId`. `severity`/`priority` maps to incident priority.",
                            value: {
                                title: "Disk space low on db-02",
                                description: "Available disk space below 10%.",
                                severity: "high",
                                dedupeKey: "db-02-disk-space",
                            },
                        },
                    },
                },
            },
        },
        responses: {
            200: { description: "An existing incident was updated (duplicate alert, matched by dedupe key).", content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookIngestResponse" } } } },
            201: { description: "A new incident was created from the alert.", content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookIngestResponse" } } } },
            202: { description: "Payload accepted but could not be parsed (e.g. missing a required identifying field for the vendor) or turned into an incident; flagged in the Intake queue for manual review.", content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookIngestResponse" } } } },
            400: { description: "Unsupported `vendor` path value.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" } } } } } },
            401: { description: "Missing or invalid webhook signature." },
        },
    },
},

// ==================================================================
// Intake (FR4-20)
// ==================================================================
"/intake/failures": {
    get: {
        tags: ["Intake"],
        summary: "List intake failures (paginated)",
        description: "Requires authentication. Effectively Admin-only in practice (the route also lists a `Manager`/`manager` role, but no such role currently exists in the system, so only `admin` accounts can pass). This router is also separately mounted at `/api/intake` (outside `/api/v1`) in app.js; both paths reach the same handlers.",
        parameters: [
            { name: "status", in: "query", required: false, schema: { type: "string" }, description: "Filter by status. NOTE: passing `failed` is mapped server-side to the literal `Flagged`, which does not match any stored value (failures are stored as lowercase `flagged`) - this filter currently returns no results for that case. Pass the exact stored value (e.g. `flagged`, `Resolved`, `Reviewed`) to filter reliably." },
            { name: "source", in: "query", required: false, schema: { type: "string", enum: ["Email", "Webhook"] }, description: "Filter by intake source." },
            { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1 }, description: "Page number (default 1)." },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1 }, description: "Items per page (default 20)." },
        ],
        responses: {
            200: { description: "Paginated list of intake failures.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/IntakeLog" } }, pagination: { $ref: "#/components/schemas/Pagination" } } } } } } } },
            401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotAuthenticatedExample" } } } } },
            403: { description: "Forbidden - requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/ForbiddenExample" } } } } },
        },
    },
},
"/intake/failures/{id}": {
    get: {
        tags: ["Intake"],
        summary: "Get an intake failure",
        description: "Requires authentication. Effectively Admin-only (see note on the list endpoint).",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "IntakeLog id (Mongo ObjectId)." }],
        responses: {
            200: { description: "Intake failure retrieved.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/IntakeLog" } } } } } },
            401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotAuthenticatedExample" } } } } },
            403: { description: "Forbidden - requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/ForbiddenExample" } } } } },
            404: { description: "Intake log not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotFoundExample" } } } } },
        },
    },
},
"/intake/failures/{id}/resolve": {
    patch: {
        tags: ["Intake"],
        summary: "Mark an intake failure resolved",
        description: "Requires authentication. Effectively Admin-only (see note on the list endpoint). Optionally links the failure to the incident it was manually turned into.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "IntakeLog id (Mongo ObjectId)." }],
        requestBody: { required: false, content: { "application/json": { schema: { $ref: "#/components/schemas/IntakeResolveRequest" } } } },
        responses: {
            200: { description: "Marked resolved.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/IntakeLog" } } } } } },
            401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotAuthenticatedExample" } } } } },
            403: { description: "Forbidden - requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/ForbiddenExample" } } } } },
            404: { description: "Intake log not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotFoundExample" } } } } },
        },
    },
},
"/intake/failures/{id}/dismiss": {
    patch: {
        tags: ["Intake"],
        summary: "Dismiss an intake failure",
        description: "Requires authentication. Effectively Admin-only (see note on the list endpoint). Marks the entry as reviewed without linking it to any incident.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "IntakeLog id (Mongo ObjectId)." }],
        responses: {
            200: { description: "Marked reviewed/dismissed.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, data: { $ref: "#/components/schemas/IntakeLog" } } } } } },
            401: { description: "Not authenticated.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotAuthenticatedExample" } } } } },
            403: { description: "Forbidden - requires the `admin` role.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/ForbiddenExample" } } } } },
            404: { description: "Intake log not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotFoundExample" } } } } },
        },
    },
},
// ==================================================================
// Agents Endpoints
// ==================================================================
"/agents": {
    get: {
        tags: ["Agents"],
        summary: "List all agents",
        description: "Retrieves a paginated list of agents. Requires OAuth2 Bearer token authentication with the 'agents.READ' scope.",
        security: [
            { OAuth2: ["agents.READ"] }
        ],
        parameters: [
            { name: "page", in: "query", required: false, schema: { type: "integer", default: 1 }, description: "Page number" },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 10 }, description: "Number of items per page" },
            { name: "search", in: "query", required: false, schema: { type: "string" }, description: "Search term to filter agents by name or email" }
        ],
        responses: {
            200: {
                description: "List of agents retrieved successfully.",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                success: { type: "boolean", example: true },
                                data: {
                                    type: "array",
                                    items: { $ref: "#/components/schemas/Agent" }
                                },
                                pagination: { $ref: "#/components/schemas/Pagination" }
                            }
                        }
                    }
                }
            },
            401: { description: "Unauthorized - Invalid or missing OAuth Bearer token.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotAuthenticatedExample" } } } } },
            403: { description: "Forbidden - Requires 'agents.READ' scope.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/ForbiddenExample" } } } } },
            422: { description: "Validation failed for query parameters.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } }
        }
    }
},
"/agents/{agent_id}": {
    get: {
        tags: ["Agents"],
        summary: "Get agent by ID",
        description: "Retrieves details of a specific agent. Requires OAuth2 Bearer token authentication with the 'agents.READ' scope.",
        security: [
            { OAuth2: ["agents.READ"] }
        ],
        parameters: [
            {
                name: "agent_id",
                in: "path",
                required: true,
                schema: { type: "string" },
                description: "The unique identifier of the agent."
            }
        ],
        responses: {
            200: {
                description: "Agent details retrieved successfully.",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                success: { type: "boolean", example: true },
                                data: {
                                    type: "object",
                                    properties: {
                                        agent: { $ref: "#/components/schemas/Agent" }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            401: { description: "Unauthorized - Invalid or missing OAuth Bearer token.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotAuthenticatedExample" } } } } },
            403: { description: "Forbidden - Requires 'agents.READ' scope.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/ForbiddenExample" } } } } },
            404: { description: "Agent not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" }, examples: { default: { $ref: "#/components/examples/NotFoundExample" } } } } },
            422: { description: "Validation failed for agent_id parameter.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiErrorResponse" } } } }
        }
    }
},
        },
    },
    // Scan our own JSDoc comments if any route files are annotated. None are
    // currently, so only the definition above contributes to the spec.
    apis: [],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;