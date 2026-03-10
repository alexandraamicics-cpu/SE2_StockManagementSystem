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


function prepareSchemaSql(schema, databaseName) {
  const sanitized = String(schema || '')
    .replace(/^\s*CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+[^;]+;\s*$/gim, '')
    .replace(/^\s*USE\s+[^;]+;\s*$/gim, '')
    .trim();

  return `CREATE DATABASE IF NOT EXISTS \`${databaseName}\`;
USE \`${databaseName}\`;
${sanitized}`;
}

function prepareSeedSql(seed, databaseName) {
  const sanitized = String(seed || '')
    .replace(/^\s*USE\s+[^;]+;\s*$/gim, '')
    .trim();

  return `USE \`${databaseName}\`;
${sanitized}`;
}

async function run() {
  validateDbConfig(dbConfig);

  const conn = await connectWithRetry();

  const rawSchema = fs.readFileSync(path.resolve(process.cwd(), 'database', 'schema.sql'), 'utf8');
  const rawSeed = fs.readFileSync(path.resolve(process.cwd(), 'database', 'seed.sql'), 'utf8');
  const schema = prepareSchemaSql(rawSchema, dbConfig.database);
  const seed = prepareSeedSql(rawSeed, dbConfig.database);

  await conn.query(schema);
  await conn.query(seed);

  console.log('Database initialized and seeded.');
  await conn.end();
}

run().catch((err) => {
  console.error('DB init failed:', err);
  process.exit(1);
});
