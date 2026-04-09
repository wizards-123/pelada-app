// ============================================================
// login.js - Login, logout, navegação
// ============================================================

async function initLogin() {
  $('grupoScreen').style.display = 'none';
  $('loginScreen').style.display = 'flex';
  $('loginGrupoNome').textContent = grupoAtual.nome;

  var { data: j } = await sb.from('jogadores').select('nome').eq('grupo_id', grupoAtual.id).order('nome');
  cachedJogadores = j ? j.map(function(r) { return r.nome; }) : [];

  var { data: p } = await sb.from('peladas').select('*').eq('grupo_id', grupoAtual.id).order('criado_em', { ascending: false });
  allPeladas = p || [];
  peladaAtual = allPeladas.length > 0 ? allPeladas[0] : null;

  var sel = $('loginSelect');
  sel.innerHTML = '<option value="">Selecione seu nome...</option>';
  sa(cachedJogadores).forEach(function(n) {
    var o = document.createElement('option');
    o.value = n;
    o.textContent = dn(n);
    sel.appendChild(o);
  });
}

function onLoginSelectChange() {
  var v = $('loginSelect').value;
  $('passwordGroup').style.display = (admNames.indexOf(v) > -1) ? 'block' : 'none';
  $('loginError').style.display = 'none';
}

async function doLogin() {
  var v = $('loginSelect').value;
  if (!v) { showLoginError('Selecione.'); return; }

  if (admNames.indexOf(v) > -1) {
    var pw = $('admPassword').value;
    var { data: ae } = await sb.from('admins').select('nome, senha, tipo').eq('grupo_id', grupoAtual.id).eq('nome', v).single();
    if (!ae || ae.senha !== pw) { showLoginError('Senha incorreta.'); return; }
    finalizeLogin(v, true, ae.tipo === 'Super');
  } else {
    finalizeLogin(v, false, false);
  }
}

async function finalizeLogin(name, adm, sup) {
  currentUser = name;
  isAdm = adm;
  isSuperAdmin = sup;
  $('headerUserName').textContent = dn(name);
  $('headerGrupoName').textContent = grupoAtual.nome;
  $('loginScreen').style.display = 'none';
  $('appScreen').style.display = 'block';
  $('navAdm').style.display = adm ? 'flex' : 'none';
  $('navFinanceiro').style.display = adm ? 'flex' : 'none';
  logAsync(name, 'LOGIN', 'Entrou');
  loadHome();
}

function doLogout() {
  if (currentUser) logAsync(currentUser, 'LOGOUT', 'Saiu');
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  currentUser = null;
  isAdm = false;
  isSuperAdmin = false;
  $('appScreen').style.display = 'none';
  $('admPassword').value = '';
  $('loginSelect').value = '';
  $('passwordGroup').style.display = 'none';
  showGrupoScreen();
}

function showLoginError(m) {
  var e = $('loginError');
  e.textContent = m;
  e.style.display = 'block';
}

function voltarParaGrupos() {
  $('loginScreen').style.display = 'none';
  showGrupoScreen();
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  $('page' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  $('nav' + page).classList.add('active');

  if (page === 'Home') loadHome();
  else if (page === 'Votar') loadVotar();
  else if (page === 'Resultados') loadResultados();
  else if (page === 'Adm') loadAdm();
  else if (page === 'AoVivo') loadAoVivo();
  else if (page === 'Financeiro') loadFinanceiro();
}
