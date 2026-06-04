const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'server-data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const defaultDB = {
  masterDB: { hqs: [], products: [], doctors: [], chemists: [] },
  visitsDB: [],
  users: []
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function ensureDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2));
  }
}

function readDB() {
  ensureDatabase();
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return {
      masterDB: parsed.masterDB || defaultDB.masterDB,
      visitsDB: Array.isArray(parsed.visitsDB) ? parsed.visitsDB : [],
      users: Array.isArray(parsed.users) ? parsed.users : []
    };
  } catch (error) {
    console.error('Failed to read database:', error);
    return JSON.parse(JSON.stringify(defaultDB));
  }
}

function writeDB(db) {
  ensureDatabase();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function sendJSON(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  if (!user.passwordHash || !user.passwordSalt) return false;
  const { hash } = hashPassword(password, user.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.passwordHash, 'hex'));
}

function saveStaticFile(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = decodeURIComponent(requestUrl.pathname === '/' ? '/INDEX.html' : requestUrl.pathname);
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT) || filePath.includes(`${path.sep}server-data${path.sep}`)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(content);
  });
}

async function handleApi(req, res) {
  try {
    const db = readDB();

    if (req.method === 'GET' && req.url === '/api/data') {
      sendJSON(res, 200, { masterDB: db.masterDB, visitsDB: db.visitsDB });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/register') {
      const { name, email, username, password, role } = await readBody(req);
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedUsername = String(username || '').trim().toLowerCase();

      if (!name || !normalizedEmail || !normalizedUsername || !password || String(password).length < 6) {
        sendJSON(res, 400, { error: 'Please complete all fields. Password must be at least 6 characters.' });
        return;
      }
      if (db.users.some(u => u.username === normalizedUsername || u.email === normalizedEmail)) {
        sendJSON(res, 409, { error: 'A user with that email or username already exists.' });
        return;
      }

      const passwordData = hashPassword(String(password));
      const user = {
        id: Date.now(),
        name: String(name).trim(),
        email: normalizedEmail,
        username: normalizedUsername,
        role: role === 'Admin' ? 'Admin' : 'MR',
        passwordHash: passwordData.hash,
        passwordSalt: passwordData.salt,
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      writeDB(db);
      sendJSON(res, 201, { user: publicUser(user) });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/login') {
      const { identifier, password } = await readBody(req);
      const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
      const user = db.users.find(u => u.username === normalizedIdentifier || u.email === normalizedIdentifier);
      if (!user || !verifyPassword(String(password || ''), user)) {
        sendJSON(res, 401, { error: 'Invalid username/email or password.' });
        return;
      }
      sendJSON(res, 200, { user: publicUser(user) });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/master') {
      const { masterDB } = await readBody(req);
      db.masterDB = {
        hqs: Array.isArray(masterDB?.hqs) ? masterDB.hqs : [],
        products: Array.isArray(masterDB?.products) ? masterDB.products : [],
        doctors: Array.isArray(masterDB?.doctors) ? masterDB.doctors : [],
        chemists: Array.isArray(masterDB?.chemists) ? masterDB.chemists : []
      };
      writeDB(db);
      sendJSON(res, 200, { ok: true, masterDB: db.masterDB });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/visits') {
      const { visitsDB } = await readBody(req);
      db.visitsDB = Array.isArray(visitsDB) ? visitsDB : [];
      writeDB(db);
      sendJSON(res, 200, { ok: true, visitsDB: db.visitsDB });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/import-local-data') {
      const body = await readBody(req);
      if (body.masterDB && db.masterDB.hqs.length + db.masterDB.products.length + db.masterDB.doctors.length + db.masterDB.chemists.length === 0) {
        db.masterDB = body.masterDB;
      }
      if (Array.isArray(body.visitsDB) && db.visitsDB.length === 0) {
        db.visitsDB = body.visitsDB;
      }
      writeDB(db);
      sendJSON(res, 200, { masterDB: db.masterDB, visitsDB: db.visitsDB });
      return;
    }

    sendJSON(res, 404, { error: 'API route not found.' });
  } catch (error) {
    sendJSON(res, 500, { error: error.message || 'Server error.' });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }
  saveStaticFile(req, res);
});

server.listen(PORT, () => {
  ensureDatabase();
  console.log(`MR CRM server running at http://localhost:${PORT}`);
  console.log(`Permanent data file: ${DB_FILE}`);
});
