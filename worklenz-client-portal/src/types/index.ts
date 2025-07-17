// Client Portal Types

export interface ClientUser {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  permissions: string[];
}

export interface ClientToken {
  token: string;
  expiresAt: string;
  clientId: string;
  organizationId: string;
}

export interface DashboardStats {
  totalRequests: number;
  pendingRequests: number;
  totalProjects: number;
  activeProjects: number;
  totalInvoices: number;
  unpaidInvoices: number;
  unreadMessages: number;
}

export interface ClientService {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  status: string;
  category: string;
}

export interface ClientRequest {
  id: string;
  req_no: string;
  service: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  time: string;
  attachments: string[];
}

export interface ClientProject {
  id: string;
  name: string;
  description: string;
  status: string;
  totalTasks: number;
  completedTasks: number;
  lastUpdated: string;
  members: string[];
}

export interface ClientInvoice {
  id: string;
  invoice_no: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string;
  created_at: string;
  sent_at?: string;
  paid_at?: string;
}

export interface ClientChat {
  id: string;
  title: string;
  participants: string[];
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

export interface ClientSettings {
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  email_notifications: boolean;
  project_updates: boolean;
  invoice_notifications: boolean;
  request_updates: boolean;
}

export interface ClientNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

// API Response Types
export interface ApiResponse<T> {
  done: boolean;
  body: T;
  message?: string;
  title?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
} 