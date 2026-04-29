"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const arqueos_1 = __importDefault(require("./routes/arqueos"));
const tickets_1 = __importDefault(require("./routes/tickets"));
const excel_1 = __importDefault(require("./routes/excel"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
app.use('/api/auth', auth_1.default);
app.use('/api/users', users_1.default);
app.use('/api/arqueos', arqueos_1.default);
app.use('/api/tickets', tickets_1.default);
app.use('/api/excel', excel_1.default);
app.get('/api/health', (_req, res) => res.json({ status: 'OK', version: '4.2.0', app: 'KHIPU Arqueo Pro' }));
if (process.env.NODE_ENV === 'production') {
    app.use(express_1.default.static(path_1.default.join(__dirname, '../frontend/dist')));
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api'))
            return res.status(404).json({ error: 'Not found' });
        res.sendFile(path_1.default.join(__dirname, '../frontend/dist/index.html'));
    });
}
app.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║     KHIPU ARQUEO PRO v4.2 — Backend API      ║');
    console.log('║          Corporación Khipu · 2026            ║');
    console.log(`║      Corriendo en http://localhost:${PORT}      ║`);
    console.log('╚══════════════════════════════════════════════╝\n');
});
exports.default = app;
