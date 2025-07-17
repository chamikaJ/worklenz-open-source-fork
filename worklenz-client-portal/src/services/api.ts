import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ApiResponse, ClientRequest, ClientSettings, ClientUser, ClientToken } from '@/types';

class ClientPortalAPI {
  private api: AxiosInstance;
  private clientToken: string | null = null;
  private refreshTokenPromise: Promise<string> | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Initialize token from localStorage
    this.clientToken = localStorage.getItem('clientToken');

    // Request interceptor to add client token
    this.api.interceptors.request.use(
      (config) => {
        if (this.clientToken) {
          config.headers['Authorization'] = `Bearer ${this.clientToken}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling and token refresh
    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // Try to refresh token
            const newToken = await this.refreshTokenSilently();
            this.setToken(newToken);
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            return this.api(originalRequest);
          } catch (refreshError) {
            // If refresh fails, redirect to login
            this.clearToken();
            window.location.href = '/auth/login';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  setToken(token: string) {
    this.clientToken = token;
    localStorage.setItem('clientToken', token);
  }

  getToken(): string | null {
    if (!this.clientToken) {
      this.clientToken = localStorage.getItem('clientToken');
    }
    return this.clientToken;
  }

  clearToken() {
    this.clientToken = null;
    localStorage.removeItem('clientToken');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // Silent token refresh
  private async refreshTokenSilently(): Promise<string> {
    // Prevent multiple simultaneous refresh requests
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise;
    }

    this.refreshTokenPromise = this.api.post('/auth/refresh', {
      token: this.clientToken,
    }).then(response => {
      this.refreshTokenPromise = null;
      return response.data.body.token;
    }).catch(error => {
      this.refreshTokenPromise = null;
      throw error;
    });

    return this.refreshTokenPromise;
  }

  // Generic request method
  private async request<T>(endpoint: string, options: any = {}): Promise<ApiResponse<T>> {
    const response = await this.api.request({
      url: endpoint,
      ...options,
    });
    return response.data;
  }

  // Authentication endpoints
  async login(credentials: { email: string; password: string }): Promise<ApiResponse<{ user: ClientUser; token: string; expiresAt: string }>> {
    const response = await this.api.post('/auth/login', credentials);
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout');
    } catch (error) {
      // Ignore errors during logout
      console.warn('Logout request failed:', error);
    } finally {
      this.clearToken();
    }
  }

  async validateInvite(token: string): Promise<ApiResponse<{ valid: boolean; email?: string; organizationName?: string }>> {
    const response = await this.api.get(`/auth/invite/validate?token=${token}`);
    return response.data;
  }

  async acceptInvite(inviteData: { 
    token: string; 
    name: string; 
    email: string; 
    password: string; 
  }): Promise<ApiResponse<{ user: ClientUser; token: string; expiresAt: string }>> {
    const response = await this.api.post('/auth/invite/accept', inviteData);
    return response.data;
  }

  async refreshToken(): Promise<ApiResponse<ClientToken>> {
    const response = await this.api.post('/auth/refresh', {
      token: this.clientToken,
    });
    return response.data;
  }

  async requestPasswordReset(email: string): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.post('/auth/forgot-password', { email });
    return response.data;
  }

  async resetPassword(resetData: { 
    token: string; 
    password: string; 
  }): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.post('/auth/reset-password', resetData);
    return response.data;
  }

  async changePassword(passwordData: { 
    currentPassword: string; 
    newPassword: string; 
  }): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.post('/auth/change-password', passwordData);
    return response.data;
  }

  async getCurrentUser(): Promise<ApiResponse<ClientUser>> {
    const response = await this.api.get('/auth/me');
    return response.data;
  }

  // Dashboard
  async getDashboard() {
    return this.request('/client-portal/dashboard');
  }

  // Services
  async getServices() {
    return this.request('/client-portal/services');
  }

  async getServiceDetails(id: string) {
    return this.request(`/client-portal/services/${id}`);
  }

  // Requests
  async getRequests() {
    return this.request('/client-portal/requests');
  }

  async createRequest(data: Partial<ClientRequest>) {
    return this.request('/client-portal/requests', {
      method: 'POST',
      data,
    });
  }

  async getRequestDetails(id: string) {
    return this.request(`/client-portal/requests/${id}`);
  }

  async updateRequest(id: string, data: Partial<ClientRequest>) {
    return this.request(`/client-portal/requests/${id}`, {
      method: 'PUT',
      data,
    });
  }

  async deleteRequest(id: string) {
    return this.request(`/client-portal/requests/${id}`, {
      method: 'DELETE',
    });
  }

  // Projects
  async getProjects() {
    return this.request('/client-portal/projects');
  }

  async getProjectDetails(id: string) {
    return this.request(`/client-portal/projects/${id}`);
  }

  // Invoices
  async getInvoices() {
    return this.request('/client-portal/invoices');
  }

  async getInvoiceDetails(id: string) {
    return this.request(`/client-portal/invoices/${id}`);
  }

  async payInvoice(id: string, paymentData: unknown) {
    return this.request(`/client-portal/invoices/${id}/pay`, {
      method: 'POST',
      data: paymentData,
    });
  }

  async downloadInvoice(id: string): Promise<Blob> {
    const response = await this.api.request({
      url: `/client-portal/invoices/${id}/download`,
      method: 'GET',
      responseType: 'blob',
    });
    return response.data;
  }

  // Chat
  async getChats() {
    return this.request('/client-portal/chats');
  }

  async getChatDetails(id: string) {
    return this.request(`/client-portal/chats/${id}`);
  }

  async sendMessage(chatId: string, messageData: { content: string; attachments?: string[] }) {
    return this.request(`/client-portal/chats/${chatId}/messages`, {
      method: 'POST',
      data: messageData,
    });
  }

  async getMessages(chatId: string) {
    return this.request(`/client-portal/chats/${chatId}/messages`);
  }

  // Settings
  async getSettings() {
    return this.request('/client-portal/settings');
  }

  async updateSettings(settingsData: Partial<ClientSettings>) {
    return this.request('/client-portal/settings', {
      method: 'PUT',
      data: settingsData,
    });
  }

  // Profile
  async getProfile() {
    return this.request('/client-portal/profile');
  }

  async updateProfile(profileData: Partial<ClientUser>) {
    return this.request('/client-portal/profile', {
      method: 'PUT',
      data: profileData,
    });
  }

  // Notifications
  async getNotifications() {
    return this.request('/client-portal/notifications');
  }

  async markNotificationRead(id: string) {
    return this.request(`/client-portal/notifications/${id}/read`, {
      method: 'PUT',
    });
  }

  async markAllNotificationsRead() {
    return this.request('/client-portal/notifications/read-all', {
      method: 'PUT',
    });
  }

  // File uploads
  async uploadFile(file: File): Promise<{ url: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await this.api.request({
      url: '/client-portal/upload',
      method: 'POST',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data.body;
  }
}

// Export singleton instance
export const clientPortalAPI = new ClientPortalAPI();
export default clientPortalAPI; 