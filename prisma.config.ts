import "dotenv/config";

export default {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: 'npx ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
};