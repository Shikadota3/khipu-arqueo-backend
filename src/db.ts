import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 30,                        // valor provisional, lo ajustamos según el dato de abajo
  min: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL — KhipuArqueoPro');
});

pool.on('error', (err) => {
  console.error('❌ Error en pool PostgreSQL:', err.message);
});

export default pool;