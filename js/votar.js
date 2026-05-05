// ============================================================
// votar.js - Sistema de Notas (avaliação de jogadores)
// Carousel vertical com 2 colunas, botão desvotar, tabela pivot ADM
// ============================================================

var notasLocais = {};            // { nomeJogador: nota } cache local
var votarMensaisSet = {};        // { nome: true } para ordenação na tabela ADM

async function loadVotar() {
  var el = $('votarContent');
  if (!peladaAtual) { el.innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada.</div>'; return; }

  el.innerHTML = '<div class="skeleton"></div>';
  await loadVotarNotas();
}

// ============================================================
// NOTAS (sistema de avaliação)
// ============================================================
async function loadVotarNotas() {
  var el = $('votarContent');
  el.innerHTML = '<div class="skeleton"></div>';

  var jogPromise = sb.from('jogadores').select('nome').eq('grupo_id', grupoAtual.id);
  var mensPromise = sb.from('mensalistas').select('jogador').eq('grupo_id', grupoAtual.id).is('mes_fim', null);
  var minhasNotasPromise = sb.from('notas_jogadores').select('avaliado, nota').eq('grupo_id', grupoAtual.id).eq('avaliador', currentUser);
  var todasNotasPromise = sb.from('notas_jogadores').select('avaliador, avaliado, nota').eq('grupo_id', grupoAtual.id);

  var results = await Promise.all([jogPromise, mensPromise, minhasNotasPromise, todasNotasPromise]);

  var jogadores = results[0].data ? results[0].data.map(function(j) { return j.nome; }) : [];
  var mensalistas = results[1].data ? results[1].data.map(function(m) { return m.jogador; }) : [];
  var minhasNotas = results[2].data || [];
  var todasNotas = results[3].data || [];

  notasLocais = {};
  minhasNotas.forEach(function(n) { notasLocais[n.avaliado] = n.nota; });

  var mediasMap = {};
  todasNotas.forEach(function(n) {
    if (!mediasMap[n.avaliado]) mediasMap[n.avaliado] = { soma: 0, count: 0 };
    mediasMap[n.avaliado].soma += n.nota;
    mediasMap[n.avaliado].count += 1;
  });

  votarMensaisSet = {};
  mensalistas.forEach(function(m) { votarMensaisSet[m] = true; });

  var listaMensais = [];
  var listaAvulsos = [];
  jogadores.forEach(function(nome) {
    if (nome === currentUser) return;
    if (votarMensaisSet[nome]) listaMensais.push(nome);
    else listaAvulsos.push(nome);
  });

  listaMensais.sort(function(a, b) { return a.localeCompare(b); });
  listaAvulsos.sort(function(a, b) { return a.localeCompare(b); });

  renderNotasForm(listaMensais, listaAvulsos, mediasMap, todasNotas);
}

// ============================================================
// RENDER: grid 2 colunas com carousel vertical
// ============================================================
function renderNotasForm(mensais, avulsos, mediasMap, todasNotas) {
  var el = $('votarContent');
  var h = '';

  h += '<div class="section-desc" style="font-size:13px;">Dê notas de 0 a 10 para cada jogador. Arraste o número para cima/baixo. As notas serão usadas para equilibrar a divisão de times.</div>';

  var totalJogadores = mensais.length + avulsos.length;
  var totalAvaliados = 0;
  mensais.concat(avulsos).forEach(function(n) {
    if (notasLocais[n] !== undefined) totalAvaliados++;
  });

  h += '<div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Avaliados: <span style="font-weight:600;color:var(--green);">' + totalAvaliados + '</span>/' + totalJogadores + '</div>';

  if (mensais.length > 0) {
    h += '<div class="card">';
    h += '<div class="card-title">📋 Mensalistas</div>';
    h += '<div class="nota-grid" id="notaGridMensais"></div>';
    h += '</div>';
  }

  if (avulsos.length > 0) {
    h += '<div class="card">';
    h += '<div class="card-title">🏃 Avulsos</div>';
    h += '<div class="nota-grid" id="notaGridAvulsos"></div>';
    h += '</div>';
  }

  if (totalJogadores === 0) {
    h += '<div class="empty-state"><span class="emoji">📭</span>Nenhum jogador cadastrado no grupo.</div>';
  }

  if (isAdm && todasNotas && todasNotas.length > 0) {
    h += renderNotasDetalhadasAdm(todasNotas, mensais, avulsos);
  }

  el.innerHTML = h;

  // Inicializar carousels
  if (mensais.length > 0) initNotaGrid('notaGridMensais', mensais, mediasMap);
  if (avulsos.length > 0) initNotaGrid('notaGridAvulsos', avulsos, mediasMap);
}

function getNotaColor(v) {
  if (v === null || v === undefined) return 'var(--text3)';
  if (v <= 2) return '#e24b4a';
  if (v <= 4) return '#d85a30';
  if (v <= 6) return '#ba7517';
  if (v <= 8) return '#639922';
  return '#1d9e75';
}

function initNotaGrid(containerId, jogadores, mediasMap) {
  var container = $(containerId);
  if (!container) return;

  // VALS: null(unvote), 0, 1, 2, ..., 10, null(unvote)
  var VALS = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null];
  var IH = 36;

  jogadores.forEach(function(nome, pi) {
    var notaAtual = notasLocais[nome];
    var media = mediasMap[nome];
    var mediaStr = media ? (media.soma / media.count).toFixed(1) : '—';
    var uid = containerId + '_' + pi;

    var cell = document.createElement('div');
    cell.className = 'nota-cell';

    // Barra de cor
    var bar = document.createElement('div');
    bar.className = 'nota-bar';
    bar.id = 'nb_' + uid;
    bar.style.background = getNotaColor(notaAtual);

    // Info
    var info = document.createElement('div');
    info.className = 'nota-info';
    var nameSpan = '<span class="nota-name">' + dn(nome) + '</span>';
    var avgSpan = isAdm ? '<span class="nota-avg">Média: ' + mediaStr + '</span>' : '';
    info.innerHTML = nameSpan + avgSpan;

    // Número (carousel vertical)
    var nw = document.createElement('div');
    nw.className = 'nota-num-wrap' + (notaAtual === undefined ? ' novote' : '');
    nw.id = 'nn_' + uid;

    var strip = document.createElement('div');
    strip.className = 'nota-strip';
    strip.id = 'ns_' + uid;

    VALS.forEach(function(v) {
      var d = document.createElement('div');
      d.className = 'nota-item';
      if (v === null) {
        d.classList.add('nota-item-x');
        d.textContent = '✕';
      } else {
        d.textContent = v;
      }
      strip.appendChild(d);
    });

    nw.appendChild(strip);

    // Botão desvotar
    var xb = document.createElement('button');
    xb.className = 'nota-unvote-btn';
    xb.textContent = '✕';
    xb.title = 'Desvotar';

    cell.appendChild(bar);
    cell.appendChild(info);
    cell.appendChild(nw);
    cell.appendChild(xb);
    container.appendChild(cell);

    // Estado inicial
    var activeIdx = notaAtual !== undefined ? notaAtual + 1 : 0;

    // Snap sem animação
    (function() {
      strip.classList.add('nota-strip-drag');
      strip.style.transform = 'translateY(' + (-activeIdx * IH) + 'px)';
      requestAnimationFrame(function() { strip.classList.remove('nota-strip-drag'); });
    })();

    // Botão desvotar handler
    xb.addEventListener('click', function() {
      activeIdx = 0;
      strip.style.transform = 'translateY(0px)';
      nw.classList.add('novote');
      bar.style.background = getNotaColor(null);
      salvarDesvoto(nome);
    });

    // Drag/swipe vertical
    (function() {
      var startY = 0, startOff = 0, dragging = false, curOff = 0;

      function onStart(ey) {
        dragging = true;
        startY = ey;
        strip.classList.add('nota-strip-drag');
        var t = strip.style.transform;
        var m = t.match(/translateY\((.+?)px\)/);
        startOff = m ? parseFloat(m[1]) : 0;
        curOff = startOff;
      }
      function onMove(ey) {
        if (!dragging) return;
        curOff = startOff + (ey - startY);
        strip.style.transform = 'translateY(' + curOff + 'px)';
      }
      function onEnd() {
        if (!dragging) return;
        dragging = false;
        strip.classList.remove('nota-strip-drag');
        var nearest = Math.round(-curOff / IH);
        nearest = Math.max(0, Math.min(VALS.length - 1, nearest));
        activeIdx = nearest;
        strip.style.transform = 'translateY(' + (-nearest * IH) + 'px)';

        var val = VALS[nearest];
        if (val === null) {
          nw.classList.add('novote');
          bar.style.background = getNotaColor(null);
          salvarDesvoto(nome);
        } else {
          nw.classList.remove('novote');
          bar.style.background = getNotaColor(val);
          salvarNota(nome, val);
        }
      }

      nw.addEventListener('mousedown', function(e) { e.preventDefault(); onStart(e.clientY); });
      document.addEventListener('mousemove', function(e) { if (dragging) { e.preventDefault(); onMove(e.clientY); } });
      document.addEventListener('mouseup', function() { onEnd(); });
      nw.addEventListener('touchstart', function(e) { onStart(e.touches[0].clientY); }, { passive: true });
      nw.addEventListener('touchmove', function(e) { if (dragging) { e.preventDefault(); onMove(e.touches[0].clientY); } }, { passive: false });
      nw.addEventListener('touchend', function() { onEnd(); });
    })();
  });
}

// ============================================================
// SALVAR NOTA / DESVOTO
// ============================================================
async function salvarNota(nome, novaNota) {
  var notaAnterior = notasLocais[nome];
  if (notaAnterior !== undefined && notaAnterior === novaNota) return;

  var { error: e } = await sb.from('notas_jogadores').upsert({
    grupo_id: grupoAtual.id,
    avaliador: currentUser,
    avaliado: nome,
    nota: novaNota,
    atualizado_em: new Date().toISOString()
  }, { onConflict: 'grupo_id,avaliador,avaliado' });

  if (e) { showToast('Erro ao salvar nota: ' + e.message, true); return; }

  await sb.from('notas_jogadores_historico').insert({
    grupo_id: grupoAtual.id,
    avaliador: currentUser,
    avaliado: nome,
    nota_anterior: notaAnterior !== undefined ? notaAnterior : null,
    nota_nova: novaNota
  });

  notasLocais[nome] = novaNota;
  updateNotaCounter();
  showToast(dn(nome) + ': nota ' + novaNota + ' ✓');
  logAsync(currentUser, 'NOTA', nome + ' = ' + novaNota);
}

async function salvarDesvoto(nome) {
  var notaAnterior = notasLocais[nome];
  if (notaAnterior === undefined) return;

  var { error: e } = await sb.from('notas_jogadores')
    .delete()
    .eq('grupo_id', grupoAtual.id)
    .eq('avaliador', currentUser)
    .eq('avaliado', nome);

  if (e) { showToast('Erro ao desvotar: ' + e.message, true); return; }

  await sb.from('notas_jogadores_historico').insert({
    grupo_id: grupoAtual.id,
    avaliador: currentUser,
    avaliado: nome,
    nota_anterior: notaAnterior,
    nota_nova: null
  });

  delete notasLocais[nome];
  updateNotaCounter();
  showToast(dn(nome) + ': voto removido ✕');
  logAsync(currentUser, 'DESVOTO', nome);
}

function updateNotaCounter() {
  var counterEl = document.querySelector('#votarContent .section-desc + div > span');
  if (!counterEl) return;
  var count = Object.keys(notasLocais).length;
  counterEl.textContent = count;
}

// ============================================================
// NOTAS DETALHADAS (ADM) - TABELA PIVOT
// Linhas = avaliados, Colunas = avaliadores
// Última linha = média do jogador
// Ordem: mensais (alfa) depois não-mensais (alfa)
// ============================================================
function renderNotasDetalhadasAdm(todasNotas, mensais, avulsos) {
  // Coletar todos os avaliados e avaliadores únicos
  var avaliadosSet = {};
  var avaliadoresSet = {};
  todasNotas.forEach(function(n) {
    avaliadosSet[n.avaliado] = true;
    avaliadoresSet[n.avaliador] = true;
  });

  // Função de ordenação: mensais primeiro (alfa), depois não-mensais (alfa)
  function sortPeladaOrder(a, b) {
    var aM = votarMensaisSet[a] ? 0 : 1;
    var bM = votarMensaisSet[b] ? 0 : 1;
    if (aM !== bM) return aM - bM;
    return a.localeCompare(b);
  }

  var avaliados = Object.keys(avaliadosSet).sort(sortPeladaOrder);
  var avaliadores = Object.keys(avaliadoresSet).sort(sortPeladaOrder);

  // Mapa: avaliado -> avaliador -> nota
  var notaMap = {};
  todasNotas.forEach(function(n) {
    if (!notaMap[n.avaliado]) notaMap[n.avaliado] = {};
    notaMap[n.avaliado][n.avaliador] = n.nota;
  });

  var h = '<div class="card mt16">';
  h += '<div class="card-title">🔍 Notas Detalhadas (ADM)</div>';
  h += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">';
  h += '<table class="log-table notas-pivot-table">';

  // Header: vazio + avaliadores (nomes curtos)
  h += '<thead><tr><th class="pivot-th-fixed">Jogador</th>';
  avaliadores.forEach(function(av) {
    var short = dn(av);
    if (short.length > 6) short = short.substring(0, 5) + '…';
    h += '<th class="pivot-th-avaliador" title="' + dn(av) + '">' + short + '</th>';
  });
  h += '<th class="pivot-th-media">Média</th>';
  h += '</tr></thead>';

  // Body: linhas = avaliados
  h += '<tbody>';
  avaliados.forEach(function(jogador) {
    var soma = 0, count = 0;
    h += '<tr>';
    h += '<td class="pivot-td-nome">' + dn(jogador) + '</td>';
    avaliadores.forEach(function(av) {
      var nota = notaMap[jogador] && notaMap[jogador][av] !== undefined ? notaMap[jogador][av] : null;
      if (nota !== null) {
        soma += nota;
        count++;
        var color = getNotaColor(nota);
        h += '<td class="pivot-td-nota" style="color:' + color + ';font-weight:600;">' + nota + '</td>';
      } else {
        h += '<td class="pivot-td-nota pivot-td-vazio">—</td>';
      }
    });
    var media = count > 0 ? (soma / count).toFixed(1) : '—';
    var mediaColor = count > 0 ? getNotaColor(Math.round(soma / count)) : 'var(--text3)';
    h += '<td class="pivot-td-media" style="color:' + mediaColor + ';">' + media + '</td>';
    h += '</tr>';
  });
  h += '</tbody>';

  h += '</table></div>';
  h += '</div>';
  return h;
}
