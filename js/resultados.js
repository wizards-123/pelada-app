// ============================================================
// resultados.js - Ranking, filtro multi-pelada
// ============================================================

var resultPeladasSelecionadas = [];
var resultAllPeladas = [];
var resultRankingSortCol = 'pts';
var resultRankingSortDir = 'desc';
var resultCachedData = null;
var resultDropdownOpen = false;

async function loadResultados() {
  showSkeleton('resultadosSemana');
  $('resultadosGeral').style.display = 'none';
  $('resultadosArtilharia').style.display = 'none';
  $('resultadosVitorias').style.display = 'none';

  var canView = await checkVoteGate();
  if (!canView) return;

  var { data: allP } = await sb.from('peladas').select('*').eq('grupo_id', grupoAtual.id).neq('ativa', false).order('data', { ascending: false });
  resultAllPeladas = allP || [];

  if (resultPeladasSelecionadas.length === 0) {
    resultPeladasSelecionadas = resultAllPeladas.map(function(p) { return p.id; });
  } else {
    var ativasIds = resultAllPeladas.map(function(p) { return p.id; });
    resultPeladasSelecionadas = resultPeladasSelecionadas.filter(function(pid) {
      return ativasIds.indexOf(pid) > -1;
    });
    if (resultPeladasSelecionadas.length === 0) {
      resultPeladasSelecionadas = ativasIds;
    }
  }

  renderResultadosShell();
  await refreshResultadosData();
}

// ============================================================
// VOTE-GATE CHECK
// ============================================================
async function checkVoteGate() {
  if (isAdm) return true;

  var { data: abertas } = await sb.from('peladas').select('id').eq('grupo_id', grupoAtual.id).eq('votacao_aberta', true);
  if (!abertas || abertas.length === 0) return true;

  var peladaIds = abertas.map(function(p) { return p.id; });
  var { data: votos } = await sb.from('votos').select('pelada_id').eq('grupo_id', grupoAtual.id).eq('votante', currentUser).in('pelada_id', peladaIds);

  var peladasVotadas = {};
  if (votos) {
    votos.forEach(function(v) { peladasVotadas[v.pelada_id] = true; });
  }

  var faltaVotar = peladaIds.filter(function(pid) { return !peladasVotadas[pid]; });
  if (faltaVotar.length === 0) return true;

  renderVoteGateBlock();
  return false;
}

function renderVoteGateBlock() {
  var el = $('resultadosSemana');
  el.style.display = 'block';
  el.innerHTML =
    '<div class="empty-state" style="padding:60px 20px;">' +
      '<span class="emoji" style="font-size:48px;">🗳️</span>' +
      '<div style="font-size:16px;font-weight:600;color:var(--text);margin-top:12px;margin-bottom:8px;">Você ainda não votou</div>' +
      '<div style="font-size:14px;color:var(--text2);margin-bottom:24px;line-height:1.5;">Vote na pelada aberta para<br>visualizar o ranking.</div>' +
      '<button class="btn btn-primary" style="max-width:220px;margin:0 auto;" onclick="navigateTo(\'Votar\')">Ir para Votação</button>' +
    '</div>';
}

function renderResultadosShell() {
  var el = $('resultadosSemana');
  el.style.display = 'block';

  var ddHtml = '<div class="pelada-filter-wrap" id="peladaFilterWrap">';
  ddHtml += '<div class="pelada-filter-btn" id="peladaFilterBtn" onclick="togglePeladaDropdown()">';
  ddHtml += '<span id="peladaFilterLabel">' + getPeladaFilterLabel() + '</span>';
  ddHtml += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
  ddHtml += '</div>';
  ddHtml += '<div class="pelada-filter-dropdown" id="peladaFilterDropdown">';
  ddHtml += '<div class="pelada-filter-actions">';
  ddHtml += '<button class="pelada-filter-action-btn" onclick="peladaFilterSelectAll()">Todas</button>';
  ddHtml += '<button class="pelada-filter-action-btn" onclick="peladaFilterSelectNone()">Nenhuma</button>';
  ddHtml += '</div>';
  resultAllPeladas.forEach(function(p) {
    var checked = resultPeladasSelecionadas.indexOf(p.id) > -1 ? ' checked' : '';
    ddHtml += '<label class="pelada-filter-item"><input type="checkbox" value="' + p.id + '"' + checked + ' onchange="onPeladaFilterChange(this)"><span>' + peladaLabelComData(p) + '</span></label>';
  });
  ddHtml += '</div></div>';

  el.innerHTML = ddHtml + '<div id="resultTabRanking"></div>';
}

function getPeladaFilterLabel() {
  if (resultPeladasSelecionadas.length === 0) return 'Nenhuma selecionada';
  if (resultPeladasSelecionadas.length === resultAllPeladas.length) return 'Todas as peladas (' + resultAllPeladas.length + ')';
  return resultPeladasSelecionadas.length + ' de ' + resultAllPeladas.length + ' peladas';
}

function togglePeladaDropdown() {
  resultDropdownOpen = !resultDropdownOpen;
  var dd = $('peladaFilterDropdown');
  dd.style.display = resultDropdownOpen ? 'block' : 'none';
  $('peladaFilterBtn').classList.toggle('open', resultDropdownOpen);
}

function closePeladaDropdown() {
  resultDropdownOpen = false;
  var dd = $('peladaFilterDropdown');
  if (dd) { dd.style.display = 'none'; }
  var btn = $('peladaFilterBtn');
  if (btn) btn.classList.remove('open');
}

document.addEventListener('click', function(e) {
  var wrap = $('peladaFilterWrap');
  if (wrap && !wrap.contains(e.target) && resultDropdownOpen) {
    closePeladaDropdown();
  }
});

function peladaFilterSelectAll() {
  resultPeladasSelecionadas = resultAllPeladas.map(function(p) { return p.id; });
  updatePeladaFilterUI();
  refreshResultadosData();
}

function peladaFilterSelectNone() {
  resultPeladasSelecionadas = [];
  updatePeladaFilterUI();
  refreshResultadosData();
}

function onPeladaFilterChange(cb) {
  var pid = isNaN(Number(cb.value)) ? cb.value : Number(cb.value);
  if (cb.checked) {
    if (resultPeladasSelecionadas.indexOf(pid) === -1) resultPeladasSelecionadas.push(pid);
  } else {
    var idx = resultPeladasSelecionadas.indexOf(pid);
    if (idx > -1) resultPeladasSelecionadas.splice(idx, 1);
  }
  updatePeladaFilterLabel();
  refreshResultadosData();
}

function updatePeladaFilterUI() {
  var cbs = document.querySelectorAll('#peladaFilterDropdown input[type="checkbox"]');
  cbs.forEach(function(cb) {
    var pid = isNaN(Number(cb.value)) ? cb.value : Number(cb.value);
    cb.checked = resultPeladasSelecionadas.indexOf(pid) > -1;
  });
  updatePeladaFilterLabel();
}

function updatePeladaFilterLabel() {
  var lbl = $('peladaFilterLabel');
  if (lbl) lbl.textContent = getPeladaFilterLabel();
}

// ============================================================
// DATA FETCHING
// ============================================================
async function refreshResultadosData() {
  if (resultPeladasSelecionadas.length === 0) {
    $('resultTabRanking').innerHTML = '<div class="empty-state"><span class="emoji">🔍</span>Selecione ao menos 1 pelada.</div>';
    return;
  }

  var pIds = resultPeladasSelecionadas;

  // Buscar TODOS os gols (normais + contra)
  var golsPromise = sb.from('gols').select('*').eq('grupo_id', grupoAtual.id).in('pelada_id', pIds);
  var partidasPromise = sb.from('partidas').select('*').eq('grupo_id', grupoAtual.id).in('pelada_id', pIds).eq('status', 'Finalizada');
  var presencaPromise = sb.from('presenca').select('*').eq('grupo_id', grupoAtual.id).in('pelada_id', pIds);

  var results = await Promise.all([golsPromise, partidasPromise, presencaPromise]);
  var gols = results[0].data || [];
  var partidas = results[1].data || [];
  var presenca = results[2].data || [];

  resultCachedData = { gols: gols, partidas: partidas, presenca: presenca };
  renderRankingTab(gols, partidas, presenca);
}

// ============================================================
// RANKING TAB
// ============================================================
function renderRankingTab(gols, partidas, presenca) {
  var players = buildPlayerStats(gols, partidas, presenca);
  sortPlayers(players);

  var h = '<div class="card" style="padding:12px;overflow-x:auto;">';
  h += '<table class="ranking-table" id="rankingTable">';
  h += '<thead><tr>';

  var cols = [
    { key: 'rank', label: '#', sortable: false },
    { key: 'nome', label: 'Nome', sortable: true },
    { key: 'pts', label: 'Pts', sortable: true },
    { key: 'gols', label: 'Gols', sortable: true },
    { key: 'gc', label: 'GC', sortable: true },
    { key: 'vitorias', label: 'Vit', sortable: true },
    { key: 'peladas', label: 'Pel', sortable: true },
    { key: 'ptsPelada', label: 'Pts/P', sortable: true },
    { key: 'golsPelada', label: 'G/P', sortable: true },
    { key: 'vitPelada', label: 'V/P', sortable: true }
  ];

  cols.forEach(function(c) {
    if (!c.sortable) {
      h += '<th class="rt-th">' + c.label + '</th>';
    } else {
      var isActive = resultRankingSortCol === c.key;
      var arrow = '';
      if (isActive) arrow = resultRankingSortDir === 'desc' ? ' ▼' : ' ▲';
      h += '<th class="rt-th rt-sortable' + (isActive ? ' rt-sorted' : '') + '" onclick="sortRankingBy(\'' + c.key + '\')">' + c.label + arrow + '</th>';
    }
  });
  h += '</tr></thead><tbody>';

  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    var posClass = i === 0 ? 'rt-gold' : i === 1 ? 'rt-silver' : i === 2 ? 'rt-bronze' : '';
    h += '<tr class="' + posClass + '">';
    h += '<td class="rt-td rt-rank">' + (i + 1) + '</td>';
    h += '<td class="rt-td rt-name">' + dn(p.nome) + '</td>';
    h += '<td class="rt-td rt-num rt-bold">' + p.pts + '</td>';
    h += '<td class="rt-td rt-num">' + p.gols + '</td>';
    h += '<td class="rt-td rt-num" style="' + (p.gc > 0 ? 'color:var(--red);' : '') + '">' + p.gc + '</td>';
    h += '<td class="rt-td rt-num">' + p.vitorias + '</td>';
    h += '<td class="rt-td rt-num">' + p.peladas + '</td>';
    h += '<td class="rt-td rt-num">' + p.ptsPelada + '</td>';
    h += '<td class="rt-td rt-num">' + p.golsPelada + '</td>';
    h += '<td class="rt-td rt-num">' + p.vitPelada + '</td>';
    h += '</tr>';
  }

  h += '</tbody></table></div>';

  if (players.length === 0) {
    h = '<div class="empty-state"><span class="emoji">📊</span>Sem dados para as peladas selecionadas.</div>';
  }

  $('resultTabRanking').innerHTML = h;
}

function buildPlayerStats(gols, partidas, presenca) {
  var map = {};

  function ensure(nome) {
    if (!map[nome]) {
      map[nome] = { nome: nome, pts: 0, gols: 0, gc: 0, vitorias: 0, peladas: 0, peladaSet: {} };
    }
  }

  // Presença
  presenca.forEach(function(pr) {
    ensure(pr.jogador);
    map[pr.jogador].peladaSet[pr.pelada_id] = true;
  });

  // Gols normais e contra
  gols.forEach(function(g) {
    ensure(g.jogador);
    if (g.gol_contra) {
      map[g.jogador].gc += 1;
    } else {
      map[g.jogador].gols += 1;
    }
    map[g.jogador].peladaSet[g.pelada_id] = true;
  });

  // Vitórias
  partidas.forEach(function(p) {
    if (!p.vencedor || p.vencedor === 'Empate' || p.vencedor === '') return;
    var tw = p.vencedor === 'A' ? p.time_a : p.time_b;
    if (tw) tw.forEach(function(n) {
      if (!n) return;
      var nome = n.trim();
      ensure(nome);
      map[nome].vitorias += 1;
      map[nome].peladaSet[p.pelada_id] = true;
    });
  });

  // Pontuação: Gol = +1, Vitória = +3, Gol Contra = -1
  var players = Object.keys(map).map(function(nome) {
    var p = map[nome];
    p.peladas = Object.keys(p.peladaSet).length;
    p.pts = (p.gols * 1) + (p.vitorias * 3) + (p.gc * -1);
    p.ptsPelada = p.peladas > 0 ? (p.pts / p.peladas).toFixed(1) : '0.0';
    p.golsPelada = p.peladas > 0 ? (p.gols / p.peladas).toFixed(1) : '0.0';
    p.vitPelada = p.peladas > 0 ? (p.vitorias / p.peladas).toFixed(1) : '0.0';
    return p;
  });

  return players;
}

function sortRankingBy(col) {
  if (resultRankingSortCol === col) {
    resultRankingSortDir = resultRankingSortDir === 'desc' ? 'asc' : 'desc';
  } else {
    resultRankingSortCol = col;
    resultRankingSortDir = col === 'nome' ? 'asc' : 'desc';
  }
  if (resultCachedData) {
    renderRankingTab(resultCachedData.gols, resultCachedData.partidas, resultCachedData.presenca);
  }
}

function sortPlayers(players) {
  var col = resultRankingSortCol;
  var dir = resultRankingSortDir;

  players.sort(function(a, b) {
    var va, vb;
    if (col === 'nome') {
      va = (a.nome || '').toLowerCase();
      vb = (b.nome || '').toLowerCase();
      var cmp = va < vb ? -1 : (va > vb ? 1 : 0);
      return dir === 'asc' ? cmp : -cmp;
    }

    va = parseFloat(a[col]) || 0;
    vb = parseFloat(b[col]) || 0;
    if (va !== vb) return dir === 'desc' ? vb - va : va - vb;

    // Desempate: pts > gols > vitorias
    var tiebreakers = ['pts', 'gols', 'vitorias'];
    for (var i = 0; i < tiebreakers.length; i++) {
      var tk = tiebreakers[i];
      if (tk === col) continue;
      var ta = parseFloat(a[tk]) || 0;
      var tb = parseFloat(b[tk]) || 0;
      if (ta !== tb) return tb - ta;
    }
    return 0;
  });
}
