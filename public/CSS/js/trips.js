(() => {
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
})();
