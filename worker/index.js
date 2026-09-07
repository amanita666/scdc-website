const RESTAURANT_EMAIL = 'santaclaradoscogumelos@gmail.com';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const allowedTimes = {
  dinner: ['19:30', '20:00', '20:30', '21:00', '21:30', '22:00'],
  lunch: ['13:00', '13:30', '14:00', '14:30']
};

function validate(data) {
  const date = String(data.date || '');
  const time = String(data.time || '');
  const people = Number(data.people);
  const name = String(data.name || '').trim();
  const contact = String(data.contact || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const notes = String(data.notes || '').trim();
  const language = ['pt', 'en', 'it', 'fr', 'es'].includes(data.language) ? data.language : 'pt';
  const requestId = /^[a-zA-Z0-9-]{10,80}$/.test(String(data.requestId || '')) ? String(data.requestId) : crypto.randomUUID();
  const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const selectedDate = dateMatch ? new Date(`${date}T12:00:00Z`) : null;
  const todayInLisbon = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const isSaturday = selectedDate?.getUTCDay() === 6;
  const validTime = allowedTimes.dinner.includes(time) || (isSaturday && allowedTimes.lunch.includes(time));

  if (data.website) return { bot: true };
  if (!dateMatch || Number.isNaN(selectedDate?.getTime())) return { error: 'Escolha uma data válida.' };
  if (date < todayInLisbon) return { error: 'Escolha hoje ou uma data futura.' };
  if (!validTime) return { error: 'Escolha uma hora válida.' };
  if (!Number.isInteger(people) || people < 1 || people > 50) return { error: 'Indique um número de pessoas entre 1 e 50.' };
  if (name.length < 2 || name.length > 100) return { error: 'Indique o seu nome.' };
  if (contact.length < 5 || contact.length > 40) return { error: 'Indique um contacto telefónico válido.' };
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Indique um email válido.' };
  if (notes.length > 1000) return { error: 'As notas são demasiado longas.' };
  return { date, time, people, name, contact, email, notes, language, requestId };
}

function makeReference(date) {
  const compactDate = date.replaceAll('-', '');
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(5, '0').slice(-5);
  return `SCDC-${compactDate}-${random}`;
}

async function sendEmail(apiKey, message, idempotencyKey) {
  const response = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': apiKey, 'accept': 'application/json', 'idempotencyKey': idempotencyKey },
    body: JSON.stringify(message)
  });
  if (!response.ok) throw new Error(`Brevo ${response.status}`);
}

async function handleReservation(request, env) {
  if (!env.BREVO_API_KEY) return json({ message: 'Serviço temporariamente indisponível.' }, 503);
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ message: 'Pedido inválido.' }, 415);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 12000) return json({ message: 'Pedido demasiado grande.' }, 413);

  let raw;
  try { raw = await request.json(); } catch { return json({ message: 'Pedido inválido.' }, 400); }
  const data = validate(raw);
  if (data.bot) return json({ reference: 'SCDC-RECEBIDO' });
  if (data.error) {
    const errors = {
      'Escolha uma data válida.': 'Choose a valid date.',
      'Escolha hoje ou uma data futura.': 'Choose today or a future date.',
      'Escolha uma hora válida.': 'Choose a valid time.',
      'Indique um número de pessoas entre 1 e 50.': 'Enter a number of guests between 1 and 50.',
      'Indique o seu nome.': 'Enter your name.',
      'Indique um contacto telefónico válido.': 'Enter a valid phone number.',
      'Indique um email válido.': 'Enter a valid email address.',
      'As notas são demasiado longas.': 'The notes are too long.'
    };
    return json({ message: raw.language === 'en' ? (errors[data.error] || data.error) : data.error }, 400);
  }

  const reference = makeReference(data.date);
  const datePt = data.date.split('-').reverse().join('/');
  const timePt = data.time.replace(':', 'h');
  const notes = data.notes || '—';
  const languageTag = data.language === 'en' ? 'EN' : 'PT';
  const subject = `[${languageTag}] Pedido de reserva — ${datePt.slice(0, 5)} — ${timePt} — ${data.people} pessoas — ${data.name}`;
  const restaurantText = `NOVO PEDIDO DE RESERVA [${languageTag}]\n\nIdioma do cliente: ${languageTag}\nData: ${datePt}\nHora: ${timePt}\nPessoas: ${data.people}\nNome: ${data.name}\nTelefone: ${data.contact}\nEmail: ${data.email}\nNotas: ${notes}\nReferência: ${reference}\n\nEste pedido ainda não foi confirmado.`;
  const restaurantHtml = `<h2>NOVO PEDIDO DE RESERVA [${languageTag}]</h2><p><b>Idioma do cliente:</b> ${languageTag}<br><b>Data:</b> ${escapeHtml(datePt)}<br><b>Hora:</b> ${escapeHtml(timePt)}<br><b>Pessoas:</b> ${data.people}<br><b>Nome:</b> ${escapeHtml(data.name)}<br><b>Telefone:</b> ${escapeHtml(data.contact)}<br><b>Email:</b> <a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a><br><b>Notas:</b> ${escapeHtml(notes)}<br><b>Referência:</b> ${escapeHtml(reference)}</p><p><b>Este pedido ainda não foi confirmado.</b></p>`;
  const receiptText = data.language === 'en'
    ? `We received your reservation request for Santa Clara dos Cogumelos.\n\nDate: ${datePt}\nTime: ${timePt}\nGuests: ${data.people}\nName: ${data.name}\nPhone: ${data.contact}\nEmail: ${data.email}\nNotes: ${notes}\nReference: ${reference}\n\nPLEASE NOTE: this email only confirms receipt of your request. Your reservation will be valid after you receive our confirmation.\n\nSanta Clara dos Cogumelos\n+351 913 043 302`
    : `Recebemos o seu pedido de reserva no Santa Clara dos Cogumelos.\n\nData: ${datePt}\nHora: ${timePt}\nPessoas: ${data.people}\nNome: ${data.name}\nTelefone: ${data.contact}\nEmail: ${data.email}\nNotas: ${notes}\nReferência: ${reference}\n\nATENÇÃO: este email confirma apenas a receção do pedido. A reserva será válida depois de receber a nossa confirmação.\n\nSanta Clara dos Cogumelos\n+351 913 043 302`;
  const receiptHtml = data.language === 'en'
    ? `<h2>We received your reservation request</h2><p><b>Date:</b> ${escapeHtml(datePt)}<br><b>Time:</b> ${escapeHtml(timePt)}<br><b>Guests:</b> ${data.people}<br><b>Name:</b> ${escapeHtml(data.name)}<br><b>Phone:</b> ${escapeHtml(data.contact)}<br><b>Email:</b> ${escapeHtml(data.email)}<br><b>Notes:</b> ${escapeHtml(notes)}<br><b>Reference:</b> ${escapeHtml(reference)}</p><p><b>PLEASE NOTE: this email only confirms receipt of your request. Your reservation will be valid after you receive our confirmation.</b></p><p>Santa Clara dos Cogumelos<br>+351 913 043 302</p>`
    : `<h2>Recebemos o seu pedido de reserva</h2><p><b>Data:</b> ${escapeHtml(datePt)}<br><b>Hora:</b> ${escapeHtml(timePt)}<br><b>Pessoas:</b> ${data.people}<br><b>Nome:</b> ${escapeHtml(data.name)}<br><b>Telefone:</b> ${escapeHtml(data.contact)}<br><b>Email:</b> ${escapeHtml(data.email)}<br><b>Notas:</b> ${escapeHtml(notes)}<br><b>Referência:</b> ${escapeHtml(reference)}</p><p><b>ATENÇÃO: este email confirma apenas a receção do pedido. A reserva será válida depois de receber a nossa confirmação.</b></p><p>Santa Clara dos Cogumelos<br>+351 913 043 302</p>`;

  await sendEmail(env.BREVO_API_KEY, {
    sender: { name: 'Santa Clara dos Cogumelos', email: RESTAURANT_EMAIL },
    to: [{ email: RESTAURANT_EMAIL, name: 'Reservas SCDC' }],
    replyTo: { email: data.email, name: data.name },
    subject,
    textContent: restaurantText,
    htmlContent: restaurantHtml,
    tags: ['reserva-site']
  }, `${data.requestId}-restaurant`);

  await sendEmail(env.BREVO_API_KEY, {
    sender: { name: 'Santa Clara dos Cogumelos', email: RESTAURANT_EMAIL },
    to: [{ email: data.email, name: data.name }],
    replyTo: { email: RESTAURANT_EMAIL, name: 'Santa Clara dos Cogumelos' },
    subject: data.language === 'en' ? `We received your reservation request — ${reference}` : `Recebemos o seu pedido de reserva — ${reference}`,
    textContent: receiptText,
    htmlContent: receiptHtml,
    tags: ['reserva-recebida']
  }, `${data.requestId}-receipt`);

  return json({ reference }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/reservations' && request.method === 'POST') {
      try { return await handleReservation(request, env); }
      catch (error) { console.error('Reservation email failed', error); return json({ message: 'Não foi possível enviar o pedido.' }, 502); }
    }
    if (url.pathname.startsWith('/api/')) return json({ message: 'Não encontrado.' }, 404);
    return env.ASSETS.fetch(request);
  }
};
