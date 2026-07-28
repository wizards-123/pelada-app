// ============================================================
// adm.js - Painel do ADM (pelada, jogadores, logs, admins, grupo)
// ============================================================

function loadAdm() {
  if (!isAdm) return;
  $('admContent').innerHTML =
    '<div class="tabs" id="admTabs">' +
    '<button class="tab active" onclick="switchAdmTab(\'pelada\')">Pelada</button>' +
    '<button class="tab" onclick="switchAdmTab(\'jogadores\')">Jogadores</button>' +
    '<button class="tab" onclick="switchAdmTab(\'grupo\')">Grupo</button>' +
    '<button class="tab" onclick="switchAdmTab(\'logs\')">Logs</button>' +
    (isSuperAdmin ? '<button class="tab" onclick="switchAdmTab(\'admins\')">Admins</button>' : '') +
    '</div>' +
    '<div id="admTabPelada"></div>' +
    '<div id="admTabJogadores" style="display:none;"></div>' +
    '<div id="admTabGrupo" style="display:none;"></div>' +
    '<div id="admTabLogs" style="display:none;"></div>' +
    (isSuperAdmin ? '<div id="admTabAdmins" style="display:none;"></div>' : '');
  loadAdmPelada();
}

function switchAdmTab(t) {
  document.querySelectorAll('#admTabs .tab').forEach(function(tb) { tb.classList.remove('active'); });
  ['admTabPelada','admTabJogadores','admTabGrupo','admTabLogs'].forEach(function(id) {
    var e = $(id); if (e) e.style.display = 'none';
  });
  var ae = $('admTabAdmins'); if (ae) ae.style.display = 'none';

  var tabs = document.querySelectorAll('#admTabs .tab');
  var map = { pelada: 0, jogadores: 1, grupo: 2, logs: 3, admins: 4 };
  if (tabs[map[t]]) tabs[map[t]].classList.add('active');

  var tid = 'admTab' + t.charAt(0).toUpperCase() + t.slice(1);
  var te = $(tid); if (te) te.style.display = 'block';

  if (t === 'pelada') loadAdmPelada();
  else if (t === 'jogadores') loadAdmJogadores();
  else if (t === 'grupo') loadAdmGrupo();
  else if (t === 'logs') loadAdmLogs();
  else if (t === 'admins' && isSuperAdmin) loadAdmAdmins();
}

// --- Grupo (senha config) ---
async function loadAdmGrupo() {
  var el = $('admTabGrupo');
  showSkeleton('admTabGrupo');

  var { data: g } = await sb.from('grupos').select('*').eq('id', grupoAtual.id).single();
  if (g) grupoAtual = g;

  var temSenha = grupoAtual.tem_senha !== false;
  var senhaAtual = grupoAtual.senha_acesso || '';

  var h = '<div class="card"><div class="card-title">🔐 Senha da Pelada</div>';
  h += '<div style="font-size:13px;color:var(--text2);margin-bottom:16px;">Defina se os jogadores precisam digitar uma senha para acessar o grupo.</div>';

  h += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">';
  h += '<span style="font-size:14px;font-weight:500;">Exigir senha de acesso</span>';
  h += '<div class="toggle-wrap" onclick="toggleGrupoSenha()" id="grupoSenhaToggle" style="' +
    'width:48px;height:26px;border-radius:13px;cursor:pointer;transition:background .2s;position:relative;flex-shrink:0;' +
    'background:' + (temSenha ? 'var(--green)' : 'var(--bg3)') + ';border:1px solid ' + (temSenha ? 'var(--green)' : 'var(--border)') + ';">' +
    '<div style="width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:2px;transition:left .2s;' +
    'left:' + (temSenha ? '25px' : '3px') + ';box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div></div>';
  h += '</div>';

  h += '<div id="grupoSenhaCampo" style="' + (temSenha ? '' : 'display:none;') + '">';
  h += '<div class="vote-category"><label>Senha de acesso</label>';
  h += '<input type="text" class="vote-select" id="grupoSenhaValor" value="' + senhaAtual.replace(/"/g, '&quot;') + '" placeholder="Digite a senha...">';
  h += '</div>';
  h += '<button class="btn btn-primary" onclick="salvarGrupoSenha()">Salvar Senha</button>';
  h += '</div>';

  h += '</div>';

  h += '<div class="card"><div class="card-title">📋 Info do Grupo</div>';
  h += '<div class="status-row"><span class="status-label">Nome</span><span class="status-value">' + grupoAtual.nome + '</span></div>';
  h += '<div class="status-row"><span class="status-label">Código</span><span class="status-value">' + grupoAtual.id + '</span></div>';
  h += '<div class="status-row"><span class="status-label">Senha ativa</span><span class="status-value">' + (temSenha ? '✅ Sim' : '❌ Não') + '</span></div>';
  h += '</div>';

  el.innerHTML = h;
}

function toggleGrupoSenha() {
  var temSenha = grupoAtual.tem_senha !== false;
  var novoValor = !temSenha;

  sb.from('grupos').update({ tem_senha: novoValor }).eq('id', grupoAtual.id).then(function(res) {
    if (res.error) { showToast(res.error.message, true); return; }
    grupoAtual.tem_senha = novoValor;
    showToast(novoValor ? 'Senha ativada.' : 'Senha desativada.');
    logAsync(currentUser, 'GRUPO_SENHA', novoValor ? 'Ativou senha' : 'Desativou senha');
    loadAdmGrupo();
  });
}

async function salvarGrupoSenha() {
  var novaSenha = $('grupoSenhaValor').value.trim();
  if (!novaSenha) { showToast('Digite uma senha.', true); return; }

  var { error: e } = await sb.from('grupos').update({ senha_acesso: novaSenha }).eq('id', grupoAtual.id);
  if (e) { showToast(e.message, true); return; }

  grupoAtual.senha_acesso = novaSenha;
  showToast('Senha atualizada!');
  logAsync(currentUser, 'GRUPO_SENHA', 'Alterou senha');
}

// --- Pelada ---
async function loadAdmPelada() {
  showSkeleton('admTabPelada');
  // Buscar TODAS as peladas (incluindo inativas) para o ADM gerenciar
  var { data: p } = await sb.from('peladas').select('*').eq('grupo_id', grupoAtual.id).order('criado_em', { ascending: false });
  allPeladas = p || [];

  // A pelada ativa mais recente
  var ativas = allPeladas.filter(function(x) { return x.ativa !== false; });
  peladaAtual = ativas[0] || allPeladas[0] || null;

  // Select mostra apenas ativas para gerenciar
  var po = '';
  ativas.forEach(function(p, i) {
    po += '<option value="' + p.id + '"' + (i === 0 ? ' selected' : '') + '>' + peladaLabelComData(p) + ' — ' + p.status + '</option>';
  });

  var inativas = allPeladas.filter(function(x) { return x.ativa === false; });

  var h = '';
  h += '<div class="card"><div class="card-title">📅 Nova Pelada</div>';
  h += '<div class="input-row mb16"><input type="date" id="novaPeladaData"><button class="btn btn-primary" onclick="criarNovaPelada()">Criar</button></div>';
  h += '</div>';

  if (ativas.length > 0) {
    h += '<div class="card"><div class="card-title">📋 Gerenciar</div>';
    h += '<select class="vote-select mb16" id="admPeladaSelect" onchange="onAdmPeladaSelectChange()">' + po + '</select>';
    h += '<div id="admPeladaRename"></div>';
    h += '<div id="admPeladaRanking"></div>';
    h += '<div id="admPeladaActions"></div></div>';
    h += '<div class="card"><div class="card-title">👥 Presença</div><div id="admPresencaList"></div><button class="btn btn-primary mt12" onclick="salvarPresenca()">Salvar</button></div>';
  }

  // Seção de peladas inativas (arquivadas)
  h += renderPeladasArquivadas(ativas, inativas);

  $('admTabPelada').innerHTML = h;

  if (ativas.length > 0) loadAdmPeladaDetails(ativas[0].id);
}

function renderPeladasArquivadas(ativas, inativas) {
  var h = '<div class="card"><div class="card-title">📦 Gerenciar Visibilidade</div>';
  h += '<div style="font-size:12px;color:var(--text2);margin-bottom:14px;">Peladas desativadas ficam ocultas no app para todos, mas os dados permanecem no banco.</div>';

  if (allPeladas.length === 0) {
    h += '<div class="text-muted">Nenhuma pelada.</div></div>';
    return h;
  }

  // Listar todas as peladas com toggle ativa/inativa
  allPeladas.forEach(function(p) {
    var isAtiva = p.ativa !== false;
    var df = p.data;
    try { df = new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}
    var rkTag = (p.ranking_id === null || p.ranking_id === undefined) ? '' : ' · R' + p.ranking_id;

    h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(36,48,73,0.3);">';
    h += '<div style="flex:1;min-width:0;">';
    h += '<div style="font-size:13px;font-weight:500;' + (isAtiva ? 'color:var(--text);' : 'color:var(--text3);') + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + peladaLabel(p) + '</div>';
    h += '<div style="font-size:11px;color:var(--text3);">' + df + ' · ' + p.status + rkTag + '</div>';
    h += '</div>';

    // Toggle
    h += '<div onclick="togglePeladaAtiva(\'' + p.id + '\',' + (isAtiva ? 'false' : 'true') + ')" style="' +
      'width:44px;height:24px;border-radius:12px;cursor:pointer;transition:background .2s;position:relative;flex-shrink:0;margin-left:12px;' +
      'background:' + (isAtiva ? 'var(--green)' : 'var(--bg3)') + ';border:1px solid ' + (isAtiva ? 'var(--green)' : 'var(--border)') + ';">' +
      '<div style="width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:2px;transition:left .2s;' +
      'left:' + (isAtiva ? '22px' : '3px') + ';box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div></div>';
    h += '</div>';
  });

  h += '</div>';
  return h;
}

async function togglePeladaAtiva(peladaId, novoValor) {
  var { error: e } = await sb.from('peladas').update({ ativa: novoValor }).eq('id', peladaId).eq('grupo_id', grupoAtual.id);
  if (e) { showToast(e.message, true); return; }

  var label = novoValor ? 'ativada' : 'desativada';
  showToast('Pelada ' + label + '.');
  logAsync(currentUser, 'TOGGLE_PELADA', peladaId + ' → ' + label);

  // Resetar filtro do ranking para forçar recálculo
  resultPeladasSelecionadas = [];

  loadAdmPelada();
}

async function loadAdmPeladaDetails(pid) {
  var pel = allPeladas.find(function(p) { return p.id === pid; });
  if (!pel) return;

  var re = $('admPeladaRename');
  if (re) {
    re.innerHTML =
      '<div class="input-row mb16">' +
      '<input type="text" id="renamePeladaInput" placeholder="Nome da pelada" value="' + (pel.nome || pel.id).replace(/"/g, '&quot;') + '">' +
      '<button class="btn btn-secondary" style="width:auto;padding:10px 16px;font-size:13px;" onclick="renamePelada(\'' + pid + '\')">Renomear</button>' +
      '</div>';
  }

  // --- Seletor de ranking ---
  renderPeladaRankingControl(pid, pel);

  var { data: vt } = await sb.from('votos').select('votante').eq('pelada_id', pid).eq('grupo_id', grupoAtual.id);
  var uq = {};
  (vt || []).forEach(function(v) { uq[v.votante] = true; });
  var qjv = Object.keys(uq);

  var ae = $('admPeladaActions');
  var h = '<div class="flex-between mb16"><span class="text-muted">Status: ' + pel.status + '</span>';
  if (!pel.votacao_aberta && pel.status !== 'Encerrada')
    h += '<button class="btn btn-primary" style="width:auto;padding:10px 20px;font-size:13px;" onclick="abrirVotacao(\'' + pid + '\')">Abrir Votação</button>';
  else if (pel.votacao_aberta)
    h += '<button class="btn btn-danger" style="width:auto;padding:10px 20px;font-size:13px;" onclick="fecharVotacao(\'' + pid + '\')">Fechar Votação</button>';
  h += '</div>';
  if (qjv.length > 0) h += '<div class="text-muted" style="font-size:12px;">Votaram (' + qjv.length + '): ' + sa(qjv).map(dn).join(', ') + '</div>';
  if (ae) ae.innerHTML = h;

  var { data: pr } = await sb.from('presenca').select('jogador').eq('pelada_id', pid).eq('grupo_id', grupoAtual.id);
  var pl = (pr || []).map(function(r) { return r.jogador; });
  var { data: jg } = await sb.from('jogadores').select('nome').eq('grupo_id', grupoAtual.id).order('nome');
  var jl = (jg || []).map(function(r) { return r.nome; });

  var le = $('admPresencaList');
  if (le) {
    var jo = sa(jl), lh = '<div class="checkbox-list">';
    jo.forEach(function(n, i) {
      lh += '<div class="checkbox-item"><input type="checkbox" id="pres_' + i + '" value="' + n + '"' + (pl.indexOf(n) > -1 ? ' checked' : '') + '><label for="pres_' + i + '">' + dn(n) + '</label></div>';
    });
    lh += '</div>';
    le.innerHTML = lh;
  }
}

// ============================================================
// SELETOR DE RANKING POR PELADA
// Grava peladas.ranking_id. "Sem ranking" grava NULL.
// Rankings existentes viram botões; campo numérico cria novos.
// ============================================================
function renderPeladaRankingControl(pid, pel) {
  var el = $('admPeladaRanking');
  if (!el) return;

  // Coleta os rankings já existentes no grupo
  var set = {};
  allPeladas.forEach(function(p) {
    if (p.ranking_id !== null && p.ranking_id !== undefined) set[p.ranking_id] = true;
  });
  var nums = Object.keys(set).map(function(k) { return Number(k); }).sort(function(a, b) { return a - b; });

  var atual = (pel.ranking_id === null || pel.ranking_id === undefined) ? null : Number(pel.ranking_id);

  var h = '<div style="margin-bottom:16px;">';
  h += '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">🏆 Ranking desta pelada</div>';
  h += '<div class="ranking-macro-row">';
  h += '<button class="ranking-macro-btn' + (atual === null ? ' rmf-on' : '') + '" onclick="setPeladaRanking(\'' + pid + '\',null)">Sem ranking</button>';
  nums.forEach(function(n) {
    h += '<button class="ranking-macro-btn' + (atual === n ? ' rmf-on' : '') + '" onclick="setPeladaRanking(\'' + pid + '\',' + n + ')">R' + n + '</button>';
  });
  h += '</div>';
  h += '<div class="input-row mt12">';
  h += '<input type="number" min="1" id="novoRankingNum" placeholder="Novo ranking (nº)">';
  h += '<button class="btn btn-secondary" style="width:auto;padding:10px 16px;font-size:13px;" onclick="setPeladaRankingNovo(\'' + pid + '\')">Aplicar</button>';
  h += '</div>';
  h += '</div>';

  el.innerHTML = h;
}

async function setPeladaRanking(pid, rankingId) {
  var valor = (rankingId === null) ? null : Number(rankingId);
  var { error: e } = await sb.from('peladas').update({ ranking_id: valor }).eq('id', pid).eq('grupo_id', grupoAtual.id);
  if (e) { showToast(e.message, true); return; }

  showToast(valor === null ? 'Removida do ranking.' : 'Alocada no Ranking ' + valor + '.');
  logAsync(currentUser, 'PELADA_RANKING', pid + ' → ' + (valor === null ? 'sem ranking' : 'R' + valor));

  // Atualiza estado local
  var found = allPeladas.find(function(p) { return p.id === pid; });
  if (found) found.ranking_id = valor;
  if (peladaAtual && peladaAtual.id === pid) peladaAtual.ranking_id = valor;

  // Força o ranking a recarregar da próxima vez
  resultPeladasSelecionadas = [];

  // Redesenha o controle e a lista de visibilidade (que mostra a tag R#)
  renderPeladaRankingControl(pid, found || peladaAtual);
  loadAdmPelada();
}

function setPeladaRankingNovo(pid) {
  var input = $('novoRankingNum');
  if (!input) return;
  var v = parseInt(input.value, 10);
  if (isNaN(v) || v < 1) { showToast('Digite um número válido.', true); return; }
  setPeladaRanking(pid, v);
}

function onAdmPeladaSelectChange() { loadAdmPeladaDetails($('admPeladaSelect').value); }

async function renamePelada(pid) {
  var input = $('renamePeladaInput');
  if (!input) return;
  var novoNome = input.value.trim();
  if (!novoNome) { showToast('Digite um nome.', true); return; }

  var { error: e } = await sb.from('peladas').update({ nome: novoNome }).eq('id', pid).eq('grupo_id', grupoAtual.id);
  if (e) { showToast(e.message, true); return; }

  showToast('Nome atualizado!');
  logAsync(currentUser, 'RENOMEAR_PELADA', pid + ' → ' + novoNome);

  var found = allPeladas.find(function(p) { return p.id === pid; });
  if (found) found.nome = novoNome;
  if (peladaAtual && peladaAtual.id === pid) peladaAtual.nome = novoNome;

  var sel = $('admPeladaSelect');
  if (sel) {
    var opt = sel.querySelector('option[value="' + pid + '"]');
    if (opt) {
      var pel = found || peladaAtual;
      opt.textContent = peladaLabelComData(pel) + ' — ' + pel.status;
    }
  }
}

async function criarNovaPelada() {
  var d = $('novaPeladaData').value;
  if (!d) { showToast('Data!', true); return; }
  var { data: nid } = await sb.rpc('next_pelada_id_grupo', { p_grupo_id: grupoAtual.id });
  var { error: e } = await sb.from('peladas').insert({ id: nid, data: d, status: 'Agendada', votacao_aberta: false, grupo_id: grupoAtual.id, nome: nid, ativa: true });
  if (e) { showToast(e.message, true); return; }
  showToast('Criada: ' + nid);
  logAsync(currentUser, 'CRIAR_PELADA', nid);
  loadAdmPelada();
}

async function abrirVotacao(pid) {
  await sb.from('peladas').update({ status: 'Realizada', votacao_aberta: true }).eq('id', pid).eq('grupo_id', grupoAtual.id);
  showToast('Aberta!'); logAsync(currentUser, 'ABRIR_VOTACAO', pid); loadAdmPelada();
}

async function fecharVotacao(pid) {
  await sb.from('peladas').update({ status: 'Encerrada', votacao_aberta: false }).eq('id', pid).eq('grupo_id', grupoAtual.id);
  showToast('Fechada!'); logAsync(currentUser, 'FECHAR_VOTACAO', pid); loadAdmPelada();
}

async function salvarPresenca() {
  var pid = $('admPeladaSelect').value;
  var cb = document.querySelectorAll('#admPresencaList input[type="checkbox"]');
  var pr = [];
  cb.forEach(function(c) { if (c.checked) pr.push(c.value); });
  await sb.from('presenca').delete().eq('pelada_id', pid).eq('grupo_id', grupoAtual.id);
  if (pr.length > 0) await sb.from('presenca').insert(pr.map(function(j) { return { pelada_id: pid, jogador: j, grupo_id: grupoAtual.id }; }));
  showToast(pr.length + ' marcados.');
  logAsync(currentUser, 'PRESENCA', pid);
}

// --- Jogadores ---
async function loadAdmJogadores() {
  showSkeleton('admTabJogadores');
  var { data: jg } = await sb.from('jogadores').select('nome').eq('grupo_id', grupoAtual.id).order('nome');
  var jl = (jg || []).map(function(r) { return r.nome; });
  cachedJogadores = jl;
  var jo = sa(jl);

  var h = '<div class="card"><div class="card-title">➕ Jogador</div><div class="input-row"><input type="text" id="novoJogadorNome" placeholder="Nome"><button class="btn btn-primary" onclick="adicionarJogador()">Add</button></div></div>';
  h += '<div class="card"><div class="card-title">📋 Jogadores (' + jl.length + ')</div>';
  jo.forEach(function(n) {
    var isA = admNames.indexOf(n) > -1;
    h += '<div class="flex-between" style="padding:8px 0;border-bottom:1px solid rgba(36,48,73,0.3);"><span style="font-size:14px;">' + dn(n) + (isA ? ' <span class="badge badge-purple" style="font-size:9px;">ADM</span>' : '') + '</span>';
    if (!isA) h += '<button class="btn-logout" style="color:var(--red);border-color:var(--red);font-size:11px;" onclick="removerJogador(\'' + n.replace(/'/g, "\\'") + '\')">✕</button>';
    h += '</div>';
  });
  h += '</div>';
  $('admTabJogadores').innerHTML = h;
}

async function adicionarJogador() {
  var n = $('novoJogadorNome').value.trim();
  if (!n) { showToast('Nome!', true); return; }
  var { error: e } = await sb.from('jogadores').insert({ nome: n, grupo_id: grupoAtual.id });
  if (e) { showToast(e.message.includes('duplicate') ? 'Já existe.' : e.message, true); return; }
  showToast('OK.');
  logAsync(currentUser, 'ADD_JOGADOR', n);
  loadAdmJogadores();
}

async function removerJogador(n) {
  if (admNames.indexOf(n) > -1) { showToast('Remova ADM primeiro.', true); return; }
  if (!confirm('Remover ' + dn(n) + '?')) return;
  await sb.from('jogadores').delete().eq('nome', n).eq('grupo_id', grupoAtual.id);
  showToast('Removido.');
  logAsync(currentUser, 'REMOVER_JOGADOR', n);
  loadAdmJogadores();
}

// --- Logs ---
async function loadAdmLogs() {
  showSkeleton('admTabLogs');
  var { data: l } = await sb.from('logs').select('*').eq('grupo_id', grupoAtual.id).order('timestamp', { ascending: false }).limit(100);
  if (!l || l.length === 0) { $('admTabLogs').innerHTML = '<div class="empty-state"><span class="emoji">📋</span>Vazio.</div>'; return; }
  var h = '<div class="card"><div class="card-title">📋 Logs</div><div style="overflow-x:auto;"><table class="log-table"><tr><th>Usuário</th><th>Ação</th><th>Detalhes</th><th>Hora</th></tr>';
  l.forEach(function(x) {
    var ts = x.timestamp ? new Date(x.timestamp).toLocaleString('pt-BR') : '';
    h += '<tr><td>' + dn(x.usuario) + '</td><td>' + x.acao + '</td><td>' + x.detalhes + '</td><td class="log-time">' + ts + '</td></tr>';
  });
  h += '</table></div></div>';
  $('admTabLogs').innerHTML = h;
}

// --- Admins (Super only) ---
async function loadAdmAdmins() {
  if (!isSuperAdmin) return;
  showSkeleton('admTabAdmins');

  var { data: al } = await sb.from('admins').select('nome, tipo').eq('grupo_id', grupoAtual.id).order('tipo', { ascending: false });
  al = al || [];
  var { data: jg } = await sb.from('jogadores').select('nome').eq('grupo_id', grupoAtual.id).order('nome');
  var jl = (jg || []).map(function(r) { return r.nome; });
  var as2 = {};
  al.forEach(function(a) { as2[a.nome] = true; });

  var h = '<div class="card"><div class="card-title">👑 Add ADM</div><div style="margin-bottom:8px;"><select class="vote-select" id="novoAdminNome"><option value="">Selecione...</option>';
  sa(jl).forEach(function(n) { if (!as2[n]) h += '<option value="' + n + '">' + dn(n) + '</option>'; });
  h += '</select></div><div class="input-row"><input type="text" id="novoAdminSenha" placeholder="Senha"><button class="btn btn-primary" onclick="addAdmin()">Add</button></div></div>';

  h += '<div class="card"><div class="card-title">🔐 ADMs (' + al.length + ')</div>';
  al.forEach(function(a) {
    var tl = a.tipo === 'Super' ? '👑 Super' : '🛡️ Admin';
    var tc = a.tipo === 'Super' ? 'var(--goldGlow)' : 'var(--purpleGlow)';
    var tf = a.tipo === 'Super' ? 'var(--gold)' : 'var(--purple)';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(36,48,73,0.3);">' +
      '<div style="flex:1;"><div style="font-size:14px;font-weight:500;">' + dn(a.nome) + '</div>' +
      '<div style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;margin-top:2px;background:' + tc + ';color:' + tf + ';">' + tl + '</div></div>' +
      '<div style="display:flex;gap:6px;">' +
      '<button style="padding:6px 10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid var(--blue);background:transparent;color:var(--blue);" onclick="editarSenhaAdmin(\'' + a.nome.replace(/'/g, "\\'") + '\')">✏️</button>';
    if (a.tipo !== 'Super')
      h += '<button style="padding:6px 10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid var(--red);background:transparent;color:var(--red);" onclick="removeAdmin(\'' + a.nome.replace(/'/g, "\\'") + '\')">✕</button>';
    h += '</div></div>';
  });
  h += '</div>';
  $('admTabAdmins').innerHTML = h;
}

async function addAdmin() {
  var n = $('novoAdminNome').value, s = $('novoAdminSenha').value.trim();
  if (!n) { showToast('Selecione!', true); return; }
  if (!s) { showToast('Senha!', true); return; }
  var { error: e } = await sb.from('admins').insert({ grupo_id: grupoAtual.id, nome: n, senha: s, tipo: 'Admin' });
  if (e) { showToast(e.message.includes('duplicate') ? 'Já é ADM.' : e.message, true); return; }
  admNames.push(n);
  showToast(dn(n) + ' é ADM.');
  logAsync(currentUser, 'ADD_ADMIN', n);
  loadAdmAdmins();
}

async function removeAdmin(n) {
  if (!confirm('Remover ' + dn(n) + ' como ADM?')) return;
  await sb.from('admins').delete().eq('grupo_id', grupoAtual.id).eq('nome', n);
  var i = admNames.indexOf(n);
  if (i > -1) admNames.splice(i, 1);
  showToast('Removido.');
  logAsync(currentUser, 'REMOVE_ADMIN', n);
  loadAdmAdmins();
}

async function editarSenhaAdmin(n) {
  var ns = prompt('Nova senha para ' + dn(n) + ':');
  if (!ns || !ns.trim()) return;
  await sb.from('admins').update({ senha: ns.trim() }).eq('grupo_id', grupoAtual.id).eq('nome', n);
  showToast('Atualizada.');
  logAsync(currentUser, 'ALTERAR_SENHA', n);
}
