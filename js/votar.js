// ============================================================
// votar.js - Sistema de Notas (avaliação de jogadores)
// ============================================================

var notasLocais = {};            // { nomeJogador: nota } cache local enquanto edita

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

  // Buscar em paralelo: jogadores, mensalistas ativos, minhas notas, todas as notas
  var jogPromise = sb.from('jogadores').select('nome').eq('grupo_id', grupoAtual.id);
  var mensPromise = sb.from('mensalistas').select('jogador').eq('grupo_id', grupoAtual.id).is('mes_fim', null);
  var minhasNotasPromise = sb.from('notas_jogadores').select('avaliado, nota').eq('grupo_id', grupoAtual.id).eq('avaliador', currentUser);
  var todasNotasPromise = sb.from('notas_jogadores').select('avaliador, avaliado, nota').eq('grupo_id', grupoAtual.id);

  var results = await Promise.all([jogPromise, mensPromise, minhasNotasPromise, todasNotasPromise]);

  var jogadores = results[0].data ? results[0].data.map(function(j) { return j.nome; }) : [];
  var mensalistas = results[1].data ? results[1].data.map(function(m) { return m.jogador; }) : [];
  var minhasNotas = results[2].data || [];
  var todasNotas = results[3].data || [];

  // Mapa de notas do avaliador
  notasLocais = {};
  minhasNotas.forEach(function(n) { notasLocais[n.avaliado] = n.nota; });

  // Mapa de médias
  var mediasMap = {};
  todasNotas.forEach(function(n) {
    if (!mediasMap[n.avaliado]) mediasMap[n.avaliado] = { soma: 0, count: 0 };
    mediasMap[n.avaliado].soma += n.nota;
    mediasMap[n.avaliado].count += 1;
  });

  // Separar mensais e avulsos (excluindo o próprio jogador)
  var mensaisSet = {};
  mensalistas.forEach(function(m) { mensaisSet[m] = true; });

  var listaMensais = [];
  var listaAvulsos = [];
  jogadores.forEach(function(nome) {
    if (nome === currentUser) return;
    if (mensaisSet[nome]) listaMensais.push(nome);
    else listaAvulsos.push(nome);
  });

  listaMensais.sort(function(a, b) { return a.localeCompare(b); });
  listaAvulsos.sort(function(a, b) { return a.localeCompare(b); });

  renderNotasForm(listaMensais, listaAvulsos, mediasMap, todasNotas);
}

function renderNotasForm(mensais, avulsos, mediasMap, todasNotas) {
  var el = $('votarContent');
  var h = '';

  h += '<div class="section-desc">Dê notas de 0 a 10 para cada jogador. As notas serão usadas para equilibrar a divisão de times.</div>';

  // Contagem de notas dadas
  var totalJogadores = mensais.length + avulsos.length;
  var totalAvaliados = 0;
  mensais.concat(avulsos).forEach(function(n) {
    if (notasLocais[n] !== undefined) totalAvaliados++;
  });

  h += '<div style="font-size:12px;color:var(--text2);margin-bottom:16px;">Avaliados: <span style="font-weight:600;color:var(--green);">' + totalAvaliados + '</span>/' + totalJogadores + '</div>';

  // Mensais
  if (mensais.length > 0) {
    h += '<div class="card">';
    h += '<div class="card-title">📋 Mensalistas</div>';
    mensais.forEach(function(nome) {
      h += buildNotaRow(nome, mediasMap);
    });
    h += '</div>';
  }

  // Avulsos
  if (avulsos.length > 0) {
    h += '<div class="card">';
    h += '<div class="card-title">🏃 Avulsos</div>';
    avulsos.forEach(function(nome) {
      h += buildNotaRow(nome, mediasMap);
    });
    h += '</div>';
  }

  if (totalJogadores === 0) {
    h += '<div class="empty-state"><span class="emoji">📭</span>Nenhum jogador cadastrado no grupo.</div>';
  }

  // Bloco ADM: Notas Detalhadas
  if (isAdm && todasNotas && todasNotas.length > 0) {
    h += renderNotasDetalhadasAdm(todasNotas);
  }

  el.innerHTML = h;

  // Sincronizar visual dos sliders que já têm nota
  mensais.concat(avulsos).forEach(function(nome) {
    var slider = document.querySelector('.nota-slider[data-jogador="' + nome + '"]');
    if (slider) updateSliderVisual(slider);
  });
}

function buildNotaRow(nome, mediasMap) {
  var notaAtual = notasLocais[nome];
  var temNota = notaAtual !== undefined;
  var valorSlider = temNota ? notaAtual : 5;
  var media = mediasMap[nome];
  var mediaStr = media ? (media.soma / media.count).toFixed(1) : '—';
  var mediaCount = media ? media.count : 0;
  var safeId = nome.replace(/[^a-zA-Z0-9]/g, '_');

  var h = '';
  h += '<div class="nota-jogador-row">';
  h += '<div class="nota-jogador-info">';
  h += '<span class="nota-jogador-nome">' + dn(nome) + '</span>';
  // Média visível apenas para ADMs
  if (isAdm) {
    h += '<span class="nota-jogador-media" title="Média de ' + mediaCount + ' avaliação(ões)">Média: ' + mediaStr + '</span>';
  }
  h += '</div>';
  h += '<div class="nota-slider-wrap">';
  h += '<input type="range" min="0" max="10" step="1" value="' + valorSlider + '" class="nota-slider' + (temNota ? ' has-value' : '') + '" data-jogador="' + nome + '" oninput="onNotaSliderInput(this)" onchange="onNotaSliderChange(this)">';
  h += '<div class="nota-slider-labels"><span>0</span><span class="nota-valor-display" id="notaVal_' + safeId + '">' + (temNota ? notaAtual : '—') + '</span><span>10</span></div>';
  h += '</div>';
  h += '</div>';
  return h;
}

// ============================================================
// NOTAS DETALHADAS (ADM)
// ============================================================
function renderNotasDetalhadasAdm(todasNotas) {
  var sorted = todasNotas.slice().sort(function(a, b) {
    var cmp = a.avaliado.localeCompare(b.avaliado);
    if (cmp !== 0) return cmp;
    return a.avaliador.localeCompare(b.avaliador);
  });

  var h = '<div class="card mt16">';
  h += '<div class="card-title">🔍 Notas Detalhadas (ADM)</div>';
  h += '<div style="overflow-x:auto;">';
  h += '<table class="log-table">';
  h += '<tr><th>Avaliado</th><th>Avaliador</th><th>Nota</th></tr>';
  sorted.forEach(function(n) {
    h += '<tr>';
    h += '<td>' + dn(n.avaliado) + '</td>';
    h += '<td>' + dn(n.avaliador) + '</td>';
    h += '<td style="font-weight:600;">' + n.nota + '</td>';
    h += '</tr>';
  });
  h += '</table></div>';
  h += '</div>';
  return h;
}

// ============================================================
// SLIDER HELPERS
// ============================================================
function updateSliderVisual(slider) {
  var val = parseInt(slider.value);
  var pct = (val / 10) * 100;
  var hue = (val / 10) * 120;
  slider.style.setProperty('--slider-pct', pct + '%');
  slider.style.setProperty('--slider-hue', hue);
}

function onNotaSliderInput(slider) {
  var nome = slider.getAttribute('data-jogador');
  var val = parseInt(slider.value);
  var safeId = nome.replace(/[^a-zA-Z0-9]/g, '_');
  var display = $('notaVal_' + safeId);
  if (display) display.textContent = val;
  slider.classList.add('has-value');
  updateSliderVisual(slider);
}

async function onNotaSliderChange(slider) {
  var nome = slider.getAttribute('data-jogador');
  var novaNota = parseInt(slider.value);
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
  showToast(dn(nome) + ': nota ' + novaNota + ' ✓');
  logAsync(currentUser, 'NOTA', nome + ' = ' + novaNota);
}
