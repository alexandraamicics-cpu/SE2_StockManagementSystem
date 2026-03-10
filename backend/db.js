const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const { getDbConfig, validateDbConfig } = require('./utils/dbConfig');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dbConfig = getDbConfig();
validateDbConfig(dbConfig);

const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
