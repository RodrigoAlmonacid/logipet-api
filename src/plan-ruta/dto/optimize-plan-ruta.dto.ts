import { IsInt, IsOptional, IsPositive, Min } from 'class-validator';

// ============================================================
// DTO para optimizar un PlanRuta existente.
//
// Todos los campos son opcionales — el endpoint
// POST /plan-rutas/:id/optimize los acepta como overrides al
// comportamiento default del optimizador.
//
// Por ahora sólo exponemos `timeLimitMs` (default 10s). En el
// futuro se pueden agregar:
//   - camionIds?: number[]   (forzar un subset distinto de camiones)
//   - pedidoIds?: number[]   (forzar un subset distinto de pedidos)
//   - allowDrops?: boolean   (false = infactible en vez de drop)
// ============================================================

export class OptimizePlanRutaDto {
  /**
   * Tiempo máximo que el solver puede pasar buscando, en milisegundos.
   * Default: 10_000 (10 segundos). Para problemas grandes (>50 stops)
   * conviene 30_000 o más.
   */
  @IsOptional()
  @IsInt({ message: 'timeLimitMs debe ser un entero' })
  @Min(1000, { message: 'timeLimitMs debe ser ≥ 1000 (1 segundo)' })
  timeLimitMs?: number;
}
