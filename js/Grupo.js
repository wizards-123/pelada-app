// ============================================================
// grupo.js - Seleção e criação de grupo
// ============================================================

window.addEventListener('load', async function() {
  $('loadingOverlay').style.display = 'none';
  showGrupoScreen();
});

async function showGrupoScreen() {
  grupoAtual = null;
  currentUser = null;
  isAdm = false;
  isSuperAdmin = false;
  admNames = [];
  superAdminName = '';
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }

  $('grupoScreen').style.display = 'flex';
  $('loginScreen').style.display = 'none';
  $('appScreen').style.display = 'none';
  $('grupoError').style.display = 'none';
  $('grupoLoading').style.display = 'block';
  $('grupoList').innerHTML = '';
  $('grupoList').style.display = 'flex';
  $('grupoDivider').style.display = 'block';
  $('grupoSenhaSection').style.display = 'none';
  $('criarGrupoForm').style.display = 'none';

  var { data: g } = await sb.from('grupos').select('id, nome, criado_em').order('criado_em', { ascending: false });
  $('grupoLoading').style.display = 'none';

  if (!g || g.length === 0) {
    $('grupoList').innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada cadastrada.<br>Crie abaixo!</div>';
  } else {
    var h = '';
    g.forEach(function(x) {
      h += '<button class="grupo-card" onclick="selecionarGrupo(\'' + x.id + '\')">' +
        '<div class="grupo-card-nome">' + x.nome + '</div>' +
        '<div class="grupo-card-id">' + x.id + '</div></button>';
    });
    $('grupoList').innerHTML = h;
  }
}

var grupoSelecionadoId = null;

function selecionarGrupo(gid) {
  grupoSelecionadoId = gid;
  $('grupoError').style.display = 'none';
  $('grupoSenhaInput').value = '';
  $('grupoList').style.display = 'none';
  $('grupoDivider').style.display = 'none';
  $('criarGrupoForm').style.display = 'none';
  $('grupoSenhaSection').style.display = 'block';
  sb.from('grupos').select('id, nome').eq('id', gid).single().then(function(r) {
    if (r.data) $('grupoSenhaNome').textContent = r.data.nome;
  });
  setTimeout(function() { $('grupoSenhaInput').focus(); }, 100);
}

function voltarParaListaGrupos() {
  grupoSelecionadoId = null;
  $('grupoSenhaSection').style.display = 'none';
  $('grupoList').style.display = 'flex';
  $('grupoDivider').style.display = 'block';
  $('grupoError').style.display = 'none';
}

async function validarSenhaGrupo() {
  var s = $('grupoSenhaInput').value.trim();
  if (!s) { showGrupoError('Digite a senha.'); return; }

  var { data: g, error: e } = await sb.from('grupos').select('*').eq('id', grupoSelecionadoId).single();
  if (e || !g) { showGrupoError('Grupo não encontrado.'); return; }
  if (s !== g.senha_acesso) { showGrupoError('Senha incorreta.'); return; }

  grupoAtual = g;
  admName = g.admin_name;
  admPassword = g.admin_password;
  superAdminName = g.admin_name;

  var { data: ad } = await sb.from('admins').select('nome, tipo').eq('grupo_id', grupoAtual.id);
  if (ad && ad.length > 0) {
    admNames = ad.map(function(a) { return a.nome; });
    var se = ad.find(function(a) { return a.tipo === 'Super'; });
    if (se) superAdminName = se.nome;
  } else {
    admNames = [g.admin_name];
    superAdminName = g.admin_name;
  }

  $('grupoSenhaSection').style.display = 'none';
  initLogin();
}

function toggleCriarGrupo() {
  var f = $('criarGrupoForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function criarGrupo() {
  var nm = $('novoGrupoNome').value.trim();
  var id = $('novoGrupoId').value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  var sa2 = $('novoGrupoSenhaAcesso').value.trim();
  var ad = $('novoGrupoAdm').value.trim();
  var pw = $('novoGrupoSenha').value.trim();

  if (!nm || !id || !sa2 || !ad || !pw) { showGrupoError('Preencha todos.'); return; }
  if (id.length < 3 || id.length > 20) { showGrupoError('Código: 3 a 20 chars.'); return; }

  var ac = ad + ' (ADM)';
  var { error: e } = await sb.from('grupos').insert({ id: id, nome: nm, admin_name: ac, admin_password: pw, senha_acesso: sa2 });
  if (e) { showGrupoError(e.message.includes('duplicate') ? 'Código já existe.' : e.message); return; }

  await sb.from('jogadores').insert({ nome: ac, grupo_id: id });
  await sb.from('admins').insert({ grupo_id: id, nome: ac, senha: pw, tipo: 'Super' });

  showToast('Grupo criado!');
  $('novoGrupoNome').value = '';
  $('novoGrupoId').value = '';
  $('novoGrupoSenhaAcesso').value = '';
  $('novoGrupoAdm').value = '';
  $('novoGrupoSenha').value = '';
  $('criarGrupoForm').style.display = 'none';
  showGrupoScreen();
}

function showGrupoError(m) {
  var e = $('grupoError');
  e.textContent = m;
  e.style.display = 'block';
}
