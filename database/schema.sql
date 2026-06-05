-- ============================================================
-- KHIPU ARQUEO PRO v4.2 — Schema PostgreSQL (Supabase)
-- Pegar en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- ── Empresas ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  empresa_id    SERIAL PRIMARY KEY,
  nombre        VARCHAR(200) NOT NULL,
  ruc           VARCHAR(11)  NOT NULL UNIQUE,
  rubro         VARCHAR(100) NOT NULL,
  direccion     VARCHAR(300),
  telefono      VARCHAR(20),
  pin_admin     VARCHAR(256) NOT NULL,
  fecha_creacion TIMESTAMP   NOT NULL DEFAULT NOW(),
  activo        BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ── Usuarios ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  usuario_id     SERIAL PRIMARY KEY,
  empresa_id     INT          NOT NULL REFERENCES empresas(empresa_id),
  nombre_completo VARCHAR(200) NOT NULL,
  apellidos      VARCHAR(200),
  rol            VARCHAR(20)  NOT NULL CHECK (rol IN ('CAJERO','AUDITOR')),
  pin            VARCHAR(256) NOT NULL,
  numero_caja    VARCHAR(20),
  telefono       VARCHAR(20),
  direccion      VARCHAR(300),
  creado_por     INT          REFERENCES usuarios(usuario_id),
  fecha_creacion TIMESTAMP    NOT NULL DEFAULT NOW(),
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_numero_caja UNIQUE (empresa_id, numero_caja)
);

-- ── Arqueos ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arqueos (
  arqueo_id            SERIAL PRIMARY KEY,
  empresa_id           INT           NOT NULL REFERENCES empresas(empresa_id),
  usuario_id           INT           NOT NULL REFERENCES usuarios(usuario_id),
  modo                 VARCHAR(20)   NOT NULL CHECK (modo IN ('EDUCATIVO','TRABAJO')),
  tipo_negocio         VARCHAR(100)  NOT NULL,
  periodo              VARCHAR(20)   NOT NULL CHECK (periodo IN ('APERTURA','INTERMEDIO','CIERRE')),
  fecha_arqueo         DATE          NOT NULL,
  hora_inicio          VARCHAR(10),
  hora_fin             VARCHAR(10),
  saldo_apertura       NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_teorico        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_fisico         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_pos            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_digital        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_real           NUMERIC(12,2) NOT NULL DEFAULT 0,
  diferencia           NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado_caja          VARCHAR(20)   NOT NULL CHECK (estado_caja IN ('BALANCEADA','SOBRANTE','FALTANTE')),
  explicacion_faltante VARCHAR(500),
  tratamiento_faltante VARCHAR(50),
  estado_aprobacion    VARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE'
                       CHECK (estado_aprobacion IN ('PENDIENTE','APROBADO','OBSERVADO','RECHAZADO')),
  aprobado_por         INT           REFERENCES usuarios(usuario_id),
  fecha_aprobacion     TIMESTAMP,
  observacion_auditor  VARCHAR(500),
  fecha_creacion       TIMESTAMP     NOT NULL DEFAULT NOW(),
  fecha_cierre         TIMESTAMP
);

-- ── Operaciones ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operaciones (
  operacion_id    SERIAL PRIMARY KEY,
  arqueo_id       INT           NOT NULL REFERENCES arqueos(arqueo_id),
  usuario_id      INT           NOT NULL REFERENCES usuarios(usuario_id),
  concepto        VARCHAR(300)  NOT NULL,
  monto           NUMERIC(12,2) NOT NULL,
  tipo_movimiento VARCHAR(10)   NOT NULL CHECK (tipo_movimiento IN ('INGRESO','EGRESO')),
  metodo_pago     VARCHAR(30)   NOT NULL,
  tipo_documento  VARCHAR(30)   NOT NULL,
  numero_documento VARCHAR(100),
  tiene_documento BOOLEAN       NOT NULL DEFAULT FALSE,
  imagen_documento TEXT,         -- base64 en texto
  origen_carga    VARCHAR(20)   NOT NULL DEFAULT 'MANUAL',
  fecha_operacion TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- ── Denominaciones ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS detalle_denominaciones (
  detalle_id       SERIAL PRIMARY KEY,
  arqueo_id        INT           NOT NULL REFERENCES arqueos(arqueo_id),
  denominacion     NUMERIC(8,2)  NOT NULL,
  tipo_denominacion VARCHAR(10)  NOT NULL CHECK (tipo_denominacion IN ('BILLETE','MONEDA')),
  cantidad         INT           NOT NULL DEFAULT 0,
  sub_total        NUMERIC(12,2) GENERATED ALWAYS AS (denominacion * cantidad) STORED
);

-- ── Entradas POS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entradas_pos (
  pos_id        SERIAL PRIMARY KEY,
  arqueo_id     INT           NOT NULL REFERENCES arqueos(arqueo_id),
  monto         NUMERIC(12,2) NOT NULL,
  numero_lote   VARCHAR(50),
  fecha_registro TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ── Entradas Digitales (Yape/Plin) ───────────────────────────
CREATE TABLE IF NOT EXISTS entradas_digitales (
  digital_id      SERIAL PRIMARY KEY,
  arqueo_id       INT           NOT NULL REFERENCES arqueos(arqueo_id),
  monto           NUMERIC(12,2) NOT NULL,
  numero_operacion VARCHAR(50),
  fecha_registro  TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- ── Tickets Cierre ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets_cierre (
  ticket_id             SERIAL PRIMARY KEY,
  arqueo_id             INT           NOT NULL REFERENCES arqueos(arqueo_id),
  usuario_id            INT           NOT NULL REFERENCES usuarios(usuario_id),
  saldo_cierre          NUMERIC(12,2) NOT NULL,
  saldo_siguiente_turno NUMERIC(12,2) NOT NULL DEFAULT 0,
  observaciones         VARCHAR(500),
  aprobado_por          VARCHAR(200),
  estado                VARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (estado IN ('PENDIENTE','APROBADO','OBSERVADO')),
  fecha_emision         TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ix_arqueos_empresa_id   ON arqueos(empresa_id);
CREATE INDEX IF NOT EXISTS ix_arqueos_usuario_id   ON arqueos(usuario_id);
CREATE INDEX IF NOT EXISTS ix_arqueos_fecha        ON arqueos(fecha_arqueo);
CREATE INDEX IF NOT EXISTS ix_operaciones_arqueo   ON operaciones(arqueo_id);
CREATE INDEX IF NOT EXISTS ix_usuarios_empresa_id  ON usuarios(empresa_id);
