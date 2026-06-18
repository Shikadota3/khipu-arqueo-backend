BEGIN;
DO $$
DECLARE
  v_ruc       TEXT := '99999999851';
  v_empresa_id INT;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM empresas WHERE ruc = v_ruc;

  IF v_empresa_id IS NULL THEN
    RAISE NOTICE 'No se encontró ninguna empresa con ese RUC. No se borró nada.';
  ELSE
    DELETE FROM tickets_cierre        WHERE arqueo_id IN (SELECT arqueo_id FROM arqueos WHERE empresa_id = v_empresa_id);
    DELETE FROM entradas_transferencia WHERE arqueo_id IN (SELECT arqueo_id FROM arqueos WHERE empresa_id = v_empresa_id);
    DELETE FROM entradas_digitales     WHERE arqueo_id IN (SELECT arqueo_id FROM arqueos WHERE empresa_id = v_empresa_id);
    DELETE FROM entradas_pos           WHERE arqueo_id IN (SELECT arqueo_id FROM arqueos WHERE empresa_id = v_empresa_id);
    DELETE FROM detalle_denominaciones WHERE arqueo_id IN (SELECT arqueo_id FROM arqueos WHERE empresa_id = v_empresa_id);
    DELETE FROM operaciones            WHERE arqueo_id IN (SELECT arqueo_id FROM arqueos WHERE empresa_id = v_empresa_id);
    DELETE FROM arqueos                WHERE empresa_id = v_empresa_id;
    DELETE FROM usuarios               WHERE empresa_id = v_empresa_id;
    DELETE FROM empresas               WHERE empresa_id = v_empresa_id;
    RAISE NOTICE 'Empresa de prueba % borrada correctamente.', v_empresa_id;
  END IF;
END $$;
COMMIT;