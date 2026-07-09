"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
    max: 30, // valor provisional, lo ajustamos según el dato de abajo
    min: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
});
pool.on('connect', () => {
    console.log('✅ Conectado a PostgreSQL — KhipuArqueoPro');
});
pool.on('error', (err) => {
    console.error('❌ Error en pool PostgreSQL:', err.message);
});
exports.default = pool;
