const { config } = require('../config');

let prismaInstance = null;

/**
 * Lazily initializes and returns the singleton PrismaClient instance
 * layered over the PostgreSQL 16 schema (`prisma/schema.prisma`).
 *
 * Uses graceful fallback so that raw `pg` pool queries and unit tests continue
 * to function without interruption even if `npx prisma generate` has not been
 * run yet in a minimal test environment.
 */
function getPrismaClient() {
  if (prismaInstance) {
    return prismaInstance;
  }

  try {
    const { PrismaClient } = require('@prisma/client');
    prismaInstance = new PrismaClient({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
      log: (config.nodeEnv || config.env) === 'development' ? ['warn', 'error'] : ['error'],
    });
    return prismaInstance;
  } catch (err) {
    // Graceful no-op proxy when @prisma/client is not yet generated locally
    return null;
  }
}

const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getPrismaClient();
      if (!client) {
        if (prop === '$connect' || prop === '$disconnect') {
          return async () => {};
        }
        return undefined;
      }
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
  }
);

module.exports = {
  prisma,
  getPrismaClient,
};
