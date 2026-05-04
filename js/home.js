// ============================================================
// home.js - Página inicial: lista de peladas + detalhe
// ============================================================

var homeView = 'list';
var homePeladaDetalhe = null;

async function loadHome() {
  homeView = 'list';
  homePeladaDetalhe = null;
  showSkeleton('homeContent');

  // Buscar apenas peladas ativas
  var { data: p } = await sb.from('peladas').select('*').eq('grupo_id', grupoAtual.id).neq('ativa', false).order('criado_em', { ascending: false });
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
    if (isAberta) {
      liveIndicator = '<span class="realtime-dot" style="margin-left:8px;"></span>';
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

  if (p.status !== 'Realizada' && p.status !== 'Encerrada') {
    peladaAtual = p;
    navigateTo('AoVivo');
    return;
  }

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

  var pId = p.id;
  var results = await Promise.all([
    sb.from('partidas').select('*').eq('pelada_id', pId).eq('grupo_id', grupoAtual.id).eq('status', 'Finalizada').order('numero'),
    sb.from('gols').select('*').eq('pelada_id', pId).eq('grupo_id', grupoAtual.id),
    sb.from('votos').select('*').eq('pelada_id', pId).eq('grupo_id', grupoAtual.id)
  ]);

  var partidas = results[0].data || [];
  var gols = results[1].data || [];
  var votos = results[2].data || [];

  votos = votos.filter(function(v) {
    return v.premio === 'Goleiro' || v.premio === 'MVP' || v.premio === 'Selecao';
  });

  renderPeladaDetalhe(p, partidas, gols, votos);
}

function renderPeladaDetalhe(p, partidas, gols, votos) {
  var el = $('homeContent');
  var df = p.data;
  try { df = new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}

  var h = '';

  h += '<button class="pelada-back-btn" onclick="loadHome()">← Voltar</button>';

  h += '<div class="pelada-detail-header">';
  h += '<div class="pelada-detail-title">' + peladaLabel(p) + '</div>';
  h += '<div class="pelada-detail-date">📅 ' + df + '</div>';
  h += '</div>';

  // Partidas
  if (partidas.length > 0) {
    h += '<div class="card"><div class="card-title">⚽ Partidas</div>';
    partidas.forEach(function(pt, idx) {
      var isLast = idx === partidas.length - 1;
      var golsPartida = gols.filter(function(g) { return g.partida_id === pt.partida_id; });

      var golsCountA = {};
      var golsCountB = {};
      golsPartida.forEach(function(g) {
        if ((g.time === 'A' && !g.gol_contra) || (g.time === 'B' && g.gol_contra)) {
          golsCountA[g.jogador] = (golsCountA[g.jogador] || 0) + 1;
        } else {
          golsCountB[g.jogador] = (golsCountB[g.jogador] || 0) + 1;
        }
      });

      h += '<div class="partida-detail-block' + (isLast ? '' : ' partida-detail-border') + '">';
      h += '<div style="font-size:13px;font-weight:700;margin-bottom:12px;">Partida ' + pt.numero + '</div>';

      h += '<div class="partida-placar-row">';
      h += '<div class="partida-placar-side"><div class="partida-placar-label">🔵 Time A</div><div class="partida-placar-num partida-placar-a">' + pt.placar_a + '</div></div>';
      h += '<div class="partida-placar-x">×</div>';
      h += '<div class="partida-placar-side"><div class="partida-placar-label">Time B 🟠</div><div class="partida-placar-num partida-placar-b">' + pt.placar_b + '</div></div>';
      h += '</div>';

      h += '<div class="partida-teams-row">';

      h += '<div class="partida-team-box partida-team-box-a">';
      h += '<div class="partida-team-box-label partida-team-box-label-a">🔵 Time A</div>';
      sa(pt.time_a || []).forEach(function(n) {
        var gc = golsCountA[n] || 0;
        var balls = '';
        for (var i = 0; i < gc; i++) balls += '⚽';
        if (gc > 0) {
          h += '<div class="partida-player-row"><span>' + dn(n) + '</span><span class="partida-gol-icons">' + balls + '</span></div>';
        } else {
          h += '<div class="partida-player-row partida-player-nogol"><span>' + dn(n) + '</span></div>';
        }
      });
      h += '</div>';

      h += '<div class="partida-team-box partida-team-box-b">';
      h += '<div class="partida-team-box-label partida-team-box-label-b">🟠 Time B</div>';
      sa(pt.time_b || []).forEach(function(n) {
        var gc = golsCountB[n] || 0;
        var balls = '';
        for (var i = 0; i < gc; i++) balls += '⚽';
        if (gc > 0) {
          h += '<div class="partida-player-row"><span>' + dn(n) + '</span><span class="partida-gol-icons">' + balls + '</span></div>';
        } else {
          h += '<div class="partida-player-row partida-player-nogol"><span>' + dn(n) + '</span></div>';
        }
      });
      h += '</div>';

      h += '</div>';
      h += '</div>';
    });
    h += '</div>';
  } else {
    h += '<div class="card"><div class="card-title">⚽ Partidas</div><div class="text-muted">Nenhuma partida registrada.</div></div>';
  }

  // Seleção da Pelada
  var selecao = calcSelecaoPelada(votos);
  h += renderCampoSelecao(selecao);

  el.innerHTML = h;
}

// ============================================================
// CÁLCULO DA SELEÇÃO (goleiro + 4 seleção + MVP)
// ============================================================
function calcSelecaoPelada(votos) {
  var goleiroCount = {};
  var selecaoCount = {};
  var mvpCount = {};

  votos.forEach(function(v) {
    if (v.premio === 'Goleiro') {
      goleiroCount[v.votado] = (goleiroCount[v.votado] || 0) + 1;
    }
    if (v.premio === 'Selecao') {
      selecaoCount[v.votado] = (selecaoCount[v.votado] || 0) + 1;
    }
    if (v.premio === 'MVP') {
      mvpCount[v.votado] = (mvpCount[v.votado] || 0) + 1;
    }
  });

  var goleiroSorted = Object.keys(goleiroCount).map(function(n) {
    return { nome: n, votos: goleiroCount[n] };
  }).sort(function(a, b) { return b.votos - a.votos || a.nome.localeCompare(b.nome); });
  var goleiro = goleiroSorted.length > 0 ? goleiroSorted[0].nome : null;

  var selecaoSorted = Object.keys(selecaoCount).map(function(n) {
    return { nome: n, votos: selecaoCount[n] };
  }).sort(function(a, b) { return b.votos - a.votos || a.nome.localeCompare(b.nome); });
  var selecao = [];
  for (var i = 0; i < Math.min(4, selecaoSorted.length); i++) {
    selecao.push(selecaoSorted[i].nome);
  }

  var mvpSorted = Object.keys(mvpCount).map(function(n) {
    return { nome: n, votos: mvpCount[n] };
  }).sort(function(a, b) { return b.votos - a.votos || a.nome.localeCompare(b.nome); });
  var mvp = mvpSorted.length > 0 ? mvpSorted[0].nome : null;

  return { goleiro: goleiro, jogadores: selecao, mvp: mvp };
}

// ============================================================
// RENDERIZAR CAMPO COM SELEÇÃO (SVG)
// ============================================================
function renderCampoSelecao(selecao) {
  if (!selecao.goleiro && selecao.jogadores.length === 0) {
    return '<div class="card"><div class="card-title">🏅 Seleção da Pelada</div><div class="text-muted">Sem votos suficientes.</div></div>';
  }

  function shortName(n) {
    if (!n) return '';
    var d = dn(n);
    if (d.length <= 10) return d;
    return d.substring(0, 9) + '…';
  }

  var goleiro = selecao.goleiro;
  var mvp = selecao.mvp;
  var j = selecao.jogadores;

  var positions = [
    { x: 180, y: 110, nome: j[0] || null },
    { x: 85,  y: 220, nome: j[1] || null },
    { x: 275, y: 220, nome: j[2] || null },
    { x: 180, y: 320, nome: j[3] || null }
  ];
  var goleiroPos = { x: 180, y: 420, nome: goleiro };

  var h = '<div class="card"><div class="card-title">🏅 Seleção da Pelada</div>';
  h += '<div class="campo-wrapper">';
  h += '<svg viewBox="0 0 360 480" xmlns="http://www.w3.org/2000/svg" class="campo-svg">';

  h += '<defs>';
  h += '<pattern id="grassStripes" patternUnits="userSpaceOnUse" width="30" height="480">';
  h += '<rect width="15" height="480" fill="var(--campo-green1)"/>';
  h += '<rect x="15" width="15" height="480" fill="var(--campo-green2)"/>';
  h += '</pattern>';
  h += '<clipPath id="fieldClip"><rect width="360" height="480" rx="10"/></clipPath>';
  h += '</defs>';

  h += '<g clip-path="url(#fieldClip)">';
  h += '<rect width="360" height="480" rx="10" fill="url(#grassStripes)"/>';

  var lc = 'var(--campo-line)';
  var lw = '1.5';

  h += '<rect x="20" y="20" width="320" height="440" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<line x1="20" y1="240" x2="340" y2="240" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<circle cx="180" cy="240" r="40" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<circle cx="180" cy="240" r="2.5" fill="' + lc + '"/>';

  h += '<rect x="95" y="20" width="170" height="65" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<rect x="130" y="20" width="100" height="28" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<path d="M 140 85 Q 180 108 220 85" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';

  h += '<rect x="95" y="395" width="170" height="65" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<rect x="130" y="432" width="100" height="28" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<path d="M 140 395 Q 180 372 220 395" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';

  h += '<path d="M 20 27 Q 27 27 27 20" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<path d="M 333 20 Q 333 27 340 27" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<path d="M 20 453 Q 27 453 27 460" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';
  h += '<path d="M 333 460 Q 333 453 340 453" fill="none" stroke="' + lc + '" stroke-width="' + lw + '"/>';

  h += '</g>';

  function renderPlayer(px, py, nome, isMvp, isGK) {
    if (!nome) return '';
    var s = '<g>';
    s += '<circle cx="' + px + '" cy="' + py + '" r="26" class="campo-player"/>';
    s += '<text x="' + px + '" y="' + (py + 1) + '" class="campo-player-text" text-anchor="middle" dominant-baseline="middle">' + shortName(nome) + '</text>';

    if (isMvp) {
      var sx = px + 18;
      var sy = py - 22;
      s += '<g transform="translate(' + sx + ',' + sy + ')">';
      s += '<polygon points="12,0 14.9,8.2 23.5,8.2 16.6,13.3 19,21.5 12,16.8 5,21.5 7.4,13.3 0.5,8.2 9.1,8.2" fill="#facc15" stroke="#ca8a04" stroke-width="0.8"/>';
      s += '<text x="12" y="13.5" text-anchor="middle" dominant-baseline="middle" font-family="DM Sans, sans-serif" font-size="5.5" font-weight="700" fill="#713f12">MVP</text>';
      s += '</g>';
    }

    if (isGK) {
      var gx = px + 17;
      var gy = py - 23;
      s += '<g transform="translate(' + gx + ',' + gy + ')">';
      s += '<rect x="0" y="4" width="16" height="14" rx="3" fill="#22c55e" stroke="#16a34a" stroke-width="0.8"/>';
      s += '<rect x="1" y="0" width="3.5" height="8" rx="1.5" fill="#22c55e" stroke="#16a34a" stroke-width="0.6"/>';
      s += '<rect x="5" y="-1" width="3.5" height="9" rx="1.5" fill="#22c55e" stroke="#16a34a" stroke-width="0.6"/>';
      s += '<rect x="9" y="0" width="3.5" height="8" rx="1.5" fill="#22c55e" stroke="#16a34a" stroke-width="0.6"/>';
      s += '<rect x="12.5" y="2" width="3" height="6" rx="1.5" fill="#22c55e" stroke="#16a34a" stroke-width="0.6"/>';
      s += '<text x="8" y="14" text-anchor="middle" dominant-baseline="middle" font-family="DM Sans, sans-serif" font-size="5" font-weight="700" fill="#fff">GK</text>';
      s += '</g>';
    }

    s += '</g>';
    return s;
  }

  positions.forEach(function(pos) {
    var isMvp = pos.nome && mvp && pos.nome === mvp;
    h += renderPlayer(pos.x, pos.y, pos.nome, isMvp, false);
  });

  var gkIsMvp = goleiro && mvp && goleiro === mvp;
  h += renderPlayer(goleiroPos.x, goleiroPos.y, goleiroPos.nome, gkIsMvp, true);

  h += '</svg>';
  h += '</div></div>';

  return h;
}
