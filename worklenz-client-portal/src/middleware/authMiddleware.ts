import { Middleware } from '@reduxjs/toolkit';
import { RootState } from '@/store';
import { logoutUser, refreshToken } from '@/store/slices/authSlice';
import { TokenManager } from '@/utils/tokenManager';

export const authMiddleware: Middleware<{}, RootState> = (store) => (next) => (action: any) => {
  const result = next(action);
  const state = store.getState();
  
  // Check if we need to handle token expiry after any action
  if (action.type && (action.type.endsWith('/fulfilled') || action.type.endsWith('/rejected'))) {
    const { auth } = state;
    
    if (auth.isAuthenticated && auth.token) {
      // Check if token is expired
      if (TokenManager.isTokenExpired()) {
        store.dispatch(logoutUser());
        return result;
      }
      
      // Check if token should be refreshed
      if (TokenManager.shouldRefreshToken()) {
        store.dispatch(refreshToken());
      }
    }
  }
  
  return result;
};