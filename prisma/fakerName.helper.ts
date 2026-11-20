import { faker } from '@faker-js/faker';

const NOMBRES = [
  'Juan', 'Carlos', 'José', 'Luis', 'Jorge', 'Miguel', 'Alberto', 'Alfonso',
  'Martín', 'Diego', 'Pablo', 'Federico', 'Lucas', 'Matías', 'Nicolás',
  'Gabriel', 'Daniel', 'Andrés', 'Sergio', 'Fernando', 'Ricardo', 'Roberto',
  'Gustavo', 'Eduardo', 'Mariano', 'Sebastián', 'Facundo', 'Ezequiel',
  'Maximiliano', 'Franco', 'Agustín', 'Tomás', 'Ignacio', 'Emiliano',
  'Leandro', 'Rodrigo', 'Esteban', 'Hernán', 'Alejandro', 'Ramón',
  'Cristian', 'Diego', 'Iván', 'Bruno', 'Joaquín', 'Thiago', 'Benjamín',
  'Lautaro', 'Valentín', 'Damián', 'Fabián', 'Patricio', 'Gonzalo',
  'Ariel', 'Oscar', 'Hugo', 'Raúl', 'Rubén', 'Walter', 'Claudio',
  'María', 'Ana', 'Laura', 'Carolina', 'Julieta', 'Lucía', 'Sofía',
  'Valentina', 'Florencia', 'Gabriela', 'Silvia', 'Marcela', 'Romina',
  'Paula', 'Andrea', 'Daniela', 'Natalia', 'Verónica', 'Patricia',
  'Claudia', 'Mariana', 'Cecilia', 'Mónica', 'Alejandra', 'Vanesa',
  'Camila', 'Agustina', 'Milagros', 'Micaela', 'Belén', 'Rocío',
  'Candela', 'Malena', 'Josefina', 'Victoria', 'Martina', 'Antonella',
  'Abril', 'Lourdes', 'Carla', 'Noelia', 'Lorena', 'Sandra', 'Silvana',
  'Graciela', 'Eliana', 'Melina', 'Pilar', 'Emilia', 'Renata',
  'Bianca', 'Ailén', 'Ayelén', 'Yamila', 'Soledad', 'Eluney',
];

const APELLIDOS = [
  'González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz',
  'Martínez', 'Pérez', 'García', 'Sánchez', 'Romero', 'Sosa',
  'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Benítez',
  'Acosta', 'Medina', 'Herrera', 'Suárez', 'Aguirre', 'Giménez',
  'Gutiérrez', 'Castro', 'Pereyra', 'Rojas', 'Molina', 'Ortiz',
  'Silva', 'Núñez', 'Luna', 'Cabrera', 'Ríos', 'Vargas',
  'Domínguez', 'Morales', 'Quiroga', 'Correa', 'Peralta', 'Vega',
  'Campos', 'Figueroa', 'Navarro', 'Cáceres', 'Méndez', 'Ponce',
  'Bravo', 'Carrizo', 'Miranda', 'Vázquez', 'Arias', 'Godoy',
  'Sepúlveda', 'Sandoval', 'Jara', 'Contreras', 'Muñoz', 'Valdés',
  'Cárdenas', 'Poblete', 'Orellana', 'Cifuentes', 'Mansilla',
  'Barría', 'Almonacid', 'Vera', 'Ojeda', 'Millán', 'Cayul',
  'Huenchul', 'Antilef', 'Calfín', 'Paillalef', 'Currumil',
  'Nahuelpan', 'Painemil', 'Maripil', 'Colipan',
  'Bianchi', 'Rossi', 'Ferrari', 'Lombardi', 'Romano', 'Rinaldi',
  'Colombo', 'Moretti', 'Conti', 'Esposito', 'Gallo', 'Mancini',
  'Vázquez', 'Ibarra', 'Leiva', 'Escobar', 'Cordero', 'Pizarro',
  'Cortés', 'Delgado', 'Aguilar', 'Reyes', 'Maldonado', 'Bravo',
];

export const nombreAleatorio = () => faker.helpers.arrayElement(NOMBRES);
export const apellidoAleatorio = () => faker.helpers.arrayElement(APELLIDOS);