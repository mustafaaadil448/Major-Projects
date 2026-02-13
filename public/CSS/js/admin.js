(function () {
  const shell = document.querySelector('.admin-shell');
  const sidebar = document.getElementById('adminSidebar');
  const toggle = document.getElementById('sidebarToggle');
  const toggleMobile = document.getElementById('sidebarToggleMobile');

  const activeKey = shell?.getAttribute('data-active') || 'dashboard';
  document.querySelectorAll('.admin-nav__item').forEach(a => {
    if (a.getAttribute('data-key') === activeKey) a.classList.add('active');
  });

  function setDark(on) {
    document.body.classList.toggle('admin-dark', !!on);
    try { localStorage.setItem('admin.dark', on ? '1' : '0'); } catch (e) {}
  }

  const saved = (() => {
    try { return localStorage.getItem('admin.dark'); } catch (e) { return null; }
  })();
  if (saved === '1') setDark(true);

  document.getElementById('darkToggle')?.addEventListener('click', () => {
    setDark(!document.body.classList.contains('admin-dark'));
  });

  function setCollapsed(on) {
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed', !!on);
    shell?.classList.toggle('is-collapsed', !!on);
    document.querySelectorAll('.admin-nav__item span, .admin-brand__text').forEach(el => {
      el.style.display = on ? 'none' : '';
    });
    try { localStorage.setItem('admin.sidebar', on ? '1' : '0'); } catch (e) {}
  }

  const savedSidebar = (() => {
    try { return localStorage.getItem('admin.sidebar'); } catch (e) { return null; }
  })();
  if (savedSidebar === '1') setCollapsed(true);

  toggle?.addEventListener('click', () => setCollapsed(!sidebar.classList.contains('collapsed')));

  function mobileToggle() {
    sidebar?.classList.toggle('open');
  }
  toggleMobile?.addEventListener('click', mobileToggle);

  // Simple notifications badge (pending >24h) + KPI polling
  async function pollKpis() {
    if (!shell) return;
    const url = shell.getAttribute('data-kpis-url');
    if (!url) return;
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();

      const badge = document.getElementById('notifyBadge');
      const count = Number(data?.alerts?.pendingOver24h || 0);
      if (badge) {
        badge.style.display = count > 0 ? '' : 'none';
        badge.textContent = String(count);
      }

      // Update KPI numbers if present
      const map = {
        totalRevenue: 'kpiRevenue',
        totalBookings: 'kpiBookings',
        totalListings: 'kpiListings',
        totalUsers: 'kpiUsers',
        conversionRate: 'kpiConversion',
        pendingPayments: 'kpiPending'
      };

      Object.entries(map).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const v = data?.kpis?.[key];
        if (v == null) return;
        el.textContent = key === 'conversionRate' ? `${v}%` : `${v}`;
      });
    } catch (e) {
      // ignore
    }
  }

  pollKpis();
  setInterval(pollKpis, 30000);
})();
