document.documentElement.classList.add('js');
const header = document.querySelector('.site-header');
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');

addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 30));

toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
});

nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  toggle.setAttribute('aria-expanded', 'false');
}));

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => entry.isIntersecting && entry.target.classList.add('visible'));
}, { threshold: .12 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

const lisbonWeekday = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Lisbon',
  weekday: 'short'
}).format(new Date()).toLowerCase();
const weekdayNumber = { sun: '0', mon: '1', tue: '2', wed: '3', thu: '4', fri: '5', sat: '6' }[lisbonWeekday];
document.querySelector(`.hours-row[data-weekday="${weekdayNumber}"]`)?.classList.add('today');

const bookingDate = document.querySelector('#booking-date');
const bookingTime = document.querySelector('#booking-time');
if (bookingDate) {
  bookingDate.min = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  bookingDate.addEventListener('change', () => {
    if (!bookingTime) return;
    const selectedDate = new Date(`${bookingDate.value}T12:00:00`);
    const isSaturday = selectedDate.getDay() === 6;
    const lunch = ['13:00', '13:30', '14:00', '14:30'];
    const dinner = ['19:30', '20:00', '20:30', '21:00', '21:30', '22:00'];
    const option = time => `<option value="${time}">${time.replace(':', 'h')}</option>`;
    bookingTime.innerHTML = '<option value="">Choose a time</option>' +
      (isSaturday ? `<optgroup label="Lunch">${lunch.map(option).join('')}</optgroup>` : '') +
      `<optgroup label="Dinner">${dinner.map(option).join('')}</optgroup>`;
    bookingTime.disabled = false;
  });
}

document.querySelector('#reservation-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const status = document.querySelector('#reservation-status');
  const data = Object.fromEntries(new FormData(form));

  data.requestId ||= crypto.randomUUID();
  form.elements.requestId.value = data.requestId;
  button.disabled = true;
  button.textContent = 'Sending…';
  status.className = 'form-status';
  status.textContent = '';

  fetch('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(async response => {
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'We could not send your request.');
    status.className = 'form-status success';
    status.innerHTML = `<strong>Request received — not yet confirmed.</strong><br>We sent a copy to your email.<br>Reference: ${result.reference}`;
    form.reset();
    form.elements.requestId.value = crypto.randomUUID();
    bookingTime.innerHTML = '<option value="">Choose a date first</option>';
    bookingTime.disabled = true;
  }).catch(error => {
    status.className = 'form-status error';
    status.textContent = `${error.message} Please try again or call +351 913 043 302.`;
  }).finally(() => {
    button.disabled = false;
    button.textContent = 'Send reservation request';
  });
});
