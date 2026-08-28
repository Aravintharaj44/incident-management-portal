import { Column, Line, Pie } from "@ant-design/charts";
import { Empty } from "antd";
import { PRIORITY_HEX, STATUS_HEX } from "../../utils/constants";

/**
 * Dashboard charts (FR-11).
 *
 * Colours are pulled from the same constants the tags use, so a "Critical"
 * slice on a chart is the same red as a "Critical" tag in the table - the two
 * views never disagree about what a colour means.
 *
 * Each chart returns an Empty state rather than rendering an axis with no
 * data, which otherwise looks like a broken widget.
 */

const CHART_HEIGHT = 260;

const noData = (series) => !series || series.length === 0 || series.every((d) => !d.count);

const emptyState = (text) => (
    <div style={{ height: CHART_HEIGHT, display: "grid", placeItems: "center" }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />
    </div>
);

/** Donut of incidents by status. */
export const StatusPie = ({ data }) => {
    if (noData(data)) return emptyState("No incidents yet");

    const series = data.filter((item) => item.count > 0);

    return (
        <Pie
            height={CHART_HEIGHT}
            data={series}
            angleField="count"
            colorField="label"
            innerRadius={0.6}
            paddingBottom={36}
            paddingTop={16}
            legend={{ color: { position: "bottom", layout: { justifyContent: "center" } } }}
            // Map each slice back to the status colour used elsewhere in the UI.
            scale={{
                color: {
                    domain: series.map((item) => item.label),
                    range: series.map((item) => STATUS_HEX[item.key] || "#1677ff"),
                },
            }}
            label={{
                text: (item) => `${item.count}`,
                position: "outside",
            }}
            tooltip={{ title: (item) => item.label }}
        />
    );
};

/** Bars of incidents by priority, ordered most severe first. */
export const PriorityColumn = ({ data }) => {
    if (noData(data)) return emptyState("No incidents yet");

    return (
        <Column
            height={CHART_HEIGHT}
            data={data}
            xField="label"
            yField="count"
            colorField="label"
            paddingBottom={36}
            paddingTop={16}
            paddingLeft={44}
            paddingRight={16}
            legend={false}
            scale={{
                color: {
                    domain: data.map((item) => item.label),
                    range: data.map((item) => PRIORITY_HEX[item.key] || "#1677ff"),
                },
            }}
            axis={{ y: { title: "Incidents" } }}
            label={{ text: "count", position: "inside", style: { fill: "#fff" } }}
        />
    );
};

/** Created vs Resolved over time. */
export const TrendLine = ({ data, height = CHART_HEIGHT }) => {
    if (!data || data.length === 0) return emptyState("No activity in this period");

    return (
        <Line
            height={height}
            data={data}
            xField="date"
            yField="count"
            colorField="type"
            // Extra headroom so the top legend is not clipped by the plot area.
            paddingTop={36}
            paddingBottom={32}
            paddingLeft={44}
            paddingRight={16}
            shapeField="smooth"
            scale={{
                color: { domain: ["Created", "Resolved"], range: ["#1677ff", "#52c41a"] },
            }}
            legend={{ color: { position: "top", layout: { justifyContent: "flex-end" } } }}
            axis={{
                y: { title: "Incidents" },
                // A tick per day is unreadable over 30+ days, so thin them out.
                x: { labelAutoHide: true, labelAutoRotate: false },
            }}
            point={{ sizeField: 3 }}
        />
    );
};

/** Horizontal-style breakdown of incidents per category. */
export const CategoryColumn = ({ data }) => {
    if (noData(data)) return emptyState("No incidents yet");

    // Long tails make the axis unreadable - show the busiest categories only.
    const top = data.slice(0, 8);

    return (
        <Column
            height={CHART_HEIGHT}
            data={top}
            xField="label"
            yField="count"
            // Rotated category labels need room beneath the axis.
            paddingBottom={64}
            paddingTop={16}
            paddingLeft={44}
            paddingRight={16}
            legend={false}
            style={{ fill: "#1677ff", maxWidth: 48 }}
            axis={{ y: { title: "Incidents" }, x: { labelAutoRotate: true } }}
            label={{ text: "count", position: "inside", style: { fill: "#fff" } }}
        />
    );
};
