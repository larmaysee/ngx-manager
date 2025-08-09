/**
 * local server entry file, for local development
 */
import app from './app.js';
import { renewalScheduler } from './services/renewalScheduler.js';
import { initializeDatabase } from './config/database.js';

/**
 * start server with port
 */

console.log('SERVER_PORT:', process.env.SERVER_PORT);

const PORT = process.env.SERVER_PORT || 5000;

const server = app.listen(PORT, async () => {
  console.log(`Server ready on port ${PORT}`);

  try {
    // Ensure database is fully initialized before starting scheduler
    await initializeDatabase();

    // Start the SSL certificate renewal scheduler after database is ready
    renewalScheduler.start();
  } catch (error) {
    console.error('Failed to initialize database, scheduler not started:', error);
  }
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');

  // Stop the renewal scheduler
  renewalScheduler.stop();

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');

  // Stop the renewal scheduler
  renewalScheduler.stop();

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;