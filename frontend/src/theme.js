/**
 * Ant Design design tokens.
 *
 * Centralising them here means spacing, radius and colour stay consistent
 * across every screen, and the whole look can be re-skinned from one file
 * rather than by hunting for inline styles.
 */
export const themeConfig = {
    token: {
        colorPrimary: "#1677ff",
        colorSuccess: "#52c41a",
        colorWarning: "#faad14",
        colorError: "#ff4d4f",
        colorInfo: "#1677ff",

        borderRadius: 8,
        fontSize: 14,

        fontFamily:
            "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",

        colorBgLayout: "#f5f7fa",
    },

    components: {
        Layout: {
            headerBg: "#ffffff",
            headerHeight: 64,
            headerPadding: "0 24px",
            siderBg: "#001529",
            bodyBg: "#f5f7fa",
        },

        Menu: {
            darkItemBg: "#001529",
            darkItemSelectedBg: "#1677ff",
            itemBorderRadius: 6,
        },

        Card: {
            headerFontSize: 16,
            boxShadowTertiary: "0 1px 2px rgba(0, 0, 0, 0.04)",
        },

        Table: {
            headerBg: "#fafafa",
            headerColor: "#595959",
            rowHoverBg: "#f5f8ff",
        },

        Statistic: {
            contentFontSize: 28,
        },
    },
};
