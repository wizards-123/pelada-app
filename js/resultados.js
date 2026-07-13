// ============================================================
// resultados.js - Ranking, filtro multi-pelada, gráfico evolução
// ============================================================

var resultPeladasSelecionadas = [];
var resultAllPeladas = [];
var resultRankingSortCol = 'pts';
var resultRankingSortDir = 'desc';
var resultCachedData = null;
var resultDropdownOpen = false;
var resultActiveSubTab = 'ranking';

// --- Evolução chart state ---
var evoHighlighted = {};
var evoManualMode = false;
var evoDefaultTop = 5;
var evoChartData = null;
var evoCanvas = null;
var evoCtx = null;
var evoMensalistas = [];

var EVO_COLORS = [
  '#22c55e','#3b82f6','#f97316','#a855f7','#ef4444',
  '#facc15','#ec4899','#14b8a6','#f59e0b','#6366f1'
];

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
// Só aplica se houver identidade da votação (votarUser) e não for ADM.
// ============================================================
async function checkVoteGate() {
  if (isAdm) return true;
  if (!votarUser) return true; // ninguém se identificou ainda: libera ranking

  var { data: abertas } = await sb.from('peladas').select('id').eq('grupo_id', grupoAtual.id).eq('votacao_aberta', true);
  if (!abertas || abertas.length === 0) return true;

  var peladaIds = abertas.map(function(p) { return p.id; });
  var { data: votos } = await sb.from('votos').select('pelada_id').eq('grupo_id', grupoAtual.id).eq('votante', votarUser).in('pelada_id', peladaIds);

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

  var tabHtml = '<div class="evo-subtabs">';
  tabHtml += '<button class="evo-subtab' + (resultActiveSubTab === 'ranking' ? ' active' : '') + '" onclick="switchResultSubTab(\'ranking\')">📊 Tabela</button>';
  tabHtml += '<button class="evo-subtab' + (resultActiveSubTab === 'chart' ? ' active' : '') + '" onclick="switchResultSubTab(\'chart\')">📈 Evolução</button>';
  tabHtml += '</div>';

  el.innerHTML = ddHtml + tabHtml + '<div id="resultTabRanking"></div><div id="resultTabChart" style="display:none;"></div>';

  if (resultActiveSubTab === 'chart') {
    $('resultTabRanking').style.display = 'none';
    $('resultTabChart').style.display = 'block';
  }
}

function switchResultSubTab(tab) {
  resultActiveSubTab = tab;
  var btnAll = document.querySelectorAll('.evo-subtab');
  btnAll.forEach(function(b) { b.classList.remove('active'); });
  if (tab === 'ranking') {
    btnAll[0].classList.add('active');
    $('resultTabRanking').style.display = 'block';
    $('resultTabChart').style.display = 'none';
  } else {
    btnAll[1].classList.add('active');
    $('resultTabRanking').style.display = 'none';
    $('resultTabChart').style.display = 'block';
    if (resultCachedData) {
      renderChartView(resultCachedData.gols, resultCachedData.partidas, resultCachedData.presenca);
    }
  }
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
    $('resultTabChart').innerHTML = '<div class="empty-state"><span class="emoji">🔍</span>Selecione ao menos 1 pelada.</div>';
    return;
  }

  var pIds = resultPeladasSelecionadas;

  var golsPromise = sb.from('gols').select('*').eq('grupo_id', grupoAtual.id).in('pelada_id', pIds);
  var partidasPromise = sb.from('partidas').select('*').eq('grupo_id', grupoAtual.id).in('pelada_id', pIds).eq('status', 'Finalizada');
  var presencaPromise = sb.from('presenca').select('*').eq('grupo_id', grupoAtual.id).in('pelada_id', pIds);
  var mensPromise = sb.from('mensalistas').select('jogador').eq('grupo_id', grupoAtual.id).is('mes_fim', null);

  var results = await Promise.all([golsPromise, partidasPromise, presencaPromise, mensPromise]);
  var gols = results[0].data || [];
  var partidas = results[1].data || [];
  var presenca = results[2].data || [];
  var mens = results[3].data || [];

  evoMensalistas = [];
  var seen = {};
  mens.forEach(function(m) {
    if (m.jogador && !seen[m.jogador]) {
      evoMensalistas.push(m.jogador);
      seen[m.jogador] = true;
    }
  });

  resultCachedData = { gols: gols, partidas: partidas, presenca: presenca };
  renderRankingTab(gols, partidas, presenca);

  if (resultActiveSubTab === 'chart') {
    renderChartView(gols, partidas, presenca);
  }
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

  presenca.forEach(function(pr) {
    ensure(pr.jogador);
    map[pr.jogador].peladaSet[pr.pelada_id] = true;
  });

  gols.forEach(function(g) {
    ensure(g.jogador);
    if (g.gol_contra) {
      map[g.jogador].gc += 1;
    } else {
      map[g.jogador].gols += 1;
    }
    map[g.jogador].peladaSet[g.pelada_id] = true;
  });

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

// ============================================================
// EVOLUÇÃO CHART
// ============================================================
function renderChartView(gols, partidas, presenca) {
  var container = $('resultTabChart');
  if (!container) return;

  var data = buildEvolutionData(gols, partidas, presenca);
  evoChartData = data;

  if (!data || data.series.length === 0 || data.labels.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="emoji">📈</span>Sem dados suficientes para gerar o gráfico.</div>';
    return;
  }

  var h = '';
  h += '<div class="card evo-card">';
  h += '<div class="evo-chart-header">';
  h += '<div class="evo-chart-title">Evolução de Pontos</div>';
  h += '<div class="evo-chart-subtitle">Pontuação acumulada por pelada</div>';
  h += '</div>';
  h += '<div class="evo-canvas-wrap" id="evoCanvasWrap"><canvas id="evoCanvas"></canvas></div>';
  h += '<div class="evo-legend-wrap" id="evoLegendWrap"></div>';
  h += '</div>';

  container.innerHTML = h;

  renderEvoLegend(data);

  requestAnimationFrame(function() {
    drawEvoChart();
  });

  if (!window._evoResizeHandler) {
    window._evoResizeHandler = function() {
      if (resultActiveSubTab === 'chart' && evoChartData) {
        drawEvoChart();
      }
    };
    window.addEventListener('resize', window._evoResizeHandler);
  }
}

function buildEvolutionData(gols, partidas, presenca) {
  var selPeladas = resultAllPeladas
    .filter(function(p) { return resultPeladasSelecionadas.indexOf(p.id) > -1; })
    .slice()
    .sort(function(a, b) { return (a.data || '').localeCompare(b.data || ''); });

  if (selPeladas.length === 0) return null;

  var golsByPelada = {};
  var partidasByPelada = {};

  gols.forEach(function(g) {
    if (!golsByPelada[g.pelada_id]) golsByPelada[g.pelada_id] = [];
    golsByPelada[g.pelada_id].push(g);
  });

  partidas.forEach(function(p) {
    if (!partidasByPelada[p.pelada_id]) partidasByPelada[p.pelada_id] = [];
    partidasByPelada[p.pelada_id].push(p);
  });

  var allNames = {};
  presenca.forEach(function(pr) { allNames[pr.jogador] = true; });
  gols.forEach(function(g) { allNames[g.jogador] = true; });
  partidas.forEach(function(p) {
    if (p.time_a) p.time_a.forEach(function(n) { if (n) allNames[n.trim()] = true; });
    if (p.time_b) p.time_b.forEach(function(n) { if (n) allNames[n.trim()] = true; });
  });

  var playerNames = Object.keys(allNames);

  var cumMap = {};
  playerNames.forEach(function(name) {
    cumMap[name] = new Array(selPeladas.length).fill(0);
  });

  selPeladas.forEach(function(pelada, idx) {
    var pg = golsByPelada[pelada.id] || [];
    var pp = partidasByPelada[pelada.id] || [];
    var earned = {};

    pg.forEach(function(g) {
      if (!earned[g.jogador]) earned[g.jogador] = 0;
      earned[g.jogador] += g.gol_contra ? -1 : 1;
    });

    pp.forEach(function(p) {
      if (!p.vencedor || p.vencedor === 'Empate' || p.vencedor === '') return;
      var tw = p.vencedor === 'A' ? p.time_a : p.time_b;
      if (tw) tw.forEach(function(n) {
        if (!n) return;
        var nome = n.trim();
        if (!earned[nome]) earned[nome] = 0;
        earned[nome] += 3;
      });
    });

    playerNames.forEach(function(name) {
      var prev = idx > 0 ? cumMap[name][idx - 1] : 0;
      cumMap[name][idx] = prev + (earned[name] || 0);
    });
  });

  var series = playerNames.map(function(name) {
    var vals = cumMap[name];
    return {
      name: name,
      displayName: dn(name),
      values: vals,
      finalPts: vals[vals.length - 1]
    };
  });

  series = series.filter(function(s) {
    return s.values.some(function(v) { return v !== 0; });
  });

  series.sort(function(a, b) {
    if (b.finalPts !== a.finalPts) return b.finalPts - a.finalPts;
    return (a.name || '').localeCompare(b.name || '');
  });

  for (var i = 0; i < series.length; i++) {
    series[i].color = i < EVO_COLORS.length ? EVO_COLORS[i] : null;
    series[i].rank = i + 1;
  }

  series.forEach(function(s) { s.values.unshift(0); });

  var labels = ['0'];
  selPeladas.forEach(function(p) {
    try {
      var d = new Date(p.data + 'T12:00:00');
      labels.push(String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'));
    } catch (e) {
      labels.push('P' + labels.length);
    }
  });

  var maxPts = 0;
  series.forEach(function(s) {
    s.values.forEach(function(v) { if (v > maxPts) maxPts = v; });
  });

  return {
    labels: labels,
    series: series,
    maxPts: maxPts,
    numPeladas: labels.length
  };
}

// ============================================================
// DETECT WHICH FILTER BUTTON MATCHES CURRENT SELECTION
// ============================================================
function detectActiveFilter(data) {
  if (!data || data.series.length === 0) return '';

  var highlighted = {};
  var count = 0;
  data.series.forEach(function(s, i) {
    if (isPlayerHighlighted(s.name, i)) {
      highlighted[s.name] = true;
      count++;
    }
  });

  var total = data.series.length;

  if (count === 0) return 'nenhum';
  if (count === total) return 'todos';

  var top5n = Math.min(evoDefaultTop, total);
  if (count === top5n) {
    var isTop5 = true;
    for (var t = 0; t < top5n; t++) {
      if (!highlighted[data.series[t].name]) { isTop5 = false; break; }
    }
    if (isTop5) return 'top5';
  }

  if (evoMensalistas.length > 0) {
    var mensaisInChart = [];
    data.series.forEach(function(s) {
      if (evoMensalistas.indexOf(s.name) > -1) mensaisInChart.push(s.name);
    });
    if (mensaisInChart.length > 0 && count === mensaisInChart.length) {
      var allMatch = true;
      for (var m = 0; m < mensaisInChart.length; m++) {
        if (!highlighted[mensaisInChart[m]]) { allMatch = false; break; }
      }
      if (allMatch) return 'mensais';
    }
  }

  return '';
}

// ============================================================
// LEGEND + FILTER BUTTONS
// ============================================================
function renderEvoLegend(data) {
  var wrap = $('evoLegendWrap');
  if (!wrap) return;

  var af = detectActiveFilter(data);
  var h = '';

  h += '<div class="evo-filter-row">';
  h += '<button class="evo-filter-btn' + (af === 'todos' ? ' evo-f-on' : '') + '" onclick="evoFilterTodos()">Todos</button>';
  h += '<button class="evo-filter-btn' + (af === 'top5' ? ' evo-f-on' : '') + '" onclick="evoFilterTop5()">Top 5</button>';
  h += '<button class="evo-filter-btn' + (af === 'nenhum' ? ' evo-f-on' : '') + '" onclick="evoFilterNenhum()">Nenhum</button>';
  if (evoMensalistas.length > 0) {
    h += '<button class="evo-filter-btn evo-filter-mensal' + (af === 'mensais' ? ' evo-f-mensal-on' : '') + '" onclick="evoFilterMensais()">Mensais</button>';
  }
  h += '</div>';

  h += '<div class="evo-legend-scroll">';
  data.series.forEach(function(s, i) {
    var isActive = isPlayerHighlighted(s.name, i);
    var chipColor = isActive ? (s.color || EVO_COLORS[i % EVO_COLORS.length]) : 'var(--text3)';
    var chipClass = 'evo-chip' + (isActive ? ' evo-chip-on' : '');
    h += '<button class="' + chipClass + '" data-player="' + s.name.replace(/"/g, '&quot;') + '" data-idx="' + i + '" onclick="toggleEvoPlayer(this)" style="--chip-color:' + chipColor + ';">';
    h += '<span class="evo-chip-dot" style="background:' + chipColor + ';"></span>';
    h += '<span class="evo-chip-name">' + s.displayName + '</span>';
    h += '<span class="evo-chip-pts">' + s.finalPts + '</span>';
    h += '</button>';
  });
  h += '</div>';
  wrap.innerHTML = h;
}

function isPlayerHighlighted(name, idx) {
  if (evoManualMode) {
    return !!evoHighlighted[name];
  }
  return idx < evoDefaultTop;
}

function evoFilterTodos() {
  evoManualMode = true;
  evoHighlighted = {};
  if (evoChartData) {
    evoChartData.series.forEach(function(s) { evoHighlighted[s.name] = true; });
  }
  renderEvoLegend(evoChartData);
  drawEvoChart();
}

function evoFilterTop5() {
  evoManualMode = true;
  evoHighlighted = {};
  if (evoChartData) {
    var n = Math.min(evoDefaultTop, evoChartData.series.length);
    for (var i = 0; i < n; i++) {
      evoHighlighted[evoChartData.series[i].name] = true;
    }
  }
  renderEvoLegend(evoChartData);
  drawEvoChart();
}

function evoFilterNenhum() {
  evoManualMode = true;
  evoHighlighted = {};
  renderEvoLegend(evoChartData);
  drawEvoChart();
}

function evoFilterMensais() {
  evoManualMode = true;
  evoHighlighted = {};
  if (evoChartData) {
    evoChartData.series.forEach(function(s) {
      if (evoMensalistas.indexOf(s.name) > -1) {
        evoHighlighted[s.name] = true;
      }
    });
  }
  renderEvoLegend(evoChartData);
  drawEvoChart();
}

function toggleEvoPlayer(btn) {
  var name = btn.getAttribute('data-player');

  if (!evoManualMode) {
    evoManualMode = true;
    evoHighlighted = {};
    if (evoChartData) {
      evoChartData.series.forEach(function(s, i) {
        if (i < evoDefaultTop) evoHighlighted[s.name] = true;
      });
    }
  }

  if (evoHighlighted[name]) {
    delete evoHighlighted[name];
  } else {
    evoHighlighted[name] = true;
  }

  renderEvoLegend(evoChartData);
  drawEvoChart();
}

// ============================================================
// CANVAS DRAWING
// ============================================================
function drawEvoChart() {
  var wrap = $('evoCanvasWrap');
  var canvas = $('evoCanvas');
  if (!wrap || !canvas || !evoChartData) return;

  var data = evoChartData;
  var W = wrap.clientWidth;
  var H = Math.min(360, Math.max(280, W * 0.8));
  var dpr = window.devicePixelRatio || 1;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  evoCanvas = canvas;
  evoCtx = ctx;

  var isLight = document.documentElement.classList.contains('light');
  var gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  var axisTextColor = '#64748b';
  var mutedLineColor = isLight ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.12)';

  var ML = 34, MR = 62, MT = 16, MB = 32;
  var plotW = W - ML - MR;
  var plotH = H - MT - MB;

  var maxY = data.maxPts || 10;
  var yStep = calcYStep(maxY);
  var yMax = Math.ceil(maxY / yStep) * yStep;
  if (yMax === 0) yMax = 10;

  var numP = data.numPeladas;

  function xPos(i) {
    if (numP <= 1) return ML + plotW / 2;
    return ML + (i / (numP - 1)) * plotW;
  }
  function yPos(v) {
    return MT + plotH - (v / yMax) * plotH;
  }

  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for (var g = 0; g <= yMax; g += yStep) {
    var gy = Math.round(yPos(g)) + 0.5;
    ctx.beginPath(); ctx.moveTo(ML, gy); ctx.lineTo(W - MR, gy); ctx.stroke();
  }

  ctx.font = '10px "DM Sans", sans-serif';
  ctx.fillStyle = axisTextColor;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (var g2 = 0; g2 <= yMax; g2 += yStep) {
    ctx.fillText(String(g2), ML - 6, yPos(g2));
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  var labelInterval = numP > 14 ? 3 : numP > 8 ? 2 : 1;
  for (var xi = 0; xi < numP; xi++) {
    if (xi % labelInterval === 0 || xi === numP - 1) {
      ctx.fillText(data.labels[xi], xPos(xi), MT + plotH + 8);
    }
  }

  data.series.forEach(function(s, idx) {
    if (isPlayerHighlighted(s.name, idx)) return;
    drawLine(ctx, s.values, xPos, yPos, mutedLineColor, 1.2);
  });

  var endpointLabels = [];
  data.series.forEach(function(s, idx) {
    if (!isPlayerHighlighted(s.name, idx)) return;
    var color = s.color || EVO_COLORS[idx % EVO_COLORS.length];
    drawLine(ctx, s.values, xPos, yPos, color, 2.5);

    var ex = xPos(numP - 1);
    var ey = yPos(s.values[numP - 1]);
    ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();

    endpointLabels.push({ name: s.displayName, pts: s.finalPts, y: ey, color: color });
  });

  resolveOverlaps(endpointLabels, 13);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  endpointLabels.forEach(function(lbl) {
    ctx.font = '600 10px "DM Sans", sans-serif';
    ctx.fillStyle = lbl.color;
    ctx.fillText(truncateName(lbl.name, 7) + ' ' + lbl.pts, xPos(numP - 1) + 8, lbl.y);
  });

  setupChartTouchHandler(canvas, data, xPos, yPos);
}

function drawLine(ctx, values, xPos, yPos, color, width) {
  if (values.length === 0) return;
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
  for (var i = 0; i < values.length; i++) {
    if (i === 0) ctx.moveTo(xPos(i), yPos(values[i]));
    else ctx.lineTo(xPos(i), yPos(values[i]));
  }
  ctx.stroke();
}

function calcYStep(maxVal) {
  if (maxVal <= 10) return 2;
  if (maxVal <= 20) return 5;
  if (maxVal <= 50) return 10;
  if (maxVal <= 100) return 20;
  return Math.ceil(maxVal / 5 / 10) * 10;
}

function resolveOverlaps(labels, minGap) {
  labels.sort(function(a, b) { return a.y - b.y; });
  for (var i = 1; i < labels.length; i++) {
    var overlap = labels[i - 1].y + minGap - labels[i].y;
    if (overlap > 0) labels[i].y = labels[i - 1].y + minGap;
  }
}

function truncateName(name, maxLen) {
  if (!name) return '';
  var first = name.split(' ')[0];
  return first.length > maxLen ? first.substring(0, maxLen) : first;
}

// ============================================================
// TOUCH / CLICK INTERACTION
// ============================================================
function setupChartTouchHandler(canvas, data, xPos, yPos) {
  if (canvas._evoTouchHandler) {
    canvas.removeEventListener('click', canvas._evoTouchHandler);
  }

  var handler = function(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = e.clientX - rect.left;
    var cy = e.clientY - rect.top;

    var closest = null;
    var closestDist = 25;

    data.series.forEach(function(s) {
      for (var i = 0; i < data.numPeladas; i++) {
        var lx = xPos(i);
        var ly = yPos(s.values[i]);
        var dist = Math.sqrt((cx - lx) * (cx - lx) + (cy - ly) * (cy - ly));
        if (dist < closestDist) { closestDist = dist; closest = s; }
      }
    });

    if (closest) {
      if (!evoManualMode) {
        evoManualMode = true;
        evoHighlighted = {};
        evoChartData.series.forEach(function(s, i) {
          if (i < evoDefaultTop) evoHighlighted[s.name] = true;
        });
      }

      if (evoHighlighted[closest.name]) delete evoHighlighted[closest.name];
      else evoHighlighted[closest.name] = true;

      renderEvoLegend(evoChartData);
      drawEvoChart();
    }
  };

  canvas.addEventListener('click', handler);
  canvas._evoTouchHandler = handler;
}
