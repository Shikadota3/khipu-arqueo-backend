import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware, requireRol } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// GET /api/arqueos
router.get('/', async (req: Request, res: Response) => {
  const { empresaId, usuarioId, rol } = (req as any).user;
  try {
    let q = `SELECT a.*, u.nombre_completo AS auditor, u.numero_caja,
                     ap.nombre_completo AS aprobado_por_nombre
             FROM arqueos a
             JOIN usuarios u  ON a.usuario_id = u.usuario_id
             LEFT JOIN usuarios ap ON a.aprobado_por = ap.usuario_id
             WHERE a.empresa_id = $1`;
    const params: any[] = [empresaId];

    if (rol === 'CAJERO') {
      params.push(usuarioId);
      q += ` AND a.usuario_id = $${params.length}`;
    }
    q += ' ORDER BY a.fecha_creacion DESC';

    const r = await pool.query(q, params);
    return res.json(r.rows);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// POST /api/arqueos — guarda arqueo completo en una transacción
router.post('/', async (req: Request, res: Response) => {
  const { empresaId, usuarioId } = (req as any).user;
  const {
    modo, tipoNegocio, periodo, fechaArqueo, horaInicio, horaFin,
    saldoApertura, saldoInicialPos, saldoInicialDigital,
    operaciones, denominaciones, posEntries, walletEntries,
    saldoTeorico, teoricoEfectivo, teoricoPos, teoricoDigital,
    totalFisico, totalPOS, totalDigital, totalReal,
    diferencia, diferenciaEfectivo, diferenciaPos, diferenciaDigital,
    estadoCaja, explicacionFaltante, tratamientoFaltante,
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insertar arqueo principal
    const aRes = await client.query(
      `INSERT INTO arqueos
         (empresa_id, usuario_id, modo, tipo_negocio, periodo, fecha_arqueo,
          hora_inicio, hora_fin, saldo_apertura, saldo_inicial_pos, saldo_inicial_digital,
          saldo_teorico, teorico_efectivo, teorico_pos, teorico_digital,
          total_fisico, total_pos, total_digital, total_real,
          diferencia, diferencia_efectivo, diferencia_pos, diferencia_digital,
          estado_caja, explicacion_faltante, tratamiento_faltante)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       RETURNING arqueo_id`,
      [
        empresaId, usuarioId, modo, tipoNegocio, periodo, fechaArqueo,
        horaInicio, horaFin || null,
        saldoApertura       || 0, saldoInicialPos    || 0, saldoInicialDigital || 0,
        saldoTeorico        || 0, teoricoEfectivo    || 0, teoricoPos          || 0, teoricoDigital    || 0,
        totalFisico         || 0, totalPOS           || 0, totalDigital        || 0, totalReal         || 0,
        diferencia          || 0, diferenciaEfectivo || 0, diferenciaPos       || 0, diferenciaDigital || 0,
        estadoCaja, explicacionFaltante || null, tratamientoFaltante || null,
      ]
    );
    const arqueoId = aRes.rows[0].arqueo_id;

    // 2. Operaciones
    for (const op of (operaciones || [])) {
      await client.query(
        `INSERT INTO operaciones
           (arqueo_id, usuario_id, concepto, monto, tipo_movimiento,
            metodo_pago, tipo_documento, numero_documento, tiene_documento, imagen_documento, origen_carga)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          arqueoId, usuarioId, op.concepto, op.monto, op.tipo,
          op.metodo, op.tipoDoc, op.numeroDoc || null,
          op.tieneDoc || false, op.imagenBase64 || null, op.origen || 'MANUAL',
        ]
      );
    }

    // 3. Denominaciones
    for (const d of (denominaciones || [])) {
      if (d.cantidad > 0) {
        await client.query(
          `INSERT INTO detalle_denominaciones (arqueo_id, denominacion, tipo_denominacion, cantidad)
           VALUES ($1,$2,$3,$4)`,
          [arqueoId, d.valor, d.tipo, d.cantidad]
        );
      }
    }

    // 4. Entradas POS
    for (const p of (posEntries || [])) {
      await client.query(
        `INSERT INTO entradas_pos (arqueo_id, monto, numero_lote) VALUES ($1,$2,$3)`,
        [arqueoId, p.monto, p.numeroLote || null]
      );
    }

    // 5. Entradas Digitales (Yape/Plin)
    for (const w of (walletEntries || [])) {
      await client.query(
        `INSERT INTO entradas_digitales (arqueo_id, monto, numero_operacion) VALUES ($1,$2,$3)`,
        [arqueoId, w.monto, w.numeroOp || null]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ arqueoId, message: 'Arqueo guardado' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/arqueos/:id/aprobar — solo Auditor
router.patch('/:id/aprobar', requireRol('AUDITOR'), async (req: Request, res: Response) => {
  const { usuarioId, empresaId } = (req as any).user;
  const { estado, observacion } = req.body;
  try {
    await pool.query(
      `UPDATE arqueos
       SET estado_aprobacion=$1, aprobado_por=$2,
           fecha_aprobacion=NOW(), observacion_auditor=$3
       WHERE arqueo_id=$4 AND empresa_id=$5`,
      [estado, usuarioId, observacion || null, parseInt(req.params.id), empresaId]
    );
    return res.json({ message: `Arqueo ${estado.toLowerCase()}` });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// GET /api/arqueos/:id — detalle completo
router.get('/:id', async (req: Request, res: Response) => {
  const { empresaId } = (req as any).user;
  const id = parseInt(req.params.id);
  try {
    const [a, ops, dens, pos, wal] = await Promise.all([
      pool.query(
        `SELECT a.*, u.nombre_completo AS auditor, u.numero_caja
         FROM arqueos a JOIN usuarios u ON a.usuario_id = u.usuario_id
         WHERE a.arqueo_id=$1 AND a.empresa_id=$2`,
        [id, empresaId]
      ),
      pool.query('SELECT * FROM operaciones WHERE arqueo_id=$1 ORDER BY fecha_operacion', [id]),
      pool.query('SELECT * FROM detalle_denominaciones WHERE arqueo_id=$1', [id]),
      pool.query('SELECT * FROM entradas_pos WHERE arqueo_id=$1', [id]),
      pool.query('SELECT * FROM entradas_digitales WHERE arqueo_id=$1', [id]),
    ]);

    if (!a.rows[0]) return res.status(404).json({ error: 'No encontrado' });

    return res.json({
      ...a.rows[0],
      operaciones:   ops.rows,
      denominaciones: dens.rows,
      posEntries:    pos.rows,
      walletEntries: wal.rows,
    });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

export default router;
