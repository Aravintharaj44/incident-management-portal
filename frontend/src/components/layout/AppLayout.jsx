import { useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
    App,
    Avatar,
    Button,
    Drawer,
    Dropdown,
    Grid,
    Layout,
    Menu,
    Space,
    Typography,
} from "antd";
import {
    AppstoreOutlined,
    BarsOutlined,
    DashboardOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    PlusOutlined,
    SafetyCertificateOutlined,
    SettingOutlined,
    TeamOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/constants";
import { avatarColor, initials } from "../../utils/format";
import NotificationBell from "./NotificationBell";

const { Header, Sider, Content, Footer } = Layout;
const { Text } = Typography;

/**
 * The application shell: sidebar navigation, header and content outlet.
 *
 * Navigation items are filtered by role (FR-02) so a user is never shown a
 * screen they cannot open. That is a usability decision - the API enforces the
 * same rules regardless of what the menu displays.
 *
 * On narrow screens the fixed sider is replaced with a drawer, which is what
 * makes the layout usable on a tablet or phone (NFR: Usability).
 */
const AppLayout = () => {
    const { user, logout, isAdmin, isStaff } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { modal } = App.useApp();

    const screens = Grid.useBreakpoint();
    const isMobile = !screens.lg;

    const [collapsed, setCollapsed] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const menuItems = useMemo(() => {
        const items = [
            {
                key: "/dashboard",
                icon: <DashboardOutlined />,
                label: <Link to="/dashboard">Dashboard</Link>,
            },
            {
                key: "/incidents",
                icon: <BarsOutlined />,
                label: <Link to="/incidents">Incidents</Link>,
            },
            {
                key: "/incidents/new",
                icon: <PlusOutlined />,
                label: <Link to="/incidents/new">Raise Incident</Link>,
            },
        ];

        if (isStaff) {
            items.push({
                key: "/my-queue",
                icon: <SafetyCertificateOutlined />,
                label: <Link to="/my-queue">My Queue</Link>,
            });
        }

        if (isAdmin) {
            items.push(
                { type: "divider" },
                {
                    key: "admin",
                    icon: <SettingOutlined />,
                    label: "Administration",
                    children: [
                        {
                            key: "/admin/users",
                            icon: <TeamOutlined />,
                            label: <Link to="/admin/users">Users</Link>,
                        },
                        {
                            key: "/admin/categories",
                            icon: <AppstoreOutlined />,
                            label: <Link to="/admin/categories">Categories</Link>,
                        },
                        {
                            key: "/admin/departments",
                            icon: <TeamOutlined />,
                            label: <Link to="/admin/departments">Departments</Link>,
                        },
                    ],
                }
            );
        }

        return items;
    }, [isAdmin, isStaff]);

    /**
     * Highlights the deepest matching menu entry, so /incidents/:id keeps
     * "Incidents" selected while /incidents/new selects its own item.
     */
    const selectedKeys = useMemo(() => {
        const { pathname } = location;

        if (pathname.startsWith("/incidents/new")) return ["/incidents/new"];
        if (pathname.startsWith("/incidents")) return ["/incidents"];
        if (pathname.startsWith("/admin/users")) return ["/admin/users"];
        if (pathname.startsWith("/admin/categories")) return ["/admin/categories"];
        if (pathname.startsWith("/admin/departments")) return ["/admin/departments"];

        return [pathname];
    }, [location]);

    const handleLogout = () => {
        modal.confirm({
            title: "Sign out?",
            content: "You will need to sign in again to access the portal.",
            okText: "Sign out",
            okButtonProps: { danger: true },
            onOk: () => {
                logout();
                navigate("/login", { replace: true });
            },
        });
    };

    const userMenu = {
        items: [
            {
                key: "profile-info",
                label: (
                    <div style={{ padding: "4px 0" }}>
                        <Text strong style={{ display: "block" }}>
                            {user?.name}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {user?.email}
                        </Text>
                    </div>
                ),
                disabled: true,
            },
            { type: "divider" },
            {
                key: "profile",
                icon: <UserOutlined />,
                label: "My profile",
                onClick: () => navigate("/profile"),
            },
            {
                key: "logout",
                icon: <LogoutOutlined />,
                label: "Sign out",
                danger: true,
                onClick: handleLogout,
            },
        ],
    };

    const brand = (
        <div
            style={{
                height: 64,
                display: "flex",
                alignItems: "center",
                justifyContent: collapsed && !isMobile ? "center" : "flex-start",
                gap: 10,
                padding: collapsed && !isMobile ? 0 : "0 20px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
        >
            <SafetyCertificateOutlined style={{ color: "#1677ff", fontSize: 24 }} />
            {(!collapsed || isMobile) && (
                <span style={{ color: "#fff", fontWeight: 600, fontSize: 15, whiteSpace: "nowrap" }}>
                    Incident Portal
                </span>
            )}
        </div>
    );

    const navigation = (
        <Menu
            theme="dark"
            mode="inline"
            selectedKeys={selectedKeys}
            defaultOpenKeys={["admin"]}
            items={menuItems}
            // Closing on selection keeps the drawer from covering the page the
            // user just navigated to.
            onClick={() => setDrawerOpen(false)}
            style={{ borderInlineEnd: 0 }}
        />
    );

    return (
        <Layout style={{ minHeight: "100vh" }}>
            {isMobile ? (
                <Drawer
                    placement="left"
                    open={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    closable={false}
                    size={240}
                    styles={{ body: { padding: 0, background: "#001529" } }}
                >
                    {brand}
                    {navigation}
                </Drawer>
            ) : (
                <Sider
                    collapsible
                    collapsed={collapsed}
                    onCollapse={setCollapsed}
                    trigger={null}
                    width={240}
                    style={{
                        position: "sticky",
                        top: 0,
                        height: "100vh",
                        overflow: "auto",
                    }}
                >
                    {brand}
                    {navigation}
                </Sider>
            )}

            <Layout>
                <Header
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottom: "1px solid #f0f0f0",
                        position: "sticky",
                        top: 0,
                        zIndex: 10,
                        // antd's Header sets line-height:64px, which any nested
                        // multi-line text would inherit and overflow.
                        lineHeight: "normal",
                    }}
                >
                    <Button
                        type="text"
                        icon={
                            isMobile || collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />
                        }
                        onClick={() =>
                            isMobile ? setDrawerOpen(true) : setCollapsed((value) => !value)
                        }
                        aria-label="Toggle navigation"
                    />

                    <Space size={12} align="center">
                        <NotificationBell />

                        <Dropdown menu={userMenu} trigger={["click"]} placement="bottomRight">
                            <Space style={{ cursor: "pointer" }} size={8}>
                                <Avatar style={{ backgroundColor: avatarColor(user?.name) }}>
                                    {initials(user?.name)}
                                </Avatar>
                                {!isMobile && (
                                    <span
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            justifyContent: "center",
                                            lineHeight: 1.3,
                                        }}
                                    >
                                        <Text style={{ fontSize: 13, lineHeight: 1.3 }}>
                                            {user?.name}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.3 }}>
                                            {user?.role === ROLES.ADMIN
                                                ? "Admin"
                                                : user?.role === ROLES.AGENT
                                                  ? "Support Agent"
                                                  : "End User"}
                                        </Text>
                                    </span>
                                )}
                            </Space>
                        </Dropdown>
                    </Space>
                </Header>

                <Content style={{ padding: isMobile ? 16 : 24 }}>
                    <Outlet />
                </Content>

                <Footer style={{ textAlign: "center", color: "#8c8c8c", fontSize: 12 }}>
                    Incident Management Portal - Zybisys-COC - v1.0
                </Footer>
            </Layout>
        </Layout>
    );
};

export default AppLayout;
