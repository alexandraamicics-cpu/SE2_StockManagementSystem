const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function getDbConfig() {
  const {
    DATABASE_URL,
    MYSQL_URL,
    DB_HOST,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    DB_PORT,
    MYSQLHOST,
    MYSQLUSER,
    MYSQLPASSWORD,
    MYSQLDATABASE,
    MYSQLPORT
  } = process.env;

  if (DATABASE_URL || MYSQL_URL) {
    const url = new URL(DATABASE_URL || MYSQL_URL);
    return {
      host: url.hostname,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      port: Number(url.port || 3306)
    };
  }

  return {
    host: DB_HOST || MYSQLHOST || 'localhost',
    user: DB_USER || MYSQLUSER || 'root',
    password: DB_PASSWORD || MYSQLPASSWORD || '',
    database: DB_NAME || MYSQLDATABASE || 'db_stock',
    port: Number(DB_PORT || MYSQLPORT || '3306')
  };
}

const pool = mysql.createPool({
  ...getDbConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
