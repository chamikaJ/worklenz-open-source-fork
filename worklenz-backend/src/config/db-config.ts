export default {
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_NAME as string,
  host: process.env.DB_HOST as string,
  port: +(process.env.DB_PORT as string),
  max: +(process.env.DB_MAX_CLIENTS as string),
  idleTimeoutMillis: 30000,
};
