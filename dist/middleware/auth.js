"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.authMiddleware = authMiddleware;
exports.requireRol = requireRol;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const SECRET = process.env.JWT_SECRET || 'khipu_secret_2026';
function signToken(payload) {
    return jsonwebtoken_1.default.sign(payload, SECRET, { expiresIn: '10h' });
}
function authMiddleware(req, res, next) {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer '))
        return res.status(401).json({ error: 'Token requerido' });
    try {
        req.user = jsonwebtoken_1.default.verify(h.split(' ')[1], SECRET);
        next();
    }
    catch {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}
function requireRol(...roles) {
    return (req, res, next) => {
        const u = req.user;
        if (!roles.includes(u.rol))
            return res.status(403).json({ error: `Requiere rol: ${roles.join(' o ')}` });
        next();
    };
}
