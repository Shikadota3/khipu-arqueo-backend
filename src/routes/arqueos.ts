import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
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

// POST /api/arqueos
router.post('/', async (req: Request, res: Response) => {
  const { empresaId, usuarioId } = (req as any).user;
  const {
    modo, tipoNegocio, periodo, fechaArqueo, horaInicio, horaFin,
    saldoApertura, saldoInicialPos, saldoInicialDigital, saldoInicialTransferencia, saldoInicialCredito,
    operaciones, denominaciones, posEntries, walletEntries, transferEntries,
    saldoTeorico, teoricoEfectivo, teoricoPos, teoricoDigital, teoricoTransferencia, teoricoCredito,
    totalFisico, totalPOS, totalDigital, totalTransferencia, totalCredito, totalReal,
    diferencia, diferenciaEfectivo, diferenciaPos, diferenciaDigital, diferenciaTransferencia,
    estadoCaja, explicacionFaltante, tratamientoFaltante,
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const aRes = await client.query(
      `INSERT INTO arqueos
         (empresa_id, usuario_id, modo, tipo_negocio, periodo, fecha_arqueo,
          hora_inicio, hora_fin,
          saldo_apertura, saldo_inicial_pos, saldo_inicial_digital, saldo_inicial_transferencia, saldo_inicial_credito,
          saldo_teorico, teorico_efectivo, teorico_pos, teorico_digital, teorico_transferencia, teorico_credito,
          total_fisico, total_pos, total_digital, total_transferencia, total_credito, total_real,
          diferencia, diferencia_efectivo, diferencia_pos, diferencia_digital, diferencia_transferencia,
          estado_caja, explicacion_faltante, tratamiento_faltante)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
       RETURNING arqueo_id`,
      [
        empresaId, usuarioId, modo, tipoNegocio, periodo, fechaArqueo,
        horaInicio, horaFin || null,
        saldoApertura             || 0,
        saldoInicialPos           || 0,
        saldoInicialDigital       || 0,
        saldoInicialTransferencia || 0,
        saldoInicialCredito       || 0,
        saldoTeorico              || 0,
        teoricoEfectivo           || 0,
        teoricoPos                || 0,
        teoricoDigital            || 0,
        teoricoTransferencia      || 0,
        teoricoCredito            || 0,
        totalFisico               || 0,
        totalPOS                  || 0,
        totalDigital               || 0,
        totalTransferencia        || 0,
        totalCredito              || 0,
        totalReal                 || 0,
        diferencia                || 0,
        diferenciaEfectivo        || 0,
        diferenciaPos             || 0,
        diferenciaDigital         || 0,
        diferenciaTransferencia   || 0,
        estadoCaja, explicacionFaltante || null, tratamientoFaltante || null,
      ]
    );
    const arqueoId = aRes.rows[0].arqueo_id;

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

    for (const d of (denominaciones || [])) {
      if (d.cantidad > 0) {
        await client.query(
          `INSERT INTO detalle_denominaciones (arqueo_id, denominacion, tipo_denominacion, cantidad)
           VALUES ($1,$2,$3,$4)`,
          [arqueoId, d.valor, d.tipo, d.cantidad]
        );
      }
    }

    for (const p of (posEntries || [])) {
      await client.query(
        `INSERT INTO entradas_pos (arqueo_id, monto, numero_lote) VALUES ($1,$2,$3)`,
        [arqueoId, p.monto, p.numeroLote || null]
      );
    }

    for (const w of (walletEntries || [])) {
      await client.query(
        `INSERT INTO entradas_digitales (arqueo_id, monto, numero_operacion) VALUES ($1,$2,$3)`,
        [arqueoId, w.monto, w.numeroOp || null]
      );
    }

    for (const t of (transferEntries || [])) {
      await client.query(
        `INSERT INTO entradas_transferencia (arqueo_id, monto, numero_operacion) VALUES ($1,$2,$3)`,
        [arqueoId, t.monto, t.numeroOp || null]
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

// PATCH /api/arqueos/:id/aprobar
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
  const client = await pool.connect();
  try {
    const a = await client.query(
      `SELECT a.*, u.nombre_completo AS auditor, u.numero_caja
       FROM arqueos a JOIN usuarios u ON a.usuario_id = u.usuario_id
       WHERE a.arqueo_id=$1 AND a.empresa_id=$2`,
      [id, empresaId]
    );
    if (!a.rows[0]) return res.status(404).json({ error: 'No encontrado' });

    const ops   = await client.query('SELECT * FROM operaciones WHERE arqueo_id=$1 ORDER BY fecha_operacion', [id]);
    const dens  = await client.query('SELECT * FROM detalle_denominaciones WHERE arqueo_id=$1', [id]);
    const pos   = await client.query('SELECT * FROM entradas_pos WHERE arqueo_id=$1', [id]);
    const wal   = await client.query('SELECT * FROM entradas_digitales WHERE arqueo_id=$1', [id]);
    const trans = await client.query('SELECT * FROM entradas_transferencia WHERE arqueo_id=$1', [id]);

    return res.json({
      ...a.rows[0],
      operaciones:     ops.rows,
      denominaciones:  dens.rows,
      posEntries:      pos.rows,
      walletEntries:   wal.rows,
      transferEntries: trans.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/arqueos/:id — solo Auditor, requiere su propio PIN
router.delete('/:id', requireRol('AUDITOR'), async (req: Request, res: Response) => {
  const { empresaId, usuarioId } = (req as any).user;
  const { pin } = req.body;
  const id = parseInt(req.params.id);

  if (!pin) return res.status(400).json({ error: 'PIN requerido para eliminar' });

  const client = await pool.connect();
  try {
    // 1. Verificar que el arqueo pertenece a la empresa del auditor
    const chk = await client.query(
      'SELECT arqueo_id FROM arqueos WHERE arqueo_id=$1 AND empresa_id=$2',
      [id, empresaId]
    );
    if (!chk.rows[0]) return res.status(404).json({ error: 'Expediente no encontrado' });

    // 2. Verificar el PIN del auditor que está pidiendo el borrado
    const uRes = await client.query('SELECT pin FROM usuarios WHERE usuario_id=$1', [usuarioId]);
    if (!uRes.rows[0] || !await bcrypt.compare(String(pin), uRes.rows[0].pin))
      return res.status(401).json({ error: 'PIN incorrecto' });

    // 3. Borrar en cascada (no hay ON DELETE CASCADE en el esquema actual)
    await client.query('BEGIN');
    await client.query('DELETE FROM tickets_cierre WHERE arqueo_id=$1', [id]);
    await client.query('DELETE FROM operaciones WHERE arqueo_id=$1', [id]);
    await client.query('DELETE FROM detalle_denominaciones WHERE arqueo_id=$1', [id]);
    await client.query('DELETE FROM entradas_pos WHERE arqueo_id=$1', [id]);
    await client.query('DELETE FROM entradas_digitales WHERE arqueo_id=$1', [id]);
    await client.query('DELETE FROM entradas_transferencia WHERE arqueo_id=$1', [id]);
    await client.query('DELETE FROM arqueos WHERE arqueo_id=$1 AND empresa_id=$2', [id, empresaId]);
    await client.query('COMMIT');

    return res.json({ message: 'Expediente eliminado' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;