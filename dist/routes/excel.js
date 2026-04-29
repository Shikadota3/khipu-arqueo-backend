"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const XLSX = __importStar(require("xlsx"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
router.use(auth_1.authMiddleware);
router.post('/parse', upload.single('archivo'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'No se recibió archivo' });
    try {
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets['Operaciones'];
        if (!ws)
            return res.status(400).json({ error: 'La hoja "Operaciones" no existe' });
        const rows = XLSX.utils.sheet_to_json(ws, { range: 5, defval: '' });
        const TIPOS = ['INGRESO', 'EGRESO'];
        const METODOS = ['EFECTIVO', 'TARJETA (POS)', 'DIGITAL', 'TRANSFERENCIA'];
        const DOCS = ['BOLETA', 'FACTURA', 'RECIBO', 'VALE', 'NOTA_CREDITO', 'OTRO'];
        const ops = [];
        const errores = [];
        rows.forEach((row, i) => {
            const concepto = (row['*Concepto'] || row['Concepto'] || '').toString().trim();
            const montoRaw = row['*Monto (S/)'] || row['Monto'] || 0;
            const tipo = (row['*Tipo'] || row['Tipo'] || '').toString().toUpperCase().trim();
            const metodo = (row['*Método de Pago'] || row['Método'] || '').toString().toUpperCase().trim();
            const tipoDoc = (row['*Tipo Documento'] || row['Documento'] || '').toString().toUpperCase().trim();
            const numeroDoc = (row['Nº Documento'] || row['NroDoc'] || '').toString().trim();
            if (!concepto) {
                errores.push(`Fila ${i + 1}: Concepto vacío`);
                return;
            }
            if (!numeroDoc) {
                errores.push(`Fila ${i + 1}: Falta Nº Documento`);
                return;
            }
            const monto = parseFloat(montoRaw.toString().replace(',', '.'));
            if (isNaN(monto) || monto <= 0) {
                errores.push(`Fila ${i + 1}: Monto inválido`);
                return;
            }
            if (!TIPOS.includes(tipo)) {
                errores.push(`Fila ${i + 1}: Tipo inválido`);
                return;
            }
            if (!METODOS.includes(metodo)) {
                errores.push(`Fila ${i + 1}: Método inválido`);
                return;
            }
            if (!DOCS.includes(tipoDoc)) {
                errores.push(`Fila ${i + 1}: Documento inválido`);
                return;
            }
            ops.push({ concepto, monto, tipo, metodo, tipoDoc, numeroDoc, tieneDoc: true, origen: 'EXCEL' });
        });
        const ingreso = ops.filter(o => o.tipo === 'INGRESO').reduce((a, o) => a + o.monto, 0);
        const egreso = ops.filter(o => o.tipo === 'EGRESO').reduce((a, o) => a + o.monto, 0);
        return res.json({
            operaciones: ops,
            errores,
            resumen: {
                total: ops.length, conErrores: errores.length,
                totalIngreso: Math.round(ingreso * 100) / 100,
                totalEgreso: Math.round(egreso * 100) / 100,
                neto: Math.round((ingreso - egreso) * 100) / 100,
            },
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
