import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import sqliteSession from 'connect-sqlite3';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import multer from 'multer';
import fs from 'fs';
import jwt from 'jsonwebtoken';

// --- Path Utilities ---
const isProduction = process.env.NODE_ENV === 'production';
const rootDir = process.cwd();
const uploadsDir = path.join(rootDir, 'uploads');
const JWT_SECRET = process.env.JWT_SECRET || 'opmgg-ultra-secret-key-999';

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// --- Database Setup ---
const dbPath = path.join(rootDir, 'database.db');
// Handling ESM/CJS interop for better-sqlite3
const BetterSqlite3 = (Database as any).default || Database;
const db = new BetterSqlite3(dbPath);
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    hashedPassword TEXT NOT NULL,
    role TEXT DEFAULT 'agent',
    badge_text TEXT,
    badge_color TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS memes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    postedBy TEXT NOT NULL,
    postedById TEXT NOT NULL,
    postedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    fileUrl TEXT NOT NULL,
    fileType TEXT NOT NULL,
    tags TEXT NOT NULL,
    description TEXT,
    score INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    reports INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS votes (
    memeId TEXT NOT NULL,
    userId TEXT NOT NULL,
    value INTEGER NOT NULL, -- 1 for up, -1 for down
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (memeId, userId),
    FOREIGN KEY (memeId) REFERENCES memes (id),
    FOREIGN KEY (userId) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    memeId TEXT NOT NULL,
    userId TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reward_rules (
    id TEXT PRIMARY KEY,
    metric TEXT NOT NULL,
    operator TEXT NOT NULL,
    value INTEGER NOT NULL,
    title_text TEXT NOT NULL,
    title_color TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Default Reward Rules
const existingRules = (db.prepare('SELECT COUNT(*) as count FROM reward_rules').get() as any);
if (existingRules.count === 0) {
  const defaultRules = [
    { id: 'rule_1', metric: 'score', operator: '>=', value: 100, title_text: 'LENDA', title_color: '#fbbf24' },
    { id: 'rule_2', metric: 'memes', operator: '>=', value: 10, title_text: 'CONTRIBUINTE', title_color: '#34d399' },
    { id: 'rule_3', metric: 'views', operator: '>=', value: 500, title_text: 'VIRAL', title_color: '#a78bfa' },
    { id: 'rule_4', metric: 'votes', operator: '>=', value: 50, title_text: 'CRÍTICO', title_color: '#f87171' },
    { id: 'rule_5', metric: 'engagement', operator: '>=', value: 20, title_text: 'RELEVANTE', title_color: '#60a5fa' }
  ];
  const stmt = db.prepare('INSERT INTO reward_rules (id, metric, operator, value, title_text, title_color) VALUES (?, ?, ?, ?, ?, ?)');
  for (const rule of defaultRules) {
    stmt.run(rule.id, rule.metric, rule.operator, rule.value, rule.title_text, rule.title_color);
  }
}


// --- Migrations for existing DB ---
try { db.exec('ALTER TABLE memes ADD COLUMN description TEXT;'); } catch(e) {}
try { db.exec('ALTER TABLE memes ADD COLUMN views INTEGER DEFAULT 0;'); } catch(e) {}
try { db.exec('ALTER TABLE memes ADD COLUMN reports INTEGER DEFAULT 0;'); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'agent';"); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN badge_text TEXT;'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN badge_color TEXT;'); } catch(e) {}
try { db.exec('ALTER TABLE memes ADD COLUMN score INTEGER DEFAULT 0;'); } catch(e) {}
try { db.exec("ALTER TABLE reports ADD COLUMN status TEXT DEFAULT 'pending';"); } catch(e) {}
try { db.exec('CREATE TABLE IF NOT EXISTS votes (memeId TEXT NOT NULL, userId TEXT NOT NULL, value INTEGER NOT NULL, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (memeId, userId));'); } catch(e) {}

// Force 'adm' user to be admin
db.prepare("UPDATE users SET role = 'admin' WHERE id = 'adm'").run();

declare module 'express-session' {
  interface SessionData {
    userId: string;
    username: string;
  }
}

const app = express();
const PORT = 3000;

// Essential for sessions to work behind proxies (like Cloud Run)
app.set('trust proxy', 1);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(express.json({ limit: '10mb' }));

const SQLiteStore = sqliteSession(session);
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: rootDir
  }),
  secret: process.env.SESSION_SECRET || 'opmgg-dev-fallback-secret-12345',
  resave: true, 
  saveUninitialized: true,
  name: 'opmgg.sid',
  proxy: true,
  cookie: { 
    secure: isProduction, // Only secure in production
    sameSite: isProduction ? 'none' : 'lax',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    // @ts-ignore
    partitioned: isProduction
  }
}));

// --- Middleware: Populates Auth from JWT if present ---
const populateAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      req.session.userId = decoded.userId;
      req.session.username = decoded.username;
      req.session.role = decoded.role;
    } catch (err) {}
  }
  next();
};

const requireAuth = (req: any, res: any, next: any) => {
  // Use populateAuth logic then verify
  populateAuth(req, res, () => {
    if (!req.session.userId) {
      return res.status(401).json({ 
        error: 'Você precisa estar logado para realizar esta ação.',
      });
    }
    next();
  });
};

// --- Auth Routes ---

app.use('/uploads', express.static(uploadsDir));

app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ fileUrl });
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username e senha são obrigatórios' });
  }

  const userId = username.toLowerCase();

  try {
    const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (existingUser) {
      return res.status(400).json({ error: 'Este nome de usuário já está em uso' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = (username.toLowerCase() === 'adm' || username.toLowerCase() === 'admin') ? 'admin' : 'agent';
    
    db.prepare('INSERT INTO users (id, username, hashedPassword, role) VALUES (?, ?, ?, ?)')
      .run(userId, username, hashedPassword, role);
    
    // Create token
    const token = jwt.sign({ userId, username, role }, JWT_SECRET, { expiresIn: '30d' });

    // Auto-login session
    req.session.userId = userId;
    req.session.username = username;
    // @ts-ignore
    req.session.role = role;
    
    req.session.save((err) => {
      res.json({ username, userId, role, token });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username e senha são obrigatórios' });
  }

  try {
    const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(username.toLowerCase());
    
    if (!user) {
      return res.status(400).json({ error: 'Usuário não encontrado' });
    }

    const isMatch = await bcrypt.compare(password, user.hashedPassword);

    if (!isMatch) {
      return res.status(400).json({ error: 'Senha incorreta' });
    }

    // Create token
    const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });

    req.session.userId = user.id;
    req.session.username = user.username;
    // @ts-ignore
    req.session.role = user.role;
    
    req.session.save((err) => {
      res.json({ username: user.username, userId: user.id, role: user.role, token });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', populateAuth, (req: any, res) => {
  if (req.session.userId) {
    const user: any = db.prepare('SELECT id, username, role, badge_text, badge_color FROM users WHERE id = ?').get(req.session.userId);
    if (user) {
      // Ensure session role is synced
      req.session.role = user.role;
      res.json(user);
    } else {
      res.status(401).json(null);
    }
  } else {
    res.status(401).json(null);
  }
});

app.get('/api/users/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const users = db.prepare('SELECT id, username, badge_text, badge_color FROM users WHERE username LIKE ? LIMIT 5')
      .all(`%${q}%`);
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    res.json({ success: true });
  });
});

// --- Meme Routes ---
app.get('/api/memes', populateAuth, (req: any, res) => {
  const { sort = 'recent', tag, userId: targetUserId } = req.query;
  const userId = req.session.userId;

  try {
    let query = `
      SELECT m.*, u.badge_text, u.badge_color,
      COALESCE((SELECT SUM(score) FROM memes WHERE postedById = m.postedById), 0) as userTotalScore,
      COALESCE((SELECT SUM(views) FROM memes WHERE postedById = m.postedById), 0) as userTotalViews,
      COALESCE((SELECT COUNT(*) FROM memes WHERE postedById = m.postedById), 0) as userMemeCount,
      COALESCE((SELECT COUNT(*) FROM votes WHERE userId = m.postedById), 0) as userVotesGiven,
      (SELECT value FROM votes WHERE memeId = m.id AND userId = ?) as userVote
      FROM memes m
      LEFT JOIN users u ON m.postedById = u.id
    `;
    const params: any[] = [userId || null];

    const conditions: string[] = [];
    if (tag) {
      conditions.push('m.tags LIKE ?');
      params.push(`%${tag}%`);
    }

    if (targetUserId) {
      conditions.push('m.postedById = ?');
      params.push(targetUserId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    if (sort === 'trending') {
      query += ' ORDER BY score DESC, postedAt DESC';
    } else {
      query += ' ORDER BY postedAt DESC';
    }

    const memes = db.prepare(query).all(...params);
    const formattedMemes = memes.map((m: any) => ({
      ...m,
      tags: JSON.parse(m.tags)
    }));
    res.json(formattedMemes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/memes', requireAuth, (req: any, res) => {
  const { title, author, fileUrl, fileType, tags, description } = req.body;

  try {
    const tagsArray = typeof tags === 'string' 
      ? tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : Array.isArray(tags) ? tags : [];

    const id = Math.random().toString(36).substring(2, 15);
    const postedAt = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO memes (id, title, author, postedBy, postedById, postedAt, fileUrl, fileType, tags, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, 
      title, 
      author, 
      req.session.username, 
      req.session.userId, 
      postedAt, 
      fileUrl, 
      fileType, 
      JSON.stringify(tagsArray),
      description || ''
    );

    res.json({ 
      id, 
      title, 
      author, 
      postedBy: req.session.username, 
      postedById: req.session.userId, 
      postedAt, 
      fileUrl, 
      fileType, 
      tags: tagsArray, 
      description: description || '',
      score: 0,
      likes: 0, 
      reports: 0 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/memes/:id/vote', requireAuth, (req: any, res) => {
  const memeId = req.params.id;
  const userId = req.session.userId;
  const { value } = req.body; // 1 or -1

  if (value !== 1 && value !== -1) {
    return res.status(400).json({ error: 'Voto inválido' });
  }

  try {
    const existingVote: any = db.prepare('SELECT value FROM votes WHERE memeId = ? AND userId = ?').get(memeId, userId);
    
    const transaction = db.transaction(() => {
      if (existingVote) {
        if (existingVote.value === value) {
          // Remove vote if same
          db.prepare('DELETE FROM votes WHERE memeId = ? AND userId = ?').run(memeId, userId);
          db.prepare('UPDATE memes SET score = score - ? WHERE id = ?').run(value, memeId);
          return { action: 'removed' };
        } else {
          // Change vote
          db.prepare('UPDATE votes SET value = ? WHERE memeId = ? AND userId = ?').run(value, memeId, userId);
          db.prepare('UPDATE memes SET score = score + ? WHERE id = ?').run(value * 2, memeId);
          return { action: 'changed' };
        }
      } else {
        // New vote
        db.prepare('INSERT INTO votes (memeId, userId, value) VALUES (?, ?, ?)').run(memeId, userId, value);
        db.prepare('UPDATE memes SET score = score + ? WHERE id = ?').run(value, memeId);
        return { action: 'added' };
      }
    });

    const result = transaction();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/memes/:id', requireAuth, (req: any, res) => {
  const memeId = req.params.id;
  
  try {
    const meme = db.prepare('SELECT * FROM memes WHERE id = ?').get(memeId) as any;
    if (!meme) return res.status(404).json({ error: 'Meme não encontrado' });

    // Autor ou Admin podem deletar
    // @ts-ignore
    if (meme.postedById !== req.session.userId && req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas o autor ou administradores podem excluir este meme.' });
    }

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM votes WHERE memeId = ?').run(memeId);
      db.prepare('DELETE FROM reports WHERE memeId = ?').run(memeId);
      db.prepare('DELETE FROM memes WHERE id = ?').run(memeId);
    });

    transaction();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Admin Routes ---

app.get('/api/admin/reports', requireAuth, (req: any, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  try {
    const reports = db.prepare(`
      SELECT r.*, m.title as memeTitle, u.username as reporterName
      FROM reports r
      JOIN memes m ON r.memeId = m.id
      JOIN users u ON r.userId = u.id
      WHERE r.status = 'pending'
      ORDER BY r.createdAt DESC
    `).all();
    res.json(reports);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/reward-rules', requireAuth, (req: any, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const rules = db.prepare('SELECT * FROM reward_rules ORDER BY createdAt ASC').all();
    res.json(rules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/reward-rules', requireAuth, (req: any, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  const { metric, operator, value, title_text, title_color } = req.body;
  const id = Math.random().toString(36).substr(2, 9);
  try {
    db.prepare('INSERT INTO reward_rules (id, metric, operator, value, title_text, title_color) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, metric, operator, value, title_text, title_color);
    res.json({ id, metric, operator, value, title_text, title_color });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/reward-rules/:id', requireAuth, (req: any, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  try {
    db.prepare('DELETE FROM reward_rules WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.patch('/api/admin/reward-rules/:id', requireAuth, (req: any, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  const { metric, operator, value, title_text, title_color } = req.body;
  try {
    db.prepare('UPDATE reward_rules SET metric = ?, operator = ?, value = ?, title_text = ?, title_color = ? WHERE id = ?')
      .run(metric, operator, value, title_text, title_color, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', requireAuth, (req: any, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.role, u.badge_text, u.badge_color,
      COALESCE((SELECT SUM(score) FROM memes WHERE postedById = u.id), 0) as totalScore,
      COALESCE((SELECT SUM(views) FROM memes WHERE postedById = u.id), 0) as totalViews,
      COALESCE((SELECT COUNT(*) FROM memes WHERE postedById = u.id), 0) as memeCount,
      COALESCE((SELECT COUNT(*) FROM votes WHERE userId = u.id), 0) as votesGiven
      FROM users u
      ORDER BY username ASC
    `).all();
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/badge', requireAuth, (req: any, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  const { badge_text, badge_color } = req.body;
  try {
    db.prepare('UPDATE users SET badge_text = ?, badge_color = ? WHERE id = ?')
      .run(badge_text || null, badge_color || null, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/admin/reports/:id/resolve', requireAuth, (req: any, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  const { action } = req.body; // 'dismiss' or 'delete_meme'

  try {
    const report: any = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Reporte não encontrado' });

    const transaction = db.transaction(() => {
      if (action === 'delete_meme') {
        db.prepare('DELETE FROM votes WHERE memeId = ?').run(report.memeId);
        db.prepare('DELETE FROM reports WHERE memeId = ?').run(report.memeId);
        db.prepare('DELETE FROM memes WHERE id = ?').run(report.memeId);
      } else {
        db.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").run(req.params.id);
      }
    });
    transaction();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/memes/:id/report', requireAuth, (req: any, res) => {
  const memeId = req.params.id;
  const userId = req.session.userId;
  const { reason } = req.body;

  try {
    const reportId = Math.random().toString(36).substring(2, 15);
    const transaction = db.transaction(() => {
      db.prepare('INSERT INTO reports (id, memeId, userId, reason) VALUES (?, ?, ?, ?)').run(
        reportId,
        memeId,
        userId,
        reason || 'Não especificado'
      );
      db.prepare('UPDATE memes SET reports = reports + 1 WHERE id = ?').run(memeId);
    });
    transaction();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/memes/:id/view', (req, res) => {
  try {
    db.prepare('UPDATE memes SET views = views + 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Catch-all for API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint da API não encontrado' });
});

// --- Vite Middleware / Production Serving ---

async function start() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(rootDir, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
