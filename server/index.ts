import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Health monitoring and graceful shutdown
let isShuttingDown = false;
let connections = new Set();

// Process monitoring
const processStartTime = Date.now();
let lastHealthCheck = Date.now();

// Memory monitoring
const logMemoryUsage = () => {
  const used = process.memoryUsage();
  const mb = (bytes: number) => Math.round(bytes / 1024 / 1024 * 100) / 100;
  
  console.log(`Memory Usage: RSS: ${mb(used.rss)}MB, Heap Used: ${mb(used.heapUsed)}MB, Heap Total: ${mb(used.heapTotal)}MB, External: ${mb(used.external)}MB`);
  
  // Alert if memory usage is high
  if (used.heapUsed > 300 * 1024 * 1024) { // 300MB threshold
    console.warn(`⚠️  High memory usage detected: ${mb(used.heapUsed)}MB heap used`);
  }
};

// Periodic health checks
setInterval(() => {
  lastHealthCheck = Date.now();
  logMemoryUsage();
}, 30000); // Every 30 seconds

// Graceful shutdown handlers
const gracefulShutdown = (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  isShuttingDown = true;
  
  setTimeout(() => {
    console.log('🔄 Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
  
  // Close all connections
  connections.forEach((connection: any) => {
    connection.destroy();
  });
  
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
  
  // Log memory usage during crash
  logMemoryUsage();
  
  // Try to gracefully shutdown
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Log memory usage during crash
  logMemoryUsage();
  
  // Try to gracefully shutdown
  gracefulShutdown('unhandledRejection');
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static assets from the public directory
app.use('/assets', express.static(path.join(process.cwd(), 'public/assets')));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Enhanced health check endpoint with detailed monitoring
  app.get('/api/health', (_req, res) => {
    if (isShuttingDown) {
      return res.status(503).json({ 
        status: 'shutting_down',
        message: 'Server is shutting down'
      });
    }

    const uptime = Date.now() - processStartTime;
    const used = process.memoryUsage();
    const mb = (bytes: number) => Math.round(bytes / 1024 / 1024 * 100) / 100;

    res.status(200).json({
      status: 'healthy',
      uptime: uptime,
      uptimeFormatted: `${Math.floor(uptime / (1000 * 60 * 60))}h ${Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60))}m`,
      memory: {
        rss: `${mb(used.rss)}MB`,
        heapUsed: `${mb(used.heapUsed)}MB`,
        heapTotal: `${mb(used.heapTotal)}MB`,
        external: `${mb(used.external)}MB`
      },
      lastHealthCheck: new Date(lastHealthCheck).toISOString(),
      connections: connections.size,
      timestamp: new Date().toISOString()
    });
  });

  // Add system status endpoint
  app.get('/api/status', (_req, res) => {
    const uptime = Date.now() - processStartTime;
    res.json({
      server: 'online',
      uptime: uptime,
      version: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV || 'development'
    });
  });
  
  // Cache statistics endpoint
  app.get('/api/cache-stats', async (_req, res) => {
    try {
      const { tokenCache } = await import('./services/token-cache.js');
      const stats = tokenCache.getStats();
      
      res.json({
        status: 'ok',
        cacheStats: stats,
        message: `Caching ${stats.walletCacheSize} wallets and ${stats.metadataCacheSize} token metadata entries`
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'error',
        message: 'Failed to get cache statistics'
      });
    }
  });

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Track connections for graceful shutdown
  server.on('connection', (connection) => {
    connections.add(connection);
    connection.on('close', () => {
      connections.delete(connection);
    });
  });

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`🚀 Server started successfully on port ${port}`);
    log(`📊 Health check available at /api/health`);
    log(`📈 System status available at /api/status`);
    logMemoryUsage();
  });
})();
