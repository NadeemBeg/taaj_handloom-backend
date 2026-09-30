import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';
import { ApiError } from '../utils/ApiError.js';

/** Cloudinary is optional — uploads are disabled until all three keys are set. */
export const cloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface UploadedImage {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
}

const FOLDER = 'taaj-handloom';

/** Upload a file buffer to Cloudinary and return its URL + publicId. */
export function uploadImageBuffer(buffer: Buffer, folder = FOLDER): Promise<UploadedImage> {
  if (!cloudinaryConfigured) {
    return Promise.reject(new ApiError(503, 'Image uploads are not configured'));
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', transformation: [{ quality: 'auto', fetch_format: 'auto' }] },
      (error, result) => {
        if (error || !result) return reject(new ApiError(502, 'Image upload failed'));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
        });
      },
    );
    stream.end(buffer);
  });
}

/** Delete an image from Cloudinary by publicId (best-effort). */
export async function deleteImage(publicId: string): Promise<void> {
  if (!cloudinaryConfigured || !publicId) return;
  await cloudinary.uploader.destroy(publicId).catch(() => undefined);
}
