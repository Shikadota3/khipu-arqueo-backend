import express from 'express';
import cors    from 'cors';
import dotenv  from 'dotenv';
import path    from 'path';

import authRouter    from './routes/auth';
import usersRouter   from './routes/users';
import arqueosRouter from './routes/arqueos';
import ticketsRouter from './routes/tickets';
import excelRouter   from './routes/excel';

dotenv.config({ path: path.join(__dirname, '../../.env') })
const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'https://arqueo.khipu.plus',
      'http://arqueo.khipu.plus',
      'http://localhost:5173',
      process.env.FRONTEND_URL,
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) return callback(null, true);
    callback(new Error('CORS no permitido: ' + origin));
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth',    authRouter);
app.use('/api/users',   usersRouter);
app.use('/api/arqueos', arqueosRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/excel',   excelRouter);

app.get('/api/health', (_req, res) =>
  res.json({ status: 'OK', version: '4.2.0', app: 'KHIPU Arqueo Pro' }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist'), {
    etag: false,
    lastModified: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║     KHIPU ARQUEO PRO v4.2 — Backend API      ║');
  console.log('║          Corporación Khipu · 2026            ║');
  console.log(`║      Corriendo en http://localhost:${PORT}      ║`);
  console.log('╚══════════════════════════════════════════════╝\n');
});

export default app;
