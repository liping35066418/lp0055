import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import imageRoutes from './routes/imageRoutes.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { FileStorage } from './services/FileStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
FileStorage.init();

const app: express.Application = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(globalLimiter);

const PROJECT_ROOT = path.resolve(__dirname, '..');

app.use('/uploads', express.static(path.join(PROJECT_ROOT, 'uploads')));
app.use('/outputs', express.static(path.join(PROJECT_ROOT, 'outputs')));

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'ok',
    timestamp: Date.now(),
  });
});

app.use('/api', imageRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
