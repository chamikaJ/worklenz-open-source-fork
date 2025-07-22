import { Request, Response } from "express";
import { ServerResponse } from "../models/server-response";
import db from "../config/db";
import TokenService from "../services/token-service";
import { sendEmail, EmailRequest } from "../shared/email";
import { AuthenticatedClientRequest } from "../middlewares/client-auth-middleware";
import FileConstants from "../shared/file-constants";
import { IEmailTemplateType } from "../interfaces/email-template-type";
import { getBaseUrl, getClientPortalBaseUrl } from "../cron_jobs/helpers";
import { uploadBase64, getClientPortalLogoKey } from "../shared/storage";
import { log_error } from "../shared/utils";
import { IWorkLenzRequest } from "../interfaces/worklenz-request";

class ClientPortalController {

  // Dashboard
  static async getDashboard(req: AuthenticatedClientRequest, res: Response) {
    try {
      const {clientId} = req;
      const {organizationId} = req;

      // Get request statistics
      const requestStatsQuery = `
        SELECT 
          COUNT(*) as total_requests,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_requests,
          COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_requests,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_requests,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_requests,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_requests
        FROM client_portal_requests
        WHERE client_id = $1 AND organization_team_id = $2
      `;

      const requestStatsResult = await db.query(requestStatsQuery, [clientId, organizationId]);
      const requestStats = requestStatsResult.rows[0];

      // Get project statistics (assuming client has access to projects)
      const projectStatsQuery = `
        SELECT 
          COUNT(*) as total_projects,
          COUNT(CASE WHEN sps.name = 'Active' THEN 1 END) as active_projects,
          COUNT(CASE WHEN sps.name = 'Completed' THEN 1 END) as completed_projects
        FROM projects p
        LEFT JOIN sys_project_statuses sps ON p.status_id = sps.id
        WHERE p.client_id = $1
      `;

      const projectStatsResult = await db.query(projectStatsQuery, [clientId]);
      const projectStats = projectStatsResult.rows[0];

      // Get invoice statistics
      const invoiceStatsQuery = `
        SELECT 
          COUNT(*) as total_invoices,
          COUNT(CASE WHEN status != 'paid' THEN 1 END) as unpaid_invoices,
          COALESCE(SUM(CASE WHEN status != 'paid' THEN amount END), 0) as unpaid_amount
        FROM client_portal_invoices
        WHERE client_id = $1 AND organization_team_id = $2
      `;

      const invoiceStatsResult = await db.query(invoiceStatsQuery, [clientId, organizationId]);
      const invoiceStats = invoiceStatsResult.rows[0];

      const dashboardData = {
        totalProjects: parseInt(projectStats.total_projects || "0"),
        activeProjects: parseInt(projectStats.active_projects || "0"),
        completedProjects: parseInt(projectStats.completed_projects || "0"),
        totalRequests: parseInt(requestStats.total_requests || "0"),
        pendingRequests: parseInt(requestStats.pending_requests || "0"),
        acceptedRequests: parseInt(requestStats.accepted_requests || "0"),
        inProgressRequests: parseInt(requestStats.in_progress_requests || "0"),
        completedRequests: parseInt(requestStats.completed_requests || "0"),
        rejectedRequests: parseInt(requestStats.rejected_requests || "0"),
        totalInvoices: parseInt(invoiceStats.total_invoices || "0"),
        unpaidInvoices: parseInt(invoiceStats.unpaid_invoices || "0"),
        unpaidAmount: parseFloat(invoiceStats.unpaid_amount || "0")
      };

      return res.json(new ServerResponse(true, dashboardData, "Dashboard data retrieved successfully"));
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve dashboard data"));
    }
  }

  // Services
  static async getServices(req: AuthenticatedClientRequest, res: Response) {
    try {
      const {clientId} = req;
      const {organizationId} = req;
      const { page = 1, limit = 10, status = "active" } = req.query;

      // Get services that are either public or specifically allowed for this client
      const query = `
        SELECT 
          s.id,
          s.name,
          s.description,
          s.status,
          s.service_data,
          s.is_public,
          s.created_at,
          s.updated_at
        FROM client_portal_services s
        WHERE s.organization_team_id = $1 
        AND s.status = $2
        AND (s.is_public = true OR $3 = ANY(s.allowed_client_ids))
        ORDER BY s.name ASC
      `;

      const result = await db.query(query, [organizationId, status, clientId]);
      const services = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        serviceData: row.service_data,
        isPublic: row.is_public,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      return res.json(new ServerResponse(true, services, "Services retrieved successfully"));
    } catch (error) {
      console.error("Error fetching services:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve services"));
    }
  }

  static async getServiceDetails(req: AuthenticatedClientRequest, res: Response) {
    try {
      const { id } = req.params;
      const {clientId} = req;
      const {organizationId} = req;

      // Get service details if client has access
      const query = `
        SELECT 
          s.id,
          s.name,
          s.description,
          s.status,
          s.service_data,
          s.is_public,
          s.created_at,
          s.updated_at
        FROM client_portal_services s
        WHERE s.id = $1 
        AND s.organization_team_id = $2
        AND s.status = 'active'
        AND (s.is_public = true OR $3 = ANY(s.allowed_client_ids))
      `;

      const result = await db.query(query, [id, organizationId, clientId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Service not found or not accessible"));
      }

      const service = result.rows[0];

      return res.json(new ServerResponse(true, {
        id: service.id,
        name: service.name,
        description: service.description,
        status: service.status,
        serviceData: service.service_data,
        isPublic: service.is_public,
        createdAt: service.created_at,
        updatedAt: service.updated_at
      }, "Service details retrieved successfully"));
    } catch (error) {
      console.error("Error fetching service details:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve service details"));
    }
  }

  // Requests
  static async getRequests(req: AuthenticatedClientRequest, res: Response) {
    try {
      const {clientId} = req;
      const {organizationId} = req;
      const { page = 1, limit = 10, status, search } = req.query;

      // Build query with pagination and filtering
      let query = `
        SELECT 
          r.id,
          r.req_no,
          r.service_id,
          r.status,
          r.request_data,
          r.notes,
          r.created_at,
          r.updated_at,
          r.completed_at,
          s.name as service_name,
          s.description as service_description,
          c.name as client_name
        FROM client_portal_requests r
        JOIN client_portal_services s ON r.service_id = s.id
        JOIN clients c ON r.client_id = c.id
        WHERE r.client_id = $1 AND r.organization_team_id = $2
      `;

      const queryParams = [clientId, organizationId];
      let paramIndex = 3;

      // Add status filter if provided
      if (status) {
        query += ` AND r.status = $${paramIndex}`;
        queryParams.push(String(status));
        paramIndex++;
      }

      // Add search filter if provided
      if (search) {
        query += ` AND (r.req_no ILIKE $${paramIndex} OR s.name ILIKE $${paramIndex} OR r.notes ILIKE $${paramIndex})`;
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM client_portal_requests r
        JOIN client_portal_services s ON r.service_id = s.id
        WHERE r.client_id = $1 AND r.organization_team_id = $2
        ${status ? `AND r.status = $${status ? 3 : 3}` : ""}
        ${search ? `AND (r.req_no ILIKE $${status ? 4 : 3} OR s.name ILIKE $${status ? 4 : 3} OR r.notes ILIKE $${status ? 4 : 3})` : ""}
      `;
      const countParams = status && search ? [clientId, organizationId, status, `%${search}%`] : 
                         status ? [clientId, organizationId, status] : 
                         search ? [clientId, organizationId, `%${search}%`] : [clientId, organizationId];
      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0]?.total || "0");

      // Add pagination
      const offset = (Number(page) - 1) * Number(limit);
      query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(String(Number(limit)), String(offset));

      const result = await db.query(query, queryParams);
      const requests = result.rows.map((row: any) => ({
        id: row.id,
        requestNumber: row.req_no,
        serviceId: row.service_id,
        serviceName: row.service_name,
        serviceDescription: row.service_description,
        status: row.status,
        requestData: row.request_data,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
        clientName: row.client_name
      }));

      return res.json(new ServerResponse(true, { 
        requests, 
        total, 
        page: Number(page), 
        limit: Number(limit) 
      }, "Requests retrieved successfully"));
    } catch (error) {
      console.error("Error fetching requests:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve requests"));
    }
  }

  static async createRequest(req: AuthenticatedClientRequest, res: Response) {
    try {
      const {clientId} = req;
      const {organizationId} = req;
      const {clientEmail} = req;
      const { serviceId, requestData, notes } = req.body;

      // Validate required fields
      if (!serviceId) {
        return res.status(400).json(new ServerResponse(false, null, "Service ID is required"));
      }

      // Verify service exists and client has access
      const serviceCheck = await db.query(
        `SELECT id, name FROM client_portal_services 
         WHERE id = $1 AND organization_team_id = $2 
         AND (is_public = true OR $3 = ANY(allowed_client_ids))`,
        [serviceId, organizationId, clientId]
      );

      if (serviceCheck.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Service not found or not accessible"));
      }

      // Generate request number
      const requestNumber = `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

      // Create request
      const query = `
        INSERT INTO client_portal_requests (
          req_no, service_id, client_id, organization_team_id, 
          status, request_data, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, req_no, service_id, status, request_data, notes, created_at, updated_at
      `;

      const values = [
        requestNumber,
        serviceId,
        clientId,
        organizationId,
        "pending",
        requestData ? JSON.stringify(requestData) : null,
        notes || null
      ];

      const result = await db.query(query, values);
      const newRequest = result.rows[0];

      // Get service name for response
      const service = serviceCheck.rows[0];

      return res.json(new ServerResponse(true, {
        id: newRequest.id,
        requestNumber: newRequest.req_no,
        serviceId: newRequest.service_id,
        serviceName: service.name,
        status: newRequest.status,
        requestData: newRequest.request_data,
        notes: newRequest.notes,
        createdAt: newRequest.created_at,
        updatedAt: newRequest.updated_at
      }, "Request created successfully"));
    } catch (error) {
      console.error("Error creating request:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to create request"));
    }
  }

  static async getRequestDetails(req: AuthenticatedClientRequest, res: Response) {
    try {
      const { id } = req.params;
      const {clientId} = req;
      const {organizationId} = req;

      // Get request details with service information
      const query = `
        SELECT 
          r.id,
          r.req_no,
          r.service_id,
          r.status,
          r.request_data,
          r.notes,
          r.created_at,
          r.updated_at,
          r.completed_at,
          s.name as service_name,
          s.description as service_description,
          s.service_data as service_config,
          c.name as client_name
        FROM client_portal_requests r
        JOIN client_portal_services s ON r.service_id = s.id
        JOIN clients c ON r.client_id = c.id
        WHERE r.id = $1 AND r.client_id = $2 AND r.organization_team_id = $3
      `;

      const result = await db.query(query, [id, clientId, organizationId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Request not found"));
      }

      const request = result.rows[0];

      return res.json(new ServerResponse(true, {
        id: request.id,
        requestNumber: request.req_no,
        serviceId: request.service_id,
        serviceName: request.service_name,
        serviceDescription: request.service_description,
        serviceConfig: request.service_config,
        status: request.status,
        requestData: request.request_data,
        notes: request.notes,
        createdAt: request.created_at,
        updatedAt: request.updated_at,
        completedAt: request.completed_at,
        clientName: request.client_name
      }, "Request details retrieved successfully"));
    } catch (error) {
      console.error("Error fetching request details:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve request details"));
    }
  }

  static async updateRequest(req: AuthenticatedClientRequest, res: Response) {
    try {
      const { id } = req.params;
      const {clientId} = req;
      const {organizationId} = req;
      const { requestData, notes } = req.body;

      // Verify request exists and belongs to client
      const requestCheck = await db.query(
        "SELECT id, status FROM client_portal_requests WHERE id = $1 AND client_id = $2 AND organization_team_id = $3",
        [id, clientId, organizationId]
      );

      if (requestCheck.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Request not found"));
      }

      const currentRequest = requestCheck.rows[0];

      // Only allow updates if request is in pending status
      if (currentRequest.status !== "pending") {
        return res.status(400).json(new ServerResponse(false, null, "Cannot update request after it has been accepted"));
      }

      // Update request data
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (requestData) {
        updateFields.push(`request_data = $${paramIndex}`);
        updateValues.push(JSON.stringify(requestData));
        paramIndex++;
      }

      if (notes !== undefined) {
        updateFields.push(`notes = $${paramIndex}`);
        updateValues.push(notes);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json(new ServerResponse(false, null, "No valid fields to update"));
      }

      updateFields.push(`updated_at = NOW()`);
      updateValues.push(id, clientId, organizationId);

      const query = `
        UPDATE client_portal_requests 
        SET ${updateFields.join(", ")}
        WHERE id = $${paramIndex} AND client_id = $${paramIndex + 1} AND organization_team_id = $${paramIndex + 2}
        RETURNING id, req_no, service_id, status, request_data, notes, created_at, updated_at
      `;

      const result = await db.query(query, updateValues);
      
      if (result.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Request not found"));
      }

      const updatedRequest = result.rows[0];

      return res.json(new ServerResponse(true, {
        id: updatedRequest.id,
        requestNumber: updatedRequest.req_no,
        serviceId: updatedRequest.service_id,
        status: updatedRequest.status,
        requestData: updatedRequest.request_data,
        notes: updatedRequest.notes,
        createdAt: updatedRequest.created_at,
        updatedAt: updatedRequest.updated_at
      }, "Request updated successfully"));
    } catch (error) {
      console.error("Error updating request:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to update request"));
    }
  }

  static async deleteRequest(req: AuthenticatedClientRequest, res: Response) {
    try {
      const { id } = req.params;
      const {clientId} = req;
      const {organizationId} = req;

      // Verify request exists and belongs to client
      const requestCheck = await db.query(
        "SELECT id, status FROM client_portal_requests WHERE id = $1 AND client_id = $2 AND organization_team_id = $3",
        [id, clientId, organizationId]
      );

      if (requestCheck.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Request not found"));
      }

      const currentRequest = requestCheck.rows[0];

      // Only allow deletion if request is in pending status
      if (currentRequest.status !== "pending") {
        return res.status(400).json(new ServerResponse(false, null, "Cannot delete request after it has been accepted"));
      }

      // Delete the request
      const deleteResult = await db.query(
        "DELETE FROM client_portal_requests WHERE id = $1 AND client_id = $2 AND organization_team_id = $3",
        [id, clientId, organizationId]
      );

      if (deleteResult.rowCount === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Request not found"));
      }

      return res.json(new ServerResponse(true, null, "Request deleted successfully"));
    } catch (error) {
      console.error("Error deleting request:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to delete request"));
    }
  }

  // Request Status Options
  static async getRequestStatusOptions(req: AuthenticatedClientRequest, res: Response) {
    try {
      const statusOptions = [
        { value: "pending", label: "Pending", description: "Request is waiting for review", color: "#faad14" },
        { value: "accepted", label: "Accepted", description: "Request has been accepted and will be processed", color: "#52c41a" },
        { value: "in_progress", label: "In Progress", description: "Request is currently being worked on", color: "#1890ff" },
        { value: "completed", label: "Completed", description: "Request has been completed successfully", color: "#52c41a" },
        { value: "rejected", label: "Rejected", description: "Request has been rejected", color: "#f5222d" }
      ];

      return res.json(new ServerResponse(true, statusOptions, "Request status options retrieved successfully"));
    } catch (error) {
      console.error("Error fetching request status options:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve request status options"));
    }
  }

  // Projects
  static async getProjects(req: Request, res: Response) {
    try {
      const teamId = (req.user as any)?.team_id;
      const { page = 1, limit = 10, status, search } = req.query;

      // Build query with pagination and filtering
      let query = `
        SELECT 
          p.id,
          p.name,
          p.notes,
          p.status_id,
          sps.name as status_name,
          sps.color_code as status_color,
          p.created_at,
          p.updated_at,
          p.client_id,
          c.name as client_name,
          COUNT(t.id) as total_tasks,
          COUNT(CASE WHEN ts.category_id IN (SELECT id FROM sys_task_status_categories WHERE is_done = true) THEN 1 END) as completed_tasks
        FROM projects p
        LEFT JOIN sys_project_statuses sps ON p.status_id = sps.id
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN tasks t ON p.id = t.project_id
        LEFT JOIN task_statuses ts ON t.status_id = ts.id
        WHERE p.team_id = $1
      `;

      const queryParams = [teamId];
      let paramIndex = 2;

      // Add status filter if provided
      if (status) {
        query += ` AND sps.name = $${paramIndex}`;
        queryParams.push(String(status));
        paramIndex++;
      }

      // Add search filter if provided
      if (search) {
        query += ` AND (p.name ILIKE $${paramIndex} OR p.notes ILIKE $${paramIndex})`;
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      query += ` GROUP BY p.id, p.name, p.notes, p.status_id, sps.name, sps.color_code, p.created_at, p.updated_at, p.client_id, c.name`;

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM projects p
        LEFT JOIN sys_project_statuses sps ON p.status_id = sps.id
        WHERE p.team_id = $1
        ${status ? "AND sps.name = $2" : ""}
        ${search ? `AND (p.name ILIKE $${status ? 3 : 2} OR p.notes ILIKE $${status ? 3 : 2})` : ""}
      `;
      const countParams = status && search ? [teamId, status, `%${search}%`] : 
                         status ? [teamId, status] : 
                         search ? [teamId, `%${search}%`] : [teamId];
      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0]?.total || "0");

      // Add pagination
      const offset = (Number(page) - 1) * Number(limit);
      query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(String(Number(limit)), String(offset));

      const result = await db.query(query, queryParams);
      const projects = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.notes,
        status: row.status_name,
        status_color: row.status_color,
        created_at: row.created_at,
        updated_at: row.updated_at,
        client_id: row.client_id,
        client_name: row.client_name,
        total_tasks: parseInt(row.total_tasks || "0"),
        completed_tasks: parseInt(row.completed_tasks || "0")
      }));

      return res.json(new ServerResponse(true, { 
        projects, 
        total, 
        page: Number(page), 
        limit: Number(limit) 
      }, "Projects retrieved successfully"));
    } catch (error) {
      console.error("Error fetching projects:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve projects"));
    }
  }

  static async getProjectDetails(req: Request, res: Response) {
    try {
      const { id } = req.params;
      // TODO: Implement project details retrieval

      return res.json(new ServerResponse(true, {}, "Project details retrieved successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve project details"));
    }
  }

  // Invoices
  static async getInvoices(req: Request, res: Response) {
    try {
      // TODO: Implement invoices retrieval
      const invoices: any[] = [];

      return res.json(new ServerResponse(true, invoices, "Invoices retrieved successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve invoices"));
    }
  }

  static async getInvoiceDetails(req: Request, res: Response) {
    try {
      const { id } = req.params;
      // TODO: Implement invoice details retrieval

      return res.json(new ServerResponse(true, {}, "Invoice details retrieved successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve invoice details"));
    }
  }

  static async payInvoice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const paymentData = req.body;
      // TODO: Implement invoice payment

      return res.json(new ServerResponse(true, {}, "Invoice paid successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to pay invoice"));
    }
  }

  static async downloadInvoice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      // TODO: Implement invoice download

      return res.json(new ServerResponse(true, {}, "Invoice download initiated"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to download invoice"));
    }
  }

  // Chat
  static async getChats(req: Request, res: Response) {
    try {
      // TODO: Implement chats retrieval
      const chats: any[] = [];

      return res.json(new ServerResponse(true, chats, "Chats retrieved successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve chats"));
    }
  }

  static async getChatDetails(req: Request, res: Response) {
    try {
      const { id } = req.params;
      // TODO: Implement chat details retrieval

      return res.json(new ServerResponse(true, {}, "Chat details retrieved successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve chat details"));
    }
  }

  static async sendMessage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const messageData = req.body;
      // TODO: Implement message sending

      return res.json(new ServerResponse(true, {}, "Message sent successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to send message"));
    }
  }

  static async getMessages(req: Request, res: Response) {
    try {
      const { id } = req.params;
      // TODO: Implement messages retrieval

      return res.json(new ServerResponse(true, [], "Messages retrieved successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve messages"));
    }
  }

  // Settings
  static async getSettings(req: IWorkLenzRequest, res: Response) {
    try {
      const organizationTeamId = req.user?.organization_team_id || req.user?.team_id;
      if (!organizationTeamId) {
        return res.status(400).json(new ServerResponse(false, null, "Organization team ID not found"));
      }

      const q = `
        SELECT id, team_id, organization_team_id, logo_url, primary_color, 
               welcome_message, contact_email, contact_phone, terms_of_service, 
               privacy_policy, created_at, updated_at
        FROM client_portal_settings 
        WHERE organization_team_id = $1
      `;
      
      const result = await db.query(q, [organizationTeamId]);
      const settings = result.rows[0] || {
        organization_team_id: organizationTeamId,
        logo_url: null,
        primary_color: '#3b7ad4',
        welcome_message: null,
        contact_email: null,
        contact_phone: null,
        terms_of_service: null,
        privacy_policy: null
      };

      return res.json(new ServerResponse(true, settings, null));
    } catch (error) {
      log_error(error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve settings"));
    }
  }

  static async updateSettings(req: IWorkLenzRequest, res: Response) {
    try {
      const organizationTeamId = req.user?.organization_team_id || req.user?.team_id;
      const teamId = req.user?.team_id;
      
      if (!organizationTeamId || !teamId) {
        return res.status(400).json(new ServerResponse(false, null, "Team ID not found"));
      }

      const {
        logo_url,
        primary_color,
        welcome_message,
        contact_email,
        contact_phone,
        terms_of_service,
        privacy_policy
      } = req.body;

      // Check if settings exist
      const checkQ = `SELECT id FROM client_portal_settings WHERE organization_team_id = $1`;
      const existingResult = await db.query(checkQ, [organizationTeamId]);

      let result;
      if (existingResult.rows.length > 0) {
        // Update existing settings
        const updateQ = `
          UPDATE client_portal_settings 
          SET logo_url = $1, primary_color = $2, welcome_message = $3, 
              contact_email = $4, contact_phone = $5, terms_of_service = $6, 
              privacy_policy = $7, updated_at = CURRENT_TIMESTAMP
          WHERE organization_team_id = $8
          RETURNING *
        `;
        result = await db.query(updateQ, [
          logo_url, primary_color, welcome_message, contact_email,
          contact_phone, terms_of_service, privacy_policy, organizationTeamId
        ]);
      } else {
        // Create new settings
        const insertQ = `
          INSERT INTO client_portal_settings 
          (team_id, organization_team_id, logo_url, primary_color, welcome_message, 
           contact_email, contact_phone, terms_of_service, privacy_policy)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `;
        result = await db.query(insertQ, [
          teamId, organizationTeamId, logo_url, primary_color, welcome_message,
          contact_email, contact_phone, terms_of_service, privacy_policy
        ]);
      }

      return res.json(new ServerResponse(true, result.rows[0], "Settings updated successfully"));
    } catch (error) {
      log_error(error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to update settings"));
    }
  }

  static async uploadLogo(req: IWorkLenzRequest, res: Response) {
    try {
      const organizationTeamId = req.user?.organization_team_id || req.user?.team_id;
      if (!organizationTeamId) {
        return res.status(400).json(new ServerResponse(false, null, "Organization team ID not found"));
      }

      const { logoData } = req.body;
      if (!logoData) {
        return res.status(400).json(new ServerResponse(false, null, "Logo data is required"));
      }

      // Extract file type from base64 data
      const mimeMatch = logoData.match(/^data:(image\/[a-z]+);base64,/);
      if (!mimeMatch) {
        return res.status(400).json(new ServerResponse(false, null, "Invalid image format"));
      }

      const mimeType = mimeMatch[1];
      const fileExtension = mimeType.split('/')[1];
      
      // Generate storage key
      const storageKey = getClientPortalLogoKey(organizationTeamId, fileExtension);
      
      // Upload to storage
      const logoUrl = await uploadBase64(logoData, storageKey);
      if (!logoUrl) {
        return res.status(500).json(new ServerResponse(false, null, "Failed to upload logo"));
      }

      // Update database with logo URL
      const teamId = req.user?.team_id;
      const checkQ = `SELECT id FROM client_portal_settings WHERE organization_team_id = $1`;
      const existingResult = await db.query(checkQ, [organizationTeamId]);

      if (existingResult.rows.length > 0) {
        // Update existing settings
        const updateQ = `
          UPDATE client_portal_settings 
          SET logo_url = $1, updated_at = CURRENT_TIMESTAMP
          WHERE organization_team_id = $2
          RETURNING *
        `;
        await db.query(updateQ, [logoUrl, organizationTeamId]);
      } else {
        // Create new settings
        const insertQ = `
          INSERT INTO client_portal_settings 
          (team_id, organization_team_id, logo_url)
          VALUES ($1, $2, $3)
          RETURNING *
        `;
        await db.query(insertQ, [teamId, organizationTeamId, logoUrl]);
      }

      return res.json(new ServerResponse(true, { logo_url: logoUrl }, "Logo uploaded successfully"));
    } catch (error) {
      log_error(error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to upload logo"));
    }
  }

  // Profile
  static async getProfile(req: Request, res: Response) {
    try {
      // TODO: Implement profile retrieval
      const profile = {};

      return res.json(new ServerResponse(true, profile, "Profile retrieved successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve profile"));
    }
  }

  static async updateProfile(req: Request, res: Response) {
    try {
      const profileData = req.body;
      // TODO: Implement profile update

      return res.json(new ServerResponse(true, {}, "Profile updated successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to update profile"));
    }
  }

  // Notifications
  static async getNotifications(req: Request, res: Response) {
    try {
      // TODO: Implement notifications retrieval
      const notifications: any[] = [];

      return res.json(new ServerResponse(true, notifications, "Notifications retrieved successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve notifications"));
    }
  }

  static async markNotificationRead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      // TODO: Implement mark notification as read

      return res.json(new ServerResponse(true, {}, "Notification marked as read"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to mark notification as read"));
    }
  }

  static async markAllNotificationsRead(req: Request, res: Response) {
    try {
      // TODO: Implement mark all notifications as read

      return res.json(new ServerResponse(true, {}, "All notifications marked as read"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to mark notifications as read"));
    }
  }

  // File upload
  static async uploadFile(req: Request, res: Response) {
    try {
      // TODO: Implement file upload
      const fileData = req.body;

      return res.json(new ServerResponse(true, { url: "", filename: "" }, "File uploaded successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to upload file"));
    }
  }

  // Client Management Methods
  static async getClients(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, search, status, sortBy, sortOrder } = req.query;
      
      // Build query with pagination and filtering
      let query = `
        SELECT 
          c.id,
          c.name,
          c.email,
          c.company_name,
          c.phone,
          c.address,
          c.contact_person,
          c.status,
          c.team_id,
          c.created_at,
          c.updated_at,
          COUNT(DISTINCT p.id) as assigned_projects_count
        FROM clients c
        LEFT JOIN projects p ON c.id = p.client_id
      `;

      const whereConditions = [];
      const queryParams = [];

      // Add team filter (clients belong to a specific team)
      const teamId = (req.user as any)?.team_id;
      if (teamId) {
        whereConditions.push(`c.team_id = $${queryParams.length + 1}`);
        queryParams.push(teamId);
      }

      // Add search filter
      if (search) {
        whereConditions.push(`(c.name ILIKE $${queryParams.length + 1} OR c.email ILIKE $${queryParams.length + 1} OR c.company_name ILIKE $${queryParams.length + 1})`);
        queryParams.push(`%${search}%`);
      }

      // Add status filter
      if (status) {
        whereConditions.push(`c.status = $${queryParams.length + 1}`);
        queryParams.push(String(status));
      }

      if (whereConditions.length > 0) {
        query += ` WHERE ${whereConditions.join(" AND ")}`;
      }

      query += ` GROUP BY c.id, c.name, c.email, c.company_name, c.phone, c.address, c.contact_person, c.status, c.team_id, c.created_at, c.updated_at`;

      // Add sorting
      const sortField = String(sortBy || "name");
      const sortDirection = sortOrder === "desc" ? "DESC" : "ASC";
      // Validate sort field to prevent SQL injection and ensure it's a valid column
      const validSortFields = ["id", "name", "created_at", "updated_at"];
      const safeSortField = validSortFields.includes(sortField) ? sortField : "name";
      query += ` ORDER BY c.${safeSortField} ${sortDirection}`;

      // Get total count
      const countQuery = `
        SELECT COUNT(DISTINCT c.id) as total
        FROM clients c
        ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : ""}
      `;

      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0]?.total || "0");

      // Add pagination
      const offset = (Number(page) - 1) * Number(limit);
      query += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
      queryParams.push(Number(limit), offset);

      const result = await db.query(query, queryParams);
      const clients = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        company_name: row.company_name,
        phone: row.phone,
        address: row.address,
        contact_person: row.contact_person,
        status: row.status || "active",
        created_at: row.created_at,
        updated_at: row.updated_at,
        assigned_projects_count: parseInt(row.assigned_projects_count || "0"),
        projects: [],
        team_members: []
      }));



      return res.json(new ServerResponse(true, { 
        clients, 
        total, 
        page: Number(page), 
        limit: Number(limit) 
      }, null));
    } catch (error) {
      console.error("Error fetching clients:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve clients"));
    }
  }

  static async createClient(req: Request, res: Response) {
    try {
      const clientData = req.body;
      const teamId = (req.user as any)?.team_id;

      // Validate required fields
      if (!clientData.name) {
        return res.status(400).json(new ServerResponse(false, null, "Client name is required"));
      }

      // Insert new client
      const query = `
        INSERT INTO clients (
          name, 
          email, 
          company_name, 
          phone, 
          address, 
          contact_person, 
          status, 
          team_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, name, email, company_name, phone, address, contact_person, status, created_at, updated_at
      `;

      const values = [
        clientData.name,
        clientData.email || null,
        clientData.company_name || null,
        clientData.phone || null,
        clientData.address || null,
        clientData.contact_person || null,
        clientData.status || "active",
        teamId
      ];

      const result = await db.query(query, values);
      const newClient = result.rows[0];

      // Send invitation email if email is provided
      if (newClient.email) {
        try {
          const userId = (req.user as any)?.id;
          await ClientPortalController.sendClientInvitationEmail(newClient, teamId, userId);
        } catch (emailError) {
          console.error("Error sending client invitation email:", emailError);
          // Continue with client creation even if email fails
        }
      }

      return res.json(new ServerResponse(true, {
        id: newClient.id,
        name: newClient.name,
        email: newClient.email,
        company_name: newClient.company_name,
        phone: newClient.phone,
        address: newClient.address,
        contact_person: newClient.contact_person,
        status: newClient.status,
        created_at: newClient.created_at,
        updated_at: newClient.updated_at,
        assigned_projects_count: 0,
        team_members: []
      }, "Client created successfully"));
    } catch (error) {
      console.error("Error creating client:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to create client"));
    }
  }

  static async sendClientInvitationEmail(client: any, teamId: string, invitedBy: string) {
    try {
      // Get team information
      const teamQuery = `SELECT name FROM teams WHERE id = $1`;
      const teamResult = await db.query(teamQuery, [teamId]);
      const teamName = teamResult.rows[0]?.name || "Worklenz Team";

      // Generate secure token for invitation
      const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days from now
      const inviteToken = TokenService.generateInviteToken({
        clientId: client.id,
        email: client.email,
        name: client.name,
        role: "member",
        invitedBy,
        expiresAt,
        type: "invite"
      });

      // Create invitation record in database
      await TokenService.createInvitation({
        clientId: client.id,
        email: client.email,
        name: client.name,
        role: "member",
        invitedBy,
        token: inviteToken
      });

      // Get the email template
      const template = FileConstants.getEmailTemplate(IEmailTemplateType.ClientInvitation) as string;
      if (!template) {
        throw new Error("Client invitation email template not found");
      }

      // Generate client portal link with secure token
      const portalLink = `${getClientPortalBaseUrl()}/invite?token=${inviteToken}`;

      // Replace template variables
      const emailContent = template
        .replace(/\[VAR_CLIENT_NAME\]/g, client.name || "Client")
        .replace(/\[VAR_CLIENT_EMAIL\]/g, client.email || "")
        .replace(/\[VAR_COMPANY_NAME\]/g, client.company_name || "N/A")
        .replace(/\[VAR_CLIENT_PHONE\]/g, client.phone || "N/A")
        .replace(/\[VAR_TEAM_NAME\]/g, teamName)
        .replace(/\[VAR_PORTAL_LINK\]/g, portalLink);

      // Send the email
      await sendEmail({
        to: [client.email],
        subject: `Welcome to your Client Portal - ${teamName}`,
        html: emailContent
      });

      console.log(`Client invitation email sent to ${client.email}`);
    } catch (error) {
      console.error("Error sending client invitation email:", error);
      throw error;
    }
  }

  static async getClientById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const teamId = (req.user as any)?.team_id;

      // Get client details with team validation
      const query = `
        SELECT 
          c.id,
          c.name,
          c.email,
          c.company_name,
          c.phone,
          c.address,
          c.contact_person,
          c.status,
          c.team_id,
          c.created_at,
          c.updated_at,
          COUNT(DISTINCT p.id) as assigned_projects_count
        FROM clients c
        LEFT JOIN projects p ON c.id = p.client_id
        WHERE c.id = $1 AND c.team_id = $2
        GROUP BY c.id, c.name, c.email, c.company_name, c.phone, c.address, c.contact_person, c.status, c.team_id, c.created_at, c.updated_at
      `;

      const result = await db.query(query, [id, teamId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client not found"));
      }

      const client = result.rows[0];
      const clientData = {
        id: client.id,
        name: client.name,
        email: client.email,
        company_name: client.company_name,
        phone: client.phone,
        address: client.address,
        contact_person: client.contact_person,
        status: client.status || "active",
        created_at: client.created_at,
        updated_at: client.updated_at,
        assigned_projects_count: parseInt(client.assigned_projects_count || "0"),
        team_members: []
      };

      return res.json(new ServerResponse(true, clientData, "Client details retrieved successfully"));
    } catch (error) {
      console.error("Error fetching client by ID:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve client details"));
    }
  }

  static async getClientDetails(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const teamId = (req.user as any)?.team_id;

      // Verify client exists and belongs to team
      const clientCheck = await db.query(
        "SELECT id FROM clients WHERE id = $1 AND team_id = $2",
        [id, teamId]
      );

      if (clientCheck.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client not found"));
      }

      // Get comprehensive client details
      const clientQuery = `
        SELECT 
          c.id,
          c.name,
          c.email,
          c.company_name,
          c.phone,
          c.address,
          c.contact_person,
          c.status,
          c.team_id,
          c.created_at,
          c.updated_at,
          COUNT(DISTINCT p.id) as assigned_projects_count
        FROM clients c
        LEFT JOIN projects p ON c.id = p.client_id
        WHERE c.id = $1 AND c.team_id = $2
        GROUP BY c.id, c.name, c.email, c.company_name, c.phone, c.address, c.contact_person, c.status, c.team_id, c.created_at, c.updated_at
      `;

      const clientResult = await db.query(clientQuery, [id, teamId]);
      const client = clientResult.rows[0];

      // Get client statistics
      const projectStatsQuery = `
        SELECT 
          COUNT(*) as total_projects,
          COUNT(CASE WHEN sps.name = 'Active' THEN 1 END) as active_projects,
          COUNT(CASE WHEN sps.name = 'Completed' THEN 1 END) as completed_projects
        FROM projects p
        LEFT JOIN sys_project_statuses sps ON p.status_id = sps.id
        WHERE p.client_id = $1
      `;

      const projectStatsResult = await db.query(projectStatsQuery, [id]);
      const projectStats = projectStatsResult.rows[0];

      // Get client projects with basic info
      const projectsQuery = `
        SELECT 
          p.id,
          p.name,
          p.notes as description,
          p.status_id,
          sps.name as status,
          sps.color_code as status_color,
          p.created_at,
          p.updated_at,
          COUNT(t.id) as total_tasks,
          COUNT(CASE WHEN ts.category_id IN (SELECT id FROM sys_task_status_categories WHERE is_done = true) THEN 1 END) as completed_tasks
        FROM projects p
        LEFT JOIN sys_project_statuses sps ON p.status_id = sps.id
        LEFT JOIN tasks t ON p.id = t.project_id
        LEFT JOIN task_statuses ts ON t.status_id = ts.id
        WHERE p.client_id = $1
        GROUP BY p.id, p.name, p.notes, p.status_id, sps.name, sps.color_code, p.created_at, p.updated_at
        ORDER BY p.created_at DESC
        LIMIT 10
      `;

      const projectsResult = await db.query(projectsQuery, [id]);
      const projects = projectsResult.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        status_color: row.status_color,
        created_at: row.created_at,
        updated_at: row.updated_at,
        totalTasks: parseInt(row.total_tasks || "0"),
        completedTasks: parseInt(row.completed_tasks || "0")
      }));

      // Prepare comprehensive client details response
      const clientDetails = {
        id: client.id,
        name: client.name,
        email: client.email,
        company_name: client.company_name,
        phone: client.phone,
        address: client.address,
        contact_person: client.contact_person,
        status: client.status || "active",
        created_at: client.created_at,
        updated_at: client.updated_at,
        assigned_projects_count: parseInt(client.assigned_projects_count || "0"),
        // Statistics
        stats: {
          totalProjects: parseInt(projectStats.total_projects || "0"),
          activeProjects: parseInt(projectStats.active_projects || "0"),
          completedProjects: parseInt(projectStats.completed_projects || "0"),
          totalTeamMembers: 0, // Placeholder - team members not implemented yet
          activeTeamMembers: 0, // Placeholder
          totalRequests: 0, // Placeholder - requests not implemented yet
          pendingRequests: 0, // Placeholder
          totalInvoices: 0, // Placeholder - invoices not implemented yet
          unpaidInvoices: 0 // Placeholder
        },
        // Projects
        projects,
        // Team members (placeholder)
        team_members: []
      };

      return res.json(new ServerResponse(true, clientDetails, "Client details retrieved successfully"));
    } catch (error) {
      console.error("Error fetching comprehensive client details:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve client details"));
    }
  }

  static async updateClient(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const teamId = (req.user as any)?.team_id;

      // Verify client exists and belongs to team
      const clientCheck = await db.query(
        "SELECT id FROM clients WHERE id = $1 AND team_id = $2",
        [id, teamId]
      );

      if (clientCheck.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client not found"));
      }

      // Update client data
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      // Allow updating all available fields
      if (updateData.name) {
        updateFields.push(`name = $${paramIndex}`);
        updateValues.push(updateData.name);
        paramIndex++;
      }

      if (updateData.email) {
        updateFields.push(`email = $${paramIndex}`);
        updateValues.push(updateData.email);
        paramIndex++;
      }

      if (updateData.company_name) {
        updateFields.push(`company_name = $${paramIndex}`);
        updateValues.push(updateData.company_name);
        paramIndex++;
      }

      if (updateData.phone) {
        updateFields.push(`phone = $${paramIndex}`);
        updateValues.push(updateData.phone);
        paramIndex++;
      }

      if (updateData.address) {
        updateFields.push(`address = $${paramIndex}`);
        updateValues.push(updateData.address);
        paramIndex++;
      }

      if (updateData.status) {
        updateFields.push(`status = $${paramIndex}`);
        updateValues.push(updateData.status);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json(new ServerResponse(false, null, "No valid fields to update"));
      }

      updateFields.push(`updated_at = NOW()`);
      updateValues.push(id, teamId);

      const query = `
        UPDATE clients 
        SET ${updateFields.join(", ")}
        WHERE id = $${paramIndex} AND team_id = $${paramIndex + 1}
        RETURNING id, name, email, company_name, phone, address, status, created_at, updated_at
      `;

      const result = await db.query(query, updateValues);
      
      if (result.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client not found"));
      }

      const updatedClient = result.rows[0];

      return res.json(new ServerResponse(true, {
        id: updatedClient.id,
        name: updatedClient.name,
        email: updatedClient.email,
        company_name: updatedClient.company_name,
        phone: updatedClient.phone,
        address: updatedClient.address,
        status: updatedClient.status || "active",
        created_at: updatedClient.created_at,
        updated_at: updatedClient.updated_at
      }, "Client updated successfully"));
    } catch (error) {
      console.error("Error updating client:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to update client"));
    }
  }

  static async deleteClient(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const teamId = (req.user as any)?.team_id;

      // Verify client exists and belongs to team
      const clientCheck = await db.query(
        "SELECT id FROM clients WHERE id = $1 AND team_id = $2",
        [id, teamId]
      );

      if (clientCheck.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client not found"));
      }

      // Check if client has any projects
      const projectCheck = await db.query(
        "SELECT COUNT(*) as project_count FROM projects WHERE client_id = $1",
        [id]
      );

      const projectCount = parseInt(projectCheck.rows[0]?.project_count || "0");
      if (projectCount > 0) {
        return res.status(400).json(new ServerResponse(false, null, "Cannot delete client with assigned projects"));
      }

      // Delete the client
      const deleteResult = await db.query(
        "DELETE FROM clients WHERE id = $1 AND team_id = $2",
        [id, teamId]
      );

      if (deleteResult.rowCount === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client not found"));
      }

      return res.json(new ServerResponse(true, null, "Client deleted successfully"));
    } catch (error) {
      console.error("Error deleting client:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to delete client"));
    }
  }

  // Client Projects
  static async getClientProjects(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10, status } = req.query;
      const teamId = (req.user as any)?.team_id;

      // Verify client exists and belongs to team
      const clientCheck = await db.query(
        "SELECT id FROM clients WHERE id = $1 AND team_id = $2",
        [id, teamId]
      );

      if (clientCheck.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client not found"));
      }

      // Build query with pagination and filtering
      let query = `
        SELECT 
          p.id,
          p.name,
          p.notes,
          p.status_id,
          sps.name as status_name,
          sps.color_code as status_color,
          p.created_at,
          p.updated_at,
          COUNT(t.id) as total_tasks,
          COUNT(CASE WHEN ts.category_id IN (SELECT id FROM sys_task_status_categories WHERE is_done = true) THEN 1 END) as completed_tasks
        FROM projects p
        LEFT JOIN sys_project_statuses sps ON p.status_id = sps.id
        LEFT JOIN tasks t ON p.id = t.project_id
        LEFT JOIN task_statuses ts ON t.status_id = ts.id
        WHERE p.client_id = $1
      `;

      const queryParams = [id];
      let paramIndex = 2;

      // Add status filter if provided
      if (status) {
        query += ` AND sps.name = $${paramIndex}`;
        queryParams.push(String(status));
        paramIndex++;
      }

      query += ` GROUP BY p.id, p.name, p.notes, p.status_id, sps.name, sps.color_code, p.created_at, p.updated_at`;

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM projects p
        LEFT JOIN sys_project_statuses sps ON p.status_id = sps.id
        WHERE p.client_id = $1
        ${status ? "AND sps.name = $2" : ""}
      `;
      const countParams = status ? [id, status] : [id];
      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0]?.total || "0");

      // Add pagination
      const offset = (Number(page) - 1) * Number(limit);
      query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(String(Number(limit)), String(offset));

      const result = await db.query(query, queryParams);
      const projects = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.notes,
        status: row.status_name,
        status_color: row.status_color,
        created_at: row.created_at,
        updated_at: row.updated_at,
        total_tasks: parseInt(row.total_tasks || "0"),
        completed_tasks: parseInt(row.completed_tasks || "0")
      }));

      return res.json(new ServerResponse(true, { 
        projects, 
        total, 
        page: Number(page), 
        limit: Number(limit) 
      }, "Client projects retrieved successfully"));
    } catch (error) {
      console.error("Error fetching client projects:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve client projects"));
    }
  }

  static async assignProjectToClient(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { project_id } = req.body;
      // TODO: Implement project assignment to client

      return res.json(new ServerResponse(true, {}, "Project assigned to client successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to assign project to client"));
    }
  }

  static async removeProjectFromClient(req: Request, res: Response) {
    try {
      const { id, projectId } = req.params;
      // TODO: Implement project removal from client

      return res.json(new ServerResponse(true, null, "Project removed from client successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to remove project from client"));
    }
  }

  // Client Team Management
  static async getClientTeam(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10, status } = req.query;
      const teamId = (req.user as any)?.team_id;

      // Verify client exists and belongs to team
      const clientCheck = await db.query(
        "SELECT id FROM clients WHERE id = $1 AND team_id = $2",
        [id, teamId]
      );

      if (clientCheck.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client not found"));
      }

      // For now, return empty team since client team members are not implemented in the database
      // This would typically query a client_team_members table or similar
      const teamMembers: any[] = [];
      const total = 0;

      return res.json(new ServerResponse(true, { 
        team_members: teamMembers, 
        total, 
        page: Number(page), 
        limit: Number(limit) 
      }, "Client team retrieved successfully"));
    } catch (error) {
      console.error("Error fetching client team:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve client team"));
    }
  }

  private static generateInvitationEmailHTML(data: {
    inviteeName: string;
    inviterName: string;
    clientName: string;
    companyName?: string;
    inviteLink: string;
    expiresAt: Date;
    role: string;
  }): string {
    const expiryDate = data.expiresAt.toLocaleDateString();
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>You're Invited to Join ${data.clientName} on Worklenz</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1890ff; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; background: #1890ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>You're Invited to Join ${data.clientName}</h1>
          </div>
          <div class="content">
            <p>Hello ${data.inviteeName},</p>
            <p>${data.inviterName} has invited you to join <strong>${data.clientName}</strong> on Worklenz as a <strong>${data.role}</strong>.</p>
            <p>Worklenz is a comprehensive project management platform that will help you collaborate effectively with your team and stay updated on project progress.</p>
            <p>Click the button below to accept the invitation and set up your account:</p>
            <a href="${data.inviteLink}" class="button">Accept Invitation</a>
            <p>This invitation will expire on ${expiryDate}.</p>
            <p>If you have any questions, please contact ${data.inviterName} or reply to this email.</p>
          </div>
          <div class="footer">
            <p>© 2024 Worklenz. All rights reserved.</p>
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static generateWelcomeEmailHTML(data: {
    userName: string;
    clientName: string;
    companyName?: string;
    portalLink: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to ${data.clientName} on Worklenz</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #52c41a; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; background: #1890ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${data.clientName}!</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>Welcome to <strong>${data.clientName}</strong> on Worklenz!</p>
            <p>Your account has been successfully created. You can now access your client portal to:</p>
            <ul>
              <li>View project progress and updates</li>
              <li>Submit requests and track their status</li>
              <li>Access invoices and billing information</li>
              <li>Communicate with your team</li>
              <li>Manage your profile and settings</li>
            </ul>
            <p>Click the button below to access your portal:</p>
            <a href="${data.portalLink}" class="button">Access Portal</a>
            <p>If you have any questions or need assistance, please don't hesitate to reach out to your team.</p>
          </div>
          <div class="footer">
            <p>© 2024 Worklenz. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  static async inviteTeamMember(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { email, name, role = "member" } = req.body;
      const teamId = (req.user as any)?.team_id;
      const inviterId = (req.user as any)?.id;
      const inviterName = (req.user as any)?.name;

      // Validate required fields
      if (!email || !name) {
        return res.status(400).json(new ServerResponse(false, null, "Email and name are required"));
      }

      // Verify client exists and belongs to team
      const clientCheck = await db.query(
        "SELECT id, name, company_name FROM clients WHERE id = $1 AND team_id = $2",
        [id, teamId]
      );

      if (clientCheck.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client not found"));
      }

      const client = clientCheck.rows[0];

      // Check if user is already invited or exists
      const existingInvitation = await db.query(
        "SELECT id FROM client_invitations WHERE client_id = $1 AND email = $2 AND status = 'pending'",
        [id, email]
      );

      if (existingInvitation.rows.length > 0) {
        return res.status(400).json(new ServerResponse(false, null, "User already has a pending invitation"));
      }

      const existingUser = await db.query(
        "SELECT id FROM client_users WHERE client_id = $1 AND email = $2",
        [id, email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json(new ServerResponse(false, null, "User already exists for this client"));
      }

      // Generate invitation token
      const inviteToken = TokenService.generateSecureToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Create invitation record
      await TokenService.createInvitation({
        clientId: id,
        email,
        name,
        role,
        invitedBy: inviterId,
        token: inviteToken
      });

      // Generate invitation link
      const inviteLink = `${process.env.CLIENT_PORTAL_URL || "http://localhost:3001"}/invitation?token=${inviteToken}`;

      // Generate email HTML
      const emailHtml = ClientPortalController.generateInvitationEmailHTML({
        inviteeName: name,
        inviterName,
        clientName: client.name,
        companyName: client.company_name,
        inviteLink,
        expiresAt,
        role
      });

      // Send invitation email using shared email function
      const emailRequest = new EmailRequest(
        [email],
        `You're invited to join ${client.name} on Worklenz`,
        emailHtml
      );

      const messageId = await sendEmail(emailRequest);

      if (!messageId) {
        return res.status(500).json(new ServerResponse(false, null, "Failed to send invitation email"));
      }

      return res.json(new ServerResponse(true, {
        invitationId: inviteToken,
        email,
        name,
        role,
        status: "pending",
        expiresAt
      }, "Team member invited successfully"));
    } catch (error) {
      console.error("Error inviting team member:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to invite team member"));
    }
  }

  static async updateTeamMember(req: Request, res: Response) {
    try {
      const { id, memberId } = req.params;
      const memberData = req.body;
      // TODO: Implement team member update

      return res.json(new ServerResponse(true, {}, "Team member updated successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to update team member"));
    }
  }

  static async removeTeamMember(req: Request, res: Response) {
    try {
      const { id, memberId } = req.params;
      // TODO: Implement team member removal

      return res.json(new ServerResponse(true, null, "Team member removed successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to remove team member"));
    }
  }

  static async resendTeamInvitation(req: Request, res: Response) {
    try {
      const { id, memberId } = req.params;
      const teamId = (req.user as any)?.team_id;
      const inviterName = (req.user as any)?.name;

      // Verify client exists and belongs to team
      const clientCheck = await db.query(
        "SELECT id, name, company_name FROM clients WHERE id = $1 AND team_id = $2",
        [id, teamId]
      );

      if (clientCheck.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client not found"));
      }

      const client = clientCheck.rows[0];

      // Get invitation details
      const invitationCheck = await db.query(
        "SELECT id, email, name, role, token, status FROM client_invitations WHERE id = $1 AND client_id = $2 AND status = 'pending'",
        [memberId, id]
      );

      if (invitationCheck.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Pending invitation not found"));
      }

      const invitation = invitationCheck.rows[0];

      // Generate new token and extend expiry
      const newToken = TokenService.generateSecureToken();
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Update invitation with new token and expiry
      await db.query(
        "UPDATE client_invitations SET token = $1, expires_at = $2 WHERE id = $3",
        [newToken, newExpiresAt, memberId]
      );

      // Generate new invitation link
      const inviteLink = `${process.env.CLIENT_PORTAL_URL || "http://localhost:3001"}/invitation?token=${newToken}`;

      // Generate email HTML
      const emailHtml = ClientPortalController.generateInvitationEmailHTML({
        inviteeName: invitation.name,
        inviterName,
        clientName: client.name,
        companyName: client.company_name,
        inviteLink,
        expiresAt: newExpiresAt,
        role: invitation.role
      });

      // Send invitation email using shared email function
      const emailRequest = new EmailRequest(
        [invitation.email],
        `You're invited to join ${client.name} on Worklenz`,
        emailHtml
      );

      const messageId = await sendEmail(emailRequest);

      if (!messageId) {
        return res.status(500).json(new ServerResponse(false, null, "Failed to send invitation email"));
      }

      return res.json(new ServerResponse(true, {
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        status: invitation.status,
        resent_at: new Date()
      }, "Team invitation resent successfully"));
    } catch (error) {
      console.error("Error resending team invitation:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to resend team invitation"));
    }
  }

  // Client Analytics
  static async getClientStats(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const teamId = (req.user as any)?.team_id;

      // Verify client exists and belongs to team
      const clientCheck = await db.query(
        "SELECT id FROM clients WHERE id = $1 AND team_id = $2",
        [id, teamId]
      );

      if (clientCheck.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client not found"));
      }

      // Get project statistics
      const projectStats = await db.query(`
        SELECT 
          COUNT(*) as total_projects,
          COUNT(CASE WHEN sps.name = 'Active' THEN 1 END) as active_projects,
          COUNT(CASE WHEN sps.name = 'Completed' THEN 1 END) as completed_projects
        FROM projects p
        LEFT JOIN sys_project_statuses sps ON p.status_id = sps.id
        WHERE p.client_id = $1
      `, [id]);

      // Get team member statistics (placeholder - team members not implemented yet)
      const teamMemberStats = {
        total_team_members: 0,
        active_team_members: 0
      };

      // Get request statistics (placeholder - requests not implemented yet)
      const requestStats = {
        total_requests: 0,
        pending_requests: 0
      };

      // Get invoice statistics (placeholder - invoices not implemented yet)
      const invoiceStats = {
        total_invoices: 0,
        unpaid_invoices: 0
      };

      const stats = {
        totalProjects: parseInt(projectStats.rows[0]?.total_projects || "0"),
        activeProjects: parseInt(projectStats.rows[0]?.active_projects || "0"),
        completedProjects: parseInt(projectStats.rows[0]?.completed_projects || "0"),
        totalTeamMembers: teamMemberStats.total_team_members,
        activeTeamMembers: teamMemberStats.active_team_members,
        totalRequests: requestStats.total_requests,
        pendingRequests: requestStats.pending_requests,
        totalInvoices: invoiceStats.total_invoices,
        unpaidInvoices: invoiceStats.unpaid_invoices
      };

      return res.json(new ServerResponse(true, stats, "Client statistics retrieved successfully"));
    } catch (error) {
      console.error("Error fetching client stats:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve client statistics"));
    }
  }

  static async getClientActivity(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10, type } = req.query;
      // TODO: Implement client activity retrieval

      return res.json(new ServerResponse(true, { 
        activities: [], 
        total: 0, 
        page: Number(page), 
        limit: Number(limit) 
      }, "Client activity retrieved successfully"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve client activity"));
    }
  }

  static async exportClientData(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { format = "csv" } = req.query;
      // TODO: Implement client data export

      return res.json(new ServerResponse(true, {}, "Client data export initiated"));
    } catch (error) {
      return res.status(500).json(new ServerResponse(false, null, "Failed to export client data"));
    }
  }

  // Bulk Operations
  static async bulkUpdateClients(req: Request, res: Response) {
    try {
      const { client_ids, status } = req.body;
      const teamId = (req.user as any)?.team_id;

      if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
        return res.status(400).json(new ServerResponse(false, null, "Invalid client IDs provided"));
      }

      if (!status || !["active", "inactive", "pending"].includes(status)) {
        return res.status(400).json(new ServerResponse(false, null, "Invalid status provided"));
      }

      // Verify all clients belong to the team
      const clientCheck = await db.query(
        "SELECT id FROM clients WHERE id = ANY($1) AND team_id = $2",
        [client_ids, teamId]
      );

      if (clientCheck.rows.length !== client_ids.length) {
        return res.status(400).json(new ServerResponse(false, null, "Some clients not found or not accessible"));
      }

      // Update all clients
      const updateResult = await db.query(
        "UPDATE clients SET updated_at = NOW() WHERE id = ANY($1) AND team_id = $2",
        [client_ids, teamId]
      );

      return res.json(new ServerResponse(true, { updated_count: updateResult.rowCount }, "Clients updated successfully"));
    } catch (error) {
      console.error("Error bulk updating clients:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to update clients"));
    }
  }

  static async bulkDeleteClients(req: Request, res: Response) {
    try {
      const { client_ids } = req.body;
      const teamId = (req.user as any)?.team_id;

      if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
        return res.status(400).json(new ServerResponse(false, null, "Invalid client IDs provided"));
      }

      // Verify all clients belong to the team
      const clientCheck = await db.query(
        "SELECT id FROM clients WHERE id = ANY($1) AND team_id = $2",
        [client_ids, teamId]
      );

      if (clientCheck.rows.length !== client_ids.length) {
        return res.status(400).json(new ServerResponse(false, null, "Some clients not found or not accessible"));
      }

      // Check if any clients have projects
      const projectCheck = await db.query(
        "SELECT client_id FROM projects WHERE client_id = ANY($1)",
        [client_ids]
      );

      if (projectCheck.rows.length > 0) {
        return res.status(400).json(new ServerResponse(false, null, "Cannot delete clients with assigned projects"));
      }

      // Delete all clients
      const deleteResult = await db.query(
        "DELETE FROM clients WHERE id = ANY($1) AND team_id = $2",
        [client_ids, teamId]
      );

      return res.json(new ServerResponse(true, { deleted_count: deleteResult.rowCount }, "Clients deleted successfully"));
    } catch (error) {
      console.error("Error bulk deleting clients:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to delete clients"));
    }
  }

  // Client Portal Authentication Endpoints
  static async validateInvitation(req: Request, res: Response) {
    try {
      const { token } = req.query;

      if (!token) {
        return res.status(400).json(new ServerResponse(false, null, "Invitation token is required"));
      }

      // Get invitation details
      const invitation = await TokenService.getInvitationByToken(token as string);

      if (!invitation) {
        return res.status(404).json(new ServerResponse(false, null, "Invalid or expired invitation"));
      }

      // Return invitation details for the frontend
      return res.json(new ServerResponse(true, {
        valid: true,
        email: invitation.email,
        organizationName: invitation.team_name,
        id: invitation.id,
        name: invitation.name,
        role: invitation.role,
        clientName: invitation.client_name,
        companyName: invitation.company_name,
        teamName: invitation.team_name,
        expiresAt: invitation.expires_at,
        status: invitation.status
      }, "Invitation is valid"));
    } catch (error) {
      console.error("Error validating invitation:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to validate invitation"));
    }
  }

  static async acceptInvitation(req: Request, res: Response) {
    try {
      const { token, password, name } = req.body;

      if (!token || !password || !name) {
        return res.status(400).json(new ServerResponse(false, null, "Token, password, and name are required"));
      }

      // Accept the invitation
      const newUser = await TokenService.acceptInvitation(token, {
        password,
        name
      });

      // Send welcome email
      const invitation = await TokenService.getInvitationByToken(token);
      if (invitation) {
        const portalLink = `${process.env.CLIENT_PORTAL_URL || "http://localhost:3001"}/login`;
        
        // Generate welcome email HTML
        const emailHtml = ClientPortalController.generateWelcomeEmailHTML({
          userName: newUser.name,
          clientName: invitation.client_name,
          companyName: invitation.company_name,
          portalLink
        });

        // Send welcome email using shared email function
        const emailRequest = new EmailRequest(
          [newUser.email],
          `Welcome to ${invitation.client_name} on Worklenz`,
          emailHtml
        );

        await sendEmail(emailRequest);
      }

      return res.json(new ServerResponse(true, {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role
      }, "Invitation accepted successfully"));
    } catch (error) {
      console.error("Error accepting invitation:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to accept invitation"));
    }
  }

  static async clientLogin(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json(new ServerResponse(false, null, "Email and password are required"));
      }

      // Authenticate client user
      const clientUser = await TokenService.authenticateClient(email, password);

      if (!clientUser) {
        return res.status(401).json(new ServerResponse(false, null, "Invalid email or password"));
      }

      // Generate client access token
      const tokenPayload = {
        clientId: clientUser.client_id,
        organizationId: clientUser.team_id,
        email: clientUser.email,
        permissions: await TokenService.getClientPermissions(clientUser.client_id),
        type: "client" as const
      };

      const accessToken = TokenService.generateClientToken(tokenPayload);

      // Update last login
      await db.query(
        "UPDATE client_users SET last_login = NOW() WHERE id = $1",
        [clientUser.id]
      );

      return res.json(new ServerResponse(true, {
        token: accessToken,
        user: {
          id: clientUser.id,
          email: clientUser.email,
          name: clientUser.name,
          role: clientUser.role,
          clientId: clientUser.client_id,
          clientName: clientUser.client_name,
          companyName: clientUser.company_name
        }
      }, "Login successful"));
    } catch (error) {
      console.error("Error during client login:", error);
      return res.status(500).json(new ServerResponse(false, null, "Login failed"));
    }
  }

  static async clientLogout(req: AuthenticatedClientRequest, res: Response) {
    try {
      // In a more complete implementation, you would invalidate the token
      // For now, we'll just return a success response
      return res.json(new ServerResponse(true, null, "Logout successful"));
    } catch (error) {
      console.error("Error during client logout:", error);
      return res.status(500).json(new ServerResponse(false, null, "Logout failed"));
    }
  }

  static async getClientProfile(req: AuthenticatedClientRequest, res: Response) {
    try {
      const {clientId} = req;
      const {clientEmail} = req;

      // Get client user details
      const query = `
        SELECT cu.*, c.name as client_name, c.company_name
        FROM client_users cu
        JOIN clients c ON cu.client_id = c.id
        WHERE cu.client_id = $1 AND cu.email = $2
      `;

      const result = await db.query(query, [clientId, clientEmail]);
      
      if (result.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client profile not found"));
      }

      const clientUser = result.rows[0];

      return res.json(new ServerResponse(true, {
        id: clientUser.id,
        email: clientUser.email,
        name: clientUser.name,
        role: clientUser.role,
        clientId: clientUser.client_id,
        clientName: clientUser.client_name,
        companyName: clientUser.company_name,
        createdAt: clientUser.created_at,
        lastLogin: clientUser.last_login
      }, "Client profile retrieved successfully"));
    } catch (error) {
      console.error("Error fetching client profile:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to retrieve client profile"));
    }
  }

  static async updateClientProfile(req: AuthenticatedClientRequest, res: Response) {
    try {
      const {clientId} = req;
      const {clientEmail} = req;
      const { name, currentPassword, newPassword } = req.body;

      if (!name) {
        return res.status(400).json(new ServerResponse(false, null, "Name is required"));
      }

      // Get current client user
      const currentUser = await db.query(
        "SELECT * FROM client_users WHERE client_id = $1 AND email = $2",
        [clientId, clientEmail]
      );

      if (currentUser.rows.length === 0) {
        return res.status(404).json(new ServerResponse(false, null, "Client user not found"));
      }

      const user = currentUser.rows[0];
      const updateFields = ["name = $1", "updated_at = NOW()"];
      const updateValues = [name];
      let paramIndex = 2;

      // Handle password update if provided
      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json(new ServerResponse(false, null, "Current password is required to set new password"));
        }

        // Verify current password
        const crypto = require("crypto");
        const currentPasswordHash = crypto.createHash("sha256").update(currentPassword).digest("hex");
        
        if (currentPasswordHash !== user.password_hash) {
          return res.status(400).json(new ServerResponse(false, null, "Current password is incorrect"));
        }

        // Hash new password
        const newPasswordHash = crypto.createHash("sha256").update(newPassword).digest("hex");
        updateFields.push(`password_hash = $${paramIndex}`);
        updateValues.push(newPasswordHash);
        paramIndex++;
      }

      // Update the user
      updateValues.push(user.id);
      const updateQuery = `
        UPDATE client_users 
        SET ${updateFields.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING id, email, name, role, updated_at
      `;

      const result = await db.query(updateQuery, updateValues);
      const updatedUser = result.rows[0];

      return res.json(new ServerResponse(true, {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        updatedAt: updatedUser.updated_at
      }, "Profile updated successfully"));
    } catch (error) {
      console.error("Error updating client profile:", error);
      return res.status(500).json(new ServerResponse(false, null, "Failed to update profile"));
    }
  }
}

export default ClientPortalController; 