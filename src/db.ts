import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL — KhipuArqueoPro');
});

pool.on('error', (err) => {
  console.error('❌ Error en pool PostgreSQL:', err.message);
});

export default pool;
