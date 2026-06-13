import app from './app.js';
import { FileStorage } from './services/FileStorage.js';

const PORT = process.env.PORT || 8715;

FileStorage.init();
FileStorage.startCleanupInterval();

const server = app.listen(PORT, () => {
  console.log(`Image Repair API running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
