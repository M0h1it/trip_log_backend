import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

for (const sub of ['cards', 'products']) {
  fs.mkdirSync(path.join(UPLOADS_ROOT, sub), { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = file.fieldname === 'cardPhoto' ? 'cards' : 'products';
    cb(null, path.join(UPLOADS_ROOT, sub));
  },
  filename: (req, file, cb) => {
    const id = crypto.randomUUID();
    cb(null, `${id}.jpg`);
  },
});

function fileFilter(req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed'));
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per photo, generous for compressed JPEGs
});

export { UPLOADS_ROOT };
