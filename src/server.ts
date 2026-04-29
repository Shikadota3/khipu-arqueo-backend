import express from 'express';
import cors    from 'cors';
import dotenv  from 'dotenv';
import path    from 'path';

import authRouter    from './routes/auth';
import usersRouter   from './routes/users';
import arqueosRouter from './routes/arqueos';
import ticketsRouter from './routes/tickets';
import excelRouter   from './routes/excel';

dotenv.config();
const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
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
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html')));
}

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║     KHIPU ARQUEO PRO v4.2 — Backend API      ║');
  console.log('║          Corporación Khipu · 2026            ║');
  console.log(`║      Corriendo en http://localhost:${PORT}      ║`);
  console.log('╚══════════════════════════════════════════════╝\n');
});

export default app;
