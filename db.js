const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD?.trim(),
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),

  connectionLimit: 10,
  connectTimeout: 15000,
  acquireTimeout: 15000,
  idleTimeout: 30000,

  ssl: { rejectUnauthorized: false },

  // 🔑 REQUIRED FOR REMOTE DB AUTH
  allowPublicKeyRetrieval: true
});
