let adminToken = '';
let currentRecords = [];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

async function fetchRecords() {
  const response = await fetch('/api/rsvps', { headers: { Authorization: `Bearer ${adminToken}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo cargar el registro.');
  currentRecords = result.records;
  const yes = currentRecords.filter(item => item.attendance === 'yes').length;
  const no = currentRecords.length - yes;
  document.getElementById('response-count').textContent = `${currentRecords.length} respuestas · ${yes} asistirán · ${no} no podrán`;
  document.getElementById('response-rows').innerHTML = currentRecords.slice().reverse().map(item => `
    <tr><td>${escapeHtml(item.name)}</td><td>${item.attendance === 'yes' ? 'Sí, asistirá' : 'No podrá asistir'}</td><td>${escapeHtml(formatDate(item.updatedAt || item.createdAt))}</td></tr>
  `).join('') || '<tr><td colspan="3">Aún no hay respuestas.</td></tr>';
  document.getElementById('results').hidden = false;
}

document.getElementById('admin-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.getElementById('admin-message');
  message.classList.remove('error');
  message.textContent = 'Cargando…';
  adminToken = document.getElementById('admin-token').value;
  try {
    await fetchRecords();
    message.textContent = '';
    document.getElementById('admin-token').value = '';
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
    document.getElementById('results').hidden = true;
    adminToken = '';
  }
});

document.getElementById('download-csv').addEventListener('click', () => {
  const csvValue = value => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [['Nombre', 'Asistencia', 'Fecha de respuesta'], ...currentRecords.map(item => [item.name, item.attendance === 'yes' ? 'Sí' : 'No', formatDate(item.updatedAt || item.createdAt)])];
  const csv = '\uFEFF' + rows.map(row => row.map(csvValue).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'respuestas-cumpleanos.csv';
  link.click();
  URL.revokeObjectURL(url);
});
