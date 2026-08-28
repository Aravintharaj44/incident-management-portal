import { Navigate } from "react-router-dom";

/**
 * "My Queue" is the incident list with the assignee filter pre-applied, so
 * there is one list implementation rather than two that can drift apart.
 */
const MyQueuePage = () => (
    <Navigate to="/incidents?assignedTo=me&open=true" replace />
);

export default MyQueuePage;
