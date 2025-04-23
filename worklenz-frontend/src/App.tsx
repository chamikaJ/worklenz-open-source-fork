// Core dependencies
import React, { Suspense, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import i18next from 'i18next';

// Components
import ThemeWrapper from './features/theme/ThemeWrapper';
import PreferenceSelector from './components/PreferenceSelector';

// Routes
import router from './app/routes';

// Hooks & Utils
import { useAppSelector } from './hooks/useAppSelector';
import { initMixpanel } from './utils/mixpanelInit';

// Types & Constants
import { Language } from './features/i18n/localesSlice';
import logger from './utils/errorLogger';
import { Spin } from 'antd';

const App: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const themeMode = useAppSelector(state => state.themeReducer.mode);
  const language = useAppSelector(state => state.localesReducer.lng);

  initMixpanel(import.meta.env.VITE_MIXPANEL_TOKEN as string);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    i18next.changeLanguage(language || Language.EN, err => {
      if (err) return logger.error('Error changing language', err);
    });
  }, [language]);

  const LoadingOverlay = () => (
    <div className="task-progress-editor-loading" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
      backdropFilter: 'blur(1px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      opacity: 0.8,
      animation: 'fadeIn 0.2s ease-in-out',
    }}>
      <Spin size="large" />
    </div>
  );

  return (
    <Suspense fallback={<LoadingOverlay />}>
      <ThemeWrapper>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
        <PreferenceSelector />
      </ThemeWrapper>
    </Suspense>
  );
};

export default App;
