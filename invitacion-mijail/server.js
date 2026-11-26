const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const RSVP_FILE = path.join(DATA_DIR, 'rsvps.json');
const EVENT_FILE = path.join(PUBLIC, 'event.json');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(24).toString('hex');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RSVP_FILE)) fs.writeFileSync(RSVP_FILE, '[]\n', 'utf8');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function readRsvps() {
  try {
    const value = JSON.parse(fs.readFileSync(RSVP_FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 8192) {
        reject(new Error('body_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function isAdmin(req) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const supplied = Buffer.from(token);
  const expected = Buffer.from(ADMIN_TOKEN);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/rsvps' && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    return require('./api/rsvps')(req, res);
  }

  if (req.method === 'GET' && url.pathname === '/api/event') {
    try { return sendJson(res, 200, JSON.parse(fs.readFileSync(EVENT_FILE, 'utf8'))); }
    catch { return sendJson(res, 500, { error: 'No se pudo leer la información del evento.' }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/rsvps') {
    let body;
    try { body = await readBody(req); }
    catch (error) {
      const status = error.message === 'body_too_large' ? 413 : 400;
      return sendJson(res, status, { error: 'No se pudo leer la respuesta. Inténtalo de nuevo.' });
    }
    const name = String(body.name || '').replace(/\s+/g, ' ').trim();
    const attendance = body.attendance;
    if (name.length < 2 || name.length > 100 || !['yes', 'no'].includes(attendance)) {
      return sendJson(res, 400, { error: 'Escribe tu nombre y elige una opción.' });
    }

    const records = readRsvps();
    const normalizedName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const existing = records.find(item => item.normalizedName === normalizedName);
    const now = new Date().toISOString();
    let response;
    if (existing) {
      existing.name = name;
      existing.attendance = attendance;
      existing.updatedAt = now;
      response = existing;
    } else {
      response = { id: crypto.randomUUID(), name, attendance, createdAt: now, normalizedName };
      records.push(response);
    }

    const temporaryFile = `${RSVP_FILE}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporaryFile, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
      fs.renameSync(temporaryFile, RSVP_FILE);
    } catch {
      try { fs.unlinkSync(temporaryFile); } catch {}
      return sendJson(res, 500, { error: 'No se pudo guardar tu respuesta. Inténtalo de nuevo.' });
    }
    return sendJson(res, 201, { ok: true, message: attendance === 'yes' ? '¡Misión aceptada! Mijail ya cuenta contigo para su equipo.' : '¡Mensaje recibido! Gracias por avisar; Mijail te manda un abrazo.' });
  }

  if (req.method === 'GET' && url.pathname === '/api/rsvps') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'Clave de administración incorrecta.' });
    const records = readRsvps().map(({ normalizedName, ...item }) => item);
    return sendJson(res, 200, { records });
  }

  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { res.writeHead(400); return res.end('Solicitud incorrecta'); }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(PUBLIC, `.${pathname}`);
  if (!filePath.startsWith(`${PUBLIC}${path.sep}`)) {
    res.writeHead(403); return res.end('Prohibido');
  }
  fs.readFile(filePath, (error, file) => {
    if (error) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(file);
  });
}

http.createServer((req, res) => {
  handle(req, res).catch(() => sendJson(res, 500, { error: 'Ocurrió un error inesperado.' }));
}).listen(PORT, () => {
  console.log(`Invitación disponible en http://localhost:${PORT}`);
  if (!process.env.ADMIN_TOKEN) console.log(`Clave temporal del registro (guárdala): ${ADMIN_TOKEN}`);
});
