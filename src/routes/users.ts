import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db';
import { authMiddleware, requireRol } from '../middleware/auth';

const router = Router();
// GET /api/users/public/:empresaId — sin auth, solo nombre y rol para el login
router.get('/public/:empresaId', async (req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT usuario_id, nombre_completo, rol, numero_caja
       FROM usuarios WHERE empresa_id=$1 AND activo=TRUE
       ORDER BY rol DESC, nombre_completo ASC`,
      [parseInt(req.params.empresaId)]
    );
    return res.json(r.rows);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.use(authMiddleware); // ← esta línea ya existe, el endpoint nuevo va ANTES
router.use(authMiddleware);

// GET /api/users
router.get('/', async (req: Request, res: Response) => {
  const { empresaId } = (req as any).user;
  try {
    const r = await pool.query(
      `SELECT usuario_id, nombre_completo, apellidos, rol, numero_caja,
              telefono, direccion, activo, fecha_creacion
       FROM usuarios WHERE empresa_id=$1 AND activo=TRUE ORDER BY fecha_creacion DESC`,
      [empresaId]
    );
    return res.json(r.rows);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// POST /api/users — solo Auditor
router.post('/', requireRol('AUDITOR'), async (req: Request, res: Response) => {
  const { empresaId, usuarioId } = (req as any).user;
  const { nombreCompleto, apellidos, rol, pin, telefono, direccion, numeroCaja } = req.body;
  if (!nombreCompleto || !pin)
    return res.status(400).json({ error: 'Nombre y PIN son obligatorios' });
  if (!['CAJERO','AUDITOR'].includes(rol))
    return res.status(400).json({ error: 'Rol inválido' });
  try {
    const dup = await pool.query(
      'SELECT usuario_id FROM usuarios WHERE empresa_id=$1 AND nombre_completo=$2 AND activo=TRUE',
      [empresaId, nombreCompleto]
    );
    if (dup.rows.length > 0)
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre en esta empresa' });

    if (rol === 'CAJERO' && numeroCaja) {
      const cajaDup = await pool.query(
        'SELECT usuario_id FROM usuarios WHERE empresa_id=$1 AND numero_caja=$2 AND activo=TRUE',
        [empresaId, numeroCaja]
      );
      if (cajaDup.rows.length > 0)
        return res.status(409).json({ error: `La ${numeroCaja} ya está asignada a otro cajero` });
    }

    const hash = await bcrypt.hash(pin, 10);
    const r = await pool.query(
      `INSERT INTO usuarios
         (empresa_id, nombre_completo, apellidos, rol, pin, numero_caja, telefono, direccion, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING usuario_id, nombre_completo, rol, numero_caja`,
      [empresaId, nombreCompleto, apellidos || '', rol, hash,
       numeroCaja || null, telefono || '', direccion || '', usuarioId]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// PATCH /api/users/:id/profile
router.patch('/:id/profile', async (req: Request, res: Response) => {
  const { usuarioId, rol } = (req as any).user;
  const targetId = parseInt(req.params.id);
  if (usuarioId !== targetId && rol !== 'AUDITOR')
    return res.status(403).json({ error: 'Solo puedes editar tu propio perfil' });

  const { nombre, apellidos, telefono, direccion, pinActual, pinNuevo } = req.body;
  try {
    if (pinNuevo) {
      const uRes = await pool.query(
        'SELECT pin FROM usuarios WHERE usuario_id=$1', [targetId]
      );
      if (!uRes.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (!pinActual || !await bcrypt.compare(pinActual, uRes.rows[0].pin))
        return res.status(401).json({ error: 'PIN actual incorrecto' });
    }

    const newHash = pinNuevo ? await bcrypt.hash(pinNuevo, 10) : null;

    if (newHash) {
      await pool.query(
        `UPDATE usuarios SET nombre_completo=$1, apellidos=$2, telefono=$3, direccion=$4, pin=$5
         WHERE usuario_id=$6`,
        [nombre, apellidos || '', telefono || '', direccion || '', newHash, targetId]
      );
    } else {
      await pool.query(
        `UPDATE usuarios SET nombre_completo=$1, apellidos=$2, telefono=$3, direccion=$4
         WHERE usuario_id=$5`,
        [nombre, apellidos || '', telefono || '', direccion || '', targetId]
      );
    }
    return res.json({ message: 'Perfil actualizado' });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// PATCH /api/users/:id/estado
router.patch('/:id/estado', requireRol('AUDITOR'), async (req: Request, res: Response) => {
  const { activo } = req.body;
  const { empresaId } = (req as any).user;
  try {
    if (!activo) {
      // Al desactivar, liberar el número de caja para que pueda reasignarse
      await pool.query(
        'UPDATE usuarios SET activo=$1, numero_caja=NULL WHERE usuario_id=$2 AND empresa_id=$3',
        [false, parseInt(req.params.id), empresaId]
      );
    } else {
      await pool.query(
        'UPDATE usuarios SET activo=$1 WHERE usuario_id=$2 AND empresa_id=$3',
        [true, parseInt(req.params.id), empresaId]
      );
    }
    return res.json({ message: 'Estado actualizado' });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

export default router;
