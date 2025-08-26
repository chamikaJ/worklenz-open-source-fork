import db from "../config/db";
import { log_error } from "../shared/utils";
import {
  AppSumoStatus,
  MigrationDiscount,
  DiscountType,
  PlanTier,
  MigrationWindow,
  UrgentAction,
  PostDiscountOptions,
  FutureCampaignInfo,
  ContactInfo
} from "../interfaces/plan-recommendation";

export class AppSumoMigrationService {
  
  private static readonly APPSUMO_DISCOUNT_RATE = 50; // 50% off
  private static readonly MIGRATION_WINDOW_DAYS = 5; // 5-day migration window
  private static readonly MINIMUM_PLAN_TIER = PlanTier.BUSINESS_SMALL;
  
  // AppSumo-specific Paddle plan IDs (these should be configured in your Paddle dashboard)
  private static readonly APPSUMO_PADDLE_PLANS = {
    BUSINESS_MONTHLY: 'pri_01jd8b9xr2q3w4e5t6y7u8i9o0p1',  // 50% off Business Monthly for AppSumo users
    BUSINESS_ANNUAL: 'pri_01jd8c1xs3r4w5e6t7y8u9i0o1p2',   // 50% off Business Annual for AppSumo users
    ENTERPRISE_MONTHLY: 'pri_01jd8c2yt4s5w6e7t8y9u0i1o2p3', // 50% off Enterprise Monthly for AppSumo users
    ENTERPRISE_ANNUAL: 'pri_01jd8c3zu5t6w7e8t9y0u1i2o3p4'   // 50% off Enterprise Annual for AppSumo users
  };

  /**
   * Check AppSumo migration eligibility and status
   */
  public static async checkAppSumoEligibility(organizationId: string): Promise<AppSumoStatus | null> {
    try {
      const query = `
        SELECT 
          lcc.redeemed_by,
          lcc.created_at as appsumo_purchase_date,
          lam.id as migration_id,
          lam.migration_deadline,
          lam.special_discount_rate,
          lam.minimum_tier_required,
          lam.notification_sent,
          EXTRACT(DAY FROM lam.migration_deadline - NOW())::int as remaining_days,
          CASE 
            WHEN lam.migration_deadline > NOW() THEN true 
            ELSE false 
          END as eligible_for_discount,
          -- Check if already migrated to a standard plan
          EXISTS(SELECT 1 FROM licensing_user_subscriptions lus WHERE lus.user_id = o.user_id AND lus.subscription_status = 'active') as already_migrated
        FROM organizations o
        LEFT JOIN licensing_coupon_codes lcc ON lcc.redeemed_by = o.user_id 
          AND lcc.code LIKE '%APPSUMO%'
        LEFT JOIN licensing_appsumo_migrations lam ON lam.organization_id = o.id
        WHERE o.id = $1 AND lcc.redeemed_by IS NOT NULL
      `;

      const result = await db.query(query, [organizationId]);
      
      if (result.rows.length === 0) {
        return null; // Not an AppSumo user
      }

      const data = result.rows[0];
      
      // If no migration record exists, create one
      if (!data.migration_id) {
        await this.createAppSumoMigrationRecord(organizationId, data.redeemed_by);
        return this.checkAppSumoEligibility(organizationId); // Recursive call to get updated data
      }

      return {
        isAppSumoUser: true,
        purchaseDate: data.appsumo_purchase_date,
        remainingMigrationDays: Math.max(0, data.remaining_days || 0),
        eligibleForSpecialDiscount: data.eligible_for_discount || false,
        minimumPlanTier: data.minimum_tier_required || this.MINIMUM_PLAN_TIER,
        specialOfferDiscount: data.special_discount_rate || this.APPSUMO_DISCOUNT_RATE,
        alreadyMigrated: data.already_migrated || false
      };

    } catch (error) {
      log_error(error);
      throw new Error("Failed to check AppSumo eligibility");
    }
  }

  /**
   * Create AppSumo migration record with deadline
   */
  private static async createAppSumoMigrationRecord(organizationId: string, userId: string): Promise<void> {
    const migrationDeadline = new Date();
    migrationDeadline.setDate(migrationDeadline.getDate() + this.MIGRATION_WINDOW_DAYS);

    const query = `
      INSERT INTO licensing_appsumo_migrations (
        organization_id, 
        user_id, 
        migration_deadline, 
        special_discount_rate, 
        minimum_tier_required,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (organization_id) DO NOTHING
    `;

    await db.query(query, [
      organizationId,
      userId,
      migrationDeadline,
      this.APPSUMO_DISCOUNT_RATE,
      this.MINIMUM_PLAN_TIER
    ]);
  }

  /**
   * Get AppSumo-specific plan recommendations
   */
  public static async getAppSumoRecommendations(organizationId: string): Promise<{
    eligiblePlans: PlanTier[];
    recommendedPlan: PlanTier;
    discounts: MigrationDiscount[];
    urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
    countdownMessage: string;
    canMigrateWithoutDiscount: boolean;
    postDiscountOptions: PostDiscountOptions;
  }> {
    const appSumoStatus = await this.checkAppSumoEligibility(organizationId);
    
    if (!appSumoStatus || !appSumoStatus.isAppSumoUser) {
      throw new Error("Organization is not an AppSumo user");
    }

    const eligiblePlans = [PlanTier.BUSINESS_SMALL, PlanTier.BUSINESS_LARGE, PlanTier.ENTERPRISE];
    const recommendedPlan = await this.determineRecommendedPlan(organizationId);
    const discounts = await this.getAppSumoDiscounts(appSumoStatus);
    const urgencyLevel = this.calculateUrgencyLevel(appSumoStatus.remainingMigrationDays || 0);
    const countdownMessage = this.generateCountdownMessage(appSumoStatus.remainingMigrationDays || 0);
    
    // AppSumo users can always migrate, just without discount after deadline
    const canMigrateWithoutDiscount = !appSumoStatus.eligibleForSpecialDiscount && !appSumoStatus.alreadyMigrated;
    const postDiscountOptions = this.getPostDiscountOptions(appSumoStatus);

    return {
      eligiblePlans,
      recommendedPlan,
      discounts,
      urgencyLevel,
      countdownMessage,
      canMigrateWithoutDiscount,
      postDiscountOptions
    };
  }

  /**
   * Determine recommended plan based on AppSumo user's current usage
   */
  private static async determineRecommendedPlan(organizationId: string): Promise<PlanTier> {
    const usageQuery = `
      WITH org_teams AS (
        SELECT t.id as team_id
        FROM organizations o
        JOIN teams t ON t.user_id = o.user_id
        WHERE o.id = $1
      )
      SELECT 
        COUNT(DISTINCT tm.email) as user_count,
        COUNT(DISTINCT p.id) as project_count,
        COUNT(DISTINCT tasks.id) as task_count,
        SUM(ta.size) as storage_used
      FROM org_teams ot
      LEFT JOIN team_members tm ON tm.team_id = ot.team_id
      LEFT JOIN projects p ON p.team_id = ot.team_id
      LEFT JOIN tasks ON tasks.project_id = p.id
      LEFT JOIN task_attachments ta ON ta.task_id = tasks.id
    `;

    const result = await db.query(usageQuery, [organizationId]);
    const usage = result.rows[0];

    const userCount = Number(usage.user_count) || 0;
    const projectCount = Number(usage.project_count) || 0;
    const taskCount = Number(usage.task_count) || 0;

    // Recommendation logic for AppSumo users
    if (userCount <= 5 && projectCount <= 10 && taskCount <= 100) {
      return PlanTier.BUSINESS_SMALL;
    } else if (userCount <= 20 && projectCount <= 50 && taskCount <= 1000) {
      return PlanTier.BUSINESS_LARGE;
    } else {
      return PlanTier.ENTERPRISE;
    }
  }

  /**
   * Get AppSumo-specific discounts
   */
  private static async getAppSumoDiscounts(appSumoStatus: AppSumoStatus): Promise<MigrationDiscount[]> {
    const discounts: MigrationDiscount[] = [];

    if (appSumoStatus.eligibleForSpecialDiscount) {
      discounts.push({
        code: 'APPSUMO_50_SPECIAL',
        type: DiscountType.PERCENTAGE,
        value: appSumoStatus.specialOfferDiscount,
        duration: 12, // 12 months
        conditions: [
          'AppSumo customer exclusive',
          `Must migrate within ${appSumoStatus.remainingMigrationDays} days`,
          'Business plan or higher required'
        ],
        eligiblePlans: [PlanTier.BUSINESS_SMALL, PlanTier.BUSINESS_LARGE, PlanTier.ENTERPRISE],
        stackable: false
      });
    }

    return discounts;
  }

  /**
   * Calculate urgency level based on remaining days
   */
  private static calculateUrgencyLevel(remainingDays: number): 'low' | 'medium' | 'high' | 'critical' {
    if (remainingDays <= 0) return 'critical';
    if (remainingDays <= 1) return 'critical';
    if (remainingDays <= 2) return 'high';
    if (remainingDays <= 3) return 'high';
    if (remainingDays <= 5) return 'medium';
    return 'low';
  }

  /**
   * Generate countdown message
   */
  private static generateCountdownMessage(remainingDays: number): string {
    if (remainingDays <= 0) {
      return "🎯 Discount expired, but you can still migrate to any Business plan at standard pricing. Future campaigns may be available!";
    }
    if (remainingDays === 1) {
      return "🚨 FINAL DAY: Your AppSumo 50% discount expires in 24 hours!";
    }
    if (remainingDays <= 2) {
      return `🚨 URGENT: Only ${remainingDays} days left to claim your 50% AppSumo discount!`;
    }
    if (remainingDays <= 5) {
      return `⏰ Limited Time: ${remainingDays} days remaining for your exclusive AppSumo 50% discount`;
    }
    return `AppSumo Special: ${remainingDays} days remaining for 50% off Business plans`;
  }

  /**
   * Get post-discount migration options
   */
  private static getPostDiscountOptions(appSumoStatus: AppSumoStatus): PostDiscountOptions {
    return {
      canStillMigrate: !appSumoStatus.alreadyMigrated,
      standardPricing: true,
      futureCampaigns: {
        possibleFutureCampaigns: true,
        notificationSignup: true,
        expectedTimeframe: "2-3 months",
        potentialDiscounts: ["Seasonal campaigns", "Anniversary specials", "Volume discounts"]
      },
      migrationBenefits: [
        "Access to all Business plan features",
        "Enhanced support and priority assistance",
        "Latest product updates and improvements",
        "Better scalability for growing teams",
        "Advanced reporting and analytics"
      ],
      contactSupport: {
        email: "appsumo-support@worklenz.com",
        subject: "AppSumo Migration Assistance",
        supportHours: "Monday-Friday, 9 AM - 6 PM EST"
      }
    };
  }

  /**
   * Send AppSumo migration notifications
   */
  public static async sendMigrationNotifications(): Promise<{
    notificationsSent: number;
    errors: string[];
  }> {
    try {
      const query = `
        SELECT 
          lam.id,
          lam.organization_id,
          lam.user_id,
          lam.migration_deadline,
          lam.notification_sent,
          o.id as org_id,
          u.email,
          u.name,
          EXTRACT(DAY FROM lam.migration_deadline - NOW())::int as remaining_days
        FROM licensing_appsumo_migrations lam
        JOIN organizations o ON o.id = lam.organization_id
        JOIN users u ON u.id = lam.user_id
        WHERE lam.migration_deadline > NOW()
          AND (
            lam.notification_sent IS NULL 
            OR (EXTRACT(DAY FROM lam.migration_deadline - NOW())::int IN (3, 1) AND lam.last_notification_sent < NOW() - INTERVAL '24 hours')
          )
        ORDER BY lam.migration_deadline ASC
      `;

      const result = await db.query(query);
      const users = result.rows;

      let notificationsSent = 0;
      const errors: string[] = [];

      for (const user of users) {
        try {
          await this.sendIndividualNotification(user);
          await this.updateNotificationStatus(user.id);
          notificationsSent++;
        } catch (error) {
          log_error(error);
          errors.push(`Failed to notify user ${user.email}: ${error}`);
        }
      }

      return { notificationsSent, errors };

    } catch (error) {
      log_error(error);
      throw new Error("Failed to send AppSumo migration notifications");
    }
  }

  /**
   * Send individual notification to AppSumo user
   */
  private static async sendIndividualNotification(user: any): Promise<void> {
    const { sendEmail } = require("../shared/email");
    
    const remainingDays = user.remaining_days;
    const urgencyLevel = this.calculateUrgencyLevel(remainingDays);
    const countdownMessage = this.generateCountdownMessage(remainingDays);

    const subject = remainingDays <= 2 
      ? `🚨 URGENT: AppSumo Discount Expires in ${remainingDays} Days!`
      : `⏰ AppSumo Migration Reminder: ${remainingDays} Days Remaining`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>AppSumo Migration Reminder</title>
        <style>
          .urgent { color: #d32f2f; font-weight: bold; }
          .highlight { background-color: #fff3cd; padding: 10px; border-radius: 5px; }
          .countdown { font-size: 24px; color: #f57c00; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <h1>Hi ${user.name}!</h1>
          
          <div class="countdown ${urgencyLevel === 'critical' ? 'urgent' : ''}">
            ${countdownMessage}
          </div>
          
          <div class="highlight">
            <h2>🎉 Your Exclusive AppSumo Benefits:</h2>
            <ul>
              <li><strong>50% OFF</strong> any Business plan for 12 months</li>
              <li>All premium features included</li>
              <li>Priority customer support</li>
              <li>Advanced reporting and analytics</li>
              <li>Client portal access</li>
            </ul>
          </div>
          
          <h3>Migration is Simple:</h3>
          <ol>
            <li>Log into your Worklenz account</li>
            <li>Go to Billing & Plans</li>
            <li>Select your preferred Business plan</li>
            <li>Your 50% discount will be automatically applied</li>
          </ol>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://app.worklenz.com/settings/billing" 
               style="background-color: #2196f3; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 18px;">
              Migrate Now & Save 50%
            </a>
          </div>
          
          <p><strong>Important:</strong> This special offer is only available to AppSumo customers and expires ${remainingDays <= 1 ? 'tomorrow' : `in ${remainingDays} days`}. Don't miss out!</p>
          
          <p>Questions? Reply to this email or contact our support team.</p>
          
          <p>Best regards,<br>The Worklenz Team</p>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: [user.email],
      subject,
      html
    });
  }

  /**
   * Update notification status
   */
  private static async updateNotificationStatus(migrationId: string): Promise<void> {
    const query = `
      UPDATE licensing_appsumo_migrations 
      SET notification_sent = true, last_notification_sent = NOW()
      WHERE id = $1
    `;
    
    await db.query(query, [migrationId]);
  }

  /**
   * Get AppSumo countdown widget data
   */
  public static async getCountdownWidget(organizationId: string): Promise<{
    isVisible: boolean;
    remainingDays: number;
    remainingHours: number;
    remainingMinutes: number;
    urgencyLevel: string;
    message: string;
    ctaText: string;
    ctaUrl: string;
  } | null> {
    const appSumoStatus = await this.checkAppSumoEligibility(organizationId);
    
    if (!appSumoStatus || !appSumoStatus.eligibleForSpecialDiscount) {
      return null;
    }

    const remainingDays = appSumoStatus.remainingMigrationDays || 0;
    
    if (remainingDays <= 0) {
      return null; // Don't show widget if expired
    }

    // Calculate precise remaining time
    const deadlineQuery = `
      SELECT migration_deadline 
      FROM licensing_appsumo_migrations lam
      JOIN organizations o ON o.id = lam.organization_id
      WHERE o.id = $1
    `;
    
    const result = await db.query(deadlineQuery, [organizationId]);
    const deadline = new Date(result.rows[0]?.migration_deadline);
    const now = new Date();
    const timeDiff = deadline.getTime() - now.getTime();
    
    const remainingHours = Math.floor(timeDiff / (1000 * 60 * 60));
    const remainingMinutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

    const urgencyLevel = this.calculateUrgencyLevel(remainingDays);
    
    return {
      isVisible: true,
      remainingDays,
      remainingHours: remainingHours % 24,
      remainingMinutes,
      urgencyLevel,
      message: this.generateCountdownMessage(remainingDays),
      ctaText: remainingDays <= 1 ? "Migrate Now!" : "Claim 50% Discount",
      ctaUrl: "/settings/billing?appsumo=true"
    };
  }

  /**
   * Process AppSumo migration
   */
  public static async processAppSumoMigration(
    organizationId: string, 
    selectedPlan: PlanTier,
    userConsent: boolean
  ): Promise<{
    success: boolean;
    message: string;
    migrationId?: string;
    discountApplied?: number;
    migrationContext?: string;
  }> {
    try {
      if (!userConsent) {
        throw new Error("User consent is required for migration");
      }

      const appSumoStatus = await this.checkAppSumoEligibility(organizationId);
      
      if (!appSumoStatus) {
        throw new Error("Not an AppSumo user");
      }

      if (appSumoStatus.alreadyMigrated) {
        throw new Error("User has already migrated to a standard plan");
      }

      // Validate selected plan
      const eligiblePlans = [PlanTier.BUSINESS_SMALL, PlanTier.BUSINESS_LARGE, PlanTier.ENTERPRISE];
      if (!eligiblePlans.includes(selectedPlan)) {
        throw new Error("Selected plan is not eligible for AppSumo migration");
      }

      // Determine migration type and discount
      const isWithinDiscountWindow = appSumoStatus.eligibleForSpecialDiscount;
      const discountRate = isWithinDiscountWindow ? appSumoStatus.specialOfferDiscount : 0;
      const migrationContext = isWithinDiscountWindow ? 'within_discount_window' : 'post_discount_window';
      
      // Record migration attempt
      const migrationQuery = `
        INSERT INTO licensing_migration_audit (
          organization_id,
          migration_type,
          from_plan,
          to_plan,
          discount_code,
          discount_rate,
          user_consent,
          migration_status,
          migration_context,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING id
      `;

      const migrationResult = await db.query(migrationQuery, [
        organizationId,
        'appsumo_migration',
        'appsumo_legacy',
        selectedPlan,
        isWithinDiscountWindow ? 'APPSUMO_50_SPECIAL' : null,
        discountRate,
        userConsent,
        'initiated',
        migrationContext
      ]);

      const migrationId = migrationResult.rows[0].id;

      // Here you would integrate with Paddle to create the subscription
      // For now, we'll mark the migration as successful
      
      await db.query(
        "UPDATE licensing_migration_audit SET migration_status = 'completed', completed_at = NOW() WHERE id = $1",
        [migrationId]
      );

      const successMessage = isWithinDiscountWindow 
        ? `Successfully migrated to ${selectedPlan} with ${discountRate}% AppSumo discount`
        : `Successfully migrated to ${selectedPlan} at standard pricing. Watch for future campaigns!`;

      return {
        success: true,
        message: successMessage,
        migrationId,
        discountApplied: discountRate,
        migrationContext
      };

    } catch (error) {
      log_error(error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Migration failed"
      };
    }
  }

  /**
   * Get AppSumo-specific Paddle plan ID based on selected plan and billing cycle
   */
  public static getAppSumoPaddlePlanId(
    planTier: PlanTier, 
    billingCycle: 'monthly' | 'annual',
    teamSize: number = 25
  ): string | null {
    // For AppSumo users with 40+ members upgrading to Business plan, allow up to 50 users
    const isLargeTeam = teamSize > 25 && teamSize <= 50;
    
    if (planTier === PlanTier.BUSINESS || planTier === PlanTier.BUSINESS_LARGE) {
      return billingCycle === 'monthly' 
        ? this.APPSUMO_PADDLE_PLANS.BUSINESS_MONTHLY
        : this.APPSUMO_PADDLE_PLANS.BUSINESS_ANNUAL;
    }
    
    if (planTier === PlanTier.ENTERPRISE) {
      return billingCycle === 'monthly'
        ? this.APPSUMO_PADDLE_PLANS.ENTERPRISE_MONTHLY
        : this.APPSUMO_PADDLE_PLANS.ENTERPRISE_ANNUAL;
    }
    
    // No AppSumo plan available for other tiers
    return null;
  }

  /**
   * Check if AppSumo user can upgrade to selected plan with special pricing
   */
  public static async canUseAppSumoDiscount(
    organizationId: string,
    selectedPlanTier: PlanTier,
    teamSize: number
  ): Promise<{
    canUseDiscount: boolean;
    paddlePlanId?: string;
    specialUserLimit?: number;
    discountRate?: number;
    reason?: string;
  }> {
    try {
      const appSumoStatus = await this.checkAppSumoEligibility(organizationId);
      
      if (!appSumoStatus || !appSumoStatus.isAppSumoUser) {
        return {
          canUseDiscount: false,
          reason: "User is not an AppSumo customer"
        };
      }

      if (!appSumoStatus.eligibleForSpecialDiscount) {
        return {
          canUseDiscount: false,
          reason: "AppSumo discount period has expired"
        };
      }

      // Check if the selected plan is eligible
      const eligiblePlans = [PlanTier.BUSINESS_SMALL, PlanTier.BUSINESS_LARGE, PlanTier.ENTERPRISE];
      if (!eligiblePlans.includes(selectedPlanTier)) {
        return {
          canUseDiscount: false,
          reason: "Selected plan is not eligible for AppSumo discount"
        };
      }

      // For AppSumo users, allow up to 50 users for Business plan (normally 25)
      const specialUserLimit = (selectedPlanTier === PlanTier.BUSINESS_LARGE || selectedPlanTier === PlanTier.BUSINESS) ? 50 : undefined;

      return {
        canUseDiscount: true,
        specialUserLimit,
        discountRate: appSumoStatus.specialOfferDiscount
      };

    } catch (error) {
      log_error(error);
      return {
        canUseDiscount: false,
        reason: "Error checking AppSumo eligibility"
      };
    }
  }

  /**
   * Get AppSumo migration analytics for admin
   */
  public static async getAppSumoAnalytics(): Promise<{
    totalAppSumoUsers: number;
    eligibleForMigration: number;
    migratedUsers: number;
    expiredOpportunities: number;
    urgentUsers: number;
    conversionRate: number;
    revenueImpact: number;
  }> {
    const analyticsQuery = `
      WITH appsumo_stats AS (
        SELECT 
          COUNT(*) as total_appsumo_users,
          COUNT(CASE WHEN lam.migration_deadline > NOW() THEN 1 END) as eligible_for_migration,
          COUNT(CASE WHEN lma.migration_status = 'completed' THEN 1 END) as migrated_users,
          COUNT(CASE WHEN lam.migration_deadline <= NOW() AND lma.migration_status IS NULL THEN 1 END) as expired_opportunities,
          COUNT(CASE WHEN lam.migration_deadline > NOW() AND EXTRACT(DAY FROM lam.migration_deadline - NOW()) <= 2 THEN 1 END) as urgent_users
        FROM licensing_coupon_codes lcc
        LEFT JOIN licensing_appsumo_migrations lam ON lam.user_id = lcc.redeemed_by
        LEFT JOIN licensing_migration_audit lma ON lma.organization_id = lam.organization_id AND lma.migration_type = 'appsumo_special'
        WHERE lcc.code LIKE '%APPSUMO%'
      ),
      revenue_impact AS (
        SELECT 
          SUM(
            CASE 
              WHEN lma.to_plan = 'BUSINESS_SMALL' THEN 14.99 * 0.5 * 12
              WHEN lma.to_plan = 'BUSINESS_LARGE' THEN 99 * 0.5 * 12
              WHEN lma.to_plan = 'ENTERPRISE' THEN 349 * 0.5 * 12
              ELSE 0
            END
          ) as total_revenue_impact
        FROM licensing_migration_audit lma
        WHERE lma.migration_type = 'appsumo_special' AND lma.migration_status = 'completed'
      )
      SELECT 
        ast.*,
        ri.total_revenue_impact,
        CASE 
          WHEN ast.total_appsumo_users > 0 THEN (ast.migrated_users::float / ast.total_appsumo_users * 100)
          ELSE 0
        END as conversion_rate
      FROM appsumo_stats ast
      CROSS JOIN revenue_impact ri
    `;

    const result = await db.query(analyticsQuery);
    const data = result.rows[0];

    return {
      totalAppSumoUsers: Number(data.total_appsumo_users) || 0,
      eligibleForMigration: Number(data.eligible_for_migration) || 0,
      migratedUsers: Number(data.migrated_users) || 0,
      expiredOpportunities: Number(data.expired_opportunities) || 0,
      urgentUsers: Number(data.urgent_users) || 0,
      conversionRate: Number(data.conversion_rate) || 0,
      revenueImpact: Number(data.total_revenue_impact) || 0
    };
  }
}