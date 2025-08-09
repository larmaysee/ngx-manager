/**
 * local server entry file, for local development
 */
import app from './app';
import { renewalScheduler } from './services/renewalScheduler.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);

  // Start the SSL certificate renewal scheduler
  renewalScheduler.start();
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