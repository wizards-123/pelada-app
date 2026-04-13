// ============================================================
// home.js - Página inicial: lista de peladas + detalhe
// ============================================================

var homeView = 'list'; // 'list' | 'detail'
var homePeladaDetalhe = null;

async function loadHome() {
  homeView = 'list';
  homePeladaDetalhe = null;
  showSkeleton('homeContent');

  var { data: p } = await sb.from('peladas').select('*').eq('grupo_id', grupoAtual.id).order('criado_em', { ascending: false });
  allPeladas = p || [];
  peladaAtual = allPeladas.find(function(x) { return x.status !== 'Realizada' && x.status !== 'Encerrada'; }) || allPeladas[0] || null;

  if (allPeladas.length === 0) {
    $('homeContent').innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada agendada.</div>';
    return;
  }

  renderPeladaList();
}

// ============================================================
// LISTA DE PELADAS
// ============================================================
function renderPeladaList() {
  var el = $('homeContent');
  var h = '';

  allPeladas.forEach(function(p) {
    var df = p.data;
    try { df = new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}

    var statusBadge = '';
    var statusClass = '';
    var isAberta = (p.status !== 'Realizada' && p.status !== 'Encerrada');

    if (p.votacao_aberta) {
      statusBadge = '<span class="badge badge-green">Votação Aberta</span>';
    } else if (p.status === 'Encerrada' || p.status === 'Realizada') {
      statusBadge = '<span class="badge badge-blue">Finalizada</span>';
      statusClass = ' closed';
    } else {
      statusBadge = '<span class="badge badge-gold">Agendada</span>';
    }

    var liveIndicator = '';
    if (isAberta && (p.status === 'EmAndamento' || p.status === 'Aberta' || (!p.status || p.status === 'Agendada'))) {
      if (p.status !== 'Encerrada' && p.status !== 'Realizada') {
        liveIndicator = '<span class="realtime-dot" style="margin-left:8px;"></span>';
      }
    }

    h += '<button class="pelada-list-card' + statusClass + '" onclick="onPeladaClick(\'' + p.id + '\')">';
    h += '<div class="pelada-list-top">';
    h += '<div class="pelada-list-name">' + peladaLabel(p) + liveIndicator + '</div>';
    h += statusBadge;
    h += '</div>';
    h += '<div class="pelada-list-info">';
    h += '<span class="pelada-list-date">📅 ' + df + '</span>';
    h += '</div>';
    h += '</button>';
  });

  el.innerHTML = h;
}

// ============================================================
// CLICK: decide se vai para detalhe ou ao vivo
// ============================================================
function onPeladaClick(peladaId) {
  var p = allPeladas.find(function(x) { return String(x.id) === String(peladaId); });
  if (!p) return;

  // Se pelada ainda não foi encerrada/realizada -> Ao Vivo
  if (p.status !== 'Realizada' && p.status !== 'Encerrada') {
    peladaAtual = p;
    navigateTo('AoVivo');
    return;
  }

  // Pelada passada -> detalhe
  homePeladaDetalhe = p;
  homeView = 'detail';
  loadPeladaDetalhe(p);
}

// ============================================================
// DETALHE DA PELADA
// ============================================================
async function loadPeladaDetalhe(p) {
  var el = $('homeContent');
  el.innerHTML = '<div class="skeleton"></div>';

  // Buscar partidas, gols e votos em paralelo
  var pId = p.id;
  var results = await Promise.all([
    sb.from('partidas').select('*').eq('pelada_id', pId).eq('grupo_id', grupoAtual.id).eq('status', 'Finalizada').order('numero'),
    sb.from('gols').select('*').eq('pelada_id', pId).eq('grupo_id', grupoAtual.id),
    sb.from('votos').select('*').eq('pelada_id', pId).eq('grupo_id', grupoAtual.id)
  ]);

  var partidas = results[0].data || [];
  var gols = results[1].data || [];
  var votos = results[2].data || [];

  renderPeladaDetalhe(p, partidas, gols, votos);
}

function renderPeladaDetalhe(p, partidas, gols, votos) {
  var el = $('homeContent');
  var df = p.data;
  try { df = new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}

  var h = '';

  // Botão voltar
  h += '<button class="pelada-back-btn" onclick="loadHome()">← Voltar</button>';

  // Header
  h += '<div class="pelada-detail-header">';
  h += '<div class="pelada-detail-title">' + peladaLabel(p) + '</div>';
  h += '<div class="pelada-detail-date">📅 ' + df + '</div>';
  h += '</div>';

  // Partidas
  if (partidas.length > 0) {
    h += '<div class="card"><div class="card-title">⚽ Partidas</div>';
    partidas.forEach(function(pt) {
      var golsA = gols.filter(function(g) {
        return g.partida_id === pt.partida_id && (
          (g.time === 'A' && !g.gol_contra) || (g.time === 'B' && g.gol_contra)
        );
      });
      var golsB = gols.filter(function(g) {
        return g.partida_id === pt.partida_id && (
          (g.time === 'B' && !g.gol_contra) || (g.time === 'A' && g.gol_contra)
        );
      });

      var vl = pt.vencedor === 'A' ? '🔵 A venceu' : (pt.vencedor === 'B' ? '🟠 B venceu' : '🤝 Empate');

      h += '<div class="partida-card">';
      h += '<div class="partida-header">Partida ' + pt.numero + ' <span class="text-muted" style="font-weight:400;">' + vl + '</span></div>';
      h += '<div class="partida-placar">';
      h += '<div class="partida-time partida-time-a"><span class="partida-time-label">🔵 A</span><span class="partida-score">' + pt.placar_a + '</span></div>';
      h += '<span class="partida-x">×</span>';
      h += '<div class="partida-time partida-time-b"><span class="partida-score">' + pt.placar_b + '</span><span class="partida-time-label">B 🟠</span></div>';
      h += '</div>';

      // Gols do jogo
      var golsPartida = gols.filter(function(g) { return g.partida_id === pt.partida_id; });
      if (golsPartida.length > 0) {
        h += '<div class="partida-gols">';
        golsPartida.forEach(function(g) {
          var tc = g.time === 'A' ? 'var(--blue)' : 'var(--orange)';
          var lb = g.gol_contra ? '🔄 ' + dn(g.jogador) + ' (GC)' : '⚽ ' + dn(g.jogador);
          h += '<div class="partida-gol-item" style="color:' + tc + '">' + lb + '</div>';
        });
        h += '</div>';
      }
      h += '</div>';
    });
    h += '</div>';
  } else {
    h += '<div class="card"><div class="card-title">⚽ Partidas</div><div class="text-muted">Nenhuma partida registrada.</div></div>';
  }

  // Seleção da Pelada (campo de futebol)
  var selecao = calcSelecaoPelada(votos);
  h += renderCampoSelecao(selecao);

  el.innerHTML = h;
}

// ============================================================
// CÁLCULO DA SELEÇÃO
// ============================================================
function calcSelecaoPelada(votos) {
  // Goleiro: top 1 votado em 'Goleiro'
  var goleiroCount = {};
  var selecaoCount = {};

  votos.forEach(function(v) {
    if (v.premio === 'Goleiro') {
      goleiroCount[v.votado] = (goleiroCount[v.votado] || 0) + 1;
    }
    if (v.premio === 'Selecao') {
      selecaoCount[v.votado] = (selecaoCount[v.votado] || 0) + 1;
    }
  });

  // Goleiro: pegar o com mais votos (em caso de empate, pegar o primeiro da lista, que já vem na ordem do banco)
  var goleiroSorted = Object.keys(goleiroCount).map(function(n) {
    return { nome: n, votos: goleiroCount[n] };
  }).sort(function(a, b) { return b.votos - a.votos || a.nome.localeCompare(b.nome); });

  var goleiro = goleiroSorted.length > 0 ? goleiroSorted[0].nome : null;

  // Seleção: top 4 votados em 'Selecao'
  var selecaoSorted = Object.keys(selecaoCount).map(function(n) {
    return { nome: n, votos: selecaoCount[n] };
  }).sort(function(a, b) { return b.votos - a.votos || a.nome.localeCompare(b.nome); });

  var selecao = [];
  for (var i = 0; i < Math.min(4, selecaoSorted.length); i++) {
    selecao.push(selecaoSorted[i].nome);
  }

  return { goleiro: goleiro, jogadores: selecao };
}

// ============================================================
// RENDERIZAR CAMPO COM SELEÇÃO (SVG)
// ============================================================
function renderCampoSelecao(selecao) {
  if (!selecao.goleiro && selecao.jogadores.length === 0) {
    return '<div class="card"><div class="card-title">🏅 Seleção da Pelada</div><div class="text-muted">Sem votos suficientes.</div></div>';
  }

  // Posições no campo (losango): 
  // Goleiro: embaixo (gol)
  // Zagueiro: centro-baixo
  // Meias: esquerda e direita no meio
  // Atacante: centro-topo

  // Nomes truncados para caber nos círculos
  function shortName(n) {
    if (!n) return '';
    var d = dn(n);
    if (d.length <= 10) return d;
    return d.substring(0, 9) + '…';
  }

  var goleiro = selecao.goleiro;
  var j = selecao.jogadores;

  // SVG positions (viewBox 0 0 360 500)
  // Goleiro: bottom center
  // Losango: atacante (top), meia-esq, meia-dir, zagueiro
  var positions = [
    { x: 180, y: 120, nome: j[0] || null },  // Atacante (top do losango)
    { x: 90,  y: 230, nome: j[1] || null },   // Meia esquerda
    { x: 270, y: 230, nome: j[2] || null },   // Meia direita
    { x: 180, y: 330, nome: j[3] || null },   // Zagueiro (bottom do losango)
  ];

  var goleiroPos = { x: 180, y: 435, nome: goleiro };

  var h = '<div class="card"><div class="card-title">🏅 Seleção da Pelada</div>';
  h += '<div class="campo-wrapper">';
  h += '<svg viewBox="0 0 360 500" xmlns="http://www.w3.org/2000/svg" class="campo-svg">';

  // Campo de futebol (fundo verde com linhas)
  // Fundo
  h += '<defs>';
  h += '<pattern id="grassStripes" patternUnits="userSpaceOnUse" width="30" height="500">';
  h += '<rect width="15" height="500" fill="var(--campo-green1)"/>';
  h += '<rect x="15" width="15" height="500" fill="var(--campo-green2)"/>';
  h += '</pattern>';
  h += '</defs>';

  h += '<rect width="360" height="500" rx="12" fill="url(#grassStripes)"/>';

  // Linhas do campo
  var lc = 'var(--campo-line)';
  var lw = '1.5';

  // Borda do campo
  h += '<rect x="20" y="20" width="320" height="460" rx="0" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  // Linha do meio
  h += '<line x1="20" y1="250" x2="340" y2="250" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  // Círculo central
  h += '<circle cx="180" cy="250" r="45" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<circle cx="180" cy="250" r="3" fill="' + lc + '"/>';

  // Área grande de cima
  h += '<rect x="90" y="20" width="180" height="70" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  // Área pequena de cima
  h += '<rect x="130" y="20" width="100" height="30" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  // Meia-lua de cima
  h += '<path d="M 140 90 Q 180 115 220 90" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  // Pênalti de cima
  h += '<circle cx="180" cy="65" r="2" fill="' + lc + '"/>';

  // Área grande de baixo
  h += '<rect x="90" y="410" width="180" height="70" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  // Área pequena de baixo
  h += '<rect x="130" y="450" width="100" height="30" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  // Meia-lua de baixo
  h += '<path d="M 140 410 Q 180 385 220 410" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  // Pênalti de baixo
  h += '<circle cx="180" cy="435" r="2" fill="' + lc + '"/>';

  // Escanteios
  h += '<path d="M 20 28 Q 28 28 28 20" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<path d="M 332 20 Q 332 28 340 28" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<path d="M 20 472 Q 28 472 28 480" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<path d="M 332 480 Q 332 472 340 472" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';

  // Jogadores (círculos + nomes)
  function renderPlayer(px, py, nome, isGK) {
    if (!nome) return '';
    var r = 28;
    var s = '';
    var cls = isGK ? 'campo-player-gk' : 'campo-player';
    s += '<circle cx="' + px + '" cy="' + py + '" r="' + r + '" class="' + cls + '"/>';
    s += '<text x="' + px + '" y="' + (py + 1) + '" class="campo-player-text" text-anchor="middle" dominant-baseline="middle">' + shortName(nome) + '</text>';
    return s;
  }

  // Render jogadores do losango
  positions.forEach(function(pos) {
    h += renderPlayer(pos.x, pos.y, pos.nome, false);
  });

  // Render goleiro
  h += renderPlayer(goleiroPos.x, goleiroPos.y, goleiroPos.nome, true);

  h += '</svg>';
  h += '</div></div>';

  return h;
}
