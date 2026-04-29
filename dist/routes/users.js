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
// GET /api/users/public/:empresaId — sin auth, solo nombre y rol para el login
router.get('/public/:empresaId', async (req, res) => {
    try {
        const r = await db_1.default.query(`SELECT usuario_id, nombre_completo, rol, numero_caja
       FROM usuarios WHERE empresa_id=$1 AND activo=TRUE
       ORDER BY rol DESC, nombre_completo ASC`, [parseInt(req.params.empresaId)]);
        return res.json(r.rows);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
router.use(auth_1.authMiddleware); // ← esta línea ya existe, el endpoint nuevo va ANTES
router.use(auth_1.authMiddleware);
// GET /api/users
router.get('/', async (req, res) => {
    const { empresaId } = req.user;
    try {
        const r = await db_1.default.query(`SELECT usuario_id, nombre_completo, apellidos, rol, numero_caja,
              telefono, direccion, activo, fecha_creacion
       FROM usuarios WHERE empresa_id=$1 AND activo=TRUE ORDER BY fecha_creacion DESC`, [empresaId]);
        return res.json(r.rows);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/users — solo Auditor
router.post('/', (0, auth_1.requireRol)('AUDITOR'), async (req, res) => {
    const { empresaId, usuarioId } = req.user;
    const { nombreCompleto, apellidos, rol, pin, telefono, direccion, numeroCaja } = req.body;
    if (!nombreCompleto || !pin)
        return res.status(400).json({ error: 'Nombre y PIN son obligatorios' });
    if (!['CAJERO', 'AUDITOR'].includes(rol))
        return res.status(400).json({ error: 'Rol inválido' });
    try {
        const dup = await db_1.default.query('SELECT usuario_id FROM usuarios WHERE empresa_id=$1 AND nombre_completo=$2 AND activo=TRUE', [empresaId, nombreCompleto]);
        if (dup.rows.length > 0)
            return res.status(409).json({ error: 'Ya existe un usuario con ese nombre en esta empresa' });
        if (rol === 'CAJERO' && numeroCaja) {
            const cajaDup = await db_1.default.query('SELECT usuario_id FROM usuarios WHERE empresa_id=$1 AND numero_caja=$2 AND activo=TRUE', [empresaId, numeroCaja]);
            if (cajaDup.rows.length > 0)
                return res.status(409).json({ error: `La ${numeroCaja} ya está asignada a otro cajero` });
        }
        const hash = await bcryptjs_1.default.hash(pin, 10);
        const r = await db_1.default.query(`INSERT INTO usuarios
         (empresa_id, nombre_completo, apellidos, rol, pin, numero_caja, telefono, direccion, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING usuario_id, nombre_completo, rol, numero_caja`, [empresaId, nombreCompleto, apellidos || '', rol, hash,
            numeroCaja || null, telefono || '', direccion || '', usuarioId]);
        return res.status(201).json(r.rows[0]);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /api/users/:id/profile
router.patch('/:id/profile', async (req, res) => {
    const { usuarioId, rol } = req.user;
    const targetId = parseInt(req.params.id);
    if (usuarioId !== targetId && rol !== 'AUDITOR')
        return res.status(403).json({ error: 'Solo puedes editar tu propio perfil' });
    const { nombre, apellidos, telefono, direccion, pinActual, pinNuevo } = req.body;
    try {
        if (pinNuevo) {
            const uRes = await db_1.default.query('SELECT pin FROM usuarios WHERE usuario_id=$1', [targetId]);
            if (!uRes.rows[0])
                return res.status(404).json({ error: 'Usuario no encontrado' });
            if (!pinActual || !await bcryptjs_1.default.compare(pinActual, uRes.rows[0].pin))
                return res.status(401).json({ error: 'PIN actual incorrecto' });
        }
        const newHash = pinNuevo ? await bcryptjs_1.default.hash(pinNuevo, 10) : null;
        if (newHash) {
            await db_1.default.query(`UPDATE usuarios SET nombre_completo=$1, apellidos=$2, telefono=$3, direccion=$4, pin=$5
         WHERE usuario_id=$6`, [nombre, apellidos || '', telefono || '', direccion || '', newHash, targetId]);
        }
        else {
            await db_1.default.query(`UPDATE usuarios SET nombre_completo=$1, apellidos=$2, telefono=$3, direccion=$4
         WHERE usuario_id=$5`, [nombre, apellidos || '', telefono || '', direccion || '', targetId]);
        }
        return res.json({ message: 'Perfil actualizado' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /api/users/:id/estado
router.patch('/:id/estado', (0, auth_1.requireRol)('AUDITOR'), async (req, res) => {
    const { activo } = req.body;
    const { empresaId } = req.user;
    try {
        if (!activo) {
            // Al desactivar, liberar el número de caja para que pueda reasignarse
            await db_1.default.query('UPDATE usuarios SET activo=$1, numero_caja=NULL WHERE usuario_id=$2 AND empresa_id=$3', [false, parseInt(req.params.id), empresaId]);
        }
        else {
            await db_1.default.query('UPDATE usuarios SET activo=$1 WHERE usuario_id=$2 AND empresa_id=$3', [true, parseInt(req.params.id), empresaId]);
        }
        return res.json({ message: 'Estado actualizado' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
