// ============================================================
// resultados.js - Ranking, artilharia, vitórias, votos detalhados
// ============================================================

function switchResultTab(t) {
  document.querySelectorAll('#resultTabs .tab').forEach(function(tb) { tb.classList.remove('active'); });
  ['resultadosSemana','resultadosGeral','resultadosArtilharia','resultadosVitorias'].forEach(function(id) { $(id).style.display = 'none'; });

  if (t === 'semana') { document.querySelectorAll('#resultTabs .tab')[0].classList.add('active'); $('resultadosSemana').style.display = 'block'; }
  else if (t === 'geral') { document.querySelectorAll('#resultTabs .tab')[1].classList.add('active'); $('resultadosGeral').style.display = 'block'; }
  else if (t === 'artilharia') { document.querySelectorAll('#resultTabs .tab')[2].classList.add('active'); $('resultadosArtilharia').style.display = 'block'; }
  else if (t === 'vitorias') { document.querySelectorAll('#resultTabs .tab')[3].classList.add('active'); $('resultadosVitorias').style.display = 'block'; }
}

async function loadResultados() {
  showSkeleton('resultadosSemana');

  if (peladaAtual) {
    var { data: vs } = await sb.from('votos').select('*').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id);
    var df = peladaAtual.data;
    try { df = new Date(peladaAtual.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}
    renderResultados(buildRanking(vs || []), 'resultadosSemana', peladaAtual.id + ' (' + df + ')');
    if (isAdm) { $('votosDetalhados').style.display = 'block'; renderVotosDetalhados(vs || []); }
  } else {
    $('resultadosSemana').innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada.</div>';
  }

  // Geral
  var { data: av } = await sb.from('votos').select('*').eq('grupo_id', grupoAtual.id);
  renderResultados(buildRanking(av || []), 'resultadosGeral', 'Ranking Geral');

  // Artilharia
  var { data: ag } = await sb.from('gols').select('*').eq('grupo_id', grupoAtual.id).eq('gol_contra', false);
  var am = {};
  (ag || []).forEach(function(g) { am[g.jogador] = (am[g.jogador] || 0) + 1; });
  renderRankingSimples(
    Object.keys(am).map(function(n) { return { nome: n, gols: am[n] }; }).sort(function(a, b) { return b.gols - a.gols; }),
    'resultadosArtilharia', '⚽ Artilharia', 'gols'
  );

  // Vitórias
  var { data: ap } = await sb.from('partidas').select('*').eq('grupo_id', grupoAtual.id).eq('status', 'Finalizada').neq('vencedor', 'Empate').neq('vencedor', '');
  var vm = {};
  (ap || []).forEach(function(p) {
    var tw = p.vencedor === 'A' ? p.time_a : p.time_b;
    if (tw) tw.forEach(function(n) { if (n) vm[n.trim()] = (vm[n.trim()] || 0) + 1; });
  });
  renderRankingSimples(
    Object.keys(vm).map(function(n) { return { nome: n, vitorias: vm[n] }; }).sort(function(a, b) { return b.vitorias - a.vitorias; }),
    'resultadosVitorias', '🏆 Vitórias', 'vitorias'
  );
}

function buildRanking(v) {
  var pr = ['Goleiro','MVP','Selecao','Decepcao','Revelacao'], r = {};
  pr.forEach(function(p) {
    var c = {};
    v.forEach(function(x) { if (x.premio === p) c[x.votado] = (c[x.votado] || 0) + 1; });
    r[p] = Object.keys(c).map(function(n) { return { nome: n, votos: c[n] }; }).sort(function(a, b) { return b.votos - a.votos; });
  });
  return r;
}

function renderRankingSimples(rk, cid, tit, campo) {
  var h = '<div class="card"><div class="card-title">' + tit + '</div>';
  if (!rk || rk.length === 0) h += '<div class="text-muted">Sem dados.</div>';
  else {
    h += '<ul class="ranking-list">';
    for (var r = 0; r < rk.length && r < 20; r++) {
      var pc = r === 0 ? 'gold' : r === 1 ? 'silver' : r === 2 ? 'bronze' : 'normal';
      h += '<li class="ranking-item"><div class="ranking-pos ' + pc + '">' + (r + 1) + '</div><div class="ranking-name">' + dn(rk[r].nome) + '</div><div class="ranking-votes">' + rk[r][campo] + '</div></li>';
    }
    h += '</ul>';
  }
  h += '</div>';
  $(cid).innerHTML = h;
}

function renderResultados(res, cid, tit) {
  var pc = [{ key: 'Goleiro', emoji: '🧤' }, { key: 'MVP', emoji: '⭐' }, { key: 'Selecao', emoji: '🏅' }, { key: 'Decepcao', emoji: '😞' }, { key: 'Revelacao', emoji: '🌟' }];
  var h = '<div class="section-desc">' + tit + '</div>';
  pc.forEach(function(c) {
    var rk = res[c.key] || [];
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
  $(cid).innerHTML = h;
}

function renderVotosDetalhados(v) {
  var el = $('votosDetalhadosContent');
  if (v.length === 0) { el.innerHTML = '<div class="text-muted">Nenhum voto.</div>'; return; }
  var h = '<div style="overflow-x:auto;"><table class="log-table"><tr><th>Votante</th><th>Prêmio</th><th>Votado</th><th>Hora</th></tr>';
  v.forEach(function(x) {
    var ts = x.timestamp ? new Date(x.timestamp).toLocaleString('pt-BR') : '';
    h += '<tr><td>' + dn(x.votante) + '</td><td>' + x.premio + '</td><td>' + dn(x.votado) + '</td><td class="log-time">' + ts + '</td></tr>';
  });
  h += '</table></div>';
  el.innerHTML = h;
}
