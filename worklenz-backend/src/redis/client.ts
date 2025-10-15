import * as redis from "redis";
import { createAdapter } from "@socket.io/redis-adapter";

// Redis client configuration for production
const redisConfig: redis.RedisClientOptions = {
  socket: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  password: process.env.REDIS_PASSWORD,
  database: parseInt(process.env.REDIS_DB || "0"),
};

// Create Redis clients
const client = redis.createClient(redisConfig);
const pubClient = redis.createClient(redisConfig);
const subClient = pubClient.duplicate();

const initRedis = async () => {
  try {
    // Connect main client
    client.on("connect", () => console.log("✓ Redis Client Connected"));
    client.on("error", err => console.error("Redis Client Error:", err));
    await client.connect();

    // Connect pub/sub clients for Socket.IO adapter
    pubClient.on("error", err => console.error("Redis Pub Client Error:", err));
    subClient.on("error", err => console.error("Redis Sub Client Error:", err));
    await pubClient.connect();
    await subClient.connect();

    console.log("✓ Redis initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Redis:", error);
    throw error;
  }
};

// Graceful shutdown
const closeRedis = async () => {
  try {
    await client.quit();
    await pubClient.quit();
    await subClient.quit();
    console.log("Redis connections closed");
  } catch (error) {
    console.error("Error closing Redis connections:", error);
  }
};

// Export clients and adapter
export {
  initRedis,
  closeRedis,
  client as redisClient,
  pubClient,
  subClient,
  createAdapter,
};
