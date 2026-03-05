const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const {
  DB_HOST = 'localhost',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'db_1800soles_stock_management',
  DB_PORT = '3306'
} = process.env;

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: Number(DB_PORT),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
