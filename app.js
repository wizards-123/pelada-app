// ============================================================
// PELADA APP - Supabase Frontend (app.js)
// ============================================================

const SUPABASE_URL = 'https://ajtguipxovhsnxqxgheb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqdGd1aXB4b3Zoc254cXhnaGViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjUwMjcsImV4cCI6MjA5MTE0MTAyN30.PHCHmSwG2K4I2QzsJ4Jc_1qq_Ya9ryNtvFmFocH9ZCA';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

var currentUser = null, isAdm = false, peladaAtual = null, allPeladas = [], admName = 'Lior (ADM)', admPassword = '123';
var cachedJogadores = [], cachedPresentes = [];
var realtimeChannel = null;

// --- Helpers ---
function dn(n) { return n === admName ? admName.replace(' (ADM)', '') : n; }
function sa(a) { return a.slice().sort(function(x,y){ return x.localeCompare(y); }); }
function $(id) { return document.getElementById(id); }
function showSkeleton(id) { var e=$(id); if(e) e.innerHTML='<div class="skeleton"></div>'; }
function showToast(m, err) { var e=$('toast'); e.textContent=m; e.className='toast'+(err?' error':''); setTimeout(function(){e.classList.add('show');},10); setTimeout(function(){e.classList.remove('show');},3000); }

// Log async (fire and forget)
function logAsync(u,a,d) { sb.from('logs').insert({usuario:u,acao:a,detalhes:d||''}).then(); }

// --- Theme ---
function applyTheme(t){if(t==='light')document.documentElement.classList.add('light');else document.documentElement.classList.remove('light');var i=t==='light'?'☀️':'🌙';var l=$('loginThemeBtn'),a=$('appThemeBtn');if(l)l.textContent=i;if(a)a.textContent=i;}
function toggleTheme(){var l=document.documentElement.classList.contains('light');var t=l?'dark':'light';try{localStorage.setItem('pelada-theme',t);}catch(e){}applyTheme(t);}
(function(){try{applyTheme(localStorage.getItem('pelada-theme')||'dark');}catch(e){applyTheme('dark');}})();

// ============================================================
// INIT
// ============================================================
window.addEventListener('load', async function() {
  // Load config
  var { data: cfg } = await sb.from('config').select('*');
  if (cfg) {
    cfg.forEach(function(r) {
      if (r.chave === 'adm_name') admName = r.valor;
      if (r.chave === 'adm_password') admPassword = r.valor;
    });
  }

  // Load jogadores
  var { data: jogs } = await sb.from('jogadores').select('nome').order('nome');
  cachedJogadores = jogs ? jogs.map(function(r){ return r.nome; }) : [];

  // Load peladas (most recent first)
  var { data: pels } = await sb.from('peladas').select('*').order('criado_em', { ascending: false });
  allPeladas = pels || [];
  peladaAtual = allPeladas.length > 0 ? allPeladas[0] : null;

  // Populate login dropdown
  var sel = $('loginSelect');
  sel.innerHTML = '<option value="">Selecione seu nome...</option>';
  var sorted = sa(cachedJogadores);
  sorted.forEach(function(n) {
    var o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o);
  });

  $('loadingOverlay').style.display = 'none';
  $('loginScreen').style.display = 'flex';
});

// --- Login ---
function onLoginSelectChange() {
  var v = $('loginSelect').value;
  $('passwordGroup').style.display = (v === admName) ? 'block' : 'none';
  $('loginError').style.display = 'none';
}

function doLogin() {
  var v = $('loginSelect').value;
  if (!v) { showLoginError('Selecione seu nome.'); return; }
  if (v === admName) {
    if ($('admPassword').value !== admPassword) { showLoginError('Senha incorreta.'); return; }
    finalizeLogin(v, true);
  } else {
    finalizeLogin(v, false);
  }
}

async function finalizeLogin(name, adm) {
  currentUser = name; isAdm = adm;
  $('headerUserName').textContent = dn(name);
  $('loginScreen').style.display = 'none';
  $('appScreen').style.display = 'block';
  $('navAdm').style.display = adm ? 'flex' : 'none';
  logAsync(name, 'LOGIN', 'Entrou no app');
  loadHome();
}

function doLogout() {
  if (currentUser) logAsync(currentUser, 'LOGOUT', 'Saiu do app');
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  currentUser = null; isAdm = false;
  $('appScreen').style.display = 'none';
  $('loginScreen').style.display = 'flex';
  $('admPassword').value = '';
  $('loginSelect').value = '';
  $('passwordGroup').style.display = 'none';
}

function showLoginError(m) { var e=$('loginError'); e.textContent=m; e.style.display='block'; }

// --- Navigation ---
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  $('page'+page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
  $('nav'+page).classList.add('active');
  if(page==='Home') loadHome();
  else if(page==='Votar') loadVotar();
  else if(page==='Resultados') loadResultados();
  else if(page==='Adm') loadAdm();
  else if(page==='AoVivo') loadAoVivo();
}

// ============================================================
// HOME
// ============================================================
async function loadHome() {
  showSkeleton('homeContent');
  // Refresh peladas
  var { data: pels } = await sb.from('peladas').select('*').order('criado_em', { ascending: false });
  allPeladas = pels || [];
  peladaAtual = allPeladas.length > 0 ? allPeladas[0] : null;

  if (!peladaAtual) { $('homeContent').innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada agendada ainda.</div>'; return; }

  var { data: pres } = await sb.from('presenca').select('jogador').eq('pelada_id', peladaAtual.id);
  cachedPresentes = pres ? pres.map(function(r){ return r.jogador; }) : [];

  var { data: vcheck } = await sb.from('votos').select('id').eq('pelada_id', peladaAtual.id).eq('votante', currentUser).limit(1);
  var jaVotou = vcheck && vcheck.length > 0;

  renderHome(cachedPresentes, jaVotou);
}

function renderHome(presentes, jaVotou) {
  var el = $('homeContent');
  var p = peladaAtual;
  var sb2 = p.votacao_aberta ? '<span class="badge badge-green">Votação Aberta</span>' :
    p.status === 'Encerrada' ? '<span class="badge badge-red">Encerrada</span>' :
    p.status === 'Realizada' ? '<span class="badge badge-blue">Realizada</span>' :
    '<span class="badge badge-gold">Agendada</span>';

  var po = sa(presentes), ph = '';
  if (po.length > 0) {
    ph = '<div class="mt12" style="display:flex;flex-wrap:wrap;gap:6px;">';
    po.forEach(function(n){ ph += '<span class="badge badge-blue">' + dn(n) + '</span>'; });
    ph += '</div>';
  } else ph = '<div class="text-muted mt8">Nenhum jogador confirmado ainda.</div>';

  var vs = '';
  if (p.votacao_aberta) {
    vs = jaVotou
      ? '<div class="voted-indicator mt12">✅ Você já votou nesta pelada!</div><div style="margin-top:8px;"><button class="btn btn-secondary" onclick="navigateTo(\'Votar\')">✏️ Alterar votos</button></div>'
      : '<div style="margin-top:12px;"><button class="btn btn-primary" onclick="navigateTo(\'Votar\')">🗳️ Votar agora</button></div>';
  }

  var dataFormatada = p.data;
  try { var d = new Date(p.data + 'T12:00:00'); dataFormatada = d.toLocaleDateString('pt-BR'); } catch(e) {}

  el.innerHTML = '<div class="card status-card' + (p.status === 'Encerrada' ? ' closed' : '') + '">' +
    '<div class="flex-between mb16"><div class="card-title" style="margin-bottom:0;">Pelada da Semana</div>' + sb2 + '</div>' +
    '<div class="status-row"><span class="status-label">ID</span><span class="status-value">' + p.id + '</span></div>' +
    '<div class="status-row"><span class="status-label">Data</span><span class="status-value">' + dataFormatada + '</span></div>' +
    '<div class="status-row"><span class="status-label">Jogadores</span><span class="status-value">' + presentes.length + '</span></div>' +
    '<div style="margin-top:12px;"><span class="status-label">Convocados:</span>' + ph + '</div>' + vs + '</div>';
}

// ============================================================
// VOTAÇÃO
// ============================================================
async function loadVotar() {
  var el = $('votarContent');
  if (!peladaAtual) { el.innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada disponível.</div>'; return; }
  if (!peladaAtual.votacao_aberta) { el.innerHTML = '<div class="empty-state"><span class="emoji">🔒</span>A votação ainda não está aberta para esta pelada.</div>'; return; }

  showSkeleton('votarContent');
  var { data: pres } = await sb.from('presenca').select('jogador').eq('pelada_id', peladaAtual.id);
  var presentes = pres ? pres.map(function(r){ return r.jogador; }) : [];

  var { data: oldVotes } = await sb.from('votos').select('*').eq('pelada_id', peladaAtual.id).eq('votante', currentUser);
  var votosAnteriores = null;
  if (oldVotes && oldVotes.length > 0) {
    votosAnteriores = { goleiro: '', mvp: '', decepcao: '', revelacao: '', selecao: [] };
    oldVotes.forEach(function(v) {
      if (v.premio === 'Goleiro') votosAnteriores.goleiro = v.votado;
      else if (v.premio === 'MVP') votosAnteriores.mvp = v.votado;
      else if (v.premio === 'Decepcao') votosAnteriores.decepcao = v.votado;
      else if (v.premio === 'Revelacao') votosAnteriores.revelacao = v.votado;
      else if (v.premio === 'Selecao') votosAnteriores.selecao.push(v.votado);
    });
  }
  renderVoteForm(presentes, votosAnteriores);
}

var selecaoSelecionados = [];
function renderVoteForm(presentes, va) {
  selecaoSelecionados = [];
  var isE = va !== null, el = $('votarContent'), po = sa(presentes);
  function bO(sv) { var o = '<option value="">Selecione...</option>'; po.forEach(function(n) { o += '<option value="' + n + '"' + (n === sv ? ' selected' : '') + '>' + dn(n) + '</option>'; }); return o; }
  var selA = isE ? va.selecao : []; selecaoSelecionados = selA.slice();
  var ch = ''; po.forEach(function(n) { var iS = selA.indexOf(n) > -1; var cc = 'chip' + (iS ? ' selected' : '') + (selecaoSelecionados.length >= 4 && !iS ? ' disabled' : '');
    ch += '<div class="' + cc + '" data-name="' + n + '" onclick="toggleSelecao(this)">' + dn(n) + '</div>'; });
  var eb = isE ? '<div class="voted-indicator" style="background:var(--blueGlow);border-color:rgba(59,130,246,0.3);color:var(--blue);">✏️ Você já votou. Altere seus votos abaixo e reenvie.</div>' : '';
  var dataFormatada = peladaAtual.data; try { dataFormatada = new Date(peladaAtual.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e){}
  el.innerHTML = eb + '<div class="section-desc">Pelada: ' + peladaAtual.id + ' (' + dataFormatada + ')</div>' +
    '<div class="vote-category"><label><span class="emoji">🧤</span>Goleiro da Rodada</label><select class="vote-select" id="voteGoleiro">' + bO(isE ? va.goleiro : '') + '</select></div>' +
    '<div class="vote-category"><label><span class="emoji">⭐</span>MVP da Rodada</label><select class="vote-select" id="voteMvp">' + bO(isE ? va.mvp : '') + '</select></div>' +
    '<div class="vote-category"><label><span class="emoji">😞</span>Decepção da Rodada</label><select class="vote-select" id="voteDecepcao">' + bO(isE ? va.decepcao : '') + '</select></div>' +
    '<div class="vote-category"><label><span class="emoji">🌟</span>Revelação da Rodada</label><select class="vote-select" id="voteRevelacao">' + bO(isE ? va.revelacao : '') + '</select></div>' +
    '<div class="vote-category"><label><span class="emoji">🏅</span>Seleção da Rodada (escolha exatamente 4 para a linha)</label><div class="selecao-container" id="selecaoContainer">' + ch + '</div><div class="selecao-counter mt8">Selecionados: <span id="selecaoCount">' + selecaoSelecionados.length + '</span>/4</div></div>' +
    '<button class="btn btn-primary mt16" onclick="submitVotos()">' + (isE ? 'Atualizar Votos' : 'Enviar Votos') + '</button>';
}

function toggleSelecao(c) {
  var n = c.getAttribute('data-name'), x = selecaoSelecionados.indexOf(n);
  if (x > -1) { selecaoSelecionados.splice(x, 1); c.classList.remove('selected'); }
  else { if (selecaoSelecionados.length >= 4) return; selecaoSelecionados.push(n); c.classList.add('selected'); }
  $('selecaoCount').textContent = selecaoSelecionados.length;
  document.querySelectorAll('#selecaoContainer .chip').forEach(function(ch) {
    if (selecaoSelecionados.length >= 4 && !ch.classList.contains('selected')) ch.classList.add('disabled');
    else ch.classList.remove('disabled');
  });
}

async function submitVotos() {
  var g = $('voteGoleiro').value, m = $('voteMvp').value, d = $('voteDecepcao').value, r = $('voteRevelacao').value;
  if (!g || !m || !d || !r) { showToast('Preencha todas as categorias!', true); return; }
  if (selecaoSelecionados.length !== 4) { showToast('Selecione exatamente 4 jogadores para a Seleção!', true); return; }

  // Delete old votes
  await sb.from('votos').delete().eq('pelada_id', peladaAtual.id).eq('votante', currentUser);

  // Insert new
  var rows = [
    { pelada_id: peladaAtual.id, votante: currentUser, premio: 'Goleiro', votado: g },
    { pelada_id: peladaAtual.id, votante: currentUser, premio: 'MVP', votado: m },
    { pelada_id: peladaAtual.id, votante: currentUser, premio: 'Decepcao', votado: d },
    { pelada_id: peladaAtual.id, votante: currentUser, premio: 'Revelacao', votado: r }
  ];
  selecaoSelecionados.forEach(function(s) { rows.push({ pelada_id: peladaAtual.id, votante: currentUser, premio: 'Selecao', votado: s }); });

  var { error } = await sb.from('votos').insert(rows);
  if (error) { showToast('Erro ao votar: ' + error.message, true); return; }
  showToast('Votos registrados com sucesso! ⚽');
  logAsync(currentUser, 'VOTO', 'Votou na pelada ' + peladaAtual.id);
  loadVotar();
}

// ============================================================
// RESULTADOS
// ============================================================
function switchResultTab(t) {
  document.querySelectorAll('#resultTabs .tab').forEach(function(tb, i) { tb.classList.remove('active'); });
  ['resultadosSemana','resultadosGeral','resultadosArtilharia','resultadosVitorias'].forEach(function(id){ $(id).style.display='none'; });
  if(t==='semana'){document.querySelectorAll('#resultTabs .tab')[0].classList.add('active');$('resultadosSemana').style.display='block';}
  else if(t==='geral'){document.querySelectorAll('#resultTabs .tab')[1].classList.add('active');$('resultadosGeral').style.display='block';}
  else if(t==='artilharia'){document.querySelectorAll('#resultTabs .tab')[2].classList.add('active');$('resultadosArtilharia').style.display='block';}
  else if(t==='vitorias'){document.querySelectorAll('#resultTabs .tab')[3].classList.add('active');$('resultadosVitorias').style.display='block';}
}

async function loadResultados() {
  showSkeleton('resultadosSemana');

  // Semana
  if (peladaAtual) {
    var { data: vs } = await sb.from('votos').select('*').eq('pelada_id', peladaAtual.id);
    var dataF = peladaAtual.data; try { dataF = new Date(peladaAtual.data+'T12:00:00').toLocaleDateString('pt-BR'); } catch(e){}
    renderResultados(buildRanking(vs || []), 'resultadosSemana', peladaAtual.id + ' (' + dataF + ')');
    if (isAdm) { $('votosDetalhados').style.display = 'block'; renderVotosDetalhados(vs || []); }
  } else { $('resultadosSemana').innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada disponível.</div>'; }

  // Geral
  var { data: allV } = await sb.from('votos').select('*');
  renderResultados(buildRanking(allV || []), 'resultadosGeral', 'Ranking Geral (Todas as Peladas)');

  // Artilharia
  var { data: allG } = await sb.from('gols').select('*').eq('gol_contra', false);
  var artMap = {};
  (allG || []).forEach(function(g) { artMap[g.jogador] = (artMap[g.jogador] || 0) + 1; });
  var art = Object.keys(artMap).map(function(n){ return { nome: n, gols: artMap[n] }; }).sort(function(a,b){ return b.gols - a.gols; });
  renderRankingSimples(art, 'resultadosArtilharia', '⚽ Artilharia Geral', 'gols');

  // Vitórias
  var { data: allP } = await sb.from('partidas').select('*').eq('status', 'Finalizada').neq('vencedor', 'Empate').neq('vencedor', '');
  var vitMap = {};
  (allP || []).forEach(function(p) {
    var tw = p.vencedor === 'A' ? p.time_a : p.time_b;
    if (tw) tw.forEach(function(n) { if(n) vitMap[n.trim()] = (vitMap[n.trim()] || 0) + 1; });
  });
  var vit = Object.keys(vitMap).map(function(n){ return { nome: n, vitorias: vitMap[n] }; }).sort(function(a,b){ return b.vitorias - a.vitorias; });
  renderRankingSimples(vit, 'resultadosVitorias', '🏆 Ranking de Vitórias (Partidas)', 'vitorias');
}

function buildRanking(votos) {
  var premios = ['Goleiro','MVP','Selecao','Decepcao','Revelacao'], res = {};
  premios.forEach(function(pr) {
    var cnt = {};
    votos.forEach(function(v) { if (v.premio === pr) cnt[v.votado] = (cnt[v.votado] || 0) + 1; });
    res[pr] = Object.keys(cnt).map(function(n){ return { nome: n, votos: cnt[n] }; }).sort(function(a,b){ return b.votos - a.votos; });
  });
  return res;
}

function renderRankingSimples(rk, cid, tit, campo) {
  var h = '<div class="card"><div class="card-title">' + tit + '</div>';
  if (!rk || rk.length === 0) h += '<div class="text-muted">Sem dados ainda.</div>';
  else { h += '<ul class="ranking-list">'; for (var r = 0; r < rk.length && r < 20; r++) { var pc = r===0?'gold':r===1?'silver':r===2?'bronze':'normal';
    h += '<li class="ranking-item"><div class="ranking-pos ' + pc + '">' + (r+1) + '</div><div class="ranking-name">' + dn(rk[r].nome) + '</div><div class="ranking-votes">' + rk[r][campo] + '</div></li>'; } h += '</ul>'; }
  h += '</div>'; $(cid).innerHTML = h;
}

function renderResultados(res, cid, tit) {
  var pc = [{key:'Goleiro',emoji:'🧤'},{key:'MVP',emoji:'⭐'},{key:'Selecao',emoji:'🏅'},{key:'Decepcao',emoji:'😞'},{key:'Revelacao',emoji:'🌟'}];
  var h = '<div class="section-desc">' + tit + '</div>';
  pc.forEach(function(c) { var rk = res[c.key] || []; h += '<div class="card"><div class="card-title">' + c.emoji + ' ' + c.key + '</div>';
    if (rk.length === 0) h += '<div class="text-muted">Sem votos ainda.</div>';
    else { h += '<ul class="ranking-list">'; for (var r = 0; r < rk.length && r < 10; r++) { var ps = r===0?'gold':r===1?'silver':r===2?'bronze':'normal';
      h += '<li class="ranking-item"><div class="ranking-pos ' + ps + '">' + (r+1) + '</div><div class="ranking-name">' + dn(rk[r].nome) + '</div><div class="ranking-votes">' + rk[r].votos + ' voto' + (rk[r].votos>1?'s':'') + '</div></li>'; } h += '</ul>'; }
    h += '</div>'; });
  $(cid).innerHTML = h;
}

function renderVotosDetalhados(votos) {
  var el = $('votosDetalhadosContent');
  if (votos.length === 0) { el.innerHTML = '<div class="text-muted">Nenhum voto registrado ainda.</div>'; return; }
  var h = '<div style="overflow-x:auto;"><table class="log-table"><tr><th>Votante</th><th>Prêmio</th><th>Votado</th><th>Hora</th></tr>';
  votos.forEach(function(v) { var ts = v.timestamp ? new Date(v.timestamp).toLocaleString('pt-BR') : '';
    h += '<tr><td>' + dn(v.votante) + '</td><td>' + v.premio + '</td><td>' + dn(v.votado) + '</td><td class="log-time">' + ts + '</td></tr>'; });
  h += '</table></div>'; el.innerHTML = h;
}

// ============================================================
// ADM
// ============================================================
function loadAdm() {
  if (!isAdm) return;
  $('admContent').innerHTML = '<div class="tabs" id="admTabs"><button class="tab active" onclick="switchAdmTab(\'pelada\')">Pelada</button><button class="tab" onclick="switchAdmTab(\'jogadores\')">Jogadores</button><button class="tab" onclick="switchAdmTab(\'logs\')">Logs</button></div>' +
    '<div id="admTabPelada"></div><div id="admTabJogadores" style="display:none;"></div><div id="admTabLogs" style="display:none;"></div>';
  loadAdmPelada();
}

function switchAdmTab(t) {
  document.querySelectorAll('#admTabs .tab').forEach(function(tb){ tb.classList.remove('active'); });
  ['admTabPelada','admTabJogadores','admTabLogs'].forEach(function(id){ $(id).style.display='none'; });
  if (t==='pelada') { document.querySelectorAll('#admTabs .tab')[0].classList.add('active'); $('admTabPelada').style.display='block'; loadAdmPelada(); }
  if (t==='jogadores') { document.querySelectorAll('#admTabs .tab')[1].classList.add('active'); $('admTabJogadores').style.display='block'; loadAdmJogadores(); }
  if (t==='logs') { document.querySelectorAll('#admTabs .tab')[2].classList.add('active'); $('admTabLogs').style.display='block'; loadAdmLogs(); }
}

async function loadAdmPelada() {
  showSkeleton('admTabPelada');
  var { data: pels } = await sb.from('peladas').select('*').order('criado_em', { ascending: false });
  allPeladas = pels || []; peladaAtual = allPeladas[0] || null;

  var po = ''; allPeladas.forEach(function(p, i) {
    var dataF = p.data; try { dataF = new Date(p.data+'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}
    po += '<option value="' + p.id + '"' + (i === 0 ? ' selected' : '') + '>' + p.id + ' (' + dataF + ') — ' + p.status + '</option>'; });

  $('admTabPelada').innerHTML = '<div class="card"><div class="card-title">📅 Criar Nova Pelada</div><div class="input-row"><input type="date" id="novaPeladaData"><button class="btn btn-primary" onclick="criarNovaPelada()">Criar</button></div></div>' +
    (allPeladas.length > 0 ? '<div class="card"><div class="card-title">📋 Gerenciar Pelada</div><select class="vote-select mb16" id="admPeladaSelect" onchange="onAdmPeladaSelectChange()">' + po + '</select><div id="admPeladaActions"></div></div>' +
    '<div class="card"><div class="card-title">👥 Definir Presença</div><div id="admPresencaList"></div><button class="btn btn-primary mt12" onclick="salvarPresenca()">Salvar Presença</button></div>' : '');

  if (allPeladas.length > 0) loadAdmPeladaDetails(allPeladas[0].id);
}

async function loadAdmPeladaDetails(peladaId) {
  var pelada = allPeladas.find(function(p){ return p.id === peladaId; });
  if (!pelada) return;

  var { data: votantes } = await sb.from('votos').select('votante').eq('pelada_id', peladaId);
  var uniq = {}; (votantes||[]).forEach(function(v){ uniq[v.votante]=true; }); var qjv = Object.keys(uniq);

  var ae = $('admPeladaActions');
  var h = '<div class="flex-between mb16"><span class="text-muted">Status: ' + pelada.status + '</span>';
  if (!pelada.votacao_aberta && pelada.status !== 'Encerrada') h += '<button class="btn btn-primary" style="width:auto;padding:10px 20px;font-size:13px;" onclick="abrirVotacao(\'' + peladaId + '\')">Abrir Votação</button>';
  else if (pelada.votacao_aberta) h += '<button class="btn btn-danger" style="width:auto;padding:10px 20px;font-size:13px;" onclick="fecharVotacao(\'' + peladaId + '\')">Fechar Votação</button>';
  h += '</div>';
  if (qjv.length > 0) h += '<div class="text-muted" style="font-size:12px;">Já votaram (' + qjv.length + '): ' + sa(qjv).map(dn).join(', ') + '</div>';
  if (ae) ae.innerHTML = h;

  // Presença
  var { data: pres } = await sb.from('presenca').select('jogador').eq('pelada_id', peladaId);
  var presentesList = (pres||[]).map(function(r){ return r.jogador; });
  var { data: jogs } = await sb.from('jogadores').select('nome').order('nome');
  var jogList = (jogs||[]).map(function(r){ return r.nome; });

  var le = $('admPresencaList');
  if (le) {
    var jo = sa(jogList), lh = '<div class="checkbox-list">';
    jo.forEach(function(n, i) { var ck = presentesList.indexOf(n) > -1 ? ' checked' : '';
      lh += '<div class="checkbox-item"><input type="checkbox" id="pres_' + i + '" value="' + n + '"' + ck + '><label for="pres_' + i + '">' + dn(n) + '</label></div>'; });
    lh += '</div>'; le.innerHTML = lh;
  }
}

function onAdmPeladaSelectChange() { loadAdmPeladaDetails($('admPeladaSelect').value); }

async function criarNovaPelada() {
  var data = $('novaPeladaData').value;
  if (!data) { showToast('Selecione uma data!', true); return; }
  var { data: nid } = await sb.rpc('next_pelada_id');
  var { error } = await sb.from('peladas').insert({ id: nid, data: data, status: 'Agendada', votacao_aberta: false });
  if (error) { showToast('Erro: ' + error.message, true); return; }
  showToast('Pelada criada: ' + nid); logAsync(currentUser, 'CRIAR_PELADA', nid + ' em ' + data); loadAdmPelada();
}

async function abrirVotacao(pid) {
  await sb.from('peladas').update({ status: 'Realizada', votacao_aberta: true }).eq('id', pid);
  showToast('Votação aberta!'); logAsync(currentUser, 'ABRIR_VOTACAO', pid); loadAdmPelada();
}

async function fecharVotacao(pid) {
  await sb.from('peladas').update({ status: 'Encerrada', votacao_aberta: false }).eq('id', pid);
  showToast('Votação fechada!'); logAsync(currentUser, 'FECHAR_VOTACAO', pid); loadAdmPelada();
}

async function salvarPresenca() {
  var pid = $('admPeladaSelect').value;
  var cbs = document.querySelectorAll('#admPresencaList input[type="checkbox"]');
  var pr = []; cbs.forEach(function(c){ if(c.checked) pr.push(c.value); });
  await sb.from('presenca').delete().eq('pelada_id', pid);
  if (pr.length > 0) { var rows = pr.map(function(j){ return { pelada_id: pid, jogador: j }; }); await sb.from('presenca').insert(rows); }
  showToast(pr.length + ' jogadores marcados.'); logAsync(currentUser, 'DEFINIR_PRESENCA', pid + ': ' + pr.join(', '));
}

// ADM: Jogadores
async function loadAdmJogadores() {
  showSkeleton('admTabJogadores');
  var { data: jogs } = await sb.from('jogadores').select('nome').order('nome');
  var jogList = (jogs||[]).map(function(r){ return r.nome; });
  cachedJogadores = jogList;
  var jo = sa(jogList);
  var h = '<div class="card"><div class="card-title">➕ Adicionar Jogador</div><div class="input-row"><input type="text" id="novoJogadorNome" placeholder="Nome do jogador"><button class="btn btn-primary" onclick="adicionarJogador()">Adicionar</button></div></div>';
  h += '<div class="card"><div class="card-title">📋 Jogadores Cadastrados (' + jogList.length + ')</div>';
  jo.forEach(function(n) { h += '<div class="flex-between" style="padding:8px 0;border-bottom:1px solid rgba(36,48,73,0.3);"><span style="font-size:14px;">' + dn(n) + '</span>';
    if (n !== admName) h += '<button class="btn-logout" style="color:var(--red);border-color:var(--red);font-size:11px;" onclick="removerJogador(\'' + n + '\')">Remover</button>'; h += '</div>'; });
  h += '</div>'; $('admTabJogadores').innerHTML = h;
}

async function adicionarJogador() {
  var n = $('novoJogadorNome').value.trim(); if (!n) { showToast('Digite o nome!', true); return; }
  var { error } = await sb.from('jogadores').insert({ nome: n });
  if (error) { showToast(error.message.includes('duplicate') ? 'Jogador já existe.' : error.message, true); return; }
  showToast('Jogador adicionado.'); logAsync(currentUser, 'ADD_JOGADOR', n); loadAdmJogadores();
}

async function removerJogador(n) {
  if (!confirm('Remover ' + n + '?')) return;
  await sb.from('jogadores').delete().eq('nome', n);
  showToast('Jogador removido.'); logAsync(currentUser, 'REMOVER_JOGADOR', n); loadAdmJogadores();
}

// ADM: Logs
async function loadAdmLogs() {
  showSkeleton('admTabLogs');
  var { data: logs } = await sb.from('logs').select('*').order('timestamp', { ascending: false }).limit(100);
  if (!logs || logs.length === 0) { $('admTabLogs').innerHTML = '<div class="empty-state"><span class="emoji">📋</span>Nenhum log registrado.</div>'; return; }
  var h = '<div class="card"><div class="card-title">📋 Logs do Sistema</div><div style="overflow-x:auto;"><table class="log-table"><tr><th>Usuário</th><th>Ação</th><th>Detalhes</th><th>Data/Hora</th></tr>';
  logs.forEach(function(l) { var ts = l.timestamp ? new Date(l.timestamp).toLocaleString('pt-BR') : '';
    h += '<tr><td>' + dn(l.usuario) + '</td><td>' + l.acao + '</td><td>' + l.detalhes + '</td><td class="log-time">' + ts + '</td></tr>'; });
  h += '</table></div></div>'; $('admTabLogs').innerHTML = h;
}

// ============================================================
// AO VIVO (com Realtime!)
// ============================================================
var aoVivoPresentes = [], teamPicks = {};

async function loadAoVivo() {
  var el = $('aoVivoContent');
  if (!peladaAtual) { el.innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada disponível.</div>'; return; }
  showSkeleton('aoVivoContent');

  var { data: pres } = await sb.from('presenca').select('jogador').eq('pelada_id', peladaAtual.id);
  aoVivoPresentes = (pres||[]).map(function(r){ return r.jogador; });

  var { data: parts } = await sb.from('partidas').select('*').eq('pelada_id', peladaAtual.id).order('numero');
  var todasPartidas = parts || [];

  var ativa = todasPartidas.find(function(p){ return p.status === 'EmAndamento'; }) || null;

  if (ativa) {
    var { data: gols } = await sb.from('gols').select('*').eq('partida_id', ativa.partida_id).order('timestamp');
    renderPartidaAtiva(ativa, gols || [], todasPartidas);
    setupRealtime(ativa.partida_id);
  } else {
    var proxNum = todasPartidas.length === 0 ? 1 : todasPartidas[todasPartidas.length - 1].numero + 1;
    renderSetupPartida(todasPartidas, proxNum);
    if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  }
}

function setupRealtime(partidaId) {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel('ao-vivo-' + partidaId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gols', filter: 'partida_id=eq.' + partidaId }, function() { loadAoVivo(); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'partidas', filter: 'partida_id=eq.' + partidaId }, function() { loadAoVivo(); })
    .subscribe();
}

function renderSetupPartida(tp, pn) {
  var el = $('aoVivoContent'); teamPicks = {};
  var rh = '';
  if (tp.length > 0) { rh = '<div class="card"><div class="card-title">📋 Partidas de Hoje</div>';
    tp.forEach(function(p) { if (p.status !== 'Finalizada') return; var vl = p.vencedor === 'A' ? '🔵 Time A' : (p.vencedor === 'B' ? '🟠 Time B' : '🤝 Empate');
      rh += '<div class="flex-between" style="padding:8px 0;border-bottom:1px solid rgba(36,48,73,0.3);font-size:13px;"><span>Partida ' + p.numero + '</span><span style="font-weight:600;">' + p.placar_a + ' x ' + p.placar_b + '</span><span class="text-muted">' + vl + '</span></div>'; });
    rh += '</div>'; }
  var po = sa(aoVivoPresentes), ph = '';
  po.forEach(function(n) { ph += '<div class="pool-chip" data-player="' + n + '" onclick="pickPlayer(this)">' + dn(n) + '</div>'; });
  el.innerHTML = rh + '<div class="card"><div class="card-title">⚽ Montar Partida ' + pn + '</div><div class="team-pick-label">Toque nos nomes: 1º toque = 🔵 Time A, 2º toque = 🟠 Time B, 3º toque = remove</div>' +
    '<div class="player-pool" id="playerPool">' + ph + '</div><div class="team-counters mt8">🔵 Time A: <span id="countA">0</span>/5 &nbsp;&nbsp; 🟠 Time B: <span id="countB">0</span>/5</div></div>' +
    '<button class="btn btn-primary" onclick="iniciarPartida(' + pn + ')">Iniciar Partida ' + pn + '</button>' +
    '<button class="btn btn-danger mt12" onclick="confirmarEncerrarPelada()" style="margin-top:12px;">🏁 Encerrar Pelada</button>';
}

function pickPlayer(c) {
  var n = c.getAttribute('data-player'), cu = teamPicks[n] || null, cA = 0, cB = 0;
  for (var k in teamPicks) { if (teamPicks[k]==='A') cA++; if (teamPicks[k]==='B') cB++; }
  if (cu === null) { if (cA < 5) { teamPicks[n]='A'; c.className='pool-chip team-a'; } else if (cB < 5) { teamPicks[n]='B'; c.className='pool-chip team-b'; } }
  else if (cu === 'A') { teamPicks[n]='B'; c.className='pool-chip team-b'; cB++; if (cB > 5) { teamPicks[n]=null; c.className='pool-chip'; } }
  else { teamPicks[n]=null; c.className='pool-chip'; }
  cA=0; cB=0; for (var k in teamPicks) { if(teamPicks[k]==='A')cA++; if(teamPicks[k]==='B')cB++; }
  $('countA').textContent=cA; $('countB').textContent=cB;
}

async function iniciarPartida(num) {
  var tA=[], tB=[]; for(var k in teamPicks){if(teamPicks[k]==='A')tA.push(k);if(teamPicks[k]==='B')tB.push(k);}
  if(tA.length!==5||tB.length!==5){showToast('Selecione exatamente 5 jogadores por time!',true);return;}
  var pid = peladaAtual.id + '_M' + String(num).padStart(2, '0');
  var { error } = await sb.from('partidas').insert({ partida_id: pid, pelada_id: peladaAtual.id, numero: num, time_a: tA, time_b: tB, placar_a: 0, placar_b: 0, vencedor: '', status: 'EmAndamento' });
  if (error) { showToast('Erro: ' + error.message, true); return; }
  showToast('Partida iniciada!'); logAsync(currentUser, 'INICIAR_PARTIDA', pid); loadAoVivo();
}

function renderPartidaAtiva(part, gols, tp) {
  var el = $('aoVivoContent');
  function bTR(pl, tl) { var po=sa(pl), h=''; po.forEach(function(n) {
    h+='<div class="team-player-row"><span class="team-player-name">'+dn(n)+'</span>'+
      '<button class="goal-btn goal-btn-normal" onclick="marcarGol(\''+part.partida_id+'\',\''+n+'\',\''+tl+'\',false)">⚽ Gol</button>'+
      '<button class="goal-btn goal-btn-contra" onclick="marcarGol(\''+part.partida_id+'\',\''+n+'\',\''+tl+'\',true)">🔄 Contra</button></div>'; }); return h; }
  var gl='';
  if(gols.length>0){gl='<div class="card"><div class="card-title">⚽ Gols Registrados</div><div class="gol-log">';
    gols.forEach(function(g){var tc=g.time==='A'?'var(--blue)':'var(--orange)',tn=g.time==='A'?'Time A':'Time B';
      var lb=g.gol_contra?'🔄 Gol contra de '+dn(g.jogador)+' ('+tn+')':'⚽ '+dn(g.jogador)+' ('+tn+')';
      gl+='<div class="gol-item"><span style="color:'+tc+'">'+lb+'</span><button class="gol-remove" onclick="removerGolConfirm(\''+g.gol_id+'\',\''+part.partida_id+'\')">✕</button></div>';});
    gl+='</div></div>';}
  el.innerHTML='<div class="scoreboard"><div class="scoreboard-match">Partida '+part.numero+'</div><div class="scoreboard-score"><span class="score-a">'+part.placar_a+'</span><span class="score-x">×</span><span class="score-b">'+part.placar_b+'</span></div>'+
    '<div class="scoreboard-labels"><span>🔵 Time A</span><span>🟠 Time B</span></div></div>'+
    '<div class="team-section"><div class="team-header team-header-a">🔵 Time A</div><div class="team-players">'+bTR(part.time_a,'A')+'</div></div>'+
    '<div class="team-section"><div class="team-header team-header-b">🟠 Time B</div><div class="team-players">'+bTR(part.time_b,'B')+'</div></div>'+gl+
    '<button class="btn btn-primary mt16" onclick="confirmarFinalizarPartida(\''+part.partida_id+'\')">✅ Finalizar Partida '+part.numero+'</button>';
}

async function marcarGol(partidaId, jogador, time, gc) {
  var { data: gid } = await sb.rpc('next_gol_id');
  await sb.from('gols').insert({ gol_id: gid, partida_id: partidaId, pelada_id: peladaAtual.id, jogador: jogador, time: time, gol_contra: gc });
  await sb.rpc('recalcular_placar', { p_partida_id: partidaId });
  showToast(gc ? 'Gol contra registrado!' : 'Gol de ' + dn(jogador) + '!');
  logAsync(currentUser, 'GOL', jogador + ' (Time ' + time + ')' + (gc ? ' [CONTRA]' : '') + ' em ' + partidaId);
  // Realtime will auto-refresh, but trigger manual refresh for the scorer's device
  loadAoVivo();
}

async function removerGolConfirm(golId, partidaId) {
  if (!confirm('Remover este gol?')) return;
  await sb.from('gols').delete().eq('gol_id', golId);
  await sb.rpc('recalcular_placar', { p_partida_id: partidaId });
  showToast('Gol removido.'); logAsync(currentUser, 'REMOVER_GOL', golId); loadAoVivo();
}

async function confirmarFinalizarPartida(pid) {
  if (!confirm('Finalizar esta partida?')) return;
  var { data: p } = await sb.from('partidas').select('placar_a, placar_b').eq('partida_id', pid).single();
  var v = p.placar_a > p.placar_b ? 'A' : (p.placar_b > p.placar_a ? 'B' : 'Empate');
  await sb.from('partidas').update({ vencedor: v, status: 'Finalizada' }).eq('partida_id', pid);
  var msg = v === 'Empate' ? 'Empate! ' + p.placar_a + ' x ' + p.placar_b : (v === 'A' ? '🔵 Time A venceu!' : '🟠 Time B venceu!') + ' ' + p.placar_a + ' x ' + p.placar_b;
  showToast(msg); logAsync(currentUser, 'FINALIZAR_PARTIDA', pid + ' ' + p.placar_a + 'x' + p.placar_b); loadAoVivo();
}

async function confirmarEncerrarPelada() {
  if (!confirm('Encerrar a pelada de hoje? Isso marca a pelada como Realizada.')) return;
  await sb.from('peladas').update({ status: 'Realizada' }).eq('id', peladaAtual.id);
  showToast('Pelada encerrada!'); logAsync(currentUser, 'ENCERRAR_PELADA', peladaAtual.id); loadHome(); navigateTo('Home');
}
