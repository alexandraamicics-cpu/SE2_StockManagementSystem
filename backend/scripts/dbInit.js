const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const { getDbConfig, validateDbConfig } = require('../utils/dbConfig');

const dbConfig = getDbConfig();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDbError(err) {
  return ['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'PROTOCOL_CONNECTION_LOST'].includes(err && err.code);
}

async function connectWithRetry(attempts = 10, delayMs = 3000) {
  let lastError;

  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await mysql.createConnection({
        host: dbConfig.host,
        user: dbConfig.user,
        password: dbConfig.password,
        port: dbConfig.port,
        multipleStatements: true
      });
    } catch (err) {
      lastError = err;
      if (!isRetryableDbError(err) || i === attempts) break;
      console.warn(`DB init connection attempt ${i}/${attempts} failed (${err.code}). Retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function run() {
  validateDbConfig(dbConfig);

  const conn = await connectWithRetry();

  const schema = fs.readFileSync(path.resolve(process.cwd(), 'database', 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.resolve(process.cwd(), 'database', 'seed.sql'), 'utf8');

  await conn.query(schema);
  await conn.query(seed);

  console.log('Database initialized and seeded.');
  await conn.end();
}

run().catch((err) => {
  console.error('DB init failed:', err);
  process.exit(1);
});
