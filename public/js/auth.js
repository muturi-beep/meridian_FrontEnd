/* ══════════════════════════════════════════════════════
     CONFIG — same-origin on Vercel, localhost in dev
  ══════════════════════════════════════════════════════ */
  const isLocalDev =
    location.protocol === 'file:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '' ||
    location.hostname.startsWith('192.168.') ||
    location.hostname.startsWith('10.');

  // On Vercel, frontend + backend live on the same domain, so we use
  // relative URLs. Only use localhost:3000 when running locally.
  const API = isLocalDev ? 'http://localhost:3000' : '';

  console.log('[auth] API base =', API || '(same-origin)');

  /* ════ ROLE META ════ */
  const ROLES = {
    'agency-director':  { color:'#d4a46a', desc:'Full access — all properties, users and financials.' },
    'property-manager': { color:'#2eb8c5', desc:'Manage units, tenants and maintenance requests.' },
    'finance-officer':  { color:'#3ecf8e', desc:'Access payments, invoices and financial reports.' },
    'maintenance-staff':{ color:'#f5a623', desc:'View and update maintenance work orders.' },
    'leasing-agent':    { color:'#8b8ff5', desc:'Handle viewings, applications and leases.' },
    'tenant':           { color:'#48c78e', desc:'View your unit details and raise maintenance requests.' },
    'auditor':          { color:'#7a83a0', desc:'Read-only access to reports and dashboards.' },
  };

  const urlParams = new URLSearchParams(window.location.search);
  const packageParam = urlParams.get('package');

  /* ════ ORG MODE SWITCH ════ */
  let ORG_MODE = 'create';
  function switchOrgMode(mode) {
    ORG_MODE = mode;
    document.getElementById('org-tab-create').classList.toggle('active', mode === 'create');
    document.getElementById('org-tab-join').classList.toggle('active', mode === 'join');
    document.getElementById('org-field-create').style.display = mode === 'create' ? 'flex' : 'none';
    document.getElementById('org-field-join').style.display   = mode === 'join'   ? 'flex' : 'none';
    document.getElementById('org-field-role').style.display        = mode === 'join'   ? 'flex' : 'none';
    document.getElementById('org-field-role-locked').style.display = mode === 'create' ? 'flex' : 'none';
  }

  /* ════ TAB SWITCH ════ */
  function switchTab(tab) {
    ['login','signup'].forEach(t => {
      const isActive = t === tab;
      document.getElementById(`tab-${t}`).classList.toggle('active', isActive);
      const panel = document.getElementById(`panel-${t}`);
      panel.style.display = isActive ? 'block' : 'none';
      if (isActive) {
        panel.classList.remove('auth-panel');
        void panel.offsetWidth;
        panel.classList.add('auth-panel');
      }
    });
  }

  /* ════ ROLE PREVIEW ════ */
  function updateRolePreview(prefix) {
    const val     = document.getElementById(`${prefix}-role`).value;
    const preview = document.getElementById(`${prefix}-role-preview`);
    if (!val || !ROLES[val]) { preview.classList.remove('show'); return; }
    document.getElementById(`${prefix}-role-dot`).style.background = ROLES[val].color;
    document.getElementById(`${prefix}-role-desc`).textContent = ROLES[val].desc;
    preview.classList.add('show');
  }

  /* ════ PASSWORD TOGGLE ════ */
  function togglePwd(id, btn) {
    const el = document.getElementById(id);
    const show = el.type === 'password';
    el.type = show ? 'text' : 'password';
    btn.textContent = show ? '🙈' : '👁';
  }

  /* ════ SHOW MESSAGE ════ */
  function showMsg(id, text, type) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = `auth-msg ${type}`;
    if (type === 'ok') setTimeout(() => { el.textContent=''; el.className='auth-msg'; }, 4000);
  }

  function setLoading(btnId, loading, defaultText) {
    const btn = document.getElementById(btnId);
    btn.disabled = loading;
    btn.textContent = loading ? 'Please wait...' : defaultText;
  }

  /* ════ LOGIN ════ */
  async function handleLogin() {
    const email    = document.getElementById('l-email').value.trim();
    const password = document.getElementById('l-password').value;
    const role     = document.getElementById('l-role').value;

    if (!email)    { showMsg('login-msg','❌ Please enter your email address.','err'); return; }
    if (!password) { showMsg('login-msg','❌ Please enter your password.','err'); return; }
    if (!role)     { showMsg('login-msg','❌ Please select your role to continue.','err'); return; }

    setLoading('login-btn', true, 'Sign In →');

    const url = `${API}/auth/login`;
    console.log('[auth] POST', url);

    try {
      const res  = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password, role }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        sessionStorage.setItem('mp_session', JSON.stringify({
          ...data.user, token: data.token, loggedIn: true,
          organizationId: data.organization?.id, organizationName: data.organization?.name,
          inviteCode: data.organization?.inviteCode,
        }));
        showMsg('login-msg', `✅ Welcome back, ${data.user.firstName}! Redirecting...`, 'ok');
        setTimeout(() => window.location.href = 'dashboard.html', 1200);
      } else {
        showMsg('login-msg', `❌ ${data.message || `HTTP ${res.status}`} (${url})`, 'err');
        setLoading('login-btn', false, 'Sign In →');
      }
    } catch (err) {
      showMsg('login-msg', `❌ Cannot reach server at ${url}. ${err.message}`, 'err');
      setLoading('login-btn', false, 'Sign In →');
    }
  }

  /* ════ PAYMENT MODAL ════ */
  const paymentModal = document.getElementById('paymentModal');
  const closePaymentModal = document.getElementById('closePaymentModal');

  function showPaymentModal(amount, phone) {
    document.getElementById('paymentAmount').textContent = `KES ${amount.toLocaleString()}`;
    document.getElementById('paymentPhone').textContent = `📞 ${phone}`;

    const loaderContainer = document.getElementById('paymentLoaderContainer');
    loaderContainer.innerHTML = `
      <div class="payment-loader"></div>
      <p style="color: var(--t2); font-size: 13px; margin-top: 12px;">Waiting for payment confirmation...</p>
    `;

    closePaymentModal.textContent = 'Close';
    closePaymentModal.onclick = function() {
      paymentModal.classList.remove('open');
    };

    paymentModal.classList.add('open');

    setTimeout(() => {
      setTimeout(() => {
        loaderContainer.innerHTML = `
          <div style="font-size: 48px; margin: 10px 0;">✅</div>
          <h3 style="color: var(--green);">Payment Successful!</h3>
          <p style="color: var(--t1);">Your account has been created successfully.</p>
          <p style="color: var(--t2); font-size: 13px; margin-top: 8px;">
            Welcome! You're now on the selected plan.
          </p>
        `;
        closePaymentModal.textContent = 'Go to Dashboard';
        closePaymentModal.onclick = function() {
          window.location.href = 'dashboard.html';
        };
      }, 5000);
    }, 1000);
  }

  /* ════ SIGNUP ════ */
  async function handleSignup() {
    const first    = document.getElementById('s-first').value.trim();
    const last     = document.getElementById('s-last').value.trim();
    const email    = document.getElementById('s-email').value.trim();
    const phone    = document.getElementById('s-phone').value.trim();
    const role     = document.getElementById('s-role').value;
    const password = document.getElementById('s-password').value;
    const confirm  = document.getElementById('s-confirm').value;
    const orgName    = document.getElementById('s-org-name').value.trim();
    const inviteCode = document.getElementById('s-invite-code').value.trim();

    const isFreePackage = packageParam === 'free' || packageParam === 'starter';

    if (!first || !last)       { showMsg('signup-msg','❌ Please enter your full name.','err'); return; }
    if (!email)                { showMsg('signup-msg','❌ Please enter your email address.','err'); return; }
    if (!phone)                { showMsg('signup-msg','❌ Please enter your phone number.','err'); return; }
    if (ORG_MODE === 'create' && !orgName) { showMsg('signup-msg','❌ Please enter a name for your agency.','err'); return; }
    if (ORG_MODE === 'join') {
      if (!inviteCode) { showMsg('signup-msg','❌ Please enter your agency\'s invite code.','err'); return; }
      if (!role)        { showMsg('signup-msg','❌ Please select your role — it is required.','err'); return; }
    }
    if (password.length < 8)  { showMsg('signup-msg','❌ Password must be at least 8 characters.','err'); return; }
    if (password !== confirm)  { showMsg('signup-msg','❌ Passwords do not match.','err'); return; }

    setLoading('signup-btn', true, 'Create Account →');

    const url = `${API}/auth/register`;
    console.log('[auth] POST', url);

    try {
      const res  = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          firstName: first, lastName: last, email, phone, role, password,
          orgAction: ORG_MODE,
          organizationName: ORG_MODE === 'create' ? orgName : undefined,
          inviteCode:       ORG_MODE === 'join'   ? inviteCode : undefined,
          package: packageParam || 'none',
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        sessionStorage.setItem('mp_session', JSON.stringify({
          ...data.user, token: data.token, loggedIn: true,
          organizationId: data.organization?.id, organizationName: data.organization?.name,
          inviteCode: data.organization?.inviteCode,
          package: packageParam || 'none',
        }));

        if (isFreePackage) {
          showMsg('signup-msg', `✅ ${data.message} — Free package activated! Redirecting...`, 'ok');
          setTimeout(() => window.location.href = 'dashboard.html', 1500);
          setLoading('signup-btn', false, 'Create Account →');
          return;
        }

        const cleanPhone = phone.replace(/[^0-9]/g, '');
        let amount = 0;
        switch(packageParam) {
          case 'basic': amount = 2500; break;
          case 'professional': amount = 7500; break;
          case 'enterprise': amount = 15000; break;
          default: amount = 2500;
        }

        showMsg('signup-msg', `✅ ${data.message} — Please complete M-Pesa payment.`, 'ok');
        showPaymentModal(amount, cleanPhone);
        setLoading('signup-btn', false, 'Create Account →');
      } else {
        showMsg('signup-msg', `❌ ${data.message || `HTTP ${res.status}`} (${url})`, 'err');
        setLoading('signup-btn', false, 'Create Account →');
      }
    } catch (err) {
      showMsg('signup-msg', `❌ Cannot reach server at ${url}. ${err.message}`, 'err');
      setLoading('signup-btn', false, 'Create Account →');
    }
  }

  /* ════ Auto-select package ════ */
  if (packageParam) {
    switchTab('signup');

    const packageNames = {
      'free': '✨ Free Package (No payment required)',
      'starter': '✨ Free Package (No payment required)',
      'basic': '📦 Basic Package - KES 2,500/month',
      'professional': '📦 Professional Package - KES 7,500/month',
      'enterprise': '📦 Enterprise Package - KES 15,000/month'
    };

    const packageMessage = packageNames[packageParam] || 'Selected Package';
    const authSub = document.querySelector('#panel-signup .auth-sub');
    authSub.innerHTML = `You are signing up for: <strong style="color: var(--copper-l);">${packageMessage}</strong>`;

    if (packageParam === 'free' || packageParam === 'starter') {
      const freeNote = document.createElement('div');
      freeNote.style.cssText = `
        background: var(--green-bg);
        border: 1px solid var(--green);
        border-radius: var(--rs);
        padding: 10px 14px;
        margin-bottom: 16px;
        color: var(--green);
        font-size: 13px;
        text-align: center;
      `;
      freeNote.textContent = '🎉 No M-Pesa payment required! Your free package will be activated immediately.';
      authSub.parentNode.insertBefore(freeNote, authSub.nextSibling);
    }
  }

  /* ════ ENTER KEY ════ */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const loginVisible = document.getElementById('panel-login').style.display !== 'none';
    if (loginVisible) handleLogin(); else handleSignup();
  });

  /* ════ AUTO-REDIRECT IF ALREADY LOGGED IN ════ */
  const sess = JSON.parse(sessionStorage.getItem('mp_session') || '{}');
  if (sess.loggedIn) window.location.href = 'dashboard.html';

  paymentModal.addEventListener('click', function(e) {
    if (e.target === this) paymentModal.classList.remove('open');
  });
  document.querySelector('.payment-modal-content').addEventListener('click', function(e) {
    e.stopPropagation();
  });