// ============================================================
// Constantes del módulo OSRM
// ============================================================

/** Timeout por defecto para llamadas HTTP a OSRM (ms). */
export const OSRM_DEFAULT_TIMEOUT_MS = 10_000;

/** Mensajes de error en español, para mantener consistencia con el resto del sistema. */
export const OSRM_ERROR_MESSAGES = {
  URL_MISSING:
    'OSRM_URL no está configurada. Definila en docker-compose.yml o .env.',
  EMPTY_COORDS:
    'Se requiere al menos una coordenada para consultar OSRM.',
  TOO_FEW_FOR_TABLE:
    'El servicio /table requiere al menos 2 coordenadas.',
  TIMEOUT:
    'OSRM no respondió en el tiempo esperado. ¿Está el contenedor levantado?',
  BAD_STATUS: (status: number) =>
    `OSRM respondió con status HTTP ${status}.`,
  BAD_RESPONSE_CODE: (code: string) =>
    `OSRM rechazó el pedido con código "${code}". Probablemente las coordenadas estén fuera del grafo.`,
  INVALID_JSON:
    'OSRM devolvió una respuesta que no es JSON válido.',
} as const;

/** Codigos de estado interno que OSRM usa en el campo `code` de sus respuestas. */
export const OSRM_RESPONSE_CODE = {
  OK: 'Ok',
} as const;
