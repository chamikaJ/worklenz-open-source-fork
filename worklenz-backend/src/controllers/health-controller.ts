import { Request, Response } from "express";
import db from "../config/db";
import { redisClient } from "../redis/client";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

/**
 * Health check endpoints for monitoring and load balancer probes
 */
class HealthController {
  /**
   * Liveness probe - checks if application is running
   * Returns 200 if app is alive, regardless of dependency status
   * Used by: Docker healthcheck, Kubernetes liveness probe
   */
  public static async liveness(req: Request, res: Response) {
    return res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }

  /**
   * Readiness probe - checks if application is ready to serve traffic
   * Validates all critical dependencies (database, redis, storage)
   * Returns 200 only if all dependencies are healthy
   * Used by: Kubernetes readiness probe, load balancer health checks
   */
  public static async readiness(req: Request, res: Response) {
    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {} as any,
    };

    let allHealthy = true;

    // Check Database
    try {
      await db.query("SELECT 1");
      health.services.database = { status: "healthy", type: "PostgreSQL" };
    } catch (error: any) {
      allHealthy = false;
      health.services.database = {
        status: "unhealthy",
        error: error.message,
      };
    }

    // Check Redis
    try {
      if (redisClient.isOpen) {
        await redisClient.ping();
        health.services.redis = { status: "healthy" };
      } else {
        health.services.redis = { status: "disconnected" };
        allHealthy = false;
      }
    } catch (error: any) {
      allHealthy = false;
      health.services.redis = { status: "unhealthy", error: error.message };
    }

    // Check Storage (MinIO/S3)
    try {
      const storageHealthy = await HealthController.checkStorageHealth();
      health.services.storage = storageHealthy
        ? { status: "healthy", provider: process.env.STORAGE_PROVIDER || "minio" }
        : { status: "unhealthy" };
      
      if (!storageHealthy) allHealthy = false;
    } catch (error: any) {
      allHealthy = false;
      health.services.storage = {
        status: "unhealthy",
        error: error.message,
      };
    }

    health.status = allHealthy ? "ok" : "degraded";

    return res.status(allHealthy ? 200 : 503).json(health);
  }

  /**
   * Detailed health status - comprehensive system health check
   * Returns detailed information about all services and system resources
   */
  public static async status(req: Request, res: Response) {
    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.WORKLENZ_VERSION || "unknown",
      environment: process.env.NODE_ENV || "development",
      uptime: process.uptime(),
      memory: {
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
      },
      services: {} as any,
    };

    let allHealthy = true;

    // Database Health
    try {
      const dbStart = Date.now();
      await db.query("SELECT 1");
      const dbLatency = Date.now() - dbStart;
      
      const poolStats = db.pool.totalCount;
      health.services.database = {
        status: "healthy",
        type: "PostgreSQL",
        latency: `${dbLatency}ms`,
        connections: {
          total: poolStats,
          idle: db.pool.idleCount,
          waiting: db.pool.waitingCount,
        },
      };
    } catch (error: any) {
      allHealthy = false;
      health.services.database = {
        status: "unhealthy",
        error: error.message,
      };
    }

    // Redis Health
    try {
      if (redisClient.isOpen) {
        const redisStart = Date.now();
        await redisClient.ping();
        const redisLatency = Date.now() - redisStart;
        
        health.services.redis = {
          status: "healthy",
          latency: `${redisLatency}ms`,
          host: process.env.REDIS_HOST || "localhost",
          port: process.env.REDIS_PORT || "6379",
        };
      } else {
        health.services.redis = { status: "disconnected" };
        allHealthy = false;
      }
    } catch (error: any) {
      allHealthy = false;
      health.services.redis = { status: "unhealthy", error: error.message };
    }

    // Storage Health
    try {
      const storageStart = Date.now();
      const storageHealthy = await HealthController.checkStorageHealth();
      const storageLatency = Date.now() - storageStart;
      
      health.services.storage = storageHealthy
        ? {
            status: "healthy",
            provider: process.env.STORAGE_PROVIDER || "minio",
            latency: `${storageLatency}ms`,
            bucket: process.env.S3_BUCKET || process.env.MINIO_BUCKET,
          }
        : { status: "unhealthy" };
      
      if (!storageHealthy) allHealthy = false;
    } catch (error: any) {
      allHealthy = false;
      health.services.storage = {
        status: "unhealthy",
        error: error.message,
      };
    }

    health.status = allHealthy ? "healthy" : "degraded";

    return res.status(allHealthy ? 200 : 503).json(health);
  }

  /**
   * Check storage backend health (MinIO/S3/Azure)
   */
  private static async checkStorageHealth(): Promise<boolean> {
    try {
      const provider = process.env.STORAGE_PROVIDER || "minio";

      if (provider === "minio" || provider === "s3") {
        const s3Client = new S3Client({
          region: process.env.S3_REGION || "us-east-1",
          endpoint: process.env.S3_ENDPOINT || process.env.S3_URL,
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
          },
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" || provider === "minio",
        });

        const bucketName = process.env.S3_BUCKET || process.env.MINIO_BUCKET || "worklenz-bucket";
        
        // Check if bucket exists and is accessible
        const command = new HeadBucketCommand({ Bucket: bucketName });
        await s3Client.send(command);
        
        return true;
      }

      // Add Azure Blob Storage check if needed
      if (provider === "azure") {
        // TODO: Implement Azure health check
        return true;
      }

      return true;
    } catch (error) {
      console.error("Storage health check failed:", error);
      return false;
    }
  }

  /**
   * Metrics endpoint (for Prometheus/monitoring - future enhancement)
   */
  public static async metrics(req: Request, res: Response) {
    // TODO: Implement Prometheus metrics format
    return res.status(501).json({
      message: "Metrics endpoint not implemented yet",
    });
  }
}

export default HealthController;
