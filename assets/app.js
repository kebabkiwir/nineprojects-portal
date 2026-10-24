import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Ganti kedua nilai berikut dari Supabase Dashboard > Project Settings > API.
// Gunakan publishable key atau anon key. JANGAN pernah memasukkan service_role/secret key di sini.
const SUPABASE_URL = 'https://fjwlpjoigrmliivbwaqj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_2p9TFQKQUUH3qqguSvMqAw_qznojn-s';

const isConfigured = SUPABASE_URL.startsWith('https://')
  && !SUPABASE_URL.includes('_HERE')
  && SUPABASE_PUBLISHABLE_KEY.length > 20
  && !SUPABASE_PUBLISHABLE_KEY.includes('_HERE');
const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    })
  : null;

const $ = (id) => document.getElementById(id);
const views = { auth: $('authView'), dashboard: $('dashboardView'), recovery: $('recoveryView') };
let formMode = 'login';
let currentProfile = null;
let allUsers = [];
let recoveryModeActive = false;

function setNotice(element, message, kind = 'info') {
  element.textContent = message;
  element.className = `notice ${kind}`;
  element.hidden = false;
}
function clearNotice(element) {
  element.textContent = '';
  element.className = 'notice';
  element.hidden = true;
}
function showView(viewName) {
  Object.entries(views).forEach(([name, element]) => { element.hidden = name !== viewName; });
}
function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) {
    button.dataset.originalLabel ??= button.innerHTML;
    button.textContent = label;
  } else if (button.dataset.originalLabel) {
    button.innerHTML = button.dataset.originalLabel;
    delete button.dataset.originalLabel;
  }
}
function safeText(value, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function friendlyError(error) {
  const message = error?.message || 'Terjadi kesalahan yang tidak diketahui.';
  if (/Invalid login credentials/i.test(message)) return 'Email atau kata sandi tidak cocok. Periksa kembali data Anda.';
  if (/Email not confirmed/i.test(message)) return 'Email belum diverifikasi. Buka email konfirmasi lalu coba masuk kembali.';
  if (/User already registered/i.test(message)) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (/Password should be at least/i.test(message)) return 'Kata sandi terlalu pendek. Gunakan sedikitnya 8 karakter.';
  if (/Failed to fetch|NetworkError/i.test(message)) return 'Layanan tidak dapat dihubungi. Periksa koneksi dan konfigurasi Supabase.';
  return message;
}
function redirectTarget(mode) {
  const url = new URL(window.location.href);
  url.searchParams.set('mode', mode);
  url.hash = '';
  return url.toString();
}

function setAuthMode(mode) {
  formMode = mode;
  const registering = mode === 'register';
  $('formKicker').textContent = registering ? 'BUAT AKUN BARU' : 'SELAMAT DATANG';
  $('authTitle').textContent = registering ? 'Buat akun Anda' : 'Masuk ke akun';
  $('authDescription').textContent = registering
    ? 'Isi data di bawah. Anda mungkin perlu memverifikasi email.'
    : 'Masukkan email dan kata sandi untuk melanjutkan.';
  $('nameField').hidden = !registering;
  $('confirmField').hidden = !registering;
  $('confirmPassword').required = registering;
  $('displayName').required = registering;
  $('password').autocomplete = registering ? 'new-password' : 'current-password';
  $('loginOptions').hidden = registering;
  $('submitButton').innerHTML = registering ? 'Daftar akun <span aria-hidden="true">→</span>' : 'Masuk <span aria-hidden="true">→</span>';
  $('switchQuestion').textContent = registering ? 'Sudah punya akun?' : 'Belum punya akun?';
  $('switchMode').textContent = registering ? 'Masuk' : 'Buat akun';
  clearNotice($('authNotice'));
}

$('switchMode').addEventListener('click', () => setAuthMode(formMode === 'login' ? 'register' : 'login'));
$('togglePassword').addEventListener('click', () => {
  const password = $('password');
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  $('togglePassword').textContent = show ? 'Sembunyi' : 'Lihat';
});

$('authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearNotice($('authNotice'));
  if (!supabase) {
    setNotice($('authNotice'), 'Supabase belum dikonfigurasi. Ikuti README.md, isi URL dan publishable/anon key di assets/app.js, lalu jalankan supabase/schema.sql.', 'warn');
    return;
  }
  const email = $('email').value.trim().toLowerCase();
  const password = $('password').value;
  const button = $('submitButton');
  if (password.length < 8) {
    setNotice($('authNotice'), 'Gunakan kata sandi minimal 8 karakter.', 'warn');
    return;
  }
  if (formMode === 'register') {
    const displayName = $('displayName').value.trim();
    if (!displayName) {
      setNotice($('authNotice'), 'Isi nama tampilan Anda.', 'warn');
      return;
    }
    if (password !== $('confirmPassword').value) {
      setNotice($('authNotice'), 'Konfirmasi kata sandi belum cocok.', 'warn');
      return;
    }
    setBusy(button, true, 'Membuat akun...');
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: redirectTarget('login')
        }
      });
      if (error) throw error;
      if (data.session && data.user) {
        setNotice($('authNotice'), 'Akun berhasil dibuat. Membuka dashboard...', 'success');
        await loadDashboard(data.user);
      } else {
        setNotice($('authNotice'), 'Pendaftaran diterima. Buka email konfirmasi, verifikasi akun, lalu masuk. Email bisa berada di folder spam.', 'success');
        $('authForm').reset();
        setAuthMode('login');
        $('email').value = email;
      }
    } catch (error) {
      setNotice($('authNotice'), friendlyError(error), 'error');
    } finally {
      setBusy(button, false);
    }
    return;
  }

  setBusy(button, true, 'Memeriksa akun...');
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await loadDashboard(data.user);
  } catch (error) {
    setNotice($('authNotice'), friendlyError(error), 'error');
  } finally {
    setBusy(button, false);
  }
});

$('forgotPassword').addEventListener('click', async () => {
  clearNotice($('authNotice'));
  if (!supabase) {
    setNotice($('authNotice'), 'Konfigurasi Supabase belum lengkap. Isi pengaturan di assets/app.js terlebih dahulu.', 'warn');
    return;
  }
  const email = $('email').value.trim().toLowerCase();
  if (!email) {
    setNotice($('authNotice'), 'Isi alamat email di atas terlebih dahulu.', 'warn');
    $('email').focus();
    return;
  }
  const button = $('forgotPassword');
  button.disabled = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTarget('reset') });
    if (error) throw error;
    setNotice($('authNotice'), 'Jika email tersebut terdaftar, tautan reset akan dikirim. Periksa kotak masuk dan folder spam.', 'success');
  } catch (error) {
    setNotice($('authNotice'), friendlyError(error), 'error');
  } finally {
    button.disabled = false;
  }
});

$('recoveryForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearNotice($('recoveryNotice'));
  const password = $('newPassword').value;
  if (password.length < 8) {
    setNotice($('recoveryNotice'), 'Kata sandi harus berisi minimal 8 karakter.', 'warn');
    return;
  }
  if (password !== $('newPasswordConfirm').value) {
    setNotice($('recoveryNotice'), 'Konfirmasi kata sandi belum cocok.', 'warn');
    return;
  }
  const button = $('recoveryForm').querySelector('button[type="submit"]');
  setBusy(button, true, 'Menyimpan...');
  try {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    recoveryModeActive = false;
    setNotice($('recoveryNotice'), 'Kata sandi berhasil diperbarui.', 'success');
    await loadDashboard(data.user);
  } catch (error) {
    setNotice($('recoveryNotice'), friendlyError(error), 'error');
  } finally {
    setBusy(button, false);
  }
});

async function loadDashboard(user) {
  if (!supabase || !user) return;
  showView('dashboard');
  $('dashboardWelcome').textContent = `Memuat profil untuk ${user.email || 'akun Anda'}...`;
  clearNotice($('profileNotice'));
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id,email,display_name,role,created_at')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile) {
      showView('auth');
      setNotice($('authNotice'), 'Login berhasil, tetapi profil tidak ditemukan. Pastikan supabase/schema.sql sudah dijalankan dan akun telah terverifikasi.', 'error');
      return;
    }
    currentProfile = profile;
    const isAdmin = profile.role === 'admin' && Boolean(user.email_confirmed_at);
    $('dashboardEyebrow').textContent = isAdmin ? 'AREA ADMIN' : 'AREA PENGGUNA';
    $('dashboardTitle').textContent = isAdmin ? 'Dashboard Admin' : 'Dashboard Pengguna';
    $('dashboardWelcome').textContent = `Masuk sebagai ${safeText(profile.display_name, user.email)}`;
    $('roleValue').textContent = isAdmin ? 'Admin' : 'Pengguna';
    $('profileStatus').textContent = 'Terhubung';
    $('profileName').value = profile.display_name || '';
    $('profileEmail').value = user.email || profile.email || '';
    $('adminPanel').hidden = !isAdmin;
    if (isAdmin) await loadUsers();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    showView('auth');
    setNotice($('authNotice'), `Tidak bisa memuat profil: ${friendlyError(error)} Pastikan SQL dan kebijakan RLS telah dipasang.`, 'error');
  }
}

$('profileForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearNotice($('profileNotice'));
  if (!supabase || !currentProfile) return;
  const displayName = $('profileName').value.trim();
  if (!displayName) {
    setNotice($('profileNotice'), 'Nama tampilan tidak boleh kosong.', 'warn');
    return;
  }
  const button = $('profileForm').querySelector('button[type="submit"]');
  setBusy(button, true, 'Menyimpan...');
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', currentProfile.id)
      .select('id,email,display_name,role,created_at')
      .single();
    if (error) throw error;
    currentProfile = data;
    $('dashboardWelcome').textContent = `Masuk sebagai ${safeText(data.display_name, data.email)}`;
    setNotice($('profileNotice'), 'Profil berhasil disimpan.', 'success');
    if (data.role === 'admin') await loadUsers();
  } catch (error) {
    setNotice($('profileNotice'), `Profil tidak berhasil disimpan: ${friendlyError(error)}`, 'error');
  } finally {
    setBusy(button, false);
  }
});

function renderUsers(users) {
  const tbody = $('usersTableBody');
  tbody.replaceChildren();
  if (users.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'empty-cell';
    td.textContent = 'Tidak ada pengguna yang cocok.';
    tr.append(td);
    tbody.append(tr);
    return;
  }
  for (const user of users) {
    const tr = document.createElement('tr');
    const nameCell = document.createElement('td');
    const name = document.createElement('strong');
    name.textContent = safeText(user.display_name, 'Tanpa nama');
    const email = document.createElement('small');
    email.textContent = safeText(user.email);
    nameCell.append(name, email);
    const roleCell = document.createElement('td');
    const role = document.createElement('span');
    role.className = `role-chip${user.role === 'admin' ? ' admin' : ''}`;
    role.textContent = user.role === 'admin' ? 'Admin' : 'Pengguna';
    roleCell.append(role);
    const dateCell = document.createElement('td');
    dateCell.textContent = user.created_at ? new Date(user.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    tr.append(nameCell, roleCell, dateCell);
    tbody.append(tr);
  }
}

function filterUsers() {
  const query = $('userSearch').value.trim().toLowerCase();
  const filtered = allUsers.filter((user) => `${user.display_name || ''} ${user.email || ''} ${user.role || ''}`.toLowerCase().includes(query));
  renderUsers(filtered);
  $('usersCaption').textContent = `${filtered.length} dari ${allUsers.length} pengguna ditampilkan.`;
}

async function loadUsers() {
  if (!supabase || currentProfile?.role !== 'admin') return;
  clearNotice($('adminNotice'));
  $('usersTableBody').replaceChildren();
  const loadingRow = document.createElement('tr');
  const loadingCell = document.createElement('td');
  loadingCell.colSpan = 3;
  loadingCell.className = 'empty-cell';
  loadingCell.textContent = 'Memuat daftar pengguna...';
  loadingRow.append(loadingCell);
  $('usersTableBody').append(loadingRow);
  const button = $('refreshUsers');
  setBusy(button, true, 'Memuat...');
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,display_name,role,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    allUsers = data || [];
    filterUsers();
  } catch (error) {
    renderUsers([]);
    setNotice($('adminNotice'), `Daftar pengguna tidak bisa dibaca. Periksa fungsi is_admin dan RLS pada schema.sql. ${friendlyError(error)}`, 'error');
    $('usersCaption').textContent = 'Gagal memuat data.';
  } finally {
    setBusy(button, false);
  }
}
$('userSearch').addEventListener('input', filterUsers);
$('refreshUsers').addEventListener('click', loadUsers);

$('logoutButton').addEventListener('click', async () => {
  if (!supabase) return;
  $('logoutButton').disabled = true;
  const { error } = await supabase.auth.signOut();
  $('logoutButton').disabled = false;
  if (error) {
    setNotice($('profileNotice'), `Gagal keluar: ${friendlyError(error)}`, 'error');
    return;
  }
  currentProfile = null;
  allUsers = [];
  $('authForm').reset();
  setAuthMode('login');
  showView('auth');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function init() {
  if (!isConfigured) {
    $('connectionLabel').textContent = 'Setup diperlukan';
    $('connectionLabel').previousElementSibling.style.background = 'var(--warning)';
    return;
  }
  $('connectionLabel').textContent = 'Supabase terkonfigurasi';
  $('connectionLabel').previousElementSibling.style.background = 'var(--success)';
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      recoveryModeActive = true;
      clearNotice($('recoveryNotice'));
      showView('recovery');
      return;
    }
    if (event === 'SIGNED_OUT') {
      currentProfile = null;
      if (!recoveryModeActive) showView('auth');
      return;
    }
    if (event === 'SIGNED_IN' && session && !recoveryModeActive) {
      setTimeout(() => loadDashboard(session.user), 0);
    }
  });
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      setNotice($('authNotice'), friendlyError(error), 'error');
      return;
    }
    const mode = new URL(window.location.href).searchParams.get('mode');
    if (mode === 'reset') {
      // The PASSWORD_RECOVERY event opens the reset form once Supabase validates the link.
      return;
    }
    if (data.session && !recoveryModeActive) loadDashboard(data.session.user);
  });
}

setAuthMode('login');
showView('auth');
init();
