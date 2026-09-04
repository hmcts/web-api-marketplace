#!/usr/bin/env node
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';

import { app } from './app';
import { Logger } from './modules/logging';

const logger = Logger.getLogger('server');

/**
 * Whichever server is actually listening — https in development, plain http elsewhere.
 *
 * Both are held here because shutdown has to close the one that exists. Holding only the
 * https one meant that in production, where the http branch runs, shutdown closed nothing
 * and never reached process.exit: the service logged "Shutting down application" and then
 * kept listening, surviving Ctrl-C and SIGTERM alike and needing SIGKILL.
 */
let server: http.Server | https.Server | null = null;

/** Set once, so repeated signals do not each schedule their own shutdown. */
let shuttingDown = false;

// used by shutdownCheck in readinessChecks
app.locals.shutdown = false;

const port: number = parseInt(process.env.PORT || '3344', 10);

/** How long to keep serving after readiness goes down, so load balancers stop sending work. */
const DRAIN_MS = 4000;

/** How long to wait for open connections to finish before exiting regardless. */
const FORCE_EXIT_MS = 10000;

if (app.locals.ENV === 'development') {
  const sslDirectory = path.join(__dirname, 'resources', 'localhost-ssl');
  const sslOptions = {
    cert: fs.readFileSync(path.join(sslDirectory, 'localhost.crt')),
    key: fs.readFileSync(path.join(sslDirectory, 'localhost.key')),
  };
  server = https.createServer(sslOptions, app);
  server.listen(port, () => {
    logger.info(`Application started: https://localhost:${port}`);
  });
} else {
  server = app.listen(port, () => {
    logger.info(`Application started: http://localhost:${port}`);
  });
}

function gracefulShutdownHandler(signal: string) {
  if (shuttingDown) {
    logger.info(`⚠️ Caught ${signal} while already shutting down, ignoring`);
    return;
  }
  shuttingDown = true;

  logger.info(`⚠️ Caught ${signal}, gracefully shutting down. Setting readiness to DOWN`);
  // stop the server from accepting new connections
  app.locals.shutdown = true;

  setTimeout(() => {
    logger.info('Shutting down application');

    if (!server) {
      process.exit(0);
      return;
    }

    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // close() waits for in-flight requests, and a keep-alive connection that never sends
    // another one would keep it waiting indefinitely. Hang up on idle sockets, then exit
    // regardless if anything is still holding on.
    server.closeIdleConnections?.();

    setTimeout(() => {
      logger.error(`Connections still open after ${FORCE_EXIT_MS}ms, exiting anyway`);
      process.exit(1);
    }, FORCE_EXIT_MS).unref();
  }, DRAIN_MS);
}

process.on('SIGINT', gracefulShutdownHandler);
process.on('SIGTERM', gracefulShutdownHandler);
