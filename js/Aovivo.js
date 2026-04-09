// ============================================================
// aovivo.js - Ao Vivo, partidas, gols, realtime
// ============================================================

var aoVivoPresentes = [];
var teamPicks = {};

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
        rh += '<div class="flex-between" style="padding:8px 0;border-bottom:1px solid rgba(36,48,73,0.3);font-size:13px;"><span>P' + p.numero + '</span><span style="font-weight:600;">' + p.placar_a + ' x ' + p.placar_b + '</span><span class="text-muted">' + vl + '</span></div>';
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
    var { data: gl } = await sb.from('gols').select('*').eq('partida_id', at.partida_id).eq('grupo_id', grupoAtual.id).order('timestamp');
    renderPartidaAtiva(at, gl || [], tp);
    setupRealtime(at.partida_id);
  } else {
    var pn = tp.length === 0 ? 1 : tp[tp.length - 1].numero + 1;
    renderSetupPartida(tp, pn);
    if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  }
}

function setupRealtime(pid) {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel('av-' + pid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gols', filter: 'partida_id=eq.' + pid }, function() { loadAoVivo(); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'partidas', filter: 'partida_id=eq.' + pid }, function() { loadAoVivo(); })
    .subscribe();
}

function renderSetupPartida(tp, pn) {
  var el = $('aoVivoContent');
  teamPicks = {};

  var rh = '';
  if (tp.length > 0) {
    rh = '<div class="card"><div class="card-title">📋 Partidas</div>';
    tp.forEach(function(p) {
      if (p.status !== 'Finalizada') return;
      var vl = p.vencedor === 'A' ? '🔵 A' : (p.vencedor === 'B' ? '🟠 B' : '🤝 Emp');
      rh += '<div class="flex-between" style="padding:8px 0;border-bottom:1px solid rgba(36,48,73,0.3);font-size:13px;"><span>P' + p.numero + '</span><span style="font-weight:600;">' + p.placar_a + ' x ' + p.placar_b + '</span><span class="text-muted">' + vl + '</span></div>';
    });
    rh += '</div>';
  }

  var po = sa(aoVivoPresentes), ph = '';
  po.forEach(function(n) { ph += '<div class="pool-chip" data-player="' + n + '" onclick="pickPlayer(this)">' + dn(n) + '</div>'; });

  el.innerHTML = rh +
    '<div class="card"><div class="card-title">⚽ Partida ' + pn + '</div>' +
    '<div class="team-pick-label">1º=🔵A, 2º=🟠B, 3º=remove</div>' +
    '<div class="player-pool" id="playerPool">' + ph + '</div>' +
    '<div class="team-counters mt8">🔵 A: <span id="countA">0</span>/5 🟠 B: <span id="countB">0</span>/5</div></div>' +
    '<button class="btn btn-primary" onclick="iniciarPartida(' + pn + ')">Iniciar ' + pn + '</button>' +
    '<button class="btn btn-danger mt12" onclick="confirmarEncerrarPelada()" style="margin-top:12px;">🏁 Encerrar</button>';
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

function renderPartidaAtiva(part, gols, tp) {
  var el = $('aoVivoContent');

  function bTR(pl, tl) {
    var po = sa(pl), h = '';
    po.forEach(function(n) {
      h += '<div class="team-player-row"><span class="team-player-name">' + dn(n) + '</span>' +
        '<button class="goal-btn goal-btn-normal" onclick="mGol(\'' + part.partida_id + '\',\'' + n + '\',\'' + tl + '\',false)">⚽</button>' +
        '<button class="goal-btn goal-btn-contra" onclick="mGol(\'' + part.partida_id + '\',\'' + n + '\',\'' + tl + '\',true)">🔄</button></div>';
    });
    return h;
  }

  var gl = '';
  if (gols.length > 0) {
    gl = '<div class="card"><div class="card-title">⚽ Gols</div><div class="gol-log">';
    gols.forEach(function(g) {
      var tc = g.time === 'A' ? 'var(--blue)' : 'var(--orange)';
      var tn = g.time === 'A' ? 'A' : 'B';
      var lb = g.gol_contra ? '🔄 GC ' + dn(g.jogador) + ' (' + tn + ')' : '⚽ ' + dn(g.jogador) + ' (' + tn + ')';
      gl += '<div class="gol-item"><span style="color:' + tc + '">' + lb + '</span><button class="gol-remove" onclick="rGol(\'' + g.gol_id + '\',\'' + part.partida_id + '\')">✕</button></div>';
    });
    gl += '</div></div>';
  }

  el.innerHTML =
    '<div class="scoreboard"><div class="scoreboard-match">Partida ' + part.numero + '</div>' +
    '<div class="scoreboard-score"><span class="score-a">' + part.placar_a + '</span><span class="score-x">×</span><span class="score-b">' + part.placar_b + '</span></div>' +
    '<div class="scoreboard-labels"><span>🔵 A</span><span>🟠 B</span></div></div>' +
    '<div class="team-section"><div class="team-header team-header-a">🔵 Time A</div><div class="team-players">' + bTR(part.time_a, 'A') + '</div></div>' +
    '<div class="team-section"><div class="team-header team-header-b">🟠 Time B</div><div class="team-players">' + bTR(part.time_b, 'B') + '</div></div>' +
    gl +
    '<button class="btn btn-primary mt16" onclick="fPart(\'' + part.partida_id + '\')">✅ Finalizar ' + part.numero + '</button>';
}

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
