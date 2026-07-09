"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// GET /api/tickets
router.get('/', async (req, res) => {
    const { empresaId } = req.user;
    try {
        const r = await db_1.default.query(`SELECT t.*, u.nombre_completo AS nombre_auditor, u.numero_caja,
              a.fecha_arqueo, a.estado_caja
       FROM tickets_cierre t
       JOIN arqueos a   ON t.arqueo_id  = a.arqueo_id
       JOIN usuarios u  ON t.usuario_id = u.usuario_id
       WHERE a.empresa_id = $1
       ORDER BY t.fecha_emision DESC`, [empresaId]);
        return res.json(r.rows);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/tickets
router.post('/', async (req, res) => {
    const { usuarioId, empresaId } = req.user;
    const { arqueoId, saldoCierre, observaciones, aprobadoPor, montoLlevadoEfectivo, montoLlevadoPos, montoLlevadoDigital, montoLlevadoTransferencia, montoLlevadoCredito, cierreEfectivo, cierrePos, cierreDigital, cierreTransferencia, cierreCredito, } = req.body;
    if (!arqueoId || saldoCierre === undefined)
        return res.status(400).json({ error: 'ArqueoId y SaldoCierre son obligatorios' });
    try {
        const chk = await db_1.default.query('SELECT arqueo_id FROM arqueos WHERE arqueo_id=$1 AND empresa_id=$2', [arqueoId, empresaId]);
        if (!chk.rows[0])
            return res.status(403).json({ error: 'Arqueo no pertenece a esta empresa' });
        // Totales cierre por canal
        const ef = parseFloat(cierreEfectivo) || 0;
        const pos = parseFloat(cierrePos) || 0;
        const dig = parseFloat(cierreDigital) || 0;
        const tra = parseFloat(cierreTransferencia) || 0;
        const cre = parseFloat(cierreCredito) || 0;
        // Lo que se lleva el dueño por canal
        const lEf = parseFloat(montoLlevadoEfectivo) || 0;
        const lPos = parseFloat(montoLlevadoPos) || 0;
        const lDig = parseFloat(montoLlevadoDigital) || 0;
        const lTra = parseFloat(montoLlevadoTransferencia) || 0;
        const lCre = parseFloat(montoLlevadoCredito) || 0;
        // Saldo siguiente turno por canal
        const sigEf = Math.max(0, ef - lEf);
        const sigPos = Math.max(0, pos - lPos);
        const sigDig = Math.max(0, dig - lDig);
        const sigTra = Math.max(0, tra - lTra);
        const sigCre = Math.max(0, cre - lCre);
        const sigTotal = sigEf + sigPos + sigDig + sigTra;
        const montoLlevadoTotal = lEf + lPos + lDig + lTra;
        const estado = observaciones ? 'OBSERVADO' : 'PENDIENTE';
        const r = await db_1.default.query(`INSERT INTO tickets_cierre
         (arqueo_id, usuario_id, saldo_cierre, saldo_siguiente_turno, observaciones, aprobado_por, estado,
          monto_llevado, monto_llevado_efectivo, monto_llevado_pos, monto_llevado_digital, monto_llevado_transferencia,
          saldo_siguiente_efectivo, saldo_siguiente_pos, saldo_siguiente_digital, saldo_siguiente_transferencia,
          cierre_credito, monto_llevado_credito, saldo_siguiente_credito)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING ticket_id`, [
            arqueoId, usuarioId, parseFloat(saldoCierre), sigTotal,
            observaciones || null, aprobadoPor || null, estado,
            montoLlevadoTotal, lEf, lPos, lDig, lTra,
            sigEf, sigPos, sigDig, sigTra,
            cre, lCre, sigCre,
        ]);
        await db_1.default.query('UPDATE arqueos SET fecha_cierre=NOW() WHERE arqueo_id=$1', [arqueoId]);
        return res.status(201).json({ ticketId: r.rows[0].ticket_id, estado });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /api/tickets/:id/aprobar — solo Auditor
router.patch('/:id/aprobar', (0, auth_1.requireRol)('AUDITOR'), async (req, res) => {
    try {
        await db_1.default.query(`UPDATE tickets_cierre SET estado='APROBADO' WHERE ticket_id=$1`, [parseInt(req.params.id)]);
        return res.json({ message: 'Ticket aprobado' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
