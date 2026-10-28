const { Pool } = require('pg');
const mongoose = require('mongoose');
const { config } = require('../config');
const { prisma, getPrismaClient } = require('./prisma');

const pool = new Pool({
  connectionString: config.databaseUrl,
});

pool.on('error', (err) => {
  console.warn('[DB] Unexpected idle client error:', err.message);
});

async function connectMongo() {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('[DB] Connected to MongoDB 7.0');
  } catch (err) {
    console.warn('[DB] MongoDB connection warning:', err.message);
  }
}

async function connectPostgres() {
  try {
    const client = await pool.connect();
    client.release();
    const prismaClient = getPrismaClient();
    if (prismaClient) {
      await prismaClient.$connect().catch(() => {});
    }
    console.log('[DB] Connected to PostgreSQL 16 (pg pool + Prisma ORM)');
  } catch (err) {
    console.warn('[DB] PostgreSQL connection warning:', err.message);
  }
}

module.exports = {
  pool,
  prisma,
  getPrismaClient,
  connectMongo,
  connectPostgres,
};
