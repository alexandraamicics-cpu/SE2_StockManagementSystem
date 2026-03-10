const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

function getDbConfig() {
  const {
    DATABASE_URL,
    MYSQL_URL,
    DB_HOST,
    DB_USER,
    DB_PASSWORD,
    DB_PORT,
    MYSQLHOST,
    MYSQLUSER,
    MYSQLPASSWORD,
    MYSQLPORT
  } = process.env;

  if (DATABASE_URL || MYSQL_URL) {
    const url = new URL(DATABASE_URL || MYSQL_URL);
    return {
      host: url.hostname,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      port: Number(url.port || 3306)
    };
  }

  return {
    host: DB_HOST || MYSQLHOST || 'localhost',
    user: DB_USER || MYSQLUSER || 'root',
    password: DB_PASSWORD || MYSQLPASSWORD || '',
    port: Number(DB_PORT || MYSQLPORT || '3306')
  };
}

async function run() {
  const conn = await mysql.createConnection({
    ...getDbConfig(),
    multipleStatements: true
  });

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
