const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const fs = require('fs');
const mysql = require('mysql2/promise');
const { getDbConfig, validateDbConfig } = require('./utils/dbConfig');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const pairRoutes = require('./routes/pairs');
const activityRoutes = require('./routes/activity');
const analyticsRoutes = require('./routes/analytics');
const settingsRoutes = require('./routes/settings');
const overviewRoutes = require('./routes/overview');

const app = express();
const PORT = process.env.PORT || 4000;
const dbConfig = getDbConfig();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDbError(err) {
  return ['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'PROTOCOL_CONNECTION_LOST'].includes(err && err.code);
}

async function withDbRetry(task, label, attempts = 10, delayMs = 3000) {
  let lastError;

  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await task();
    } catch (err) {
      lastError = err;
      if (!isRetryableDbError(err) || i === attempts) break;
      console.warn(`${label} attempt ${i}/${attempts} failed (${err.code}). Retrying in ${delayMs}ms...`);
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

async function ensureSchema() {
  const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;

  const schema = fs.readFileSync(schemaPath, 'utf8');
  const schemaSql = prepareSchemaSql(schema, dbConfig.database);

  await withDbRetry(async () => {
    const conn = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port,
      multipleStatements: true
    });

    await conn.query(schemaSql);
    await conn.end();
  }, 'ensureSchema');
}

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.use(express.static(path.join(process.cwd(), 'frontend')));
app.use('/images', express.static(path.join(process.cwd(), 'images')));

app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

async function start() {
  try {
    validateDbConfig(dbConfig);
    await ensureSchema();
  } catch (err) {
    console.error('Failed to ensure DB schema:', err.message || err);
  }

  const sessionStore = new MySQLStore({
    ...dbConfig,
    createDatabaseTable: true
  });

  app.set('trust proxy', 1);
  app.use(session({
    key: 'sessid',
    secret: process.env.SESSION_SECRET || 'secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 4,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    }
  }));

  app.use('/api/auth', authRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/pairs', pairRoutes);
  app.use('/api/activity', activityRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/overview', overviewRoutes);
  app.use('/api/settings', settingsRoutes);

  app.get('/', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'frontend', 'index.html'));
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
