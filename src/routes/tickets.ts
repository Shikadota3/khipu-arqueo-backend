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
  const {
    arqueoId, saldoCierre, observaciones, aprobadoPor,
    montoLlevadoEfectivo, montoLlevadoPos, montoLlevadoDigital, montoLlevadoTransferencia,
    cierreEfectivo, cierrePos, cierreDigital, cierreTransferencia,
  } = req.body;

  if (!arqueoId || saldoCierre === undefined)
    return res.status(400).json({ error: 'ArqueoId y SaldoCierre son obligatorios' });

  try {
    const chk = await pool.query(
      'SELECT arqueo_id FROM arqueos WHERE arqueo_id=$1 AND empresa_id=$2',
      [arqueoId, empresaId]
    );
    if (!chk.rows[0])
      return res.status(403).json({ error: 'Arqueo no pertenece a esta empresa' });

    // Totales cierre por canal
    const ef  = parseFloat(cierreEfectivo)       || 0;
    const pos = parseFloat(cierrePos)            || 0;
    const dig = parseFloat(cierreDigital)        || 0;
    const tra = parseFloat(cierreTransferencia)  || 0;

    // Lo que se lleva el dueño por canal
    const lEf  = parseFloat(montoLlevadoEfectivo)       || 0;
    const lPos = parseFloat(montoLlevadoPos)            || 0;
    const lDig = parseFloat(montoLlevadoDigital)        || 0;
    const lTra = parseFloat(montoLlevadoTransferencia)  || 0;

    // Saldo siguiente turno por canal
    const sigEf  = Math.max(0, ef  - lEf);
    const sigPos = Math.max(0, pos - lPos);
    const sigDig = Math.max(0, dig - lDig);
    const sigTra = Math.max(0, tra - lTra);
    const sigTotal       = sigEf + sigPos + sigDig + sigTra;
    const montoLlevadoTotal = lEf + lPos + lDig + lTra;

    const estado = observaciones ? 'OBSERVADO' : 'PENDIENTE';

    const r = await pool.query(
      `INSERT INTO tickets_cierre
         (arqueo_id, usuario_id, saldo_cierre, saldo_siguiente_turno, observaciones, aprobado_por, estado,
          monto_llevado, monto_llevado_efectivo, monto_llevado_pos, monto_llevado_digital, monto_llevado_transferencia,
          saldo_siguiente_efectivo, saldo_siguiente_pos, saldo_siguiente_digital, saldo_siguiente_transferencia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING ticket_id`,
      [
        arqueoId, usuarioId, parseFloat(saldoCierre), sigTotal,
        observaciones || null, aprobadoPor || null, estado,
        montoLlevadoTotal, lEf, lPos, lDig, lTra,
        sigEf, sigPos, sigDig, sigTra,
      ]
    );

    await pool.query('UPDATE arqueos SET fecha_cierre=NOW() WHERE arqueo_id=$1', [arqueoId]);
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