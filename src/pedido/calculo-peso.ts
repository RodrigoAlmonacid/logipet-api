export interface LineaPeso {
  pesoUnitarioGramos: number | null;
  cantidad: number;
}

export function calcularPeso(lineas: LineaPeso[]) {
  const pesoGramos = lineas.reduce((acc, l) => acc + (l.pesoUnitarioGramos ?? 0) * l.cantidad, 0);
  const pesoIncompleto = lineas.some((l) => l.pesoUnitarioGramos === null);
  return { pesoGramos, pesoIncompleto };
}