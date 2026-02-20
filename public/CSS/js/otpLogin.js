(() => {
  function $(id) {
    return document.getElementById(id);
  }

  const emailEl = $('otpLoginEmail');
  const sendBtn = $('otpSendBtn');
  const resendBtn = $('otpResendBtn');
  const verifyBlock = $('otpVerifyBlock');
  const otpEl = $('otpCode');
  const verifyBtn = $('otpVerifyBtn');
  const alertEl = $('otpLoginAlert');
  const infoEl = $('otpLoginInfo');

  if (!emailEl || !sendBtn || !resendBtn || !verifyBlock || !otpEl || !verifyBtn) return;

  let resendTimerId = 0;
  let resendReadyAt = 0;

  function showAlert(msg) {
    if (!alertEl) return;
    alertEl.textContent = String(msg || '').trim();
    alertEl.classList.toggle('d-none', !alertEl.textContent);
  }

  function showInfo(msg) {
    if (!infoEl) return;
    infoEl.textContent = String(msg || '').trim();
    infoEl.classList.toggle('d-none', !infoEl.textContent);
  }

  function setResendDisabled(disabled) {
    resendBtn.disabled = Boolean(disabled);
  }

  function stopResendTimer() {
    if (resendTimerId) {
      window.clearInterval(resendTimerId);
      resendTimerId = 0;
    }
    resendReadyAt = 0;
  }

  function startResendTimer(seconds) {
    stopResendTimer();
    const ms = Math.max(0, Number(seconds || 30)) * 1000;
    resendReadyAt = Date.now() + ms;
    setResendDisabled(true);

    resendTimerId = window.setInterval(() => {
      const remaining = Math.max(0, resendReadyAt - Date.now());
      if (remaining <= 0) {
        stopResendTimer();
        setResendDisabled(false);
      }
    }, 300);
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {}),
      credentials: 'same-origin',
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || data.success === false) {
      const msg = data && data.message ? data.message : `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  async function sendOtp() {
    showAlert('');
    showInfo('');

    const email = String(emailEl.value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showAlert('Please enter a valid email address.');
      return;
    }

    sendBtn.disabled = true;
    setResendDisabled(true);

    const data = await postJson('/send-otp', {
      tab: 'login',
      method: 'email',
      role: 'user',
      email,
    });

    const target = data && data.target ? String(data.target) : '';
    showInfo(target ? `OTP sent to ${target}` : 'OTP sent.');
    if (data && data.debugOtp) {
      showInfo((target ? `OTP sent to ${target}. ` : '') + `Debug OTP: ${data.debugOtp}`);
    }

    verifyBlock.classList.remove('d-none');
    otpEl.value = '';
    otpEl.focus();

    startResendTimer(30);
    sendBtn.disabled = false;
  }

  async function verifyOtp() {
    showAlert('');
    showInfo('');

    const otp = String(otpEl.value || '').replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(otp)) {
      showAlert('Please enter the 6-digit OTP.');
      return;
    }

    verifyBtn.disabled = true;
    await postJson('/verify-otp', { otp });
    window.location.href = '/';
  }

  sendBtn.addEventListener('click', () => {
    sendOtp().catch((err) => {
      showAlert(err && err.message ? err.message : 'Unable to send OTP.');
      sendBtn.disabled = false;
    });
  });

  resendBtn.addEventListener('click', () => {
    sendOtp().catch((err) => {
      showAlert(err && err.message ? err.message : 'Unable to resend OTP.');
      setResendDisabled(false);
    });
  });

  verifyBtn.addEventListener('click', () => {
    verifyOtp().catch((err) => {
      showAlert(err && err.message ? err.message : 'Unable to verify OTP.');
      verifyBtn.disabled = false;
    });
  });

  otpEl.addEventListener('input', () => {
    otpEl.value = String(otpEl.value || '').replace(/\D/g, '').slice(0, 6);
  });
})();
