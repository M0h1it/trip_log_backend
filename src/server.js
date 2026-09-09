import express from 'express';
import cors from 'cors';
import path from 'path';
import 'dotenv/config';
import { verifyConnection } from './db.js';
import authRoutes from './routes/auth.js';
import entriesRoutes from './routes/entries.js';
import { UPLOADS_ROOT } from './uploadConfig.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Restrict CORS to your deployed frontend origin in production. Comma-separate
// multiple origins in .env if you test from both a dev server and the live site.
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim());
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  })
);

app.use(express.json({ limit: '2mb' }));

// Serve uploaded photos back out. In production, prefer letting your web
// server (Apache/nginx via Hostinger) serve this folder directly for
// performance — this Express route is a functional fallback either way.
app.use('/uploads', express.static(UPLOADS_ROOT));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/entries', entriesRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err.message?.includes('Only image files')) {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Photo too large (max 8MB)' });
  }
  res.status(500).json({ error: 'Server error' });
});

async function start() {
  try {
    await verifyConnection();
    console.log('Connected to MySQL.');
  } catch (err) {
    console.error('Could not connect to MySQL. Check .env DB_* values.', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Trip Log API running on port ${PORT}`);
  });
}

start();
