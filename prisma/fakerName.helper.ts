import { faker } from '@faker-js/faker';

const NOMBRES = [
  'Juan', 'Carlos', 'José', 'Luis', 'Jorge', 'Miguel', 'Alberto', 'Alfonso',
  'Martín', 'Diego', 'Pablo', 'Federico', 'Lucas', 'Matías', 'Nicolás',
  'María', 'Ana', 'Laura', 'Carolina', 'Julieta', 'Lucía', 'Sofía',
  'Valentina', 'Florencia', 'Gabriela', 'Silvia', 'Marcela', 'Romina',
];

const APELLIDOS = [
  'González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez',
  'Pérez', 'García', 'Sánchez', 'Romero', 'Sosa', 'Álvarez', 'Torres',
  'Ruiz', 'Ramírez', 'Flores', 'Benítez', 'Acosta', 'Medina', 'Herrera',
  'Suárez', 'Aguirre', 'Giménez', 'Gutiérrez', 'Castro', 'Pereyra', 'Rojas',
];

export const nombreAleatorio = () => faker.helpers.arrayElement(NOMBRES);
export const apellidoAleatorio = () => faker.helpers.arrayElement(APELLIDOS);