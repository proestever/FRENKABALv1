import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create a connection pool with improved settings for long-running applications
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed (30 seconds)
  connectionTimeoutMillis: 2000, // How long to wait for a connection (2 seconds)
  allowExitOnIdle: true // Allow clients to exit the pool on idle timeout
});

// Handle pool errors to prevent application crashes
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
  // Don't crash the server, just log the error
});

// Setup a regular health check to prevent idle timeout disconnections
const healthCheckInterval = 60000; // 1 minute
setInterval(() => {
  pool.query('SELECT 1').catch(err => {
    console.error('Database health check failed:', err);
  });
}, healthCheckInterval);

export const db = drizzle(pool, { schema });