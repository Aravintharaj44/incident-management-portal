import { useState } from "react";
import { App, Button, Select, Space, Typography } from "antd";
import { kbApi } from "../../api";

const { Text } = Typography;

/**
 * Inline panel for staff to search and link a KB article to an incident or problem.
 * Pass either `incidentId` or `problemId` (not both).
 */
const KbLinkPanel = ({ incidentId, problemId, onChange }) => {
    const { message } = App.useApp();
    const [options, setOptions] = useState([]);
    const [searching, setSearching] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [linking, setLinking] = useState(false);

    const handleSearch = async (value) => {
        if (!value || value.trim().length < 2) {
            setOptions([]);
            return;
        }
        setSearching(true);
        try {
            const response = await kbApi.list({ search: value, status: "published", limit: 10 });
            setOptions(
                (response.data.items || []).map((a) => ({
                    value: a._id,
                    label: a.title,
                }))
            );
        } catch {
            setOptions([]);
        } finally {
            setSearching(false);
        }
    };

    const handleLink = async () => {
        if (!selectedId) return;
        setLinking(true);
        try {
            if (incidentId) {
                await kbApi.linkIncident(selectedId, incidentId);
            } else if (problemId) {
                await kbApi.linkProblem(selectedId, problemId);
            }
            message.success("KB article linked");
            setSelectedId(null);
            setOptions([]);
            onChange?.();
        } catch (err) {
            message.error(err.message || "Failed to link article");
        } finally {
            setLinking(false);
        }
    };

    return (
        <div style={{ padding: "8px 0" }}>
            <Space.Compact style={{ width: "100%" }}>
                <Select
                    showSearch
                    filterOption={false}
                    onSearch={handleSearch}
                    loading={searching}
                    options={options}
                    value={selectedId}
                    onChange={setSelectedId}
                    placeholder="Search for a KB article..."
                    style={{ flex: 1 }}
                    notFoundContent={searching ? "Searching..." : "Type to search"}
                />
                <Button type="primary" onClick={handleLink} loading={linking} disabled={!selectedId}>
                    Link
                </Button>
            </Space.Compact>
            <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
                Search by title to find a published KB article, then click Link.
            </Text>
        </div>
    );
};

export default KbLinkPanel;
