import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware, requireRol } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// GET /api/tickets
router.get('/', async (req: Request, res: Response) => {
  const { empresaId } = (req as any).user;
  try {
    const r = await pool.query(
      `SELECT t.*, u.nombre_completo AS nombre_auditor, u.numero_caja,
              a.fecha_arqueo, a.estado_caja
       FROM tickets_cierre t
       JOIN arqueos a   ON t.arqueo_id  = a.arqueo_id
       JOIN usuarios u  ON t.usuario_id = u.usuario_id
       WHERE a.empresa_id = $1
       ORDER BY t.fecha_emision DESC`,
      [empresaId]
    );
    return res.json(r.rows);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// POST /api/tickets
router.post('/', async (req: Request, res: Response) => {
  const { usuarioId, empresaId } = (req as any).user;
  const { arqueoId, saldoCierre, saldoSiguienteTurno, observaciones, aprobadoPor } = req.body;
  if (!arqueoId || saldoCierre === undefined)
    return res.status(400).json({ error: 'ArqueoId y SaldoCierre son obligatorios' });

  try {
    // Verificar que el arqueo pertenece a esta empresa
    const chk = await pool.query(
      'SELECT arqueo_id FROM arqueos WHERE arqueo_id=$1 AND empresa_id=$2',
      [arqueoId, empresaId]
    );
    if (!chk.rows[0])
      return res.status(403).json({ error: 'Arqueo no pertenece a esta empresa' });

    const estado = observaciones ? 'OBSERVADO' : 'PENDIENTE';

    const r = await pool.query(
      `INSERT INTO tickets_cierre
         (arqueo_id, usuario_id, saldo_cierre, saldo_siguiente_turno, observaciones, aprobado_por, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING ticket_id`,
      [
        arqueoId, usuarioId, parseFloat(saldoCierre),
        parseFloat(saldoSiguienteTurno) || 0,
        observaciones || null, aprobadoPor || null, estado,
      ]
    );

    // Marcar fecha de cierre del arqueo
    await pool.query(
      'UPDATE arqueos SET fecha_cierre=NOW() WHERE arqueo_id=$1',
      [arqueoId]
    );

    return res.status(201).json({ ticketId: r.rows[0].ticket_id, estado });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// PATCH /api/tickets/:id/aprobar — solo Auditor
router.patch('/:id/aprobar', requireRol('AUDITOR'), async (req: Request, res: Response) => {
  try {
    await pool.query(
      `UPDATE tickets_cierre SET estado='APROBADO' WHERE ticket_id=$1`,
      [parseInt(req.params.id)]
    );
    return res.json({ message: 'Ticket aprobado' });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

export default router;
