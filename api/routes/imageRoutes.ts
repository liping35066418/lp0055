import { Router } from 'express';
import multer from 'multer';
import {
  uploadImage,
  getImageInfo,
  detectDefects,
  startRepair,
  getProgress,
  downloadImage,
  getHistory,
  deleteImage,
} from '../controllers/imageController.js';
import { repairLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

router.post('/upload', upload.single('image'), uploadImage);
router.get('/images', getHistory);
router.get('/images/:id', getImageInfo);
router.post('/images/:id/detect', detectDefects);
router.post('/images/:id/repair', repairLimiter, startRepair);
router.get('/tasks/:taskId/progress', getProgress);
router.get('/images/:id/download', downloadImage);
router.delete('/images/:id', deleteImage);

export default router;
