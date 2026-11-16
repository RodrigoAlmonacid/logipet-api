import { PartialType } from '@nestjs/mapped-types';
import { CreateDepositoDto } from './create-deposito.dto';

// ============================================================
// DTO para actualizar un depósito.
// Todos los campos son opcionales porque un PATCH puede actualizar
// cualquiera de ellos, o ninguno (no-op).
// ============================================================

export class UpdateDepositoDto extends PartialType(CreateDepositoDto) {}
