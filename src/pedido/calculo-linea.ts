export interface LineaCalculada {
  articuloId: number;
  nombre: string;
  cantidad: number;
  precioVenta: number;
  descuentoPorcentaje: number;
  alicuotaIvaPorcentaje: number;
  importeBruto: number;
  importeDescuento: number;
  importeNeto: number;
  importeIva: number;
  importeFinal: number;
}

export function calcularLinea(args: {
  articuloId: number;
  nombre: string;
  cantidad: number;
  precioVenta: number;
  descuentoPorcentaje: number;
  alicuotaIvaPorcentaje: number;
}): LineaCalculada {
  const importeBruto = args.precioVenta * args.cantidad;
  const importeDescuento = importeBruto * (args.descuentoPorcentaje / 100);
  const importeNeto = importeBruto - importeDescuento;
  const importeIva = importeNeto * (args.alicuotaIvaPorcentaje / 100);
  const importeFinal = importeNeto + importeIva;

  return { ...args, importeBruto, importeDescuento, importeNeto, importeIva, importeFinal };
}