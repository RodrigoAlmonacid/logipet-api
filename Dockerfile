FROM node:18-alpine

WORKDIR /app

# Copiamos solo los archivos de dependencias primero para aprovechar el caché de Docker
COPY package*.json ./
COPY prisma ./prisma/

# Instalamos dependencias y generamos el cliente de Prisma
RUN npm install
RUN npx prisma generate

# Copiamos el resto del código
COPY . .

# Exponemos el puerto de NestJS
EXPOSE 3000

# Comando para iniciar en modo desarrollo con hot-reload
CMD ["npm", "run", "start:dev"]