export function precioConIva(articulo: { precio: number; alicuotaIva: { porcentaje: number } }) {
  return articulo.precio * (1 + articulo.alicuotaIva.porcentaje / 100);
}

export function esCuitValido(cuit: string): boolean {
  const limpio = cuit.replace(/-/g, '');
  if (!/^\d{11}$/.test(limpio)) return false;

  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digitos = limpio.split('').map(Number);
  const suma = multiplicadores.reduce((acc, m, i) => acc + m * digitos[i], 0);
  const verificador = (11 - (suma % 11)) % 11;

  return verificador === digitos[10];
}