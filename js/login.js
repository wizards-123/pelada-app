// ============================================================
// login.js - Login direto, ADM destravável por senha, navegação
// ============================================================

// Entra direto no app (sem selecionar "quem você é")
function initLogin() {
  currentUser = null;      // identidade só é definida na Votação
  isAdm = false;           // ADM começa travado; destrava via senha no app
  isSuperAdmin = false;
  votarUser = null;        // identidade da Votação (persiste na sessão)

  $('grupoScreen').style.display = 'none';
  $('loginScreen').style.display = 'none';
  $('appScreen').style.display = 'block';

  $('headerUserName').textContent = grupoAtual.nome;
  $('headerGrupoName').textContent = grupoAtual.nome;

  // Todas as abas visíveis (ADM aparece sempre; conteúdo é gated por senha)
  $('navAdm').style.display = 'flex';
  $('navFinanceiro').style.display = 'flex';

  updateAdmLockUI();

  logAsync('—', 'ENTRAR', 'Entrou no grupo');
  navigateTo('Home');
}

// Atualiza rótulo/estado visual do lock de ADM (badge no header)
function updateAdmLockUI() {
  var badge = $('admLockBadge');
  if (badge) {
    badge.textContent = isAdm ? '🔓 ADM' : '🔒 ADM';
    badge.style.color = isAdm ? 'var(--green)' : 'var(--text3)';
    badge.style.borderColor = isAdm ? 'var(--green)' : 'var(--border)';
  }
}

// ============================================================
// DESTRAVAR ADM (modal de senha)
// ============================================================
function openAdmUnlock() {
  if (isAdm) {
    // Já destravado: oferecer travar de novo
    if (confirm('ADM está destravado. Deseja travar novamente?')) {
      lockAdm();
    }
    return;
  }
  $('admUnlockError').style.display = 'none';
  $('admUnlockInput').value = '';
  $('admUnlockModal').style.display = 'flex';
  setTimeout(function() { $('admUnlockInput').focus(); }, 100);
}

function closeAdmUnlock() {
  $('admUnlockModal').style.display = 'none';
}

async function submitAdmUnlock() {
  var pw = $('admUnlockInput').value;
  if (!pw) { showAdmUnlockError('Digite a senha.'); return; }

  // Valida a senha contra qualquer ADM do grupo (senha por-grupo)
  var { data: ads } = await sb.from('admins').select('nome, senha, tipo').eq('grupo_id', grupoAtual.id);
  ads = ads || [];
  var match = ads.find(function(a) { return a.senha === pw; });

  if (!match) { showAdmUnlockError('Senha incorreta.'); return; }

  isAdm = true;
  isSuperAdmin = match.tipo === 'Super';
  currentUser = match.nome; // logs de ADM passam a ter nome do admin

  closeAdmUnlock();
  updateAdmLockUI();
  showToast('🔓 ADM destravado.');
  logAsync(currentUser, 'ADM_UNLOCK', 'Destravou ADM');

  // Recarrega a página atual para revelar recursos de ADM
  refreshCurrentPage();
}

function lockAdm() {
  isAdm = false;
  isSuperAdmin = false;
  // currentUser volta a ser a identidade da Votação (se houver)
  currentUser = votarUser || null;
  updateAdmLockUI();
  showToast('🔒 ADM travado.');
  refreshCurrentPage();
}

function showAdmUnlockError(m) {
  var e = $('admUnlockError');
  e.textContent = m;
  e.style.display = 'block';
}

// Descobre a página ativa e recarrega
function refreshCurrentPage() {
  var active = document.querySelector('.page.active');
  if (!active) { loadHome(); return; }
  var id = active.id.replace('page', '');
  if (id === 'Home') loadHome();
  else if (id === 'Votar') loadVotar();
  else if (id === 'Resultados') loadResultados();
  else if (id === 'Adm') loadAdm();
  else if (id === 'AoVivo') loadAoVivo();
  else if (id === 'Financeiro') loadFinanceiro();
}

function doLogout() {
  logAsync('—', 'SAIR', 'Saiu');
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  currentUser = null;
  votarUser = null;
  isAdm = false;
  isSuperAdmin = false;
  $('appScreen').style.display = 'none';
  showGrupoScreen();
}

function voltarParaGrupos() {
  $('loginScreen').style.display = 'none';
  showGrupoScreen();
}

// ============================================================
// NAVEGAÇÃO
// ============================================================
function navigateTo(page) {
  // Se for ADM e estiver travado, abre o modal de senha em vez de navegar
  if (page === 'Adm' && !isAdm) {
    openAdmUnlock();
    return;
  }

  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  $('page' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  var navBtn = $('nav' + page);
  if (navBtn) navBtn.classList.add('active');

  if (page === 'Home') loadHome();
  else if (page === 'Votar') loadVotar();
  else if (page === 'Resultados') loadResultados();
  else if (page === 'Adm') loadAdm();
  else if (page === 'AoVivo') loadAoVivo();
  else if (page === 'Financeiro') loadFinanceiro();
}
