import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL — KhipuArqueoPro');
});

pool.on('error', (err) => {
  console.error('❌ Error en pool PostgreSQL:', err.message);
});

export default pool;