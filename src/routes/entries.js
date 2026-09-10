import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { upload, UPLOADS_ROOT } from '../uploadConfig.js';

const router = Router();
router.use(requireAuth);

// mysql2 auto-parses native JSON columns into JS values already, but guard
// against either shape (string or already-parsed) so this doesn't break if
// the driver version or column type ever changes.
function asJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value; // already an object/array
}

// Formats a MySQL DATE value as YYYY-MM-DD using its own calendar fields —
// never via toISOString(), which reinterprets the value in UTC and can
// shift the date by one day depending on the server's/driver's timezone
// configuration. A DATE column has no time-of-day or timezone component;
// treating it as one is exactly the bug that caused entries to appear
// under the wrong day for users east of UTC.
function formatDateOnly(value) {
  if (value == null) return value;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return value; // already a 'YYYY-MM-DD' string
}

function rowToEntry(row) {
  return {
    id: row.id,
    localId: row.local_id,
    contactName: row.contact_name,
    companyName: row.company_name,
    phones: asJson(row.phones, []),
    email: row.email,
    wechat: row.wechat,
    address: row.address,
    cardPhotoPaths: asJson(row.card_photo_paths, []),
    // Each element: { photoPath, priceTiers: [{quantity,price,unit}], remarks }
    products: asJson(row.products, []),
    remarks: row.remarks, // general meeting notes, not tied to any one product
    entryDate: formatDateOnly(row.entry_date),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/entries — all entries for the logged-in user, newest first
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM entries WHERE user_id = ? ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(rows.map(rowToEntry));
  } catch (err) {
    console.error('List entries error:', err);
    res.status(500).json({ error: 'Failed to load entries' });
  }
});

// POST /api/entries — create or update-by-localId (upsert)
//
// multipart/form-data fields:
//   localId, contactName, companyName, phones (JSON string), email, wechat,
//   address, remarks, entryDate — plain text fields, same as before.
//
//   cardPhoto — 0+ files (business card photos, unchanged from before).
//
//   productsMeta — a JSON string: an array of { priceTiers, remarks,
//     hasNewPhoto, existingPhotoPath } objects, ONE PER PRODUCT, in the
//     same order the corresponding productPhoto files are attached (for
//     entries whose photo hasn't changed since last sync, hasNewPhoto is
//     false and existingPhotoPath carries the path already on the server —
//     this lets a retry avoid re-uploading a file that's already there).
//
//   productPhoto — 0+ files, in order, one per product entry in
//     productsMeta where hasNewPhoto is true.
router.post(
  '/',
  upload.fields([
    { name: 'cardPhoto', maxCount: 5 },
    { name: 'productPhoto', maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      const b = req.body;
      const localId = b.localId;
      if (!localId) return res.status(400).json({ error: 'localId is required' });

      const cardFiles = req.files?.cardPhoto || [];
      const cardPhotoPaths = cardFiles.length
        ? cardFiles.map((f) => `cards/${f.filename}`)
        : b.cardPhotoPaths
        ? JSON.parse(b.cardPhotoPaths)
        : [];

      const productFiles = req.files?.productPhoto || [];
      const productsMeta = b.productsMeta ? JSON.parse(b.productsMeta) : [];

      // Walk productsMeta in order, pulling the next uploaded file for each
      // slot that needs one, so files line up correctly with their
      // matching price/remarks even though multer delivers files as one
      // flat array separate from the text fields.
      let fileCursor = 0;
      const products = productsMeta.map((meta) => {
        let photoPath;
        if (meta.hasNewPhoto) {
          const file = productFiles[fileCursor++];
          photoPath = file ? `products/${file.filename}` : meta.existingPhotoPath || null;
        } else {
          photoPath = meta.existingPhotoPath || null;
        }
        return {
          photoPath,
          priceTiers: Array.isArray(meta.priceTiers) ? meta.priceTiers : [],
          remarks: meta.remarks || '',
        };
      });

      const phones = b.phones ? JSON.parse(b.phones) : [];

      // Upsert by local_id: if the same device re-syncs the same entry
      // (e.g. after an edit), update instead of duplicating.
      const [existing] = await pool.query(
        'SELECT id FROM entries WHERE local_id = ? AND user_id = ?',
        [localId, req.userId]
      );

      if (existing.length) {
        await pool.query(
          `UPDATE entries SET
            contact_name=?, company_name=?, phones=?, email=?, wechat=?, address=?,
            card_photo_paths=?, products=?, remarks=?, entry_date=?
           WHERE local_id=? AND user_id=?`,
          [
            b.contactName || '', b.companyName || '', JSON.stringify(phones),
            b.email || '', b.wechat || '', b.address || '',
            JSON.stringify(cardPhotoPaths), JSON.stringify(products),
            b.remarks || '', b.entryDate,
            localId, req.userId,
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO entries
            (local_id, user_id, contact_name, company_name, phones, email, wechat, address,
             card_photo_paths, products, remarks, entry_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            localId, req.userId,
            b.contactName || '', b.companyName || '', JSON.stringify(phones),
            b.email || '', b.wechat || '', b.address || '',
            JSON.stringify(cardPhotoPaths), JSON.stringify(products),
            b.remarks || '', b.entryDate,
          ]
        );
      }

      const [rows] = await pool.query('SELECT * FROM entries WHERE local_id = ? AND user_id = ?', [
        localId,
        req.userId,
      ]);
      res.status(201).json(rowToEntry(rows[0]));
    } catch (err) {
      console.error('Create/update entry error:', err);
      res.status(500).json({ error: 'Failed to save entry' });
    }
  }
);

// DELETE /api/entries/:localId
router.delete('/:localId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM entries WHERE local_id = ? AND user_id = ?',
      [req.params.localId, req.userId]
    );
    const entry = rows[0];
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    // best-effort file cleanup; don't fail the request if a file is already gone
    const productPaths = asJson(entry.products, []).map((p) => p.photoPath).filter(Boolean);
    const filesToRemove = [...asJson(entry.card_photo_paths, []), ...productPaths].filter(Boolean);
    for (const relPath of filesToRemove) {
      fs.unlink(path.join(UPLOADS_ROOT, relPath)).catch(() => {});
    }

    await pool.query('DELETE FROM entries WHERE local_id = ? AND user_id = ?', [
      req.params.localId,
      req.userId,
    ]);
    res.status(204).send();
  } catch (err) {
    console.error('Delete entry error:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

export default router;