// ============================================================
// resultados.js - Ranking, votações, filtro multi-pelada
// ============================================================

var resultPeladasSelecionadas = [];
var resultAllPeladas = [];
var resultCurrentTab = 'votacoes';
var resultRankingSortCol = 'pts';
var resultRankingSortDir = 'desc';
var resultCachedData = null;
var resultDropdownOpen = false;

async function loadResultados() {
  showSkeleton('resultadosSemana');
  $('resultadosGeral').style.display = 'none';
  $('resultadosArtilharia').style.display = 'none';
  $('resultadosVitorias').style.display = 'none';

  // Buscar todas as peladas do grupo
  var { data: allP } = await sb.from('peladas').select('*').eq('grupo_id', grupoAtual.id).order('data', { ascending: false });
  resultAllPeladas = allP || [];

  // Inicializar: todas selecionadas
  if (resultPeladasSelecionadas.length === 0) {
    resultPeladasSelecionadas = resultAllPeladas.map(function(p) { return p.id; });
  }

  // Renderizar estrutura
  renderResultadosShell();
  await refreshResultadosData();
}

function renderResultadosShell() {
  var el = $('resultadosSemana');
  el.style.display = 'block';

  // Dropdown de peladas
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

  // Tabs
  var tabsHtml = '<div class="tabs" id="resultTabs">';
  tabsHtml += '<button class="tab' + (resultCurrentTab === 'votacoes' ? ' active' : '') + '" onclick="switchResultTab(\'votacoes\')">Votações</button>';
  tabsHtml += '<button class="tab' + (resultCurrentTab === 'ranking' ? ' active' : '') + '" onclick="switchResultTab(\'ranking\')">Ranking</button>';
  tabsHtml += '</div>';

  el.innerHTML = ddHtml + tabsHtml +
    '<div id="resultTabVotacoes"' + (resultCurrentTab !== 'votacoes' ? ' style="display:none;"' : '') + '></div>' +
    '<div id="resultTabRanking"' + (resultCurrentTab !== 'ranking' ? ' style="display:none;"' : '') + '></div>';
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

// Fechar dropdown ao clicar fora
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

function switchResultTab(t) {
  resultCurrentTab = t;
  document.querySelectorAll('#resultTabs .tab').forEach(function(tb) { tb.classList.remove('active'); });
  if (t === 'votacoes') {
    document.querySelectorAll('#resultTabs .tab')[0].classList.add('active');
    $('resultTabVotacoes').style.display = 'block';
    $('resultTabRanking').style.display = 'none';
  } else {
    document.querySelectorAll('#resultTabs .tab')[1].classList.add('active');
    $('resultTabVotacoes').style.display = 'none';
    $('resultTabRanking').style.display = 'block';
  }
}

// ============================================================
// DATA FETCHING
// ============================================================
async function refreshResultadosData() {
  if (resultPeladasSelecionadas.length === 0) {
    $('resultTabVotacoes').innerHTML = '<div class="empty-state"><span class="emoji">🔍</span>Selecione ao menos 1 pelada.</div>';
    $('resultTabRanking').innerHTML = '<div class="empty-state"><span class="emoji">🔍</span>Selecione ao menos 1 pelada.</div>';
    return;
  }

  // Fetch all needed data in parallel
  var pIds = resultPeladasSelecionadas;

  var votosPromise = sb.from('votos').select('*').eq('grupo_id', grupoAtual.id).in('pelada_id', pIds);
  var golsPromise = sb.from('gols').select('*').eq('grupo_id', grupoAtual.id).in('pelada_id', pIds).eq('gol_contra', false);
  var partidasPromise = sb.from('partidas').select('*').eq('grupo_id', grupoAtual.id).in('pelada_id', pIds).eq('status', 'Finalizada');
  var presencaPromise = sb.from('presenca').select('*').eq('grupo_id', grupoAtual.id).in('pelada_id', pIds);

  var results = await Promise.all([votosPromise, golsPromise, partidasPromise, presencaPromise]);
  var votos = results[0].data || [];
  var gols = results[1].data || [];
  var partidas = results[2].data || [];
  var presenca = results[3].data || [];

  resultCachedData = { votos: votos, gols: gols, partidas: partidas, presenca: presenca };

  renderVotacoesTab(votos);
  renderRankingTab(votos, gols, partidas, presenca);
}

// ============================================================
// VOTAÇÕES TAB
// ============================================================
function renderVotacoesTab(votos) {
  var ranking = buildRanking(votos);
  var pc = [
    { key: 'Goleiro', emoji: '🧤' },
    { key: 'MVP', emoji: '⭐' },
    { key: 'Selecao', emoji: '🏅' },
    { key: 'Decepcao', emoji: '😞' },
    { key: 'Revelacao', emoji: '🌟' }
  ];
  var h = '';
  pc.forEach(function(c) {
    var rk = ranking[c.key] || [];
    h += '<div class="card"><div class="card-title">' + c.emoji + ' ' + c.key + '</div>';
    if (rk.length === 0) h += '<div class="text-muted">Sem votos.</div>';
    else {
      h += '<ul class="ranking-list">';
      for (var r = 0; r < rk.length && r < 10; r++) {
        var ps = r === 0 ? 'gold' : r === 1 ? 'silver' : r === 2 ? 'bronze' : 'normal';
        h += '<li class="ranking-item"><div class="ranking-pos ' + ps + '">' + (r + 1) + '</div><div class="ranking-name">' + dn(rk[r].nome) + '</div><div class="ranking-votes">' + rk[r].votos + '</div></li>';
      }
      h += '</ul>';
    }
    h += '</div>';
  });

  // Votos detalhados (ADM)
  if (isAdm) {
    h += '<div class="card mt16"><div class="card-title">🔍 Votos Detalhados (ADM)</div>';
    if (votos.length === 0) {
      h += '<div class="text-muted">Nenhum voto.</div>';
    } else {
      h += '<div style="overflow-x:auto;"><table class="log-table"><tr><th>Pelada</th><th>Votante</th><th>Prêmio</th><th>Votado</th></tr>';
      votos.forEach(function(x) {
        h += '<tr><td>' + x.pelada_id + '</td><td>' + dn(x.votante) + '</td><td>' + x.premio + '</td><td>' + dn(x.votado) + '</td></tr>';
      });
      h += '</table></div>';
    }
    h += '</div>';
  }

  $('resultTabVotacoes').innerHTML = h;
}

function buildRanking(v) {
  var pr = ['Goleiro', 'MVP', 'Selecao', 'Decepcao', 'Revelacao'], r = {};
  pr.forEach(function(p) {
    var c = {};
    v.forEach(function(x) { if (x.premio === p) c[x.votado] = (c[x.votado] || 0) + 1; });
    r[p] = Object.keys(c).map(function(n) { return { nome: n, votos: c[n] }; }).sort(function(a, b) { return b.votos - a.votos; });
  });
  return r;
}

// ============================================================
// RANKING TAB
// ============================================================
function renderRankingTab(votos, gols, partidas, presenca) {
  var players = buildPlayerStats(votos, gols, partidas, presenca);
  sortPlayers(players);

  var h = '<div class="card" style="padding:12px;overflow-x:auto;">';
  h += '<table class="ranking-table" id="rankingTable">';
  h += '<thead><tr>';

  var cols = [
    { key: 'rank', label: '#', sortable: false },
    { key: 'nome', label: 'Nome', sortable: true },
    { key: 'pts', label: 'Pts', sortable: true },
    { key: 'gols', label: 'Gols', sortable: true },
    { key: 'vitorias', label: 'Vit', sortable: true },
    { key: 'peladas', label: 'Pel', sortable: true },
    { key: 'mvp', label: 'MVP', sortable: true },
    { key: 'selecao', label: 'Sel', sortable: true },
    { key: 'goleiro', label: 'Gol', sortable: true },
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
    h += '<td class="rt-td rt-num">' + p.vitorias + '</td>';
    h += '<td class="rt-td rt-num">' + p.peladas + '</td>';
    h += '<td class="rt-td rt-num">' + p.mvp + '</td>';
    h += '<td class="rt-td rt-num">' + p.selecao + '</td>';
    h += '<td class="rt-td rt-num">' + p.goleiro + '</td>';
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

function buildPlayerStats(votos, gols, partidas, presenca) {
  var map = {};

  // Helper: garante que jogador existe no map
  function ensure(nome) {
    if (!map[nome]) {
      map[nome] = { nome: nome, pts: 0, gols: 0, vitorias: 0, peladas: 0, mvp: 0, selecao: 0, goleiro: 0, peladaSet: {} };
    }
  }

  // 1. Presença (para contar peladas por jogador)
  presenca.forEach(function(pr) {
    ensure(pr.jogador);
    map[pr.jogador].peladaSet[pr.pelada_id] = true;
  });

  // 2. Gols (já filtrados para gol_contra === false)
  gols.forEach(function(g) {
    ensure(g.jogador);
    map[g.jogador].gols += 1;
    map[g.jogador].peladaSet[g.pelada_id] = true;
  });

  // 3. Vitórias
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

  // 4. Prêmios por pelada (MVP, Seleção, Goleiro)
  //    Agrupar votos por pelada e prêmio, calcular vencedores
  var votosPorPelada = {};
  votos.forEach(function(v) {
    var k = v.pelada_id;
    if (!votosPorPelada[k]) votosPorPelada[k] = [];
    votosPorPelada[k].push(v);
  });

  Object.keys(votosPorPelada).forEach(function(peladaId) {
    var pv = votosPorPelada[peladaId];

    // MVP: 1° colocado(s) em votos
    var mvpWinners = getWinners(pv, 'MVP', 1);
    mvpWinners.forEach(function(n) { ensure(n); map[n].mvp += 1; });

    // Goleiro: 1° colocado(s) em votos
    var golWinners = getWinners(pv, 'Goleiro', 1);
    golWinners.forEach(function(n) { ensure(n); map[n].goleiro += 1; });

    // Seleção: top 4 (com empate no corte)
    var selWinners = getWinners(pv, 'Selecao', 4);
    selWinners.forEach(function(n) { ensure(n); map[n].selecao += 1; });
  });

  // Calcular campos derivados
  var players = Object.keys(map).map(function(nome) {
    var p = map[nome];
    p.peladas = Object.keys(p.peladaSet).length;
    p.pts = p.gols * 1 + p.vitorias * 3;
    p.ptsPelada = p.peladas > 0 ? (p.pts / p.peladas).toFixed(1) : '0.0';
    p.golsPelada = p.peladas > 0 ? (p.gols / p.peladas).toFixed(1) : '0.0';
    p.vitPelada = p.peladas > 0 ? (p.vitorias / p.peladas).toFixed(1) : '0.0';
    return p;
  });

  return players;
}

// Retorna nomes dos vencedores de um prêmio numa pelada
// topN: quantos "slots" (1 para MVP/Goleiro, 4 para Seleção)
// Em caso de empate no corte, todos os empatados entram
function getWinners(votosArr, premio, topN) {
  var contagem = {};
  votosArr.forEach(function(v) {
    if (v.premio === premio) contagem[v.votado] = (contagem[v.votado] || 0) + 1;
  });
  var sorted = Object.keys(contagem).map(function(n) {
    return { nome: n, votos: contagem[n] };
  }).sort(function(a, b) { return b.votos - a.votos; });

  if (sorted.length === 0) return [];

  var winners = [];
  var slotsFilled = 0;
  var i = 0;
  while (i < sorted.length && slotsFilled < topN) {
    var currentVotes = sorted[i].votos;
    // Pega todos com esse mesmo número de votos
    var tiedGroup = [];
    while (i < sorted.length && sorted[i].votos === currentVotes) {
      tiedGroup.push(sorted[i].nome);
      i++;
    }
    // Se ainda cabe no topN OU se estamos no corte e há empate
    winners = winners.concat(tiedGroup);
    slotsFilled += tiedGroup.length;
  }

  return winners;
}

function sortRankingBy(col) {
  if (resultRankingSortCol === col) {
    resultRankingSortDir = resultRankingSortDir === 'desc' ? 'asc' : 'desc';
  } else {
    resultRankingSortCol = col;
    resultRankingSortDir = col === 'nome' ? 'asc' : 'desc';
  }
  if (resultCachedData) {
    renderRankingTab(resultCachedData.votos, resultCachedData.gols, resultCachedData.partidas, resultCachedData.presenca);
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

    // Numérico (incluindo strings como "1.5")
    va = parseFloat(a[col]) || 0;
    vb = parseFloat(b[col]) || 0;
    if (va !== vb) return dir === 'desc' ? vb - va : va - vb;

    // Desempate: pts > gols > mvp > selecao
    var tiebreakers = ['pts', 'gols', 'mvp', 'selecao'];
    for (var i = 0; i < tiebreakers.length; i++) {
      var tk = tiebreakers[i];
      if (tk === col) continue;
      var ta = parseFloat(a[tk]) || 0;
      var tb = parseFloat(b[tk]) || 0;
      if (ta !== tb) return tb - ta; // desempate sempre desc
    }
    return 0;
  });
}
