import { Router } from 'express';
import multer from 'multer';
import { MediaValidationError } from './media.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function createMediaRouter(mediaStore) {
  const router = Router();

  router.post('/', upload.single('file'), async (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }
    try {
      const result = await mediaStore.save(req.file.buffer, req.file.mimetype);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof MediaValidationError) {
        return res.status(415).json({ error: err.message });
      }
      next(err);
    }
  });

  // Multer / Express error handler — catches the limits.fileSize error etc.
  // eslint-disable-next-line no-unused-vars
  router.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return router;
}
