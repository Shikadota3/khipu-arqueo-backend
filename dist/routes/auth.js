"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = __importDefault(require("../db"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// POST /api/auth/setup — crear empresa + auditor
router.post('/setup', async (req, res) => {
    const { nombre, ruc, rubro, direccion, telefono, pinAdmin } = req.body;
    if (!nombre || !ruc || !rubro || !pinAdmin)
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    if (!/^\d{11}$/.test(ruc))
        return res.status(400).json({ error: 'RUC debe tener exactamente 11 dígitos' });
    if (pinAdmin.length < 4)
        return res.status(400).json({ error: 'PIN mínimo 4 dígitos' });
    const client = await db_1.default.connect();
    try {
        const exists = await client.query('SELECT empresa_id FROM empresas WHERE ruc=$1', [ruc]);
        if (exists.rows.length > 0)
            return res.status(409).json({ error: 'Ya existe una empresa con ese RUC' });
        const hash = await bcryptjs_1.default.hash(pinAdmin, 10);
        await client.query('BEGIN');
        const eRes = await client.query(`INSERT INTO empresas (nombre, ruc, rubro, direccion, telefono, pin_admin)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING empresa_id`, [nombre, ruc, rubro, direccion || '', telefono || '', hash]);
        const empresaId = eRes.rows[0].empresa_id;
        const uRes = await client.query(`INSERT INTO usuarios (empresa_id, nombre_completo, apellidos, rol, pin, telefono, direccion)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING usuario_id`, [empresaId, nombre, '', 'AUDITOR', hash, telefono || '', direccion || '']);
        const usuarioId = uRes.rows[0].usuario_id;
        await client.query('COMMIT');
        const token = (0, auth_1.signToken)({ usuarioId, empresaId, rol: 'AUDITOR', nombre });
        return res.status(201).json({
            token,
            empresa: { empresaId, nombre, ruc, rubro },
            usuario: { usuarioId, nombre, rol: 'AUDITOR' },
        });
    }
    catch (err) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: err.message });
    }
    finally {
        client.release();
    }
});
// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { empresaRuc, nombre, pin } = req.body;
    if (!empresaRuc || !nombre || !pin)
        return res.status(400).json({ error: 'RUC, nombre y PIN son obligatorios' });
    try {
        const eRes = await db_1.default.query('SELECT empresa_id, nombre FROM empresas WHERE ruc=$1 AND activo=TRUE', [empresaRuc]);
        if (!eRes.rows[0])
            return res.status(404).json({ error: 'Empresa no encontrada' });
        const empresa = eRes.rows[0];
        const uRes = await db_1.default.query(`SELECT usuario_id, nombre_completo, apellidos, rol, pin, numero_caja, telefono, direccion
       FROM usuarios WHERE empresa_id=$1 AND nombre_completo=$2 AND activo=TRUE`, [empresa.empresa_id, nombre]);
        if (!uRes.rows[0])
            return res.status(401).json({ error: 'Usuario no encontrado' });
        const u = uRes.rows[0];
        if (!await bcryptjs_1.default.compare(pin, u.pin))
            return res.status(401).json({ error: 'PIN incorrecto' });
        const token = (0, auth_1.signToken)({
            usuarioId: u.usuario_id,
            empresaId: empresa.empresa_id,
            rol: u.rol,
            nombre: u.nombre_completo,
            apellidos: u.apellidos,
            numeroCaja: u.numero_caja,
        });
        return res.json({
            token,
            empresa: { empresaId: empresa.empresa_id, nombre: empresa.nombre, ruc: empresaRuc },
            usuario: {
                usuarioId: u.usuario_id,
                nombre: u.nombre_completo,
                apellidos: u.apellidos,
                rol: u.rol,
                numeroCaja: u.numero_caja,
                telefono: u.telefono,
                direccion: u.direccion,
            },
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/auth/empresa/:ruc
router.get('/empresa/:ruc', async (req, res) => {
    try {
        const r = await db_1.default.query('SELECT empresa_id, nombre, rubro FROM empresas WHERE ruc=$1 AND activo=TRUE', [req.params.ruc]);
        return res.json(r.rows[0]
            ? { exists: true, empresa: r.rows[0] }
            : { exists: false });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/auth/empresas — lista todas las empresas (para el selector del login)
router.get('/empresas', async (_req, res) => {
    try {
        const r = await db_1.default.query('SELECT empresa_id, nombre, ruc, rubro FROM empresas WHERE activo=TRUE ORDER BY nombre ASC');
        return res.json(r.rows);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/auth/empresas/:empresaId/usuarios — usuarios de una empresa (para el selector)
router.get('/empresas/:empresaId/usuarios', async (req, res) => {
    try {
        const r = await db_1.default.query(`SELECT usuario_id, nombre_completo, apellidos, rol, numero_caja
       FROM usuarios WHERE empresa_id=$1 AND activo=TRUE
       ORDER BY rol DESC, nombre_completo ASC`, [parseInt(req.params.empresaId)]);
        return res.json(r.rows);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
