const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const {
  DB_HOST = 'localhost',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_PORT = '3306'
} = process.env;

async function run() {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    port: Number(DB_PORT),
    multipleStatements: true
  });

  const schema = fs.readFileSync(path.resolve(process.cwd(), 'database', 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.resolve(process.cwd(), 'database', 'seed.sql'), 'utf8');

  await conn.query(schema);
  await conn.query(seed);

  console.log('Database initialized and seeded.');
  await conn.end();
}

run().catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
