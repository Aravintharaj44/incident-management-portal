import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spin } from "antd";
import ProtectedRoute from "./routes/ProtectedRoute";
import RoleRoute from "./routes/RoleRoute";
import AppLayout from "./components/layout/AppLayout";
import ErrorBoundary from "./components/common/ErrorBoundary";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import { ROLES } from "./utils/constants";
import IntakeFailuresPage from './pages/admin/IntakeFailuresPage';

/**
 * Route table for the whole app.
 *
 * Screens behind the login are code-split: the login page is the only thing a
 * first-time visitor needs to download, and the admin bundle is never fetched
 * for a user who cannot open those screens.
 *
 * The role guards here mirror the API's own checks (FR-02). They exist so the
 * UI does not offer dead ends - the server, not this file, is what actually
 * enforces access.
 */

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const IncidentListPage = lazy(() => import("./pages/IncidentListPage"));
const IncidentCreatePage = lazy(() => import("./pages/IncidentCreatePage"));
const IncidentDetailPage = lazy(() => import("./pages/IncidentDetailPage"));
const MyQueuePage = lazy(() => import("./pages/MyQueuePage"));
const ProblemsPage = lazy(() => import("./pages/problems/ProblemsPage"));
const ProblemCreatePage = lazy(() => import("./pages/problems/ProblemCreatePage"));
const ProblemDetailPage = lazy(() => import("./pages/problems/ProblemDetailPage"));
const KnownErrorsPage = lazy(() => import("./pages/problems/KnownErrorsPage"));
const KbListPage = lazy(() => import("./pages/kb/KbListPage"));
const KbDetailPage = lazy(() => import("./pages/kb/KbDetailPage"));
const KbCreateEditPage = lazy(() => import("./pages/kb/KbCreateEditPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const ApiDocsPage = lazy(() => import("./pages/ApiDocsPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const CategoriesPage = lazy(() => import("./pages/admin/CategoriesPage"));
const DepartmentsPage = lazy(() => import("./pages/admin/DepartmentsPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const ForbiddenPage = lazy(() => import("./pages/ForbiddenPage"));
const OnCallPage = lazy(() => import("./pages/admin/OnCallPage"));
const SurveyPage = lazy(() => import("./pages/survey/SurveyPage"));

const RouteFallback = () => (
    <div style={{ display: "grid", placeItems: "center", minHeight: 320 }}>
        <Spin size="large" />
    </div>
);

const App = () => (
    <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
            <Routes>
                {/* Public */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                {/* FR4-26 - Post Resolution Survey */}
                <Route
                    path="/survey/:token"
                    element={<SurveyPage />}
                />

                {/* Everything below requires a session */}
                <Route element={<ProtectedRoute />}>
                    <Route element={<AppLayout />}>
                        <Route index element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={<DashboardPage />} />

                        <Route path="/incidents" element={<IncidentListPage />} />
                        <Route path="/incidents/new" element={<IncidentCreatePage />} />
                        <Route path="/incidents/:id" element={<IncidentDetailPage />} />

                        <Route path="/profile" element={<ProfilePage />} />
                        <Route path="/api-docs" element={<ApiDocsPage />} />
                        <Route path="/forbidden" element={<ForbiddenPage />} />

                        {/* Staff only */}
                        <Route
                            element={<RoleRoute allowedRoles={[ROLES.ADMIN, ROLES.AGENT]} />}
                        >
                            <Route path="/my-queue" element={<MyQueuePage />} />
                            <Route path="/on-call" element={<OnCallPage />} />

                            {/* V4 - Problem Management (FR4-01..06) */}
                            <Route path="/problems" element={<ProblemsPage />} />
                            <Route path="/problems/new" element={<ProblemCreatePage />} />
                            <Route path="/problems/:id" element={<ProblemDetailPage />} />
                            <Route path="/known-errors" element={<KnownErrorsPage />} />
                        </Route>

                        {/* KB - all authenticated users can view; staff can create/edit */}
                        <Route path="/kb" element={<KbListPage />} />
                        <Route path="/kb/new" element={<KbCreateEditPage />} />
                        <Route path="/kb/:id" element={<KbDetailPage />} />
                        <Route path="/kb/:id/edit" element={<KbCreateEditPage />} />

                        {/* Admin only (FR-13) */}
                        <Route element={<RoleRoute allowedRoles={[ROLES.ADMIN]} />}>
                            <Route path="/admin/users" element={<UsersPage />} />
                            <Route path="/admin/categories" element={<CategoriesPage />} />
                            <Route path="/admin/departments" element={<DepartmentsPage />} />
                            <Route path="/admin/intake-failures" element={<IntakeFailuresPage />} />
                        </Route>

                        <Route path="*" element={<NotFoundPage />} />
                    </Route>
                </Route>
            </Routes>
        </Suspense>
    </ErrorBoundary>
);

export default App;
