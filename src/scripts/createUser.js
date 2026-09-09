// Run with: npm run create-user -- your@email.com yourPassword
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import 'dotenv/config';

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: npm run create-user -- <email> <password>');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password should be at least 8 characters.');
  process.exit(1);
}

try {
  const hash = await bcrypt.hash(password, 10);
  await pool.query('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hash]);
  console.log(`User created: ${email}`);
} catch (err) {
  if (err.code === 'ER_DUP_ENTRY') {
    console.error('A user with that email already exists.');
  } else {
    console.error('Failed to create user:', err.message);
  }
  process.exit(1);
} finally {
  await pool.end();
}
