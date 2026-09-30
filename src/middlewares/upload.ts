import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/** In-memory multer instance — buffers are streamed straight to Cloudinary. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 }, // 5MB each, up to 8
  fileFilter(_req, file, cb) {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest('Only JPEG, PNG, WebP or AVIF images are allowed'));
  },
});
