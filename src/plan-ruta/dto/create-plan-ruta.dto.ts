import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  Min,
  ValidateNested,
} from 'class-validator';

// ============================================================
// DTO para crear un PlanRuta.
//
// Un PlanRuta es la unidad de planificación diaria: agrupa los
// Pedidos a rutear y los Camiones disponibles para que el
// optimizador (POST /plan-rutas/:id/optimize) reparta el trabajo.
//
// La selección concreta de pedidos se hace en otro endpoint
// (probablemente PATCH /plan-rutas/:id/pedidos) que aún no existe —
// este DTO sólo crea el "contenedor" con la fecha, depósito,
// hora límite y vehículos candidatos.
// ============================================================

export class CreatePlanRutaDto {
  @IsDateString({}, { message: 'fecha debe ser una fecha ISO 8601 válida' })
  @IsNotEmpty({ message: 'fecha es obligatoria' })
  fecha: string;

  @IsInt({ message: 'depositoId debe ser un entero' })
  @IsPositive({ message: 'depositoId debe ser > 0' })
  depositoId: number;

  @IsDateString({}, { message: 'horaLimite debe ser una fecha ISO 8601 válida' })
  @IsNotEmpty({ message: 'horaLimite es obligatoria' })
  horaLimite: string;

  /**
   * IDs de camiones disponibles para este plan. Si se omite, el
   * optimize() va a usar todos los camiones con disponible=true
   * que no estén asignados a otro Envio del mismo día.
   */
  @IsOptional()
  @IsArray({ message: 'camionIds debe ser un array' })
  @ArrayMinSize(1, { message: 'camionIds debe tener al menos 1 elemento' })
  @IsInt({ each: true, message: 'camionIds debe contener enteros' })
  @IsPositive({ each: true, message: 'camionIds debe contener enteros > 0' })
  camionIds?: number[];
}
