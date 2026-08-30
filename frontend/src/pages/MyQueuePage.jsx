import IncidentListPage from "./IncidentListPage";

/**
 * Keeps the queue at its own URL and menu entry while reusing the incident
 * table. The assignee and open-state filters are intentionally fixed here.
 */
const MyQueuePage = () => (
    <IncidentListPage
        fixedFilters={{ assignedTo: "me", open: true }}
        pageTitle="My Queue"
    />
);

export default MyQueuePage;