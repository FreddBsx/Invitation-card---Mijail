const crypto = require('node:crypto');

function sendJson(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(value));
}

function normalizeName(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

function authorized(req) {
  const authorization = req.headers.authorization || '';
  const supplied = Buffer.from(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
  const expected = Buffer.from(process.env.ADMIN_TOKEN || '');
  return expected.length >= 6 && supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return {};
}

async function supabaseRequest(path, options = {}) {
  const baseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const secretKey = process.env.SUPABASE_SECRET_KEY || '';
  if (!baseUrl || !secretKey) throw new Error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en Vercel.');
  return fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Método no permitido.' });
  }

  if (req.method === 'GET') {
    if (!authorized(req)) return sendJson(res, 401, { error: 'Clave de administración incorrecta.' });
    try {
      const response = await supabaseRequest('rsvps?select=id,name,attendance,created_at,updated_at&order=created_at.desc');
      if (!response.ok) {
        console.error('Supabase GET rsvps:', response.status, await response.text());
        return sendJson(res, 502, { error: 'No se pudo consultar la base de datos.' });
      }
      const rows = await response.json();
      const records = rows.map(row => ({
        id: row.id,
        name: row.name,
        attendance: row.attendance,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
      return sendJson(res, 200, { records });
    } catch (error) {
      console.error('Supabase GET error:', error.message);
      return sendJson(res, 500, { error: 'No se pudo conectar con la base de datos. Revisa la configuración de Vercel.' });
    }
  }

  let body;
  try { body = readBody(req); }
  catch { return sendJson(res, 400, { error: 'La respuesta no tiene un formato válido.' }); }
  const name = String(body.name || '').replace(/\s+/g, ' ').trim();
  const attendance = body.attendance;
  if (name.length < 2 || name.length > 100 || !['yes', 'no'].includes(attendance)) {
    return sendJson(res, 400, { error: 'Escribe tu nombre y elige una opción.' });
  }

  try {
    const response = await supabaseRequest('rsvps?on_conflict=normalized_name', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        name,
        normalized_name: normalizeName(name),
        attendance,
        updated_at: new Date().toISOString()
      })
    });
    if (!response.ok) {
      console.error('Supabase POST rsvps:', response.status, await response.text());
      return sendJson(res, 502, { error: 'No se pudo guardar la respuesta en la base de datos.' });
    }
    return sendJson(res, 200, {
      ok: true,
      message: attendance === 'yes' ? '¡Misión aceptada! Mijail ya cuenta contigo para su equipo.' : '¡Mensaje recibido! Gracias por avisar; Mijail te manda un abrazo.'
    });
  } catch (error) {
    console.error('Supabase POST error:', error.message);
    return sendJson(res, 500, { error: 'No se pudo conectar con la base de datos. Revisa la configuración de Vercel.' });
  }
};
