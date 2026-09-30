import { Router } from 'express';
import type { Request, Response } from 'express';
import { uploadImageBuffer, deleteImage, cloudinaryConfigured } from '../../config/cloudinary.js';
import { imageUpload } from '../../middlewares/upload.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';

const singleHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No image provided');
  const image = await uploadImageBuffer(req.file.buffer);
  sendSuccess(res, { image }, 'Image uploaded', 201);
});

const multiHandler = asyncHandler(async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw ApiError.badRequest('No images provided');
  const images = await Promise.all(files.map((f) => uploadImageBuffer(f.buffer)));
  sendSuccess(res, { images }, 'Images uploaded', 201);
});

const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteImage(req.body.publicId);
  sendSuccess(res, null, 'Image deleted');
});

const statusHandler = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, { configured: cloudinaryConfigured }, 'Upload status');
});

const router = Router();
const guard = [authenticate, authorize('ADMIN', 'INVENTORY_MANAGER')];

router.get('/status', ...guard, statusHandler);
router.post('/image', ...guard, imageUpload.single('image'), singleHandler);
router.post('/images', ...guard, imageUpload.array('images', 8), multiHandler);
router.delete('/image', ...guard, deleteHandler);

export default router;
