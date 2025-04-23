import { colors } from '@/styles/colors';
import { getInitialTheme } from '@/utils/get-initial-theme';
import { ConfigProvider, theme, Layout, Spin } from 'antd';
import { useEffect } from 'react';

// Loading component with theme awareness
export const SuspenseFallback = () => {
  const currentTheme = getInitialTheme();
  const isDark = currentTheme === 'dark';

  // Add the animation to the document on component mount
  useEffect(() => {
    // Check if the animation style already exists to avoid duplicates
    const existingStyle = document.getElementById('suspense-fallback-animation');
    if (!existingStyle) {
      const styleElement = document.createElement('style');
      styleElement.id = 'suspense-fallback-animation';
      styleElement.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 0.6; }
        }
      `;
      document.head.appendChild(styleElement);
    }
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        components: {
          Layout: {
            colorBgLayout: 'transparent',
          },
          Spin: {
            colorPrimary: isDark ? '#fff' : '#1890ff',
          },
        },
      }}
    >
      <Layout
        className="app-loading-container"
        style={{
          position: 'fixed',
          width: '100vw',
          height: '100vh',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.05)',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          opacity: 0.6,
          animation: 'fadeIn 0.2s ease-in-out',
          transition: 'none',
        }}
      >
        <Spin
          size="large"
          style={{
            position: 'static',
            transform: 'none',
          }}
        />
      </Layout>
    </ConfigProvider>
  );
};
