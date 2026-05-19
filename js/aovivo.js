// ============================================================
// aovivo.js - Ao Vivo, partidas, gols, realtime, substituições, sortear times
// Feature: ADM pode editar partidas finalizadas
// ============================================================

var aoVivoPresentes = [];
var teamPicks = {};
var subPendente = null;
var sorteioAtual = null;
var editingPartidaId = null; // partida sendo editada
var editTeamPicks = {};      // picks durante edição
var editGols = [];           // gols carregados durante edição
var editSubs = [];           // subs carregados durante edição

async function loadAoVivo() {
  var el = $('aoVivoContent');
  if (!peladaAtual) { el.innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada.</div>'; return; }
  showSkeleton('aoVivoContent');

  var { data: pr } = await sb.from('peladas').select('*').eq('id', peladaAtual.id).eq('grupo_id', grupoAtual.id).single();
  if (pr) peladaAtual = pr;

  // Pelada encerrada/realizada
  if (peladaAtual.status === 'Realizada' || peladaAtual.status === 'Encerrada') {
    var { data: pts } = await sb.from('partidas').select('*').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id).order('numero');
    var fn = (pts || []).filter(function(p) { return p.status === 'Finalizada'; });
    if (fn.length > 0) {
      var rh = '<div class="card"><div class="card-title">📋 Partidas</div>';
      fn.forEach(function(p) {
        var vl = p.vencedor === 'A' ? '🔵 A' : (p.vencedor === 'B' ? '🟠 B' : '🤝 Emp');
        rh += '<div class="flex-between" style="padding:8px 0;border-bottom:1px solid rgba(36,48,73,0.3);font-size:13px;">';
        rh += '<span>P' + p.numero + '</span><span style="font-weight:600;">' + p.placar_a + ' x ' + p.placar_b + '</span><span class="text-muted">' + vl + '</span>';
        if (isAdm) {
          rh += '<button class="btn-edit-partida" onclick="editPartidaAoVivo(\'' + p.partida_id + '\')">✏️</button>';
        }
        rh += '</div>';
        rh += '<div id="editZone_' + p.partida_id.replace(/[^a-zA-Z0-9_]/g, '_') + '"></div>';
      });
      rh += '</div>';
      el.innerHTML = rh + '<div class="empty-state"><span class="emoji">✅</span>Encerrada.</div>';
    } else {
      el.innerHTML = '<div class="empty-state"><span class="emoji">✅</span>Encerrada.</div>';
    }
    if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
    return;
  }

  // Presentes
  var { data: ps } = await sb.from('presenca').select('jogador').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id);
  aoVivoPresentes = (ps || []).map(function(r) { return r.jogador; });

  // Partidas
  var { data: pts } = await sb.from('partidas').select('*').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id).order('numero');
  var tp = pts || [];
  var at = tp.find(function(p) { return p.status === 'EmAndamento'; }) || null;

  if (at) {
    var results = await Promise.all([
      sb.from('gols').select('*').eq('partida_id', at.partida_id).eq('grupo_id', grupoAtual.id).order('timestamp'),
      sb.from('substituicoes').select('*').eq('partida_id', at.partida_id).eq('grupo_id', grupoAtual.id).order('criado_em')
    ]);
    var gl = results[0].data || [];
    var subs = results[1].data || [];
    renderPartidaAtiva(at, gl, subs, tp);
    setupRealtime(at.partida_id);
  } else {
    var pn = tp.length === 0 ? 1 : tp[tp.length - 1].numero + 1;
    var preSelect = calcPreSelection(tp);
    await resolvePreSelectAndRender(tp, pn, preSelect);
    if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  }
}

// ============================================================
// REI DA MESA
// ============================================================
function calcPreSelection(allPartidas) {
  var finalizadas = allPartidas.filter(function(p) { return p.status === 'Finalizada'; });
  if (finalizadas.length === 0) return null;
  finalizadas.sort(function(a, b) { return a.numero - b.numero; });
  var lastMatch = finalizadas[finalizadas.length - 1];
  var ficouNaUltima = calcFicouSide(finalizadas);
  var stayTeamSide = null;
  if (lastMatch.vencedor === 'A') { stayTeamSide = 'A'; }
  else if (lastMatch.vencedor === 'B') { stayTeamSide = 'B'; }
  else {
    if (ficouNaUltima === null) return null;
    stayTeamSide = (ficouNaUltima === 'A') ? 'B' : 'A';
  }
  var teamArray = stayTeamSide === 'A' ? (lastMatch.time_a || []) : (lastMatch.time_b || []);
  return { stayTeam: stayTeamSide, lastPartidaId: lastMatch.partida_id, teamArray: teamArray };
}

function calcFicouSide(finalizadas) {
  if (finalizadas.length <= 1) return null;
  var ficou = null;
  for (var i = 0; i < finalizadas.length - 1; i++) {
    var match = finalizadas[i];
    if (match.vencedor === 'A') { ficou = 'A'; }
    else if (match.vencedor === 'B') { ficou = 'B'; }
    else {
      if (ficou === 'A') ficou = 'B';
      else if (ficou === 'B') ficou = 'A';
      else ficou = null;
    }
  }
  return ficou;
}

async function resolvePreSelectAndRender(tp, pn, preSelect) {
  if (!preSelect || !preSelect.stayTeam) { renderSetupPartida(tp, pn, null); return; }
  var { data: subs } = await sb.from('substituicoes').select('*').eq('partida_id', preSelect.lastPartidaId).eq('grupo_id', grupoAtual.id);
  subs = subs || [];
  var teamSubs = subs.filter(function(s) { return s.time === preSelect.stayTeam; });
  var saiu = {};
  teamSubs.forEach(function(s) { saiu[s.jogador_saiu] = true; });
  var activePlayers = preSelect.teamArray.filter(function(n) { return n && !saiu[n.trim()]; });
  activePlayers = activePlayers.slice(0, 5);
  if (activePlayers.length === 0) { renderSetupPartida(tp, pn, null); return; }
  var picks = {};
  activePlayers.forEach(function(n) { picks[n.trim()] = preSelect.stayTeam; });
  renderSetupPartida(tp, pn, { players: picks, stayTeam: preSelect.stayTeam });
}

function setupRealtime(pid) {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel('av-' + pid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gols', filter: 'partida_id=eq.' + pid }, function() { loadAoVivo(); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'partidas', filter: 'partida_id=eq.' + pid }, function() { loadAoVivo(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'substituicoes', filter: 'partida_id=eq.' + pid }, function() { loadAoVivo(); })
    .subscribe();
}

function renderSetupPartida(tp, pn, preSelect) {
  var el = $('aoVivoContent');
  teamPicks = {};
  if (preSelect && preSelect.players) {
    for (var nome in preSelect.players) { teamPicks[nome] = preSelect.players[nome]; }
  }

  var rh = '';
  if (tp.length > 0) {
    rh = '<div class="card"><div class="card-title">📋 Partidas</div>';
    tp.forEach(function(p) {
      if (p.status !== 'Finalizada') return;
      var vl = p.vencedor === 'A' ? '🔵 A' : (p.vencedor === 'B' ? '🟠 B' : '🤝 Emp');
      rh += '<div class="flex-between" style="padding:8px 0;border-bottom:1px solid rgba(36,48,73,0.3);font-size:13px;">';
      rh += '<span>P' + p.numero + '</span><span style="font-weight:600;">' + p.placar_a + ' x ' + p.placar_b + '</span><span class="text-muted">' + vl + '</span>';
      if (isAdm) {
        rh += '<button class="btn-edit-partida" onclick="editPartidaAoVivo(\'' + p.partida_id + '\')">✏️</button>';
      }
      rh += '</div>';
      rh += '<div id="editZone_' + p.partida_id.replace(/[^a-zA-Z0-9_]/g, '_') + '"></div>';
    });
    rh += '</div>';
  }

  var sortearBtn = '';
  if (aoVivoPresentes.length >= 10) {
    sortearBtn = '<button class="btn btn-secondary mt12" onclick="sortearTimes()" style="margin-bottom:16px;">🎲 Sortear Times (' + aoVivoPresentes.length + ' presentes)</button>';
  } else if (aoVivoPresentes.length > 0 && aoVivoPresentes.length < 10) {
    sortearBtn = '<div style="font-size:12px;color:var(--text3);margin-bottom:12px;text-align:center;">🎲 Sorteio disponível a partir de 10 presentes (' + aoVivoPresentes.length + ' agora)</div>';
  }

  var sorteioSalvoPanel = '';
  if (peladaAtual.times_sorteados && !sorteioAtual) {
    sorteioSalvoPanel = renderSorteioSalvo(peladaAtual.times_sorteados);
  }
  var sortearPanel = '<div id="sorteioPanel"></div>';

  var po = sa(aoVivoPresentes), ph = '';
  po.forEach(function(n) {
    var cls = 'pool-chip';
    if (teamPicks[n] === 'A') cls = 'pool-chip team-a';
    else if (teamPicks[n] === 'B') cls = 'pool-chip team-b';
    ph += '<div class="' + cls + '" data-player="' + n + '" onclick="pickPlayer(this)">' + dn(n) + '</div>';
  });

  var cA = 0, cB = 0;
  for (var k in teamPicks) { if (teamPicks[k] === 'A') cA++; if (teamPicks[k] === 'B') cB++; }

  var preSelectBanner = '';
  if (preSelect && preSelect.stayTeam) {
    var stayLabel = preSelect.stayTeam === 'A' ? '🔵 Time A' : '🟠 Time B';
    preSelectBanner = '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--greenGlow);border:1px solid rgba(34,197,94,0.3);border-radius:10px;margin-bottom:12px;font-size:13px;color:var(--green);">👑 Rei da mesa: ' + stayLabel + ' fica</div>';
  }

  el.innerHTML = rh +
    sortearBtn +
    sorteioSalvoPanel +
    sortearPanel +
    '<div class="card"><div class="card-title">⚽ Partida ' + pn + '</div>' +
    preSelectBanner +
    '<div class="team-pick-label">1º=🔵A, 2º=🟠B, 3º=remove</div>' +
    '<div class="player-pool" id="playerPool">' + ph + '</div>' +
    '<div class="team-counters mt8">🔵 A: <span id="countA">' + cA + '</span>/5 🟠 B: <span id="countB">' + cB + '</span>/5</div></div>' +
    '<button class="btn btn-primary" onclick="iniciarPartida(' + pn + ')">Iniciar ' + pn + '</button>' +
    '<button class="btn btn-danger mt12" onclick="confirmarEncerrarPelada()" style="margin-top:12px;">🏁 Encerrar</button>';
}

// ============================================================
// SORTEIO SALVO
// ============================================================
function renderSorteioSalvo(timesSorteados) {
  var teamColors = [
    { nome: 'Time 1', cor: 'var(--blue)', bg: 'var(--blueGlow)', border: 'rgba(59,130,246,0.3)', emoji: '🔵' },
    { nome: 'Time 2', cor: 'var(--orange)', bg: 'var(--orangeGlow)', border: 'rgba(249,115,22,0.3)', emoji: '🟠' },
    { nome: 'Time 3', cor: 'var(--green)', bg: 'var(--greenGlow)', border: 'rgba(34,197,94,0.3)', emoji: '🟢' },
    { nome: 'Time 4', cor: 'var(--purple)', bg: 'var(--purpleGlow)', border: 'rgba(168,85,247,0.3)', emoji: '🟣' },
    { nome: 'Time 5', cor: 'var(--gold)', bg: 'var(--goldGlow)', border: 'rgba(250,204,21,0.3)', emoji: '🟡' }
  ];
  var h = '<div class="card" style="border-color:var(--green);">';
  h += '<div class="card-title">🎲 Times Sorteados (salvo)</div>';
  h += '<div class="sorteio-times-grid">';
  timesSorteados.forEach(function(time, idx) {
    var tc = teamColors[idx] || teamColors[0];
    var somaRating = 0;
    time.forEach(function(j) { somaRating += j.rating; });
    var mediaRating = time.length > 0 ? somaRating / time.length : 0;
    h += '<div class="sorteio-time-card" style="border-color:' + tc.border + ';">';
    h += '<div class="sorteio-time-header" style="background:' + tc.bg + ';color:' + tc.cor + ';">';
    h += '<span>' + tc.emoji + ' ' + tc.nome + ' (' + time.length + ')</span>';
    h += '<span style="font-size:12px;font-weight:600;">média ' + mediaRating.toFixed(1) + '</span>';
    h += '</div>';
    time.forEach(function(j) {
      h += '<div class="sorteio-player-row">';
      h += '<span class="sorteio-player-name">' + dn(j.nome) + '</span>';
      h += '<span class="sorteio-player-rating" style="color:' + tc.cor + ';">' + j.rating.toFixed(1) + '</span>';
      h += '</div>';
    });
    h += '<div class="sorteio-actions">';
    h += '<button class="sorteio-action-btn sorteio-action-a" onclick="alocarTimeSorteado(' + idx + ',\'A\',true)">→ 🔵 Time A</button>';
    h += '<button class="sorteio-action-btn sorteio-action-b" onclick="alocarTimeSorteado(' + idx + ',\'B\',true)">→ 🟠 Time B</button>';
    h += '</div>';
    h += '</div>';
  });
  h += '</div>';
  h += '<button class="btn btn-secondary mt12" onclick="sortearTimes()" style="width:100%;">🎲 Sortear novamente</button>';
  h += '</div>';
  sorteioAtual = timesSorteados;
  return h;
}

function pickPlayer(c) {
  var n = c.getAttribute('data-player'), cu = teamPicks[n] || null;
  var cA = 0, cB = 0;
  for (var k in teamPicks) { if (teamPicks[k] === 'A') cA++; if (teamPicks[k] === 'B') cB++; }
  if (cu === null) {
    if (cA < 5) { teamPicks[n] = 'A'; c.className = 'pool-chip team-a'; }
    else if (cB < 5) { teamPicks[n] = 'B'; c.className = 'pool-chip team-b'; }
  } else if (cu === 'A') {
    teamPicks[n] = 'B'; c.className = 'pool-chip team-b'; cB++;
    if (cB > 5) { teamPicks[n] = null; c.className = 'pool-chip'; }
  } else {
    teamPicks[n] = null; c.className = 'pool-chip';
  }
  cA = 0; cB = 0;
  for (var k in teamPicks) { if (teamPicks[k] === 'A') cA++; if (teamPicks[k] === 'B') cB++; }
  $('countA').textContent = cA;
  $('countB').textContent = cB;
}

// ============================================================
// SORTEAR TIMES
// ============================================================
function calcNumTimes(n) {
  if (n <= 15) return 3;
  if (n <= 20) return 4;
  return 5;
}

function shuffleArray(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

function distribuirJogadoresBruteForce(jogadores, numTimes) {
  var n = jogadores.length;
  var base = Math.floor(n / numTimes);
  var extras = n % numTimes;
  var tamanhos = [];
  for (var i = 0; i < numTimes; i++) { tamanhos.push(i < extras ? base + 1 : base); }
  var ratings = jogadores.map(function(j) { return j.rating; });
  var indices = [];
  for (var i = 0; i < n; i++) indices.push(i);
  var melhorDiff = Infinity;
  var melhorOrdem = indices.slice();
  var MAX_ITERACOES = 100000;
  var EARLY_EXIT = 0.1;
  for (var iter = 0; iter < MAX_ITERACOES; iter++) {
    shuffleArray(indices);
    var maxMedia = -Infinity, minMedia = Infinity, pos = 0;
    for (var t = 0; t < numTimes; t++) {
      var soma = 0;
      for (var j = 0; j < tamanhos[t]; j++) { soma += ratings[indices[pos]]; pos++; }
      var media = soma / tamanhos[t];
      if (media > maxMedia) maxMedia = media;
      if (media < minMedia) minMedia = media;
    }
    var diff = maxMedia - minMedia;
    if (diff < melhorDiff) { melhorDiff = diff; melhorOrdem = indices.slice(); if (diff < EARLY_EXIT) break; }
  }
  var times = [], pos = 0;
  for (var t = 0; t < numTimes; t++) {
    var time = [];
    for (var j = 0; j < tamanhos[t]; j++) { time.push(jogadores[melhorOrdem[pos]]); pos++; }
    times.push(time);
  }
  return times;
}

async function sortearTimes() {
  var panel = $('sorteioPanel');
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:20px;"><div class="loader"></div><div style="color:var(--text2);font-size:13px;margin-top:8px;">Buscando avaliações...</div></div>';
  var { data: notas } = await sb.from('notas_jogadores').select('avaliado, nota').eq('grupo_id', grupoAtual.id);
  notas = notas || [];
  var somaNotas = {}, countNotas = {};
  notas.forEach(function(n) {
    if (!somaNotas[n.avaliado]) { somaNotas[n.avaliado] = 0; countNotas[n.avaliado] = 0; }
    somaNotas[n.avaliado] += n.nota; countNotas[n.avaliado]++;
  });
  var semNota = [];
  var jogadoresComRating = aoVivoPresentes.map(function(nome) {
    var media = 5.0, temNota = false;
    if (somaNotas[nome] !== undefined && countNotas[nome] > 0) { media = somaNotas[nome] / countNotas[nome]; temNota = true; }
    else { semNota.push(nome); }
    return { nome: nome, rating: media, temNota: temNota };
  });
  executarSorteio(jogadoresComRating, semNota);
}

function executarSorteio(jogadoresComRating, semNota) {
  var panel = $('sorteioPanel');
  if (!panel) return;
  var numTimes = calcNumTimes(jogadoresComRating.length);
  var times = distribuirJogadoresBruteForce(jogadoresComRating, numTimes);
  sorteioAtual = times;
  var teamColors = [
    { nome: 'Time 1', cor: 'var(--blue)', bg: 'var(--blueGlow)', border: 'rgba(59,130,246,0.3)', emoji: '🔵' },
    { nome: 'Time 2', cor: 'var(--orange)', bg: 'var(--orangeGlow)', border: 'rgba(249,115,22,0.3)', emoji: '🟠' },
    { nome: 'Time 3', cor: 'var(--green)', bg: 'var(--greenGlow)', border: 'rgba(34,197,94,0.3)', emoji: '🟢' },
    { nome: 'Time 4', cor: 'var(--purple)', bg: 'var(--purpleGlow)', border: 'rgba(168,85,247,0.3)', emoji: '🟣' },
    { nome: 'Time 5', cor: 'var(--gold)', bg: 'var(--goldGlow)', border: 'rgba(250,204,21,0.3)', emoji: '🟡' }
  ];
  var h = '<div class="card" style="border-color:var(--green);">';
  h += '<div class="card-title">🎲 Times Sorteados</div>';
  if (semNota.length > 0) {
    h += '<div style="display:flex;align-items:flex-start;gap:8px;padding:10px 14px;background:var(--goldGlow);border:1px solid rgba(250,204,21,0.3);border-radius:10px;margin-bottom:14px;font-size:12px;color:var(--gold);">';
    h += '<span style="flex-shrink:0;">⚠️</span><span>' + semNota.length + ' jogador(es) sem avaliação (rating padrão 5.0): ' + semNota.map(function(n) { return dn(n); }).join(', ') + '</span>';
    h += '</div>';
  }
  h += '<div class="sorteio-times-grid">';
  times.forEach(function(time, idx) {
    var tc = teamColors[idx];
    var somaRating = 0;
    time.forEach(function(j) { somaRating += j.rating; });
    var mediaRating = time.length > 0 ? somaRating / time.length : 0;
    h += '<div class="sorteio-time-card" style="border-color:' + tc.border + ';">';
    h += '<div class="sorteio-time-header" style="background:' + tc.bg + ';color:' + tc.cor + ';">';
    h += '<span>' + tc.emoji + ' ' + tc.nome + ' (' + time.length + ')</span>';
    h += '<span style="font-size:12px;font-weight:600;">média ' + mediaRating.toFixed(1) + '</span>';
    h += '</div>';
    time.forEach(function(j) {
      var notaClass = j.temNota ? '' : ' style="opacity:0.6;font-style:italic;"';
      h += '<div class="sorteio-player-row">';
      h += '<span class="sorteio-player-name"' + notaClass + '>' + dn(j.nome) + (j.temNota ? '' : ' *') + '</span>';
      h += '<span class="sorteio-player-rating" style="color:' + tc.cor + ';">' + j.rating.toFixed(1) + '</span>';
      h += '</div>';
    });
    h += '<div class="sorteio-actions">';
    h += '<button class="sorteio-action-btn sorteio-action-a" onclick="alocarTimeSorteado(' + idx + ',\'A\')">→ 🔵 Time A</button>';
    h += '<button class="sorteio-action-btn sorteio-action-b" onclick="alocarTimeSorteado(' + idx + ',\'B\')">→ 🟠 Time B</button>';
    h += '</div>';
    h += '</div>';
  });
  h += '</div>';
  var medias = times.map(function(t) { var s = 0; t.forEach(function(j) { s += j.rating; }); return t.length > 0 ? s / t.length : 0; });
  var maxM = Math.max.apply(null, medias), minM = Math.min.apply(null, medias);
  var diff = maxM - minM;
  var diffColor = diff < 0.5 ? 'var(--green)' : (diff < 1.0 ? 'var(--gold)' : 'var(--red)');
  h += '<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px;font-size:13px;">';
  h += '<span style="color:var(--text2);">Diferença máx (média):</span>';
  h += '<span style="font-weight:700;color:' + diffColor + ';">' + diff.toFixed(2) + '</span>';
  h += '</div>';
  h += '<div style="display:flex;gap:8px;margin-top:12px;">';
  h += '<button class="btn btn-secondary" onclick="resortearTimes()" style="flex:1;">🎲 Sortear novamente</button>';
  h += '<button class="btn btn-primary" onclick="salvarSorteio()" style="flex:1;">💾 Salvar</button>';
  h += '</div></div>';
  panel.innerHTML = h;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window._sorteioDados = { jogadoresComRating: jogadoresComRating, semNota: semNota };
}

function resortearTimes() {
  var dados = window._sorteioDados;
  if (!dados) { sortearTimes(); return; }
  executarSorteio(dados.jogadoresComRating, dados.semNota);
}

async function salvarSorteio() {
  if (!sorteioAtual) return;
  var { error: e } = await sb.from('peladas').update({ times_sorteados: sorteioAtual }).eq('id', peladaAtual.id).eq('grupo_id', grupoAtual.id);
  if (e) { showToast('Erro ao salvar: ' + e.message, true); return; }
  peladaAtual.times_sorteados = sorteioAtual;
  showToast('💾 Times sorteados salvos!');
  logAsync(currentUser, 'SALVAR_SORTEIO', peladaAtual.id);
}

function alocarTimeSorteado(sorteioIdx, targetTeam, fromSaved) {
  var source = fromSaved && peladaAtual.times_sorteados ? peladaAtual.times_sorteados : sorteioAtual;
  if (!source || !source[sorteioIdx]) return;
  var jogadores = source[sorteioIdx];
  for (var k in teamPicks) { if (teamPicks[k] === targetTeam) { teamPicks[k] = null; } }
  jogadores.forEach(function(j) { teamPicks[j.nome] = targetTeam; });
  var chips = document.querySelectorAll('#playerPool .pool-chip');
  chips.forEach(function(c) {
    var n = c.getAttribute('data-player');
    if (teamPicks[n] === 'A') c.className = 'pool-chip team-a';
    else if (teamPicks[n] === 'B') c.className = 'pool-chip team-b';
    else c.className = 'pool-chip';
  });
  var cA = 0, cB = 0;
  for (var k in teamPicks) { if (teamPicks[k] === 'A') cA++; if (teamPicks[k] === 'B') cB++; }
  if ($('countA')) $('countA').textContent = cA;
  if ($('countB')) $('countB').textContent = cB;
  var label = targetTeam === 'A' ? '🔵 Time A' : '🟠 Time B';
  showToast('Time ' + (sorteioIdx + 1) + ' alocado no ' + label);
}

async function iniciarPartida(num) {
  var tA = [], tB = [];
  for (var k in teamPicks) { if (teamPicks[k] === 'A') tA.push(k); if (teamPicks[k] === 'B') tB.push(k); }
  if (tA.length !== 5 || tB.length !== 5) { showToast('5 por time!', true); return; }
  var pid = grupoAtual.id + '_' + peladaAtual.id + '_M' + String(num).padStart(2, '0');
  var { error: e } = await sb.from('partidas').insert({
    partida_id: pid, pelada_id: peladaAtual.id, numero: num,
    time_a: tA, time_b: tB, placar_a: 0, placar_b: 0,
    vencedor: '', status: 'EmAndamento', grupo_id: grupoAtual.id
  });
  if (e) { showToast(e.message, true); return; }
  showToast('Iniciada!');
  logAsync(currentUser, 'INICIAR_PARTIDA', pid);
  loadAoVivo();
}

// ============================================================
// PARTIDA ATIVA: render com substituições
// ============================================================
function renderPartidaAtiva(part, gols, subs, tp) {
  var el = $('aoVivoContent');
  subPendente = null;

  var subsA = subs.filter(function(s) { return s.time === 'A'; });
  var subsB = subs.filter(function(s) { return s.time === 'B'; });
  var saiuA = {}; subsA.forEach(function(s) { saiuA[s.jogador_saiu] = true; });
  var saiuB = {}; subsB.forEach(function(s) { saiuB[s.jogador_saiu] = true; });
  var entrouASet = {}; subsA.forEach(function(s) { entrouASet[s.jogador_entrou] = true; });
  var entrouBSet = {}; subsB.forEach(function(s) { entrouBSet[s.jogador_entrou] = true; });
  var entrouA = Object.keys(entrouASet);
  var entrouB = Object.keys(entrouBSet);

  var allASet = {};
  (part.time_a || []).forEach(function(n) { if (n) allASet[n.trim()] = true; });
  entrouA.forEach(function(n) { allASet[n] = true; });
  var allBSet = {};
  (part.time_b || []).forEach(function(n) { if (n) allBSet[n.trim()] = true; });
  entrouB.forEach(function(n) { allBSet[n] = true; });

  var todosNoJogo = {};
  Object.keys(allASet).forEach(function(n) { todosNoJogo[n] = true; });
  Object.keys(allBSet).forEach(function(n) { todosNoJogo[n] = true; });

  function bTR(originalTeam, entrouSet, saiuMap, tl, subsCount) {
    var playerSet = {};
    originalTeam.forEach(function(n) { if (n) playerSet[n.trim()] = true; });
    Object.keys(entrouSet).forEach(function(n) { playerSet[n] = true; });
    var allPlayers = sa(Object.keys(playerSet));
    var h = '';
    allPlayers.forEach(function(n) {
      var isSaiu = saiuMap[n] === true;
      var isSub = entrouSet[n] === true;
      var nameHtml = '<span class="team-player-name"';
      if (isSaiu) nameHtml += ' style="text-decoration:line-through;opacity:0.5;"';
      nameHtml += '>' + dn(n);
      if (isSub) nameHtml += ' <span style="font-size:10px;color:var(--green);">↑ SUB</span>';
      if (isSaiu) nameHtml += ' <span style="font-size:10px;color:var(--red);">↓ SAIU</span>';
      nameHtml += '</span>';
      if (isSaiu) {
        h += '<div class="team-player-row">' + nameHtml + '</div>';
      } else {
        var subBtn = '';
        if (subsCount < 3) {
          subBtn = '<button class="goal-btn goal-btn-sub" onclick="iniciarSub(\'' + part.partida_id + '\',\'' + n + '\',\'' + tl + '\')">🔄</button>';
        }
        h += '<div class="team-player-row">' + nameHtml +
          '<button class="goal-btn goal-btn-normal" onclick="mGol(\'' + part.partida_id + '\',\'' + n + '\',\'' + tl + '\',false)">⚽</button>' +
          '<button class="goal-btn goal-btn-contra" onclick="mGol(\'' + part.partida_id + '\',\'' + n + '\',\'' + tl + '\',true)">⚽</button>' +
          subBtn + '</div>';
      }
    });
    return h;
  }

  var teamAHtml = bTR(part.time_a || [], entrouASet, saiuA, 'A', subsA.length);
  var teamBHtml = bTR(part.time_b || [], entrouBSet, saiuB, 'B', subsB.length);
  var subInfoA = subsA.length > 0 ? ' <span style="font-size:11px;font-weight:400;color:var(--text2);">(🔄 ' + subsA.length + '/3)</span>' : '';
  var subInfoB = subsB.length > 0 ? ' <span style="font-size:11px;font-weight:400;color:var(--text2);">(🔄 ' + subsB.length + '/3)</span>' : '';

  var gl = '';
  if (gols.length > 0) {
    gl = '<div class="card"><div class="card-title">⚽ Gols</div><div class="gol-log">';
    gols.forEach(function(g) {
      var tc = g.time === 'A' ? 'var(--blue)' : 'var(--orange)';
      var tn = g.time === 'A' ? 'A' : 'B';
      var lb = g.gol_contra ? '⚽ GC ' + dn(g.jogador) + ' (' + tn + ')' : '⚽ ' + dn(g.jogador) + ' (' + tn + ')';
      gl += '<div class="gol-item"><span style="color:' + tc + '">' + lb + '</span><button class="gol-remove" onclick="rGol(\'' + g.gol_id + '\',\'' + part.partida_id + '\')">✕</button></div>';
    });
    gl += '</div></div>';
  }

  var subLog = '';
  if (subs.length > 0) {
    subLog = '<div class="card"><div class="card-title">🔄 Substituições</div><div class="gol-log">';
    subs.forEach(function(s) {
      var tc = s.time === 'A' ? 'var(--blue)' : 'var(--orange)';
      var tn = s.time === 'A' ? 'A' : 'B';
      subLog += '<div class="gol-item"><span style="color:' + tc + '">↓ ' + dn(s.jogador_saiu) + ' → ↑ ' + dn(s.jogador_entrou) + ' (' + tn + ')</span>' +
        '<button class="gol-remove" onclick="rSub(' + s.id + ',\'' + part.partida_id + '\',\'' + s.jogador_entrou + '\',\'' + s.time + '\')">✕</button></div>';
    });
    subLog += '</div></div>';
  }

  var subPanel = '<div id="subPanel" style="display:none;"></div>';

  // Resumo de partidas finalizadas anteriores (com botão editar para ADM)
  var resumo = '';
  if (tp && tp.length > 0) {
    var finPrev = tp.filter(function(p) { return p.status === 'Finalizada'; });
    if (finPrev.length > 0) {
      resumo = '<div class="card" style="margin-top:16px;"><div class="card-title">📋 Partidas anteriores</div>';
      finPrev.forEach(function(p) {
        var vl = p.vencedor === 'A' ? '🔵 A' : (p.vencedor === 'B' ? '🟠 B' : '🤝 Emp');
        resumo += '<div class="flex-between" style="padding:8px 0;border-bottom:1px solid rgba(36,48,73,0.3);font-size:13px;">';
        resumo += '<span>P' + p.numero + '</span><span style="font-weight:600;">' + p.placar_a + ' x ' + p.placar_b + '</span><span class="text-muted">' + vl + '</span>';
        if (isAdm) {
          resumo += '<button class="btn-edit-partida" onclick="editPartidaAoVivo(\'' + p.partida_id + '\')">✏️</button>';
        }
        resumo += '</div>';
        resumo += '<div id="editZone_' + p.partida_id.replace(/[^a-zA-Z0-9_]/g, '_') + '"></div>';
      });
      resumo += '</div>';
    }
  }

  el.innerHTML =
    '<div class="scoreboard"><div class="scoreboard-match">Partida ' + part.numero + '</div>' +
    '<div class="scoreboard-score"><span class="score-a">' + part.placar_a + '</span><span class="score-x">×</span><span class="score-b">' + part.placar_b + '</span></div>' +
    '<div class="scoreboard-labels"><span>🔵 A</span><span>🟠 B</span></div></div>' +
    '<div class="team-section"><div class="team-header team-header-a">🔵 Time A' + subInfoA + '</div><div class="team-players">' + teamAHtml + '</div></div>' +
    '<div class="team-section"><div class="team-header team-header-b">🟠 Time B' + subInfoB + '</div><div class="team-players">' + teamBHtml + '</div></div>' +
    subPanel + gl + subLog +
    '<button class="btn btn-primary mt16" onclick="fPart(\'' + part.partida_id + '\')">✅ Finalizar ' + part.numero + '</button>' +
    resumo;

  window._todosNoJogo = todosNoJogo;
}

// ============================================================
// SUBSTITUIÇÃO
// ============================================================
function iniciarSub(partidaId, jogador, time) {
  subPendente = { partida_id: partidaId, jogador: jogador, time: time };
  var todosNoJogo = window._todosNoJogo || {};
  var disponiveis = aoVivoPresentes.filter(function(n) { return !todosNoJogo[n]; });
  var panel = $('subPanel');
  if (disponiveis.length === 0) {
    panel.innerHTML = '<div class="card" style="border-color:var(--gold);"><div class="card-title">🔄 Substituição</div>' +
      '<div class="text-muted">Nenhum jogador disponível para substituir.</div>' +
      '<button class="btn btn-secondary mt12" onclick="cancelarSub()">Cancelar</button></div>';
    panel.style.display = 'block'; return;
  }
  var h = '<div class="card" style="border-color:var(--gold);">';
  h += '<div class="card-title">🔄 Substituir ' + dn(jogador) + '</div>';
  h += '<div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Selecione quem entra no lugar:</div>';
  h += '<div class="selecao-container">';
  sa(disponiveis).forEach(function(n) { h += '<div class="chip" onclick="confirmarSub(\'' + n + '\')">' + dn(n) + '</div>'; });
  h += '</div>';
  h += '<button class="btn btn-secondary mt12" onclick="cancelarSub()">Cancelar</button></div>';
  panel.innerHTML = h; panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelarSub() {
  subPendente = null;
  var panel = $('subPanel');
  if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
}

async function confirmarSub(jogadorEntrou) {
  if (!subPendente) return;
  var { error: e } = await sb.from('substituicoes').insert({
    partida_id: subPendente.partida_id, grupo_id: grupoAtual.id,
    time: subPendente.time, jogador_saiu: subPendente.jogador, jogador_entrou: jogadorEntrou
  });
  if (e) { showToast(e.message, true); return; }
  await addSubToTeam(subPendente.partida_id, subPendente.time, jogadorEntrou);
  showToast('🔄 ' + dn(subPendente.jogador) + ' → ' + dn(jogadorEntrou));
  logAsync(currentUser, 'SUB', subPendente.jogador + ' → ' + jogadorEntrou + ' T' + subPendente.time);
  subPendente = null;
  loadAoVivo();
}

async function addSubToTeam(partidaId, time, jogadorEntrou) {
  var col = time === 'A' ? 'time_a' : 'time_b';
  var { data: part } = await sb.from('partidas').select(col).eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id).single();
  if (!part) return;
  var arr = part[col] || [];
  if (arr.indexOf(jogadorEntrou) === -1) {
    arr.push(jogadorEntrou);
    var upd = {}; upd[col] = arr;
    await sb.from('partidas').update(upd).eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id);
  }
}

async function rSub(subId, partidaId, jogadorEntrou, time) {
  if (!confirm('Desfazer substituição?')) return;
  await sb.from('substituicoes').delete().eq('id', subId).eq('grupo_id', grupoAtual.id);
  await removeSubFromTeam(partidaId, time, jogadorEntrou);
  showToast('Substituição desfeita.');
  loadAoVivo();
}

async function removeSubFromTeam(partidaId, time, jogadorEntrou) {
  var col = time === 'A' ? 'time_a' : 'time_b';
  var { data: part } = await sb.from('partidas').select(col).eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id).single();
  if (!part) return;
  var arr = part[col] || [];
  var idx = arr.indexOf(jogadorEntrou);
  if (idx > -1) { arr.splice(idx, 1); var upd = {}; upd[col] = arr; await sb.from('partidas').update(upd).eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id); }
}

// ============================================================
// GOLS
// ============================================================
async function mGol(pid, j, t, gc) {
  var { data: gid } = await sb.rpc('next_gol_id_grupo', { p_grupo_id: grupoAtual.id });
  await sb.from('gols').insert({ gol_id: gid, partida_id: pid, pelada_id: peladaAtual.id, jogador: j, time: t, gol_contra: gc, grupo_id: grupoAtual.id });
  await sb.rpc('recalcular_placar', { p_partida_id: pid });
  showToast(gc ? 'Gol contra!' : 'Gol de ' + dn(j) + '!');
  logAsync(currentUser, 'GOL', j + ' T' + t + (gc ? ' GC' : ''));
  loadAoVivo();
}

async function rGol(gid, pid) {
  if (!confirm('Remover?')) return;
  await sb.from('gols').delete().eq('gol_id', gid).eq('grupo_id', grupoAtual.id);
  await sb.rpc('recalcular_placar', { p_partida_id: pid });
  showToast('Removido.');
  loadAoVivo();
}

async function fPart(pid) {
  if (!confirm('Finalizar?')) return;
  var { data: p } = await sb.from('partidas').select('placar_a, placar_b').eq('partida_id', pid).eq('grupo_id', grupoAtual.id).single();
  var v = p.placar_a > p.placar_b ? 'A' : (p.placar_b > p.placar_a ? 'B' : 'Empate');
  await sb.from('partidas').update({ vencedor: v, status: 'Finalizada' }).eq('partida_id', pid).eq('grupo_id', grupoAtual.id);
  showToast(v === 'Empate' ? 'Empate!' : (v === 'A' ? '🔵 A' : '🟠 B') + ' venceu!');
  logAsync(currentUser, 'FIN_PART', pid);
  loadAoVivo();
}

async function confirmarEncerrarPelada() {
  if (!confirm('Encerrar pelada?')) return;
  await sb.from('peladas').update({ status: 'Realizada' }).eq('id', peladaAtual.id).eq('grupo_id', grupoAtual.id);
  showToast('Encerrada!');
  logAsync(currentUser, 'ENC_PELADA', peladaAtual.id);
  loadHome();
  navigateTo('Home');
}

// ============================================================
// EDITAR PARTIDA FINALIZADA (ADM)
// ============================================================

async function editPartidaAoVivo(partidaId) {
  // Se já está editando essa, fecha
  if (editingPartidaId === partidaId) { closeEditPartida(); return; }
  // Fecha qualquer edição aberta
  closeEditPartida();

  editingPartidaId = partidaId;
  var safeId = partidaId.replace(/[^a-zA-Z0-9_]/g, '_');
  var zone = $('editZone_' + safeId);
  if (!zone) return;
  zone.innerHTML = '<div style="padding:12px;text-align:center;"><div class="loader"></div></div>';

  // Carregar dados da partida
  var results = await Promise.all([
    sb.from('partidas').select('*').eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id).single(),
    sb.from('gols').select('*').eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id).order('timestamp'),
    sb.from('substituicoes').select('*').eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id).order('criado_em'),
    sb.from('presenca').select('jogador').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id)
  ]);

  var partida = results[0].data;
  editGols = results[1].data || [];
  editSubs = results[2].data || [];
  var presentes = (results[3].data || []).map(function(r) { return r.jogador; });

  if (!partida) { zone.innerHTML = '<div class="text-muted" style="padding:12px;">Partida não encontrada.</div>'; return; }

  // Montar editTeamPicks a partir dos times atuais
  editTeamPicks = {};
  (partida.time_a || []).forEach(function(n) { if (n) editTeamPicks[n.trim()] = 'A'; });
  (partida.time_b || []).forEach(function(n) { if (n) editTeamPicks[n.trim()] = 'B'; });

  renderEditPartida(zone, partida, presentes);
}

function renderEditPartida(zone, partida, presentes) {
  var safeId = partida.partida_id.replace(/[^a-zA-Z0-9_]/g, '_');
  var h = '<div class="edit-partida-panel">';
  h += '<div class="edit-partida-header">✏️ Editando Partida ' + partida.numero + '</div>';

  // --- TIMES ---
  h += '<div class="edit-section-label">Times</div>';
  h += '<div class="team-pick-label">1º=🔵A, 2º=🟠B, 3º=remove</div>';
  h += '<div class="player-pool" id="editPlayerPool_' + safeId + '">';
  var sorted = sa(presentes);
  sorted.forEach(function(n) {
    var cls = 'pool-chip';
    if (editTeamPicks[n] === 'A') cls = 'pool-chip team-a';
    else if (editTeamPicks[n] === 'B') cls = 'pool-chip team-b';
    h += '<div class="' + cls + '" data-player="' + n + '" data-partida="' + safeId + '" onclick="editPickPlayer(this)">' + dn(n) + '</div>';
  });
  h += '</div>';

  var cA = 0, cB = 0;
  for (var k in editTeamPicks) { if (editTeamPicks[k] === 'A') cA++; if (editTeamPicks[k] === 'B') cB++; }
  h += '<div class="team-counters mt8">🔵 A: <span id="editCountA_' + safeId + '">' + cA + '</span>/5 🟠 B: <span id="editCountB_' + safeId + '">' + cB + '</span>/5</div>';

  // --- GOLS ---
  h += '<div class="edit-section-label" style="margin-top:14px;">Gols</div>';
  h += '<div id="editGolsList_' + safeId + '">';
  h += renderEditGolsList(safeId);
  h += '</div>';

  // Botões de adicionar gol por jogador
  h += '<div class="edit-section-label" style="margin-top:10px;">Adicionar gol</div>';
  h += '<div class="edit-add-gol-section">';
  h += '<div class="edit-add-gol-team">';
  h += '<div style="font-size:11px;font-weight:600;color:var(--blue);margin-bottom:4px;">🔵 Time A</div>';
  var timeAPlayers = [];
  for (var k in editTeamPicks) { if (editTeamPicks[k] === 'A') timeAPlayers.push(k); }
  sa(timeAPlayers).forEach(function(n) {
    h += '<div class="edit-gol-player-row">';
    h += '<span style="font-size:12px;">' + dn(n) + '</span>';
    h += '<button class="goal-btn goal-btn-normal" onclick="editAddGol(\'' + partida.partida_id + '\',\'' + n + '\',\'A\',false)" style="font-size:11px;padding:4px 8px;">⚽</button>';
    h += '<button class="goal-btn goal-btn-contra" onclick="editAddGol(\'' + partida.partida_id + '\',\'' + n + '\',\'A\',true)" style="font-size:11px;padding:4px 8px;">GC</button>';
    h += '</div>';
  });
  h += '</div>';
  h += '<div class="edit-add-gol-team">';
  h += '<div style="font-size:11px;font-weight:600;color:var(--orange);margin-bottom:4px;">🟠 Time B</div>';
  var timeBPlayers = [];
  for (var k in editTeamPicks) { if (editTeamPicks[k] === 'B') timeBPlayers.push(k); }
  sa(timeBPlayers).forEach(function(n) {
    h += '<div class="edit-gol-player-row">';
    h += '<span style="font-size:12px;">' + dn(n) + '</span>';
    h += '<button class="goal-btn goal-btn-normal" onclick="editAddGol(\'' + partida.partida_id + '\',\'' + n + '\',\'B\',false)" style="font-size:11px;padding:4px 8px;">⚽</button>';
    h += '<button class="goal-btn goal-btn-contra" onclick="editAddGol(\'' + partida.partida_id + '\',\'' + n + '\',\'B\',true)" style="font-size:11px;padding:4px 8px;">GC</button>';
    h += '</div>';
  });
  h += '</div>';
  h += '</div>';

  // --- SUBSTITUIÇÕES ---
  h += '<div class="edit-section-label" style="margin-top:14px;">Substituições</div>';
  h += '<div id="editSubsList_' + safeId + '">';
  h += renderEditSubsList(safeId);
  h += '</div>';
  h += '<button class="btn btn-secondary" onclick="editAddSubStart(\'' + partida.partida_id + '\')" style="font-size:12px;padding:6px 12px;margin-top:6px;">+ Adicionar substituição</button>';
  h += '<div id="editSubPanel_' + safeId + '" style="display:none;margin-top:8px;"></div>';

  // --- AÇÕES ---
  h += '<div class="edit-actions">';
  h += '<button class="btn btn-primary" onclick="editSavePartida(\'' + partida.partida_id + '\')">💾 Salvar</button>';
  h += '<button class="btn btn-secondary" onclick="closeEditPartida()">Cancelar</button>';
  h += '</div>';

  h += '</div>';
  zone.innerHTML = h;
  zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderEditGolsList(safeId) {
  if (editGols.length === 0) return '<div class="text-muted" style="font-size:12px;padding:4px 0;">Nenhum gol.</div>';
  var h = '<div class="gol-log">';
  editGols.forEach(function(g) {
    var tc = g.time === 'A' ? 'var(--blue)' : 'var(--orange)';
    var tn = g.time === 'A' ? 'A' : 'B';
    var lb = g.gol_contra ? '⚽ GC ' + dn(g.jogador) + ' (' + tn + ')' : '⚽ ' + dn(g.jogador) + ' (' + tn + ')';
    h += '<div class="gol-item"><span style="color:' + tc + '">' + lb + '</span><button class="gol-remove" onclick="editRemoveGol(\'' + g.gol_id + '\',\'' + editingPartidaId + '\')">✕</button></div>';
  });
  h += '</div>';
  return h;
}

function renderEditSubsList(safeId) {
  if (editSubs.length === 0) return '<div class="text-muted" style="font-size:12px;padding:4px 0;">Nenhuma substituição.</div>';
  var h = '<div class="gol-log">';
  editSubs.forEach(function(s) {
    var tc = s.time === 'A' ? 'var(--blue)' : 'var(--orange)';
    var tn = s.time === 'A' ? 'A' : 'B';
    h += '<div class="gol-item"><span style="color:' + tc + '">↓ ' + dn(s.jogador_saiu) + ' → ↑ ' + dn(s.jogador_entrou) + ' (' + tn + ')</span>';
    h += '<button class="gol-remove" onclick="editRemoveSub(' + s.id + ',\'' + editingPartidaId + '\',\'' + s.jogador_entrou + '\',\'' + s.time + '\')">✕</button></div>';
  });
  h += '</div>';
  return h;
}

function editPickPlayer(c) {
  var n = c.getAttribute('data-player');
  var cu = editTeamPicks[n] || null;
  var cA = 0, cB = 0;
  for (var k in editTeamPicks) { if (editTeamPicks[k] === 'A') cA++; if (editTeamPicks[k] === 'B') cB++; }

  if (cu === null) {
    if (cA < 5) { editTeamPicks[n] = 'A'; c.className = 'pool-chip team-a'; }
    else if (cB < 5) { editTeamPicks[n] = 'B'; c.className = 'pool-chip team-b'; }
  } else if (cu === 'A') {
    editTeamPicks[n] = 'B'; c.className = 'pool-chip team-b'; cB++;
    if (cB > 5) { editTeamPicks[n] = null; c.className = 'pool-chip'; }
  } else {
    editTeamPicks[n] = null; c.className = 'pool-chip';
  }

  cA = 0; cB = 0;
  for (var k in editTeamPicks) { if (editTeamPicks[k] === 'A') cA++; if (editTeamPicks[k] === 'B') cB++; }

  var safeId = c.getAttribute('data-partida');
  var elA = $('editCountA_' + safeId);
  var elB = $('editCountB_' + safeId);
  if (elA) elA.textContent = cA;
  if (elB) elB.textContent = cB;
}

async function editAddGol(partidaId, jogador, time, golContra) {
  var { data: gid } = await sb.rpc('next_gol_id_grupo', { p_grupo_id: grupoAtual.id });
  var { error: e } = await sb.from('gols').insert({
    gol_id: gid, partida_id: partidaId, pelada_id: peladaAtual.id,
    jogador: jogador, time: time, gol_contra: golContra, grupo_id: grupoAtual.id
  });
  if (e) { showToast(e.message, true); return; }
  await sb.rpc('recalcular_placar', { p_partida_id: partidaId });

  // Recarregar gols
  var { data: gl } = await sb.from('gols').select('*').eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id).order('timestamp');
  editGols = gl || [];

  var safeId = partidaId.replace(/[^a-zA-Z0-9_]/g, '_');
  var listEl = $('editGolsList_' + safeId);
  if (listEl) listEl.innerHTML = renderEditGolsList(safeId);

  showToast(golContra ? 'Gol contra adicionado!' : 'Gol de ' + dn(jogador) + ' adicionado!');
  logAsync(currentUser, 'EDIT_GOL_ADD', jogador + ' T' + time + (golContra ? ' GC' : '') + ' P:' + partidaId);
}

async function editRemoveGol(golId, partidaId) {
  if (!confirm('Remover gol?')) return;
  await sb.from('gols').delete().eq('gol_id', golId).eq('grupo_id', grupoAtual.id);
  await sb.rpc('recalcular_placar', { p_partida_id: partidaId });

  var { data: gl } = await sb.from('gols').select('*').eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id).order('timestamp');
  editGols = gl || [];

  var safeId = partidaId.replace(/[^a-zA-Z0-9_]/g, '_');
  var listEl = $('editGolsList_' + safeId);
  if (listEl) listEl.innerHTML = renderEditGolsList(safeId);

  showToast('Gol removido.');
  logAsync(currentUser, 'EDIT_GOL_REM', golId + ' P:' + partidaId);
}

function editAddSubStart(partidaId) {
  var safeId = partidaId.replace(/[^a-zA-Z0-9_]/g, '_');
  var panel = $('editSubPanel_' + safeId);
  if (!panel) return;

  // Jogadores nos times
  var inTeam = {};
  for (var k in editTeamPicks) { if (editTeamPicks[k]) inTeam[k] = editTeamPicks[k]; }

  // Jogadores ativos (não saíram)
  var saiuMap = {};
  editSubs.forEach(function(s) { saiuMap[s.jogador_saiu] = true; });

  var ativosA = [], ativosB = [];
  for (var k in inTeam) {
    if (saiuMap[k]) continue;
    if (inTeam[k] === 'A') ativosA.push(k);
    if (inTeam[k] === 'B') ativosB.push(k);
  }

  var h = '<div class="card" style="border-color:var(--gold);padding:12px;">';
  h += '<div style="font-size:13px;font-weight:600;margin-bottom:8px;">Nova substituição</div>';

  // Step 1: selecionar quem sai
  h += '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Quem sai?</div>';
  h += '<div class="selecao-container">';
  sa(ativosA).forEach(function(n) {
    h += '<div class="chip" style="border-color:var(--blue);color:var(--blue);" onclick="editSubSelectSaiu(\'' + partidaId + '\',\'' + n + '\',\'A\')">' + dn(n) + ' 🔵</div>';
  });
  sa(ativosB).forEach(function(n) {
    h += '<div class="chip" style="border-color:var(--orange);color:var(--orange);" onclick="editSubSelectSaiu(\'' + partidaId + '\',\'' + n + '\',\'B\')">' + dn(n) + ' 🟠</div>';
  });
  h += '</div>';
  h += '<button class="btn btn-secondary mt12" onclick="editSubCancel(\'' + partidaId + '\')" style="font-size:12px;padding:4px 10px;">Cancelar</button>';
  h += '</div>';

  panel.innerHTML = h;
  panel.style.display = 'block';
}

function editSubSelectSaiu(partidaId, jogadorSaiu, time) {
  var safeId = partidaId.replace(/[^a-zA-Z0-9_]/g, '_');
  var panel = $('editSubPanel_' + safeId);
  if (!panel) return;

  // Presentes que não estão em nenhum time
  var inTeam = {};
  for (var k in editTeamPicks) { if (editTeamPicks[k]) inTeam[k] = true; }

  // Pegar presentes da pelada (todos que estão no pool)
  var poolChips = document.querySelectorAll('#editPlayerPool_' + safeId + ' .pool-chip');
  var todosPresentes = [];
  poolChips.forEach(function(c) { todosPresentes.push(c.getAttribute('data-player')); });

  var disponiveis = todosPresentes.filter(function(n) { return !inTeam[n]; });

  if (disponiveis.length === 0) {
    panel.innerHTML = '<div class="card" style="border-color:var(--gold);padding:12px;">' +
      '<div class="text-muted">Nenhum jogador disponível.</div>' +
      '<button class="btn btn-secondary mt12" onclick="editSubCancel(\'' + partidaId + '\')" style="font-size:12px;padding:4px 10px;">Cancelar</button></div>';
    return;
  }

  var h = '<div class="card" style="border-color:var(--gold);padding:12px;">';
  h += '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">↓ ' + dn(jogadorSaiu) + ' sai</div>';
  h += '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Quem entra?</div>';
  h += '<div class="selecao-container">';
  sa(disponiveis).forEach(function(n) {
    h += '<div class="chip" onclick="editSubConfirm(\'' + partidaId + '\',\'' + jogadorSaiu + '\',\'' + n + '\',\'' + time + '\')">' + dn(n) + '</div>';
  });
  h += '</div>';
  h += '<button class="btn btn-secondary mt12" onclick="editSubCancel(\'' + partidaId + '\')" style="font-size:12px;padding:4px 10px;">Cancelar</button>';
  h += '</div>';

  panel.innerHTML = h;
}

async function editSubConfirm(partidaId, jogadorSaiu, jogadorEntrou, time) {
  var { error: e } = await sb.from('substituicoes').insert({
    partida_id: partidaId, grupo_id: grupoAtual.id,
    time: time, jogador_saiu: jogadorSaiu, jogador_entrou: jogadorEntrou
  });
  if (e) { showToast(e.message, true); return; }
  await addSubToTeam(partidaId, time, jogadorEntrou);

  // Recarregar subs
  var { data: sbs } = await sb.from('substituicoes').select('*').eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id).order('criado_em');
  editSubs = sbs || [];

  var safeId = partidaId.replace(/[^a-zA-Z0-9_]/g, '_');
  var listEl = $('editSubsList_' + safeId);
  if (listEl) listEl.innerHTML = renderEditSubsList(safeId);

  editSubCancel(partidaId);
  showToast('🔄 ' + dn(jogadorSaiu) + ' → ' + dn(jogadorEntrou));
  logAsync(currentUser, 'EDIT_SUB_ADD', jogadorSaiu + ' → ' + jogadorEntrou + ' T' + time + ' P:' + partidaId);
}

async function editRemoveSub(subId, partidaId, jogadorEntrou, time) {
  if (!confirm('Remover substituição?')) return;
  await sb.from('substituicoes').delete().eq('id', subId).eq('grupo_id', grupoAtual.id);
  await removeSubFromTeam(partidaId, time, jogadorEntrou);

  var { data: sbs } = await sb.from('substituicoes').select('*').eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id).order('criado_em');
  editSubs = sbs || [];

  var safeId = partidaId.replace(/[^a-zA-Z0-9_]/g, '_');
  var listEl = $('editSubsList_' + safeId);
  if (listEl) listEl.innerHTML = renderEditSubsList(safeId);

  showToast('Substituição removida.');
  logAsync(currentUser, 'EDIT_SUB_REM', subId + ' P:' + partidaId);
}

function editSubCancel(partidaId) {
  var safeId = partidaId.replace(/[^a-zA-Z0-9_]/g, '_');
  var panel = $('editSubPanel_' + safeId);
  if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
}

async function editSavePartida(partidaId) {
  var tA = [], tB = [];
  for (var k in editTeamPicks) {
    if (editTeamPicks[k] === 'A') tA.push(k);
    if (editTeamPicks[k] === 'B') tB.push(k);
  }

  // Atualizar times
  var { error: e } = await sb.from('partidas').update({
    time_a: tA, time_b: tB
  }).eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id);

  if (e) { showToast('Erro ao salvar times: ' + e.message, true); return; }

  // Recalcular placar e vencedor
  await sb.rpc('recalcular_placar', { p_partida_id: partidaId });

  var { data: p } = await sb.from('partidas').select('placar_a, placar_b').eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id).single();
  if (p) {
    var v = p.placar_a > p.placar_b ? 'A' : (p.placar_b > p.placar_a ? 'B' : 'Empate');
    await sb.from('partidas').update({ vencedor: v }).eq('partida_id', partidaId).eq('grupo_id', grupoAtual.id);
  }

  showToast('✅ Partida atualizada!');
  logAsync(currentUser, 'EDIT_PARTIDA', partidaId);
  closeEditPartida();

  // Recarregar a página atual
  if (homeView === 'detail' && homePeladaDetalhe) {
    loadPeladaDetalhe(homePeladaDetalhe);
  } else {
    loadAoVivo();
  }
}

function closeEditPartida() {
  if (editingPartidaId) {
    var safeId = editingPartidaId.replace(/[^a-zA-Z0-9_]/g, '_');
    var zone = $('editZone_' + safeId);
    if (zone) zone.innerHTML = '';
  }
  editingPartidaId = null;
  editTeamPicks = {};
  editGols = [];
  editSubs = [];
}
