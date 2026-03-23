import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prevent creating a new PrismaClient on every hot-reload in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
let prismaInstance = globalForPrisma.prisma;

export function getPrisma(): PrismaClient {
  if (prismaInstance) return prismaInstance;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL in environment");
  }

  prismaInstance = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prismaInstance;
  }

  return prismaInstance;
}

