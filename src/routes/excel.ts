import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
router.use(authMiddleware);

router.post('/parse', upload.single('archivo'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  try {
    const wb  = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws  = wb.Sheets['Operaciones'];
    if (!ws) return res.status(400).json({ error: 'La hoja "Operaciones" no existe' });
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { range: 5, defval: '' });
    const TIPOS   = ['INGRESO','EGRESO'];
    const METODOS = ['EFECTIVO','TARJETA (POS)','DIGITAL','TRANSFERENCIA'];
    const DOCS    = ['BOLETA','FACTURA','RECIBO','VALE','NOTA_CREDITO','OTRO'];
    const ops: any[] = [];
    const errores: string[] = [];
    rows.forEach((row: any, i: number) => {
      const concepto  = (row['*Concepto']||row['Concepto']||'').toString().trim();
      const montoRaw  = row['*Monto (S/)']||row['Monto']||0;
      const tipo      = (row['*Tipo']||row['Tipo']||'').toString().toUpperCase().trim();
      const metodo    = (row['*Método de Pago']||row['Método']||'').toString().toUpperCase().trim();
      const tipoDoc   = (row['*Tipo Documento']||row['Documento']||'').toString().toUpperCase().trim();
      const numeroDoc = (row['Nº Documento']||row['NroDoc']||'').toString().trim();
      if (!concepto)  { errores.push(`Fila ${i+1}: Concepto vacío`);       return; }
      if (!numeroDoc) { errores.push(`Fila ${i+1}: Falta Nº Documento`);   return; }
      const monto = parseFloat(montoRaw.toString().replace(',','.'));
      if (isNaN(monto)||monto<=0) { errores.push(`Fila ${i+1}: Monto inválido`);   return; }
      if (!TIPOS.includes(tipo))  { errores.push(`Fila ${i+1}: Tipo inválido`);    return; }
      if (!METODOS.includes(metodo)) { errores.push(`Fila ${i+1}: Método inválido`);  return; }
      if (!DOCS.includes(tipoDoc))   { errores.push(`Fila ${i+1}: Documento inválido`);return; }
      ops.push({ concepto, monto, tipo, metodo, tipoDoc, numeroDoc, tieneDoc: true, origen: 'EXCEL' });
    });
    const ingreso = ops.filter(o=>o.tipo==='INGRESO').reduce((a,o)=>a+o.monto,0);
    const egreso  = ops.filter(o=>o.tipo==='EGRESO').reduce((a,o)=>a+o.monto,0);
    return res.json({
      operaciones: ops,
      errores,
      resumen: {
        total: ops.length, conErrores: errores.length,
        totalIngreso: Math.round(ingreso*100)/100,
        totalEgreso:  Math.round(egreso*100)/100,
        neto:         Math.round((ingreso-egreso)*100)/100,
      },
    });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

export default router;
