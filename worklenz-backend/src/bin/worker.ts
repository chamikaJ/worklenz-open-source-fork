#!/usr/bin/env node

/**
 * Worklenz Background Worker Service
 * 
 * This service handles background jobs and cron tasks separately from the API server.
 * Running workers separately allows for better scalability and resource isolation.
 * 
 * Responsibilities:
 * - Email notifications (daily/weekly digests)
 * - Recurring task automation
 * - Report generation
 * - Data cleanup and maintenance
 * - Long-running background tasks
 */

// Config must be imported first
import "./config";

import { initRedis, closeRedis } from "../redis/client";
import { startCronJobs } from "../cron_jobs";
import db from "../config/db";

// Worker service lifecycle management
class WorkerService {
  private static isShuttingDown = false;

  public static async start() {
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║        Worklenz Background Worker Service               ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log();
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`Worker Mode: Enabled`);
    console.log();

    try {
      // Initialize Redis connection
      console.log("⏳ Initializing Redis...");
      await initRedis();
      console.log("✓ Redis connected");

      // Test database connection
      console.log("⏳ Connecting to database...");
      await db.query("SELECT 1");
      console.log("✓ Database connected");

      // Start cron jobs based on configuration
      console.log();
      console.log("Starting background jobs...");
      
      if (process.env.ENABLE_EMAIL_CRONJOBS === "true") {
        console.log("✓ Email cron jobs enabled");
      }
      
      if (process.env.ENABLE_RECURRING_JOBS === "true") {
        console.log("✓ Recurring tasks automation enabled");
        console.log(`  Schedule: ${process.env.RECURRING_JOBS_INTERVAL || "0 11 */1 * 1-5"}`);
      }

      // Start all cron jobs
      startCronJobs();

      console.log();
      console.log("✓ Worker service started successfully");
      console.log();
      console.log("Worker is now running. Press CTRL+C to stop.");

      // Health check interval - log status every 5 minutes
      setInterval(() => {
        if (!this.isShuttingDown) {
          console.log(`[${new Date().toISOString()}] Worker alive - Uptime: ${Math.floor(process.uptime())}s`);
        }
      }, 5 * 60 * 1000); // 5 minutes

    } catch (error) {
      console.error("Failed to start worker service:", error);
      process.exit(1);
    }
  }

  public static async shutdown(signal: string) {
    if (this.isShuttingDown) {
      console.log("Shutdown already in progress...");
      return;
    }

    this.isShuttingDown = true;

    console.log();
    console.log(`Received ${signal} - Starting graceful shutdown...`);

    try {
      // Close Redis connections
      console.log("⏳ Closing Redis connections...");
      await closeRedis();
      console.log("✓ Redis connections closed");

      // Close database pool
      console.log("⏳ Closing database pool...");
      await db.pool.end();
      console.log("✓ Database pool closed");

      console.log("✓ Worker service stopped gracefully");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  }
}

// Handle graceful shutdown
process.on("SIGTERM", () => WorkerService.shutdown("SIGTERM"));
process.on("SIGINT", () => WorkerService.shutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  WorkerService.shutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit on unhandled rejection, just log it
});

// Start the worker service
WorkerService.start().catch((error) => {
  console.error("Fatal error starting worker:", error);
  process.exit(1);
});
