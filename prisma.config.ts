import path from "node:path";
import { defineConfig } from "prisma/config";
import { config } from "dotenv";

config(); // Carrega o arquivo .env

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    // Usa DIRECT_URL (porta 5432) para modificar o banco, com fallback para DATABASE_URL
    url: process.env.DIRECT_URL || process.env.DATABASE_URL!,
  },
  migrate: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL!,
  },
});
