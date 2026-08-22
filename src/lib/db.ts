import { PrismaClient } from "@prisma/client";

// Next.js dev mode re-evaluates modules on every hot reload, which would open a
// new pool each time. Cache the client on globalThis outside production.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
