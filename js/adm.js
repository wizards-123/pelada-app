// ============================================================
// adm.js - Painel do ADM (pelada, jogadores, logs, admins)
// ============================================================

function loadAdm() {
  if (!isAdm) return;
  $('admContent').innerHTML =
    '<div class="tabs" id="admTabs">' +
    '<button class="tab active" onclick="switchAdmTab(\'pelada\')">Pelada</button>' +
    '<button class="tab" onclick="switchAdmTab(\'jogadores\')">Jogadores</button>' +
    '<button class="tab" onclick="switchAdmTab(\'logs\')">Logs</button>' +
    (isSuperAdmin ? '<button class="tab" onclick="switchAdmTab(\'admins\')">Admins</button>' : '') +
    '</div>' +
    '<div id="admTabPelada"></div>' +
    '<div id="admTabJogadores" style="display:none;"></div>' +
    '<div id="admTabLogs" style="display:none;"></div>' +
    (isSuperAdmin ? '<div id="admTabAdmins" style="display:none;"></div>' : '');
  loadAdmPelada();
}

function switchAdmTab(t) {
  document.querySelectorAll('#admTabs .tab').forEach(function(tb) { tb.classList.remove('active'); });
  ['admTabPelada','admTabJogadores','admTabLogs'].forEach(function(id) { $(id).style.display = 'none'; });
  var ae = $('admTabAdmins'); if (ae) ae.style.display = 'none';

  if (t === 'pelada') { document.querySelectorAll('#admTabs .tab')[0].classList.add('active'); $('admTabPelada').style.display = 'block'; loadAdmPelada(); }
  if (t === 'jogadores') { document.querySelectorAll('#admTabs .tab')[1].classList.add('active'); $('admTabJogadores').style.display = 'block'; loadAdmJogadores(); }
  if (t === 'logs') { document.querySelectorAll('#admTabs .tab')[2].classList.add('active'); $('admTabLogs').style.display = 'block'; loadAdmLogs(); }
  if (t === 'admins' && isSuperAdmin) { document.querySelectorAll('#admTabs .tab')[3].classList.add('active'); $('admTabAdmins').style.display = 'block'; loadAdmAdmins(); }
}

// --- Pelada ---
async function loadAdmPelada() {
  showSkeleton('admTabPelada');
  var { data: p } = await sb.from('peladas').select('*').eq('grupo_id', grupoAtual.id).order('criado_em', { ascending: false });
  allPeladas = p || [];
  peladaAtual = allPeladas[0] || null;

  var po = '';
  allPeladas.forEach(function(p, i) {
    var df = p.data;
    try { df = new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}
    po += '<option value="' + p.id + '"' + (i === 0 ? ' selected' : '') + '>' + p.id + ' (' + df + ') — ' + p.status + '</option>';
  });

  $('admTabPelada').innerHTML =
    '<div class="card"><div class="card-title">📅 Nova Pelada</div><div class="input-row"><input type="date" id="novaPeladaData"><button class="btn btn-primary" onclick="criarNovaPelada()">Criar</button></div></div>' +
    (allPeladas.length > 0
      ? '<div class="card"><div class="card-title">📋 Gerenciar</div><select class="vote-select mb16" id="admPeladaSelect" onchange="onAdmPeladaSelectChange()">' + po + '</select><div id="admPeladaActions"></div></div>' +
        '<div class="card"><div class="card-title">👥 Presença</div><div id="admPresencaList"></div><button class="btn btn-primary mt12" onclick="salvarPresenca()">Salvar</button></div>'
      : '');

  if (allPeladas.length > 0) loadAdmPeladaDetails(allPeladas[0].id);
}

async function loadAdmPeladaDetails(pid) {
  var pel = allPeladas.find(function(p) { return p.id === pid; });
  if (!pel) return;

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

  // Presença
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

function onAdmPeladaSelectChange() { loadAdmPeladaDetails($('admPeladaSelect').value); }

async function criarNovaPelada() {
  var d = $('novaPeladaData').value;
  if (!d) { showToast('Data!', true); return; }
  var { data: nid } = await sb.rpc('next_pelada_id_grupo', { p_grupo_id: grupoAtual.id });
  var { error: e } = await sb.from('peladas').insert({ id: nid, data: d, status: 'Agendada', votacao_aberta: false, grupo_id: grupoAtual.id });
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
