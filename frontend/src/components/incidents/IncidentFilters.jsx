import { useEffect, useState } from "react";
import { Button, Card, Col, DatePicker, Input, Row, Select, Space, Switch, Tag } from "antd";
import { ClearOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
    PRIORITY_OPTIONS,
    STATUS_OPTIONS,
} from "../../utils/constants";
import { useDebounce } from "../../hooks/useDebounce";

const { RangePicker } = DatePicker;

/**
 * Search and filter bar for the incident list (FR-10).
 *
 * Filters are lifted into the parent (and from there into the URL), so a
 * filtered view can be bookmarked, shared, or linked to from a dashboard tile.
 *
 * The keyword box is debounced: typing "printer" should send one request, not
 * seven.
 */
const IncidentFilters = ({
    filters,
    onChange,
    onReset,
    categories = [],
    assignees = [],
    isStaff,
    loading,
}) => {
    const [searchText, setSearchText] = useState(filters.search || "");
    const debouncedSearch = useDebounce(searchText, 400);

    /**
     * Keep the box in step when the parent resets the filters or a dashboard
     * link changes them.
     *
     * Adjusting state during render (rather than in an effect) is React's
     * documented pattern for "a prop changed, reset some local state" - it
     * re-renders immediately instead of painting the stale value first.
     */
    const [lastAppliedSearch, setLastAppliedSearch] = useState(filters.search || "");

    if ((filters.search || "") !== lastAppliedSearch) {
        setLastAppliedSearch(filters.search || "");
        setSearchText(filters.search || "");
    }

    // Push the debounced value up only when it actually differs, otherwise the
    // first render would fire a redundant request.
    useEffect(() => {
        if (debouncedSearch !== (filters.search || "")) {
            onChange({ search: debouncedSearch || undefined, page: 1 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearch]);

    const activeCount = [
        filters.status?.length,
        filters.priority?.length,
        filters.category?.length,
        filters.assignedTo,
        filters.reportedBy,
        filters.overdue,
        filters.dateFrom,
        filters.search,
    ].filter(Boolean).length;

    const handleDateRange = (range) => {
        onChange({
            dateFrom: range?.[0] ? range[0].startOf("day").toISOString() : undefined,
            dateTo: range?.[1] ? range[1].endOf("day").toISOString() : undefined,
            page: 1,
        });
    };

    return (
        <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={[12, 12]} align="middle">
                <Col xs={24} md={8} lg={6}>
                    <Input
                        allowClear
                        prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
                        placeholder="Search title, description or INC number"
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                    />
                </Col>

                <Col xs={12} md={8} lg={4}>
                    <Select
                        mode="multiple"
                        allowClear
                        maxTagCount="responsive"
                        style={{ width: "100%" }}
                        placeholder="Status"
                        options={STATUS_OPTIONS}
                        value={filters.status || []}
                        onChange={(value) => onChange({ status: value, page: 1 })}
                    />
                </Col>

                <Col xs={12} md={8} lg={4}>
                    <Select
                        mode="multiple"
                        allowClear
                        maxTagCount="responsive"
                        style={{ width: "100%" }}
                        placeholder="Priority"
                        options={PRIORITY_OPTIONS}
                        value={filters.priority || []}
                        onChange={(value) => onChange({ priority: value, page: 1 })}
                    />
                </Col>

                <Col xs={12} md={8} lg={4}>
                    <Select
                        mode="multiple"
                        allowClear
                        maxTagCount="responsive"
                        style={{ width: "100%" }}
                        placeholder="Category"
                        options={categories.map((category) => ({
                            value: category._id,
                            label: category.name,
                        }))}
                        value={filters.category || []}
                        onChange={(value) => onChange({ category: value, page: 1 })}
                    />
                </Col>

                {isStaff && (
                    <Col xs={12} md={8} lg={4}>
                        <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            style={{ width: "100%" }}
                            placeholder="Assignee"
                            value={filters.assignedTo}
                            onChange={(value) => onChange({ assignedTo: value, page: 1 })}
                            options={[
                                { value: "me", label: "Assigned to me" },
                                { value: "unassigned", label: "Unassigned" },
                                ...assignees.map((agent) => ({
                                    value: agent._id,
                                    label: agent.name,
                                })),
                            ]}
                        />
                    </Col>
                )}

                <Col xs={24} md={8} lg={6}>
                    <RangePicker
                        style={{ width: "100%" }}
                        placeholder={["Raised from", "Raised to"]}
                        value={
                            filters.dateFrom
                                ? [dayjs(filters.dateFrom), filters.dateTo ? dayjs(filters.dateTo) : null]
                                : null
                        }
                        onChange={handleDateRange}
                    />
                </Col>

                <Col xs={24} lg={6}>
                    <Space wrap size={16}>
                        <Space size={6}>
                            <Switch
                                size="small"
                                checked={Boolean(filters.overdue)}
                                onChange={(checked) =>
                                    onChange({ overdue: checked || undefined, page: 1 })
                                }
                            />
                            <span style={{ fontSize: 13 }}>Overdue only</span>
                        </Space>

                        <Space size={6}>
                            <Switch
                                size="small"
                                checked={Boolean(filters.open)}
                                onChange={(checked) =>
                                    onChange({ open: checked || undefined, page: 1 })
                                }
                            />
                            <span style={{ fontSize: 13 }}>Open only</span>
                        </Space>
                    </Space>
                </Col>

                {activeCount > 0 && (
                    <Col xs={24} lg={4} style={{ textAlign: "right" }}>
                        <Space size={8}>
                            <Tag color="blue">{activeCount} filter(s)</Tag>
                            <Button
                                size="small"
                                icon={<ClearOutlined />}
                                onClick={onReset}
                                disabled={loading}
                            >
                                Clear
                            </Button>
                        </Space>
                    </Col>
                )}
            </Row>
        </Card>
    );
};

export default IncidentFilters;
