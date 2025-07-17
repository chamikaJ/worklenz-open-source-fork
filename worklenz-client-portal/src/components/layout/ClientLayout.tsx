import React from 'react';
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Badge,
  Button,
  theme,
  DashboardOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  ProjectOutlined,
  FileDoneOutlined,
  MessageOutlined,
  SettingOutlined,
  UserOutlined,
  BellOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
} from '@/shared/antd-imports';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/hooks/useAppSelector';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { logout, setUser } from '@/store/slices/authSlice';
import { toggleSidebar, setTheme, toggleNotificationPanel } from '@/store/slices/uiSlice';
import { useGetProfileQuery, useGetNotificationsQuery } from '@/store/api';
import type { RootState } from '@/store';

const { Header, Sider, Content } = Layout;

const ClientLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { token } = theme.useToken();
  
  const { isAuthenticated } = useAppSelector((state: RootState) => state.auth);

  // Redirect unauthenticated users to login
  React.useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth/login', { replace: true });
    }
  }, [isAuthenticated, navigate]);
  
  const sidebarCollapsed = useAppSelector((state: RootState) => state.ui.sidebarCollapsed);
  const currentTheme = useAppSelector((state: RootState) => state.ui.theme);
  const notifications = useAppSelector((state: RootState) => state.ui.notifications);
  const user = useAppSelector((state: RootState) => state.auth.user);

  // RTK Query hooks
  const { data: profileData } = useGetProfileQuery();
  const { data: notificationsData } = useGetNotificationsQuery({ limit: 10 });

  // Update user data when profile is loaded
  React.useEffect(() => {
    if (profileData?.body && !user) {
      dispatch(setUser(profileData.body));
    }
  }, [profileData, user, dispatch]);

  // Update notification count
  React.useEffect(() => {
    // if (notificationsData?.body) {
    //   const unreadCount = notificationsData.body.filter(n => !n.read).length;
    //   // dispatch(setUnreadNotifications(unreadCount));
    // }
  }, [notificationsData]);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/auth/login');
  };

  const handleThemeToggle = () => {
    dispatch(setTheme(currentTheme === 'light' ? 'dark' : 'light'));
  };

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/services',
      icon: <AppstoreOutlined />,
      label: 'Services',
    },
    {
      key: '/requests',
      icon: <FileTextOutlined />,
      label: 'Requests',
    },
    {
      key: '/projects',
      icon: <ProjectOutlined />,
      label: 'Projects',
    },
    {
      key: '/invoices',
      icon: <FileDoneOutlined />,
      label: 'Invoices',
    },
    {
      key: '/chats',
      icon: <MessageOutlined />,
      label: 'Chats',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
  ];

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'theme',
      icon: currentTheme === 'light' ? <DashboardOutlined /> : <DashboardOutlined />,
      label: `${currentTheme === 'light' ? 'Dark' : 'Light'} Mode`,
      onClick: handleThemeToggle,
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: handleLogout,
    },
  ];

  const notificationMenuItems = [
    {
      key: 'notifications',
      label: (
        <div style={{ padding: '8px 0' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Notifications</div>
          {Array.isArray(notificationsData?.body) && notificationsData.body.slice(0, 3).map((notification) => (
            <div key={notification.id} style={{ fontSize: '12px', marginBottom: '4px' }}>
              {notification.title}
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={sidebarCollapsed}
        theme={currentTheme}
        style={{
          background: token.colorBgContainer,
          borderRight: `1px solid ${token.colorBorder}`,
        }}
      >
        <div style={{ 
          height: 64, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          borderBottom: `1px solid ${token.colorBorder}`,
        }}>
          <h2 style={{ 
            color: token.colorPrimary, 
            margin: 0,
            fontSize: sidebarCollapsed ? '16px' : '20px',
          }}>
            {sidebarCollapsed ? 'CP' : 'Client Portal'}
          </h2>
        </div>
        <Menu
          theme={currentTheme}
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      
      <Layout>
        <Header
          style={{
            padding: '0 16px',
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Button
            type="text"
            icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => dispatch(toggleSidebar())}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Dropdown
              menu={{ items: notificationMenuItems }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Badge count={notifications.unreadCount} size="small">
                <Button
                  type="text"
                  icon={<BellOutlined />}
                  style={{ fontSize: '16px' }}
                  onClick={() => dispatch(toggleNotificationPanel())}
                />
              </Badge>
            </Dropdown>
            
            <Dropdown
              menu={{ items: userMenuItems }}
              placement="bottomRight"
              trigger={['click']}
            >
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar icon={<UserOutlined />} />
                {!sidebarCollapsed && (
                  <span>{user?.name || 'Client User'}</span>
                )}
              </div>
            </Dropdown>
          </div>
        </Header>
        
        <Content
          style={{
            margin: '16px',
            padding: '24px',
            background: token.colorBgContainer,
            borderRadius: token.borderRadius,
            minHeight: 280,
            overflow: 'auto',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default ClientLayout; 