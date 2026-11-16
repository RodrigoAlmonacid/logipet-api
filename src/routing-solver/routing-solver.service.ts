import { Injectable } from '@nestjs/common';
import { solve as solveFn } from './routing-solver';
import { SolveVrpInput, SolveVrpOutput } from './routing-solver.types';

// ============================================================
// RoutingSolverService — wrapper @Injectable alrededor de la
// función pura solve() del módulo routing-solver.
//
// Hacemos esto (en vez de importar solve() directamente desde
// PlanRutaService) para poder mockear el solver en los tests de
// PlanRutaService usando el sistema estándar de DI de NestJS:
//
//   { provide: RoutingSolverService, useValue: { solve: jest.fn() } }
//
// Sin este wrapper, tendríamos que usar jest.unstable_mockModule
// que NO funciona correctamente con Jest 30 + ESM nativo (el mock
// se registra pero el import directo en el código de producción
// igual carga el módulo real).
// ============================================================

@Injectable()
export class RoutingSolverService {
  solve(input: SolveVrpInput): Promise<SolveVrpOutput> {
    return solveFn(input);
  }
}
