import mysql from 'mysql2/promise';
import 'dotenv/config';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Fails fast and loud at startup if the DB is unreachable, instead of every
// request silently timing out later.
export async function verifyConnection() {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
}
