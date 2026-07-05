import dotenv from 'dotenv';
dotenv.config();
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'pos-cafe',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit', quality: 'auto' }],
  },
});

const multerUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
});

const upload = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    multerUpload.single('image')(req, res, (err) => {
      if (err) {
        console.error('Multer upload error:', err.message);
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  } else {
    next();
  }
};

export { upload };
