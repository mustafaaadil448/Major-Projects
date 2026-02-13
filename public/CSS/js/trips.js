(() => {
  const filterEl = document.getElementById('tripFilter');
  const searchEl = document.getElementById('tripSearch');
  const cards = Array.from(document.querySelectorAll('[data-trip-card]'));
  const emptyEl = document.getElementById('tripEmpty');
  const countEl = document.getElementById('tripCount');

  function normalize(s) {
    return String(s || '').toLowerCase().trim();
  }

  function parseISODate(value) {
    if (!value) return null;
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getComputedBucket(card) {
    const bookingStatus = normalize(card.dataset.bookingStatus);
    const paymentStatus = normalize(card.dataset.paymentStatus);
    const checkIn = parseISODate(card.dataset.checkin);
    const checkOut = parseISODate(card.dataset.checkout);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (bookingStatus === 'cancelled') return 'cancelled';
    if (paymentStatus === 'pending' && bookingStatus === 'pending') return 'pending_payment';

    if (checkOut && checkOut < today) return 'completed';
    if (checkIn && checkIn >= today) return 'upcoming';

    return 'all';
  }

  function applyFilters() {
    const selected = normalize(filterEl?.value || 'all');
    const q = normalize(searchEl?.value || '');

    let visible = 0;
    for (const card of cards) {
      const title = normalize(card.dataset.title);
      const bucket = getComputedBucket(card);

      const matchesSearch = !q || title.includes(q);
      const matchesFilter = selected === 'all' || bucket === selected;

      const show = matchesSearch && matchesFilter;
      card.classList.toggle('d-none', !show);
      if (show) visible++;
    }

    if (countEl) countEl.textContent = String(visible);
    if (emptyEl) emptyEl.classList.toggle('d-none', visible !== 0);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-trip-toggle]');
    if (!btn) return;

    const id = btn.getAttribute('data-trip-toggle');
    const details = document.querySelector(`[data-trip-details="${CSS.escape(id)}"]`);
    if (!details) return;

    const isOpen = details.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    btn.textContent = isOpen ? 'Hide Details' : 'View Details';
  });

  if (filterEl) filterEl.addEventListener('change', applyFilters);
  if (searchEl) searchEl.addEventListener('input', applyFilters);

  applyFilters();
})();
