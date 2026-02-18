 (() => {
   const overlay = document.getElementById('se-auth-overlay');
   if (!overlay) return;
 
   const panel = document.getElementById('se-auth-panel');
   const closeBtn = document.getElementById('se-auth-close');
   const hiddenTab = document.getElementById('se-auth-hidden-tab');
   const hiddenMethod = document.getElementById('se-auth-hidden-method');
  const hiddenMode = document.getElementById('se-auth-hidden-mode');
   const indicator = document.getElementById('se-auth-tab-indicator');
   const roleBlock = document.getElementById('se-auth-role');
   const emailBlock = document.getElementById('se-auth-email-block');
   const phoneBlock = document.getElementById('se-auth-phone-block');

  const loginModesWrap = document.getElementById('se-auth-login-modes');
  const modeButtons = Array.from(overlay.querySelectorAll('[data-auth-mode]'));

  const usernameBlock = document.getElementById('se-auth-username-block');
  const passwordBlock = document.getElementById('se-auth-password-block');
  const confirmBlock = document.getElementById('se-auth-confirm-block');

  const usernameInput = document.getElementById('se-auth-username');
  const passwordInput = document.getElementById('se-auth-password');
  const confirmInput = document.getElementById('se-auth-confirm');
  const emailLabel = document.getElementById('se-auth-email-label');

  const form = document.getElementById('se-auth-form');
  const alertEl = document.getElementById('se-auth-alert');
  const debugEl = document.getElementById('se-auth-debug');
  const otpWrap = document.getElementById('se-auth-otp');
  const otpBoxes = Array.from(overlay.querySelectorAll('[data-otp-box]'));
  const resendBtn = document.getElementById('se-auth-resend');
  const timerEl = document.getElementById('se-auth-timer');
  const primaryBtn = document.getElementById('se-auth-primary');

  const bodyWrap = overlay.querySelector('.se-auth-body');
  const socialButtons = Array.from(overlay.querySelectorAll('[data-social-provider]'));

  const emailInput = document.getElementById('se-auth-email');
  const phoneInput = document.getElementById('se-auth-phone');
  const countrySelect = document.getElementById('se-auth-country');

  let countdownId = 0;
  let countdownEndsAt = 0;
 
   const tabButtons = Array.from(overlay.querySelectorAll('[data-auth-tab]'));
   const methodButtons = Array.from(overlay.querySelectorAll('[data-auth-method]'));
 
   let lastBodyOverflow = '';
 
   function isOpen() {
     return overlay.classList.contains('is-open');
   }

  function showAlert(message) {
    if (!alertEl) return;
    alertEl.textContent = String(message || '').trim();
    alertEl.classList.toggle('is-hidden', !alertEl.textContent);
  }

  function showDebug(message) {
    if (!debugEl) return;
    debugEl.textContent = String(message || '').trim();
    debugEl.classList.toggle('is-hidden', !debugEl.textContent);
  }

  function setPrimaryText(text) {
    if (!primaryBtn) return;
    primaryBtn.textContent = text;
  }

  function setPrimaryDisabled(disabled) {
    if (!primaryBtn) return;
    primaryBtn.disabled = Boolean(disabled);
  }

  function setResendDisabled(disabled) {
    if (!resendBtn) return;
    resendBtn.disabled = Boolean(disabled);
  }

  function stopCountdown() {
    if (countdownId) {
      window.clearInterval(countdownId);
      countdownId = 0;
    }
    countdownEndsAt = 0;
  }

  function startCountdown(seconds) {
    stopCountdown();
    const totalMs = Math.max(0, Number(seconds || 30)) * 1000;
    countdownEndsAt = Date.now() + totalMs;
    setResendDisabled(true);

    const tick = () => {
      const remainingMs = Math.max(0, countdownEndsAt - Date.now());
      const remainingS = Math.ceil(remainingMs / 1000);
      if (timerEl) timerEl.textContent = `${remainingS}s`;
      if (remainingMs <= 0) {
        stopCountdown();
        setResendDisabled(false);
        if (timerEl) timerEl.textContent = '0s';
      }
    };
    tick();
    countdownId = window.setInterval(tick, 250);
  }

  function showOtpStep(show) {
    if (!otpWrap) return;
    otpWrap.classList.toggle('is-hidden', !show);
    if (show) {
      otpBoxes.forEach((b) => (b.value = ''));
      window.setTimeout(() => {
        try { otpBoxes[0] && otpBoxes[0].focus && otpBoxes[0].focus(); } catch (e) {}
      }, 0);
    }
  }

  function getOtpValue() {
    return otpBoxes.map((b) => String(b.value || '').replace(/\D/g, '').slice(0, 1)).join('');
  }

  function getRoleValue() {
    const checked = overlay.querySelector('input[name="role"]:checked');
    const v = checked ? String(checked.value || '').toLowerCase() : 'user';
    return v === 'admin' ? 'admin' : 'user';
  }

  function getPayload() {
    const tab = hiddenTab && hiddenTab.value ? String(hiddenTab.value).toLowerCase() : 'login';
    const method = hiddenMethod && hiddenMethod.value ? String(hiddenMethod.value).toLowerCase() : 'email';
    const mode = hiddenMode && hiddenMode.value ? String(hiddenMode.value).toLowerCase() : 'otp';

    return {
      tab: tab === 'signup' ? 'signup' : 'login',
      method: method === 'phone' ? 'phone' : 'email',
      mode: mode === 'password' ? 'password' : 'otp',
      role: getRoleValue(),
      email: emailInput ? String(emailInput.value || '').trim() : '',
      countryCode: countrySelect ? String(countrySelect.value || '+91').trim() : '+91',
      phone: phoneInput ? String(phoneInput.value || '').trim() : '',
    };
  }

  function getTab() {
    return hiddenTab && hiddenTab.value === 'signup' ? 'signup' : 'login';
  }

  function getMethod() {
    return hiddenMethod && hiddenMethod.value === 'phone' ? 'phone' : 'email';
  }

  function getMode() {
    return hiddenMode && hiddenMode.value === 'password' ? 'password' : 'otp';
  }

  function setMode(nextMode) {
    const mode = String(nextMode || 'otp').toLowerCase() === 'password' ? 'password' : 'otp';
    if (hiddenMode) hiddenMode.value = mode;
    modeButtons.forEach((btn) => {
      const btnMode = String(btn.getAttribute('data-auth-mode') || '').toLowerCase();
      btn.classList.toggle('is-active', btnMode === mode);
    });
    syncUi();
  }

  function setRequired(el, required) {
    if (!el) return;
    if (required) el.setAttribute('required', 'required');
    else el.removeAttribute('required');
  }

  function syncUi() {
    const tab = getTab();
    const method = getMethod();
    let mode = getMode();

    // Signup: OTP authentication + username/password compulsory.
    // Allow both email OTP and phone OTP on signup.
    const effectiveMethod = method;
    const effectiveMode = (effectiveMethod === 'phone') ? 'otp' : (tab === 'signup' ? 'otp' : mode);
    if (hiddenMode) hiddenMode.value = effectiveMode;

    // Login mode selector only for email+login
    if (loginModesWrap) {
      loginModesWrap.classList.toggle('is-hidden', !(tab === 'login' && effectiveMethod === 'email'));
    }
    if (tab === 'login' && effectiveMethod === 'email') {
      modeButtons.forEach((btn) => {
        const btnMode = String(btn.getAttribute('data-auth-mode') || '').toLowerCase();
        btn.classList.toggle('is-active', btnMode === effectiveMode);
      });
    }

    syncFieldStates();

    if (emailLabel) {
      if (tab === 'signup') emailLabel.textContent = 'Email';
      else emailLabel.textContent = (tab === 'login' && effectiveMode === 'password') ? 'Username or Email' : 'Email';
    }

    // Blocks
    if (emailBlock) emailBlock.classList.toggle('is-hidden', effectiveMethod !== 'email');
    if (phoneBlock) phoneBlock.classList.toggle('is-hidden', effectiveMethod !== 'phone');
    if (usernameBlock) usernameBlock.classList.toggle('is-hidden', tab !== 'signup');
    if (passwordBlock) passwordBlock.classList.toggle('is-hidden', !(tab === 'signup' || (tab === 'login' && effectiveMode === 'password')));
    if (confirmBlock) confirmBlock.classList.toggle('is-hidden', tab !== 'signup');

    // Required
    setRequired(emailInput, effectiveMethod === 'email');
    setRequired(phoneInput, effectiveMethod === 'phone');
    setRequired(usernameInput, tab === 'signup');
    setRequired(passwordInput, tab === 'signup' || (tab === 'login' && effectiveMode === 'password'));
    setRequired(confirmInput, tab === 'signup');

    // OTP step visibility
    // Primary button
    const otpVisible = otpWrap && !otpWrap.classList.contains('is-hidden');
    if (tab === 'signup') {
      setPrimaryText(otpVisible ? 'Verify OTP' : 'Send OTP');
    } else if (effectiveMode === 'password') {
      setPrimaryText('Log in');
    } else {
      setPrimaryText(otpVisible ? 'Verify OTP' : 'Send OTP');
    }
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body || {}),
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || data.success === false) {
      const msg = (data && data.message) ? data.message : `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }
 
   function setOpen(nextOpen) {
     const open = Boolean(nextOpen);
     overlay.classList.toggle('is-open', open);
     overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
 
     if (open) {
       lastBodyOverflow = document.body.style.overflow;
       document.body.style.overflow = 'hidden';
      showAlert('');
      showDebug('');
     } else {
       document.body.style.overflow = lastBodyOverflow;
      stopCountdown();
     }
   }
 
   function setTab(nextTab) {
     const tab = String(nextTab || 'login').toLowerCase() === 'signup' ? 'signup' : 'login';
     if (hiddenTab) hiddenTab.value = tab;
 
     tabButtons.forEach((btn) => {
       const btnTab = String(btn.getAttribute('data-auth-tab') || '').toLowerCase();
       const active = btnTab === tab;
       btn.classList.toggle('is-active', active);
       btn.setAttribute('aria-selected', active ? 'true' : 'false');
     });
 
     if (indicator) {
       indicator.style.transform = tab === 'signup' ? 'translateX(100%)' : 'translateX(0%)';
     }
 
     if (roleBlock) {
       roleBlock.classList.toggle('is-hidden', tab !== 'signup');
     }

    if (bodyWrap) {
      bodyWrap.classList.remove('is-switching');
      // Force restart animation for smoother tab switching.
      // This is purely visual and does not touch the auth flow.
      void bodyWrap.offsetWidth;
      bodyWrap.classList.add('is-switching');
      window.setTimeout(() => bodyWrap.classList.remove('is-switching'), 280);
    }

    // Reset OTP step when switching tabs
    showOtpStep(false);
    setPrimaryText('Send OTP');
    setPrimaryDisabled(false);
    setResendDisabled(true);
    showAlert('');
    showDebug('');
    stopCountdown();

    // Default login to OTP; signup always OTP-first
    if (tab === 'login') {
      if (hiddenMode) hiddenMode.value = 'otp';
    } else {
      if (hiddenMode) hiddenMode.value = 'otp';
    }
    syncUi();
   }

  function setHasValue(el, hasValue) {
    if (!el) return;
    el.classList.toggle('has-value', Boolean(hasValue));
  }

  function syncFieldStates() {
    // Floating-label state sync (visual only).
    const controls = Array.from(overlay.querySelectorAll('.se-auth-input, .se-auth-select'));
    controls.forEach((control) => {
      const wrap = control.closest('.se-auth-block') || control.parentElement;
      if (!wrap) return;
      const value = (control.tagName === 'SELECT')
        ? String(control.value || '').trim()
        : String(control.value || '').trim();
      setHasValue(wrap, Boolean(value));
    });
  }
 
   function setMethod(nextMethod) {
     const method = String(nextMethod || 'email').toLowerCase() === 'phone' ? 'phone' : 'email';
     if (hiddenMethod) hiddenMethod.value = method;
 
     methodButtons.forEach((btn) => {
       const btnMethod = String(btn.getAttribute('data-auth-method') || '').toLowerCase();
       btn.classList.toggle('is-active', btnMethod === method);
     });
 
     if (emailBlock) emailBlock.classList.toggle('is-hidden', method !== 'email');
     if (phoneBlock) phoneBlock.classList.toggle('is-hidden', method !== 'phone');
 
     window.setTimeout(() => {
       try {
         const focusEl = method === 'phone'
           ? overlay.querySelector('#se-auth-phone')
           : overlay.querySelector('#se-auth-email');
         focusEl && focusEl.focus && focusEl.focus();
       } catch (e) {}
     }, 0);

    // Reset OTP step when switching methods
    showOtpStep(false);
    setPrimaryText('Send OTP');
    setPrimaryDisabled(false);
    setResendDisabled(true);
    showAlert('');
    showDebug('');
    stopCountdown();

    // Phone always OTP
    if (hiddenMethod && hiddenMethod.value === 'phone') {
      if (hiddenMode) hiddenMode.value = 'otp';
    }
    syncUi();
   }
 
   function open(nextTab) {
     setTab(nextTab);
     setOpen(true);
   }
 
   function close() {
     setOpen(false);
   }
 
   // Public API (optional)
   window.StayEaseAuth = { open, close };
 
   // Navbar triggers: <a data-auth-open="login|signup" href="/login|/signup">
   // Use capture phase to win against other handlers and ensure navigation is prevented.
   document.addEventListener('click', (e) => {
     const target = e.target;
     const trigger = target && target.closest ? target.closest('[data-auth-open]') : null;
     if (!trigger) return;
 
     e.preventDefault();
     open(trigger.getAttribute('data-auth-open'));
   }, true);
 
   tabButtons.forEach((btn) => {
     btn.addEventListener('click', () => setTab(btn.getAttribute('data-auth-tab')));
   });
 
   methodButtons.forEach((btn) => {
     btn.addEventListener('click', () => setMethod(btn.getAttribute('data-auth-method')));
   });

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.getAttribute('data-auth-mode')));
  });
 
   closeBtn && closeBtn.addEventListener('click', close);
   overlay.addEventListener('mousedown', (e) => {
     if (e.target === overlay) close();
   });
   panel && panel.addEventListener('mousedown', (e) => e.stopPropagation());
   document.addEventListener('keydown', (e) => {
     if (e.key === 'Escape' && isOpen()) close();
   });
 
   // Open via URL: /?auth=login|signup
   try {
     const params = new URLSearchParams(window.location.search || '');
     const auth = String(params.get('auth') || '').toLowerCase();
     if (auth === 'login' || auth === 'signup') {
       open(auth);
     }
   } catch (e) {}

  // Also auto-open on dedicated routes so the upgraded modal is visible there.
  try {
    const p = String(window.location.pathname || '');
    if (p === '/login') open('login');
    if (p === '/signup') open('signup');
  } catch (e) {}
 
   // Defaults
   setTab(hiddenTab && hiddenTab.value ? hiddenTab.value : 'login');
   setMethod(hiddenMethod && hiddenMethod.value ? hiddenMethod.value : 'email');
  setMode(hiddenMode && hiddenMode.value ? hiddenMode.value : 'otp');
  syncUi();

  // Keep floating labels in sync when typing
  overlay.addEventListener('input', (e) => {
    const t = e && e.target;
    if (!t) return;
    if (t.classList && (t.classList.contains('se-auth-input') || t.classList.contains('se-auth-select'))) {
      syncFieldStates();
    }
  });

  // Social auth placeholder (optional; does not affect existing flows)
  if (socialButtons.length) {
    socialButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const provider = String(btn.getAttribute('data-social-provider') || '').toLowerCase();
        showAlert('');
        showDebug(`Social login (${provider || 'provider'}) is not connected yet.`);
      });
    });
  }

  // OTP input UX
  if (otpBoxes.length) {
    otpBoxes.forEach((box, idx) => {
      box.addEventListener('input', () => {
        box.value = String(box.value || '').replace(/\D/g, '').slice(0, 1);
        if (box.value && otpBoxes[idx + 1]) {
          otpBoxes[idx + 1].focus();
        }
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && otpBoxes[idx - 1]) {
          otpBoxes[idx - 1].focus();
        }
      });

      box.addEventListener('paste', (e) => {
        const text = (e.clipboardData && e.clipboardData.getData) ? e.clipboardData.getData('text') : '';
        const digits = String(text || '').replace(/\D/g, '').slice(0, 6);
        if (!digits) return;
        e.preventDefault();
        for (let i = 0; i < otpBoxes.length; i++) {
          otpBoxes[i].value = digits[i] ? digits[i] : '';
        }
        const last = otpBoxes[Math.min(digits.length, otpBoxes.length) - 1];
        last && last.focus && last.focus();
      });
    });
  }

  // Send/Verify OTP flow
  async function sendOtp() {
    showAlert('');
    showDebug('');
    setPrimaryDisabled(true);
    const payload = getPayload();
    const data = await postJson('/send-otp', payload);
    const target = data && data.target ? String(data.target) : '';
    showAlert(target ? `OTP sent to ${target}` : 'OTP sent');
    if (data && data.debugOtp) {
      showDebug(`Debug OTP: ${data.debugOtp}`);
    }
    showOtpStep(true);
    setPrimaryText('Verify OTP');
    setPrimaryDisabled(false);
    startCountdown(30);
  }

  async function passwordLogin() {
    showAlert('');
    showDebug('');
    setPrimaryDisabled(true);

    const identifier = emailInput ? String(emailInput.value || '').trim() : '';
    const password = passwordInput ? String(passwordInput.value || '') : '';
    const data = await postJson('/api/auth/password-login', { identifier, password });
    close();
    window.location.reload();
    return data;
  }

  async function passwordSignup() {
    showAlert('');
    showDebug('');
    setPrimaryDisabled(true);

    const email = emailInput ? String(emailInput.value || '').trim() : '';
    const username = usernameInput ? String(usernameInput.value || '').trim() : '';
    const password = passwordInput ? String(passwordInput.value || '') : '';
    const confirmPassword = confirmInput ? String(confirmInput.value || '') : '';
    const role = getRoleValue();

    const data = await postJson('/api/auth/password-signup', { email, username, password, confirmPassword, role });
    close();
    window.location.reload();
    return data;
  }

  async function completeSignup() {
    const username = usernameInput ? String(usernameInput.value || '').trim() : '';
    const password = passwordInput ? String(passwordInput.value || '') : '';
    const confirmPassword = confirmInput ? String(confirmInput.value || '') : '';
    return postJson('/complete-signup', { username, password, confirmPassword });
  }

  async function verifyOtpSignupAndComplete() {
    showAlert('');
    showDebug('');
    const otp = getOtpValue();
    if (!/^\d{6}$/.test(otp)) {
      showAlert('Please enter the 6-digit OTP.');
      return;
    }
    setPrimaryDisabled(true);
    await postJson('/verify-otp-signup', { otp });
    await completeSignup();
    close();
    window.location.reload();
  }

  async function verifyOtp() {
    showAlert('');
    showDebug('');
    const otp = getOtpValue();
    if (!/^\d{6}$/.test(otp)) {
      showAlert('Please enter the 6-digit OTP.');
      return;
    }

    setPrimaryDisabled(true);
    await postJson('/verify-otp', { otp });
    close();
    window.location.reload();
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const tab = getTab();
        const method = getMethod();
        const mode = getMode();

        if (tab === 'signup') {
          const otpVisible = otpWrap && !otpWrap.classList.contains('is-hidden');
          if (!otpVisible) {
            await sendOtp();
          } else {
            await verifyOtpSignupAndComplete();
          }
          return;
        }

        if (method === 'email' && mode === 'password') {
          await passwordLogin();
          return;
        }

        const otpVisible = otpWrap && !otpWrap.classList.contains('is-hidden');
        if (!otpVisible) await sendOtp();
        else await verifyOtp();
      } catch (err) {
        showAlert(err && err.message ? err.message : 'Something went wrong.');
        setPrimaryDisabled(false);
      }
    });
  }

  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      try {
        setResendDisabled(true);
        await sendOtp();
      } catch (err) {
        showAlert(err && err.message ? err.message : 'Unable to resend OTP.');
        setResendDisabled(false);
      }
    });
  }
 })();
