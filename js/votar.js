// ============================================================
// votar.js - Sistema de Notas (avaliacao de jogadores)
// Identidade definida aqui (votarUser), persiste na sessão
// ============================================================

var notasLocais = {};
var votarMensaisSet = {};

async function loadVotar() {
  var el = $('votarContent');
  if (!peladaAtual) { el.innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada.</div>'; return; }

  // Se ainda não sei quem é o avaliador nesta sessão, pedir o nome
  if (!votarUser) {
    await renderVotarIdentityPicker();
    return;
  }

  el.innerHTML = '<div class="skeleton"></div>';
  await loadVotarNotas();
}

// ============================================================
// SELETOR DE IDENTIDADE (só na Votação)
// ============================================================
async function renderVotarIdentityPicker() {
  var el = $('votarContent');
  el.innerHTML = '<div class="skeleton"></div>';

  var { data: j } = await sb.from('jogadores').select('nome').eq('grupo_id', grupoAtual.id).order('nome');
  var jogadores = j ? j.map(function(r) { return r.nome; }) : [];

  var opts = '<option value="">Selecione seu nome...</option>';
  sa(jogadores).forEach(function(n) {
    opts += '<option value="' + n.replace(/"/g, '&quot;') + '">' + dn(n) + '</option>';
  });

  var h = '<div class="card">';
  h += '<div class="card-title">🗳️ Quem é você?</div>';
  h += '<div class="section-desc" style="font-size:13px;margin-bottom:16px;">Selecione seu nome para dar as notas. Suas notas ficam vinculadas a você.</div>';
  h += '<div class="vote-category"><label>Seu nome</label>';
  h += '<select class="vote-select" id="votarIdentitySelect">' + opts + '</select></div>';
  h += '<button class="btn btn-primary" onclick="confirmarVotarIdentity()">Continuar</button>';
  h += '</div>';

  el.innerHTML = h;
}

function confirmarVotarIdentity() {
  var v = $('votarIdentitySelect').value;
  if (!v) { showToast('Selecione seu nome.', true); return; }
  votarUser = v;
  // currentUser reflete a identidade da votação (a menos que ADM esteja destravado)
  if (!isAdm) currentUser = v;
  loadVotar();
}

function trocarVotarIdentity() {
  votarUser = null;
  if (!isAdm) currentUser = null;
  loadVotar();
}

// ============================================================
// NOTAS (sistema de avaliacao)
// ============================================================
async function loadVotarNotas() {
  var el = $('votarContent');
  el.innerHTML = '<div class="skeleton"></div>';

  // Avaliador é sempre votarUser aqui (identidade da votação)
  var avaliador = votarUser;

  var jogPromise = sb.from('jogadores').select('nome').eq('grupo_id', grupoAtual.id);
  var mensPromise = sb.from('mensalistas').select('jogador').eq('grupo_id', grupoAtual.id).is('mes_fim', null);
  var minhasNotasPromise = sb.from('notas_jogadores').select('avaliado, nota').eq('grupo_id', grupoAtual.id).eq('avaliador', avaliador);
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
    if (nome === avaliador) return;
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

  // Cabeçalho com identidade atual + trocar
  h += '<div class="flex-between" style="margin-bottom:12px;padding:10px 14px;background:var(--greenGlow);border:1px solid rgba(34,197,94,0.3);border-radius:10px;">';
  h += '<span style="font-size:13px;color:var(--green);">Avaliando como <strong>' + dn(votarUser) + '</strong></span>';
  h += '<button class="btn-logout" style="font-size:11px;padding:4px 10px;" onclick="trocarVotarIdentity()">Trocar</button>';
  h += '</div>';

  h += '<div class="section-desc" style="font-size:13px;">De notas de 0 a 10 para cada jogador. Arraste o numero para cima/baixo. As notas serao usadas para equilibrar a divisao de times.</div>';

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

  var VALS = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null];
  var IH = 36;

  jogadores.forEach(function(nome, pi) {
    var notaAtual = notasLocais[nome];
    var media = mediasMap[nome];
    var mediaStr = media ? (media.soma / media.count).toFixed(1) : '\u2014';
    var uid = containerId + '_' + pi;

    var cell = document.createElement('div');
    cell.className = 'nota-cell';

    var bar = document.createElement('div');
    bar.className = 'nota-bar';
    bar.id = 'nb_' + uid;
    bar.style.background = getNotaColor(notaAtual);

    var info = document.createElement('div');
    info.className = 'nota-info';
    var nameSpan = '<span class="nota-name">' + dn(nome) + '</span>';
    var avgSpan = isAdm ? '<span class="nota-avg">Media: ' + mediaStr + '</span>' : '';
    info.innerHTML = nameSpan + avgSpan;

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
        d.textContent = '\u2715';
      } else {
        d.textContent = v;
      }
      strip.appendChild(d);
    });

    nw.appendChild(strip);

    var xb = document.createElement('button');
    xb.className = 'nota-unvote-btn';
    xb.textContent = '\u2715';
    xb.title = 'Desvotar';

    cell.appendChild(bar);
    cell.appendChild(info);
    cell.appendChild(nw);
    cell.appendChild(xb);
    container.appendChild(cell);

    var activeIdx = notaAtual !== undefined ? notaAtual + 1 : 0;

    (function() {
      strip.classList.add('nota-strip-drag');
      strip.style.transform = 'translateY(' + (-activeIdx * IH) + 'px)';
      requestAnimationFrame(function() { strip.classList.remove('nota-strip-drag'); });
    })();

    xb.addEventListener('click', function() {
      activeIdx = 0;
      strip.style.transform = 'translateY(0px)';
      nw.classList.add('novote');
      bar.style.background = getNotaColor(null);
      salvarDesvoto(nome);
    });

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
  var avaliador = votarUser;
  var notaAnterior = notasLocais[nome];
  if (notaAnterior !== undefined && notaAnterior === novaNota) return;

  var { error: e } = await sb.from('notas_jogadores').upsert({
    grupo_id: grupoAtual.id,
    avaliador: avaliador,
    avaliado: nome,
    nota: novaNota,
    atualizado_em: new Date().toISOString()
  }, { onConflict: 'grupo_id,avaliador,avaliado' });

  if (e) { showToast('Erro ao salvar nota: ' + e.message, true); return; }

  await sb.from('notas_jogadores_historico').insert({
    grupo_id: grupoAtual.id,
    avaliador: avaliador,
    avaliado: nome,
    nota_anterior: notaAnterior !== undefined ? notaAnterior : null,
    nota_nova: novaNota
  });

  notasLocais[nome] = novaNota;
  updateNotaCounter();
  showToast(dn(nome) + ': nota ' + novaNota + ' \u2713');
  logAsync(avaliador, 'NOTA', nome + ' = ' + novaNota);
}

async function salvarDesvoto(nome) {
  var avaliador = votarUser;
  var notaAnterior = notasLocais[nome];
  if (notaAnterior === undefined) return;

  var { error: e } = await sb.from('notas_jogadores')
    .delete()
    .eq('grupo_id', grupoAtual.id)
    .eq('avaliador', avaliador)
    .eq('avaliado', nome);

  if (e) { showToast('Erro ao desvotar: ' + e.message, true); return; }

  await sb.from('notas_jogadores_historico').insert({
    grupo_id: grupoAtual.id,
    avaliador: avaliador,
    avaliado: nome,
    nota_anterior: notaAnterior,
    nota_nova: null
  });

  delete notasLocais[nome];
  updateNotaCounter();
  showToast(dn(nome) + ': voto removido \u2715');
  logAsync(avaliador, 'DESVOTO', nome);
}

function updateNotaCounter() {
  var counterEl = document.querySelector('#votarContent .section-desc + div > span');
  if (!counterEl) return;
  var count = Object.keys(notasLocais).length;
  counterEl.textContent = count;
}

// ============================================================
// NOTAS DETALHADAS (ADM) - 2 TABELAS PIVOT + ORDENACAO
// ============================================================
var pivotSortState = {};

function renderNotasDetalhadasAdm(todasNotas, mensais, avulsos) {
  var notasMensais = todasNotas.filter(function(n) { return votarMensaisSet[n.avaliado]; });
  var notasAvulsos = todasNotas.filter(function(n) { return !votarMensaisSet[n.avaliado]; });

  var h = '';

  if (notasMensais.length > 0) {
    h += buildPivotTable('pivotMensais', '\uD83D\uDD0D Notas Detalhadas: Mensalistas', notasMensais);
  }

  if (notasAvulsos.length > 0) {
    h += buildPivotTable('pivotAvulsos', '\uD83D\uDD0D Notas Detalhadas: Diaristas', notasAvulsos);
  }

  return h;
}

function buildPivotTable(tableId, title, notas) {
  var avaliadosSet = {};
  var avaliadoresSet = {};
  notas.forEach(function(n) {
    avaliadosSet[n.avaliado] = true;
    avaliadoresSet[n.avaliador] = true;
  });

  var avaliados = Object.keys(avaliadosSet).sort(function(a, b) { return a.localeCompare(b); });
  var avaliadores = Object.keys(avaliadoresSet).sort(function(a, b) { return a.localeCompare(b); });

  var notaMap = {};
  notas.forEach(function(n) {
    if (!notaMap[n.avaliado]) notaMap[n.avaliado] = {};
    notaMap[n.avaliado][n.avaliador] = n.nota;
  });

  if (!pivotSortState[tableId]) {
    pivotSortState[tableId] = { col: null, dir: null };
  }

  var h = '<div class="card mt16">';
  h += '<div class="card-title">' + title + '</div>';
  h += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">';
  h += '<table class="log-table notas-pivot-table" id="' + tableId + '">';

  h += '<thead><tr><th class="pivot-th-fixed pivot-sortable" data-table="' + tableId + '" data-col="nome" onclick="sortPivotTable(\'' + tableId + '\',\'nome\')">Jogador ' + getSortArrow(tableId, 'nome') + '</th>';
  avaliadores.forEach(function(av) {
    var short = dn(av);
    if (short.length > 6) short = short.substring(0, 5) + '\u2026';
    h += '<th class="pivot-th-avaliador pivot-sortable" title="' + dn(av) + '" data-table="' + tableId + '" data-col="av_' + av + '" onclick="sortPivotTable(\'' + tableId + '\',\'av_' + av.replace(/'/g, "\\'") + '\')">' + short + ' ' + getSortArrow(tableId, 'av_' + av) + '</th>';
  });
  h += '<th class="pivot-th-media pivot-sortable" data-table="' + tableId + '" data-col="media" onclick="sortPivotTable(\'' + tableId + '\',\'media\')">' + 'Media ' + getSortArrow(tableId, 'media') + '</th>';
  h += '</tr></thead>';

  var rows = avaliados.map(function(jogador) {
    var soma = 0, count = 0;
    var rowData = { nome: jogador, notas: {}, media: null };
    avaliadores.forEach(function(av) {
      var nota = notaMap[jogador] && notaMap[jogador][av] !== undefined ? notaMap[jogador][av] : null;
      rowData.notas[av] = nota;
      if (nota !== null) { soma += nota; count++; }
    });
    rowData.media = count > 0 ? soma / count : null;
    return rowData;
  });

  var st = pivotSortState[tableId];
  if (st.col && st.dir) {
    rows.sort(function(a, b) {
      var va, vb;
      if (st.col === 'nome') {
        va = a.nome; vb = b.nome;
        return st.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      } else if (st.col === 'media') {
        va = a.media; vb = b.media;
      } else if (st.col.indexOf('av_') === 0) {
        var avKey = st.col.substring(3);
        va = a.notas[avKey]; vb = b.notas[avKey];
      }
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return st.dir === 'asc' ? va - vb : vb - va;
    });
  }

  h += '<tbody>';
  rows.forEach(function(row) {
    h += '<tr>';
    h += '<td class="pivot-td-nome">' + dn(row.nome) + '</td>';
    avaliadores.forEach(function(av) {
      var nota = row.notas[av];
      if (nota !== null) {
        var color = getNotaColor(nota);
        h += '<td class="pivot-td-nota" style="color:' + color + ';font-weight:600;">' + nota + '</td>';
      } else {
        h += '<td class="pivot-td-nota pivot-td-vazio">\u2014</td>';
      }
    });
    var mediaStr = row.media !== null ? row.media.toFixed(1) : '\u2014';
    var mediaColor = row.media !== null ? getNotaColor(Math.round(row.media)) : 'var(--text3)';
    h += '<td class="pivot-td-media" style="color:' + mediaColor + ';">' + mediaStr + '</td>';
    h += '</tr>';
  });
  h += '</tbody>';

  h += '</table></div></div>';

  window['_pivotData_' + tableId] = { notas: notas, title: title };

  return h;
}

function getSortArrow(tableId, col) {
  var st = pivotSortState[tableId];
  if (!st || st.col !== col) return '<span class="pivot-sort-arrow">\u2195</span>';
  if (st.dir === 'asc') return '<span class="pivot-sort-arrow active">\u25B2</span>';
  return '<span class="pivot-sort-arrow active">\u25BC</span>';
}

function sortPivotTable(tableId, col) {
  var st = pivotSortState[tableId];
  if (!st) { pivotSortState[tableId] = { col: null, dir: null }; st = pivotSortState[tableId]; }

  if (st.col === col) {
    if (st.dir === 'asc') { st.dir = 'desc'; }
    else if (st.dir === 'desc') { st.col = null; st.dir = null; }
  } else {
    st.col = col;
    st.dir = col === 'nome' ? 'asc' : 'desc';
  }

  var data = window['_pivotData_' + tableId];
  if (!data) return;

  var el = document.getElementById(tableId);
  if (!el) return;

  var wrapper = el.closest('.card');
  if (!wrapper) return;

  var newHtml = buildPivotTable(tableId, data.title, data.notas);
  var temp = document.createElement('div');
  temp.innerHTML = newHtml;
  wrapper.replaceWith(temp.firstElementChild);
}
