FROM node:22

# Desactivar telemetría e interacciones automáticas de Prisma
ENV PRISMA_DISABLE_TELEMETRY=1
ENV CHECKPOINT_DISABLE=1

WORKDIR /app

# Copiar manifiestos de dependencias
COPY package*.json ./

# Copiar esquema y configuración de Prisma necesarios para el cliente
COPY prisma ./prisma/

# Instalar dependencias
RUN npm install

# Copiar el código fuente restante
COPY . .

# Generar el cliente de Prisma explicitamente
RUN npx prisma generate

EXPOSE 3000
CMD ["npm", "run", "start:dev"]