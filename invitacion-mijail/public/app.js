const byId = id => document.getElementById(id);
const setText = (id, value, fallback = '') => { byId(id).textContent = value || fallback; };
let googleMapsApiPromise;

function parseCoordinates(value) {
  const match = String(value || '').trim().match(/^([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function loadGoogleMapsApi(apiKey) {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (!googleMapsApiPromise) {
    googleMapsApiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
      script.async = true;
      script.defer = true;
      script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error('Google Maps no disponible'));
      script.onerror = () => reject(new Error('No se pudo cargar Google Maps'));
      document.head.appendChild(script);
    });
  }
  return googleMapsApiPromise;
}

async function showLockedMap(event) {
  const position = parseCoordinates(event.mapQuery);
  const apiKey = String(event.googleMapsApiKey || '').trim();
  if (!position || !apiKey) return false;

  const maps = await loadGoogleMapsApi(apiKey);
  const canvas = byId('map-canvas');
  const fallback = byId('map-iframe-fallback');
  canvas.hidden = false;
  fallback.hidden = true;
  try {
    const map = new maps.Map(canvas, {
      center: position,
      zoom: 16,
      mapTypeControl: true,
      mapTypeControlOptions: { mapTypeIds: ['roadmap', 'satellite'] },
      clickableIcons: false,
      gestureHandling: 'greedy',
      streetViewControl: false
    });

    new maps.Marker({
      map,
      position,
      title: event.venue || 'Lugar de la celebración',
      draggable: false,
      clickable: false
    });
    return true;
  } catch (error) {
    canvas.hidden = true;
    fallback.hidden = false;
    throw error;
  }
}

async function loadEvent() {
  const response = await fetch('/event.json?v=mijail-map-20261125', { cache: 'no-store' });
  if (!response.ok) throw new Error('event');
  const event = await response.json();
  const name = event.guestOfHonor || 'Mijail';
  setText('hero-names', name);
  setText('event-date', event.date, 'Fecha por definir');
  setText('event-time', event.time, 'Hora por confirmar');
  setText('map-venue', event.venue, 'Ubicación por confirmar');
  setText('map-address', event.address, 'Pronto compartiremos el punto de encuentro');

  const mapQuery = event.mapQuery || '';
  let mapUrl = event.mapUrl || '';
  const fallback = byId('map-iframe-fallback');
  const canvas = byId('map-canvas');
  const pendingPreview = byId('map-pending-preview');
  const previewToggle = byId('map-preview-toggle');
  if (mapQuery) {
    const encoded = encodeURIComponent(mapQuery);
    const embedUrl = `https://maps.google.com/maps?q=${encoded}&z=16&output=embed`;
    fallback.src = embedUrl;
    fallback.hidden = false;
    canvas.hidden = true;
    pendingPreview.hidden = true;
    previewToggle.hidden = false;
    setText('map-hint', 'Toca el mapa para ampliarlo');
    byId('map-empty').hidden = true;
    if (!mapUrl) mapUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    try { await showLockedMap(event); } catch { /* Se conserva el mapa integrado como alternativa. */ }
  } else {
    fallback.hidden = true;
    canvas.hidden = true;
    pendingPreview.hidden = false;
    previewToggle.hidden = true;
    setText('map-hint', 'Ubicación por confirmar');
    byId('map-empty').hidden = false;
  }
  if (mapUrl) {
    byId('maps-link').href = mapUrl;
    byId('maps-link').hidden = false;
  }
}

function toggleMap() {
  const expanded = byId('map-toggle').getAttribute('aria-expanded') === 'true';
  byId('map-toggle').setAttribute('aria-expanded', String(!expanded));
  byId('map-preview-toggle').setAttribute('aria-expanded', String(!expanded));
  byId('map-expanded').hidden = expanded;
  byId('map-card').classList.toggle('is-open', !expanded);
}

byId('map-toggle').addEventListener('click', toggleMap);
byId('map-preview-toggle').addEventListener('click', toggleMap);

async function sendRsvp(attendance) {
  const input = byId('guest-input');
  const message = byId('rsvp-message');
  const name = input.value.trim();
  message.classList.remove('error');
  if (name.length < 2) {
    message.textContent = 'Escribe tu nombre de héroe para registrar tu respuesta.';
    message.classList.add('error');
    input.focus();
    return;
  }
  const buttons = [byId('yes-button'), byId('no-button')];
  buttons.forEach(button => { button.disabled = true; });
  message.textContent = 'Guardando tu respuesta…';
  try {
    const response = await fetch('/api/rsvps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, attendance })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo guardar la respuesta.');
    input.value = '';
    if (attendance === 'yes') {
      window.location.assign('./gracias.html');
      return;
    }
    message.textContent = result.message;
    byId('decline-dialog').showModal();
  } catch (error) {
    message.textContent = location.protocol === 'file:'
      ? 'Abre la invitación con el servidor local del README para enviar tu respuesta.'
      : '¡Se perdió la señal del cuartel! Inténtalo otra vez en un momento.';
    message.classList.add('error');
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

byId('yes-button').addEventListener('click', () => sendRsvp('yes'));
byId('no-button').addEventListener('click', () => sendRsvp('no'));
byId('decline-close').addEventListener('click', () => byId('decline-dialog').close());
byId('decline-dialog').addEventListener('click', event => {
  if (event.target === byId('decline-dialog')) byId('decline-dialog').close();
});

loadEvent().catch(() => {
  setText('rsvp-message', location.protocol === 'file:'
    ? 'Para cargar todos los datos y guardar respuestas, inicia el servidor local indicado en el README.'
    : 'No se pudo cargar la invitación. Recarga la página para intentarlo de nuevo.');
  byId('rsvp-message').classList.add('error');
});
