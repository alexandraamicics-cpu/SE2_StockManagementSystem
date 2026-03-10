const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const fs = require('fs');
const mysql = require('mysql2/promise');

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

const dbConfig = getDbConfig();

async function ensureSchema() {
  const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const conn = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    port: dbConfig.port,
    multipleStatements: true
  });
  await conn.query(schema);
  await conn.end();
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
    await ensureSchema();
  } catch (err) {
    console.error('Failed to ensure DB schema:', err);
  }

  const sessionStore = new MySQLStore(dbConfig);
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
