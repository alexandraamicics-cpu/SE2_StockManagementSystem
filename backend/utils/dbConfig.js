const DEFAULT_DB_NAME = 'db_stock';

function parseUrlConfig(rawUrl) {
  const url = new URL(rawUrl);
  return {
    host: url.hostname,
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent(url.pathname.replace(/^\//, '') || DEFAULT_DB_NAME),
    port: Number(url.port || 3306)
  };
}

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
    return parseUrlConfig(DATABASE_URL || MYSQL_URL);
  }

  const config = {
    host: DB_HOST || MYSQLHOST || '',
    user: DB_USER || MYSQLUSER || 'root',
    password: DB_PASSWORD || MYSQLPASSWORD || '',
    database: DB_NAME || MYSQLDATABASE || DEFAULT_DB_NAME,
    port: Number(DB_PORT || MYSQLPORT || '3306')
  };

  if (!config.host) {
    config.host = process.env.NODE_ENV === 'production' ? '' : 'localhost';
  }

  return config;
}

function validateDbConfig(config) {
  if (!config.host) {
    throw new Error(
      'Database host is missing. Set one of DATABASE_URL, MYSQL_URL, DB_HOST, or MYSQLHOST in environment variables.'
    );
  }

  if (!config.user) {
    throw new Error('Database user is missing. Set DB_USER or MYSQLUSER.');
  }

  if (!Number.isFinite(config.port) || config.port <= 0) {
    throw new Error('Database port is invalid. Set DB_PORT or MYSQLPORT to a valid number.');
  }
}

module.exports = {
  getDbConfig,
  validateDbConfig
};
