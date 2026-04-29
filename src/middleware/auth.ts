import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'khipu_secret_2026';

export interface JwtPayload {
  usuarioId:  number;
  empresaId:  number;
  rol:        'CAJERO' | 'AUDITOR';
  nombre:     string;
  apellidos?: string;
  numeroCaja?: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '10h' });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token requerido' });
  try {
    (req as any).user = jwt.verify(h.split(' ')[1], SECRET) as JwtPayload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export function requireRol(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const u = (req as any).user as JwtPayload;
    if (!roles.includes(u.rol))
      return res.status(403).json({ error: `Requiere rol: ${roles.join(' o ')}` });
    next();
  };
}
