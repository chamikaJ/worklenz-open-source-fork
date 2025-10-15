import session from "express-session";
import RedisStore from "connect-redis";
import { redisClient } from "../redis/client";

/**
 * Create Redis session store
 * Used as an alternative to PostgreSQL sessions for better performance
 */
export function createRedisSessionStore() {
  return new RedisStore({
    client: redisClient,
    prefix: "worklenz:session:",
    ttl: 30 * 24 * 60 * 60, // 30 days in seconds
  });
}

/**
 * Check if Redis should be used for sessions
 * Defaults to PostgreSQL for backward compatibility
 */
export function useRedisForSessions(): boolean {
  return process.env.REDIS_SESSION_STORE === "true";
}
