import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db';
import { signToken } from '../middleware/auth';
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
const router = Router();

// POST /api/auth/setup — crear empresa + auditor
router.post('/setup', async (req: Request, res: Response) => {
  const { nombre, ruc, rubro, direccion, telefono, pinAdmin } = req.body;
  if (!nombre || !ruc || !rubro || !pinAdmin)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  if (!/^\d{11}$/.test(ruc))
    return res.status(400).json({ error: 'RUC debe tener exactamente 11 dígitos' });
  if (pinAdmin.length < 4)
    return res.status(400).json({ error: 'PIN mínimo 4 dígitos' });

  const client = await pool.connect();
  try {
    const exists = await client.query('SELECT empresa_id FROM empresas WHERE ruc=$1', [ruc]);
    if (exists.rows.length > 0)
      return res.status(409).json({ error: 'Ya existe una empresa con ese RUC' });

    const hash = await bcrypt.hash(pinAdmin, 10);
    await client.query('BEGIN');

    const eRes = await client.query(
      `INSERT INTO empresas (nombre, ruc, rubro, direccion, telefono, pin_admin)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING empresa_id`,
      [nombre, ruc, rubro, direccion || '', telefono || '', hash]
    );
    const empresaId = eRes.rows[0].empresa_id;

    const uRes = await client.query(
      `INSERT INTO usuarios (empresa_id, nombre_completo, apellidos, rol, pin, telefono, direccion)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING usuario_id`,
      [empresaId, nombre, '', 'AUDITOR', hash, telefono || '', direccion || '']
    );
    const usuarioId = uRes.rows[0].usuario_id;

    await client.query('COMMIT');

    const token = signToken({ usuarioId, empresaId, rol: 'AUDITOR', nombre });
    return res.status(201).json({
      token,
      empresa: { empresaId, nombre, ruc, rubro },
      usuario: { usuarioId, nombre, rol: 'AUDITOR' },
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { empresaRuc, nombre, pin } = req.body;
  if (!empresaRuc || !nombre || !pin)
    return res.status(400).json({ error: 'RUC, nombre y PIN son obligatorios' });
  try {
    const eRes = await pool.query(
      'SELECT empresa_id, nombre FROM empresas WHERE ruc=$1 AND activo=TRUE',
      [empresaRuc]
    );
    if (!eRes.rows[0])
      return res.status(404).json({ error: 'Empresa no encontrada' });
    const empresa = eRes.rows[0];

    const uRes = await pool.query(
      `SELECT usuario_id, nombre_completo, apellidos, rol, pin, numero_caja, telefono, direccion
       FROM usuarios WHERE empresa_id=$1 AND nombre_completo=$2 AND activo=TRUE`,
      [empresa.empresa_id, nombre]
    );
    if (!uRes.rows[0])
      return res.status(401).json({ error: 'Usuario no encontrado' });
    const u = uRes.rows[0];

    if (!await bcrypt.compare(pin, u.pin))
      return res.status(401).json({ error: 'PIN incorrecto' });

    const token = signToken({
      usuarioId:  u.usuario_id,
      empresaId:  empresa.empresa_id,
      rol:        u.rol,
      nombre:     u.nombre_completo,
      apellidos:  u.apellidos,
      numeroCaja: u.numero_caja,
    });

    return res.json({
      token,
      empresa: { empresaId: empresa.empresa_id, nombre: empresa.nombre, ruc: empresaRuc },
      usuario: {
        usuarioId:  u.usuario_id,
        nombre:     u.nombre_completo,
        apellidos:  u.apellidos,
        rol:        u.rol,
        numeroCaja: u.numero_caja,
        telefono:   u.telefono,
        direccion:  u.direccion,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/empresa/:ruc
router.get('/empresa/:ruc', async (req: Request, res: Response) => {
  try {
    const r = await pool.query(
      'SELECT empresa_id, nombre, rubro FROM empresas WHERE ruc=$1 AND activo=TRUE',
      [req.params.ruc]
    );
    return res.json(
      r.rows[0]
        ? { exists: true,  empresa: r.rows[0] }
        : { exists: false }
    );
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
// GET /api/auth/empresas — lista todas las empresas (para el selector del login)
router.get('/empresas', async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(
      'SELECT empresa_id, nombre, ruc, rubro FROM empresas WHERE activo=TRUE ORDER BY nombre ASC'
    );
    return res.json(r.rows);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// GET /api/auth/empresas/:empresaId/usuarios — usuarios de una empresa (para el selector)
router.get('/empresas/:empresaId/usuarios', async (req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT usuario_id, nombre_completo, apellidos, rol, numero_caja
       FROM usuarios WHERE empresa_id=$1 AND activo=TRUE
       ORDER BY rol DESC, nombre_completo ASC`,
      [parseInt(req.params.empresaId)]
    );
    return res.json(r.rows);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});
// POST /api/auth/forgot-pin
router.post('/forgot-pin', async (req: Request, res: Response) => {
  const { ruc, nombreUsuario } = req.body;
  if (!ruc || !nombreUsuario)
    return res.status(400).json({ error: 'RUC y nombre de usuario obligatorios' });
  try {
    const eRes = await pool.query(
      'SELECT empresa_id FROM empresas WHERE ruc=$1 AND activo=TRUE', [ruc]
    );
    if (!eRes.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });
    const empresaId = eRes.rows[0].empresa_id;

    const uRes = await pool.query(
      `SELECT usuario_id, email FROM usuarios
       WHERE empresa_id=$1 AND nombre_completo=$2 AND activo=TRUE`,
      [empresaId, nombreUsuario]
    );
    if (!uRes.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    const u = uRes.rows[0];
    if (!u.email) return res.status(400).json({ error: 'Este usuario no tiene correo registrado. Contacta al administrador.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await pool.query(
      `UPDATE usuarios SET reset_token=$1, reset_token_expira=$2 WHERE usuario_id=$3`,
      [token, expira, u.usuario_id]
    );

    const link = `${process.env.APP_URL}/reset-pin?token=${token}`;
    await transporter.sendMail({
      from: `"KHIPU Pro" <${process.env.SMTP_FROM}>`,
      to: u.email,
      subject: 'Restablecer PIN — KHIPU Arqueo Pro',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#F0F4F9;border-radius:16px">
          <h2 style="color:#0F2347;font-style:italic">KHIPU Pro — Restablecer PIN</h2>
          <p style="color:#475569">Hola <strong>${nombreUsuario}</strong>, recibimos una solicitud para restablecer tu PIN.</p>
          <a href="${link}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#1A3A6B;color:white;border-radius:12px;text-decoration:none;font-weight:900;letter-spacing:0.05em">
            Restablecer PIN
          </a>
          <p style="color:#94A3B8;font-size:12px">Este enlace expira en 1 hora. Si no solicitaste esto, ignora este correo.</p>
          <p style="color:#94A3B8;font-size:11px">Corporación Khipu · arqueo.khipu.plus</p>
        </div>
      `,
    });

    return res.json({ ok: true, message: 'Correo enviado correctamente' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset-pin
router.post('/reset-pin', async (req: Request, res: Response) => {
  const { ruc, nombreUsuario, llaveMaestra, nuevoPin } = req.body;

  if (!ruc || !nombreUsuario || !llaveMaestra || !nuevoPin) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  if (nuevoPin.length < 4) {
    return res.status(400).json({ error: 'El PIN debe tener un mínimo de 4 dígitos' });
  }

  // Tu llave ultra secreta como dueño de la plataforma (si está en el .env la jala, sino usa la de respaldo)
  const LLAVE_MAESTRA_SISTEMA = process.env.MASTER_RECOVERY_KEY || "KhipuDevSecret2026";

  try {
    // 1. Validar la Llave Maestra del programador
    if (llaveMaestra !== LLAVE_MAESTRA_SISTEMA) {
      return res.status(401).json({ error: 'Llave Maestra incorrecta. Autorización denegada.' });
    }

    // 2. Buscar que la empresa exista mediante su RUC
    const eRes = await pool.query(
      'SELECT empresa_id FROM empresas WHERE ruc=$1 AND activo=TRUE', 
      [ruc]
    );
    if (!eRes.rows[0]) {
      return res.status(404).json({ error: 'El RUC de la empresa no está registrado.' });
    }
    const empresaId = eRes.rows[0].empresa_id;

    // 3. Encriptar el nuevo PIN con bcrypt usando la misma configuración de tu login (10 saltos)
    const pinHasheado = await bcrypt.hash(nuevoPin, 10);

    // 4. Forzar la actualización en la tabla usuarios
    const uRes = await pool.query(
      `UPDATE usuarios 
       SET pin=$1, reset_token=NULL, reset_token_expira=NULL 
       WHERE empresa_id=$2 AND nombre_completo=$3 AND activo=TRUE 
       RETURNING usuario_id, rol`,
      [pinHasheado, empresaId, nombreUsuario]
    );

    if (!uRes.rows[0]) {
      return res.status(404).json({ error: 'El usuario especificado no existe en esta empresa.' });
    }

    // 5. Si el usuario recuperado resulta ser el ADMINISTRADOR/AUDITOR principal,
    // sincronizamos también el pin_admin de la tabla empresas
    if (uRes.rows[0].rol === 'AUDITOR') {
      await pool.query(
        'UPDATE empresas SET pin_admin=$1 WHERE empresa_id=$2',
        [pinHasheado, empresaId]
      );
    }

    return res.json({ ok: true, message: '¡PIN restablecido exitosamente!' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
export default router;
