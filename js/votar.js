// ============================================================
// votar.js - Sistema de votação (Seleção + Goleiro + MVP) + Notas
// ============================================================

var votSelecaoSelecionados = []; // nomes dos 5 selecionados
var votGoleiro = null;           // nome do goleiro escolhido (entre os 5)
var votMvp = null;               // nome do MVP escolhido (entre os 5)
var votarSubTab = 'categorias';  // 'categorias' ou 'notas'
var notasLocais = {};            // { nomeJogador: nota } cache local enquanto edita

async function loadVotar() {
  var el = $('votarContent');
  if (!peladaAtual) { el.innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada.</div>'; return; }

  // Render sub-tabs sempre (Notas não depende de votação aberta)
  var h = '';
  h += '<div class="tabs votar-sub-tabs" id="votarSubTabs">';
  h += '<button class="tab' + (votarSubTab === 'categorias' ? ' active' : '') + '" onclick="switchVotarTab(\'categorias\')">🏅 Categorias</button>';
  h += '<button class="tab' + (votarSubTab === 'notas' ? ' active' : '') + '" onclick="switchVotarTab(\'notas\')">⭐ Notas</button>';
  h += '</div>';
  h += '<div id="votarTabContent"></div>';
  el.innerHTML = h;

  if (votarSubTab === 'categorias') {
    await loadVotarCategorias();
  } else {
    await loadVotarNotas();
  }
}

function switchVotarTab(tab) {
  votarSubTab = tab;
  // Atualizar visual das tabs sem recarregar tudo
  var tabs = document.querySelectorAll('#votarSubTabs .tab');
  tabs.forEach(function(t) { t.classList.remove('active'); });
  if (tab === 'categorias') tabs[0].classList.add('active');
  else tabs[1].classList.add('active');

  var content = $('votarTabContent');
  content.innerHTML = '<div class="skeleton"></div>';

  if (tab === 'categorias') {
    loadVotarCategorias();
  } else {
    loadVotarNotas();
  }
}

// ============================================================
// TAB: CATEGORIAS (código original)
// ============================================================
async function loadVotarCategorias() {
  var el = $('votarTabContent');
  if (!peladaAtual.votacao_aberta) { el.innerHTML = '<div class="empty-state"><span class="emoji">🔒</span>Votação fechada.</div>'; return; }

  el.innerHTML = '<div class="skeleton"></div>';

  var presPromise = sb.from('presenca').select('jogador').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id);
  var votosPromise = sb.from('votos').select('*').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id).eq('votante', currentUser);
  var golsPromise = sb.from('gols').select('*').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id);
  var partidasPromise = sb.from('partidas').select('*').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id).eq('status', 'Finalizada');

  var results = await Promise.all([presPromise, votosPromise, golsPromise, partidasPromise]);

  var pr = results[0].data;
  var ov = results[1].data;
  var gols = results[2].data || [];
  var partidas = results[3].data || [];

  var pres = pr ? pr.map(function(r) { return r.jogador; }) : [];

  var va = null;
  if (ov && ov.length > 0) {
    va = { goleiro: null, mvp: null, selecao: [] };
    ov.forEach(function(v) {
      if (v.premio === 'Goleiro') va.goleiro = v.votado;
      else if (v.premio === 'MVP') va.mvp = v.votado;
      else if (v.premio === 'Selecao') va.selecao.push(v.votado);
    });
  }

  renderVoteForm(pres, va, gols, partidas);
}

// ============================================================
// RENDER FORM (Categorias)
// ============================================================
function renderVoteForm(pres, va, gols, partidas) {
  votSelecaoSelecionados = [];
  votGoleiro = null;
  votMvp = null;

  var isEdit = va !== null;
  var el = $('votarTabContent');
  var po = sa(pres);

  if (isEdit) {
    var allSel = va.selecao.slice();
    if (va.goleiro && allSel.indexOf(va.goleiro) === -1) allSel.push(va.goleiro);
    votSelecaoSelecionados = allSel;
    votGoleiro = va.goleiro;
    votMvp = va.mvp;
  }

  var df = peladaAtual.data;
  try { df = new Date(peladaAtual.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}

  var eb = isEdit
    ? '<div class="voted-indicator" style="background:var(--blueGlow);border-color:rgba(59,130,246,0.3);color:var(--blue);">✏️ Altere e reenvie.</div>'
    : '';

  var h = '';
  h += eb;
  h += '<div class="section-desc">Pelada: ' + peladaLabel(peladaAtual) + ' (' + df + ')</div>';

  h += '<div class="card">';
  h += '<div class="card-title">🏅 Seleção da Rodada</div>';
  h += '<div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Selecione 5 jogadores. Depois marque quem é o 🧤 Goleiro e quem é o ⭐ MVP.</div>';

  h += '<div class="selecao-container" id="votSelecaoContainer">';
  po.forEach(function(n) {
    var isSelf = (n === currentUser);
    var isSel = votSelecaoSelecionados.indexOf(n) > -1;
    var isDisabled = (votSelecaoSelecionados.length >= 5 && !isSel) || isSelf;
    var cls = 'chip';
    if (isSel) cls += ' selected';
    if (isDisabled) cls += ' disabled';
    if (isSelf) cls += ' self-chip';
    h += '<div class="' + cls + '" data-name="' + n + '" onclick="votToggleSelecao(this)">' + dn(n) + (isSelf ? ' (você)' : '') + '</div>';
  });
  h += '</div>';
  h += '<div class="selecao-counter mt8">Selecionados: <span id="votSelCount">' + votSelecaoSelecionados.length + '</span>/5</div>';

  h += '<div id="votRolesSection" style="' + (votSelecaoSelecionados.length > 0 ? '' : 'display:none;') + '">';
  h += '<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px;">';

  h += '<div style="margin-bottom:16px;">';
  h += '<div style="font-size:13px;font-weight:600;color:var(--text2);margin-bottom:8px;">🧤 GOLEIRO <span style="font-weight:400;font-size:11px;color:var(--text3);">(entre os selecionados)</span></div>';
  h += '<div class="selecao-container" id="votGoleiroContainer">';
  h += buildRoleChips('goleiro');
  h += '</div>';
  h += '</div>';

  h += '<div>';
  h += '<div style="font-size:13px;font-weight:600;color:var(--text2);margin-bottom:8px;">⭐ MVP <span style="font-weight:400;font-size:11px;color:var(--text3);">(entre os selecionados)</span></div>';
  h += '<div class="selecao-container" id="votMvpContainer">';
  h += buildRoleChips('mvp');
  h += '</div>';
  h += '</div>';

  h += '</div>';
  h += '</div>';

  h += '<button class="btn btn-primary mt16" id="votSubmitBtn" onclick="submitVotos()">' + (isEdit ? 'Atualizar Votos' : 'Enviar Votos') + '</button>';
  h += '</div>';

  h += renderVotarMetricas(pres, gols, partidas);

  el.innerHTML = h;
}

// ============================================================
// BUILD ROLE CHIPS (goleiro / mvp)
// ============================================================
function buildRoleChips(role) {
  var h = '';
  if (votSelecaoSelecionados.length === 0) return '<div class="text-muted" style="font-size:12px;">Selecione jogadores acima primeiro.</div>';

  var sorted = sa(votSelecaoSelecionados);
  sorted.forEach(function(n) {
    var isActive = (role === 'goleiro' && votGoleiro === n) || (role === 'mvp' && votMvp === n);
    var cls = 'chip role-chip';
    if (isActive) cls += ' selected';
    var emoji = role === 'goleiro' ? '🧤 ' : '⭐ ';
    h += '<div class="' + cls + '" data-name="' + n + '" data-role="' + role + '" onclick="votToggleRole(this)">' + (isActive ? emoji : '') + dn(n) + '</div>';
  });
  return h;
}

// ============================================================
// TOGGLE SELEÇÃO (5 jogadores)
// ============================================================
function votToggleSelecao(chip) {
  var n = chip.getAttribute('data-name');
  if (n === currentUser) return;

  var idx = votSelecaoSelecionados.indexOf(n);
  if (idx > -1) {
    votSelecaoSelecionados.splice(idx, 1);
    chip.classList.remove('selected');
    if (votGoleiro === n) votGoleiro = null;
    if (votMvp === n) votMvp = null;
  } else {
    if (votSelecaoSelecionados.length >= 5) return;
    votSelecaoSelecionados.push(n);
    chip.classList.add('selected');
  }

  $('votSelCount').textContent = votSelecaoSelecionados.length;

  var chips = document.querySelectorAll('#votSelecaoContainer .chip');
  chips.forEach(function(ch) {
    var nm = ch.getAttribute('data-name');
    if (nm === currentUser) return;
    if (votSelecaoSelecionados.length >= 5 && !ch.classList.contains('selected')) {
      ch.classList.add('disabled');
    } else {
      ch.classList.remove('disabled');
    }
  });

  var rolesSection = $('votRolesSection');
  if (votSelecaoSelecionados.length > 0) {
    rolesSection.style.display = '';
  } else {
    rolesSection.style.display = 'none';
  }

  $('votGoleiroContainer').innerHTML = buildRoleChips('goleiro');
  $('votMvpContainer').innerHTML = buildRoleChips('mvp');
}

// ============================================================
// TOGGLE ROLE (goleiro / mvp)
// ============================================================
function votToggleRole(chip) {
  var n = chip.getAttribute('data-name');
  var role = chip.getAttribute('data-role');

  if (role === 'goleiro') {
    votGoleiro = (votGoleiro === n) ? null : n;
    $('votGoleiroContainer').innerHTML = buildRoleChips('goleiro');
  } else if (role === 'mvp') {
    votMvp = (votMvp === n) ? null : n;
    $('votMvpContainer').innerHTML = buildRoleChips('mvp');
  }
}

// ============================================================
// SUBMIT VOTOS
// ============================================================
async function submitVotos() {
  if (votSelecaoSelecionados.length !== 5) { showToast('Selecione 5 jogadores!', true); return; }
  if (!votGoleiro) { showToast('Selecione o goleiro!', true); return; }
  if (!votMvp) { showToast('Selecione o MVP!', true); return; }

  if (votSelecaoSelecionados.indexOf(votGoleiro) === -1) { showToast('Goleiro deve estar entre os selecionados!', true); return; }
  if (votSelecaoSelecionados.indexOf(votMvp) === -1) { showToast('MVP deve estar entre os selecionados!', true); return; }

  await sb.from('votos').delete().eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id).eq('votante', currentUser);

  var rows = [];
  rows.push({ pelada_id: peladaAtual.id, votante: currentUser, premio: 'Goleiro', votado: votGoleiro, grupo_id: grupoAtual.id });
  rows.push({ pelada_id: peladaAtual.id, votante: currentUser, premio: 'MVP', votado: votMvp, grupo_id: grupoAtual.id });

  votSelecaoSelecionados.forEach(function(n) {
    if (n !== votGoleiro) {
      rows.push({ pelada_id: peladaAtual.id, votante: currentUser, premio: 'Selecao', votado: n, grupo_id: grupoAtual.id });
    }
  });

  var { error: e } = await sb.from('votos').insert(rows);
  if (e) { showToast(e.message, true); return; }

  showToast('Votos registrados! ⚽');
  logAsync(currentUser, 'VOTO', peladaAtual.id);
  loadVotarCategorias();
}

// ============================================================
// SUB-SEÇÃO: MÉTRICAS DA PELADA
// ============================================================
function renderVotarMetricas(pres, gols, partidas) {
  var h = '<div class="card mt16">';
  h += '<div class="card-title">📊 Métricas da Pelada</div>';

  if (pres.length === 0) {
    h += '<div class="text-muted">Nenhum jogador presente registrado.</div></div>';
    return h;
  }

  var golsMap = {};
  pres.forEach(function(n) { golsMap[n] = { normais: 0, contra: 0 }; });
  gols.forEach(function(g) {
    if (!golsMap[g.jogador]) golsMap[g.jogador] = { normais: 0, contra: 0 };
    if (g.gol_contra) { golsMap[g.jogador].contra += 1; }
    else { golsMap[g.jogador].normais += 1; }
  });

  var vitMap = {};
  pres.forEach(function(n) { vitMap[n] = 0; });
  partidas.forEach(function(p) {
    if (!p.vencedor || p.vencedor === 'Empate' || p.vencedor === '') return;
    var tw = p.vencedor === 'A' ? p.time_a : p.time_b;
    if (tw) tw.forEach(function(n) {
      if (!n) return;
      var nome = n.trim();
      if (vitMap[nome] === undefined) vitMap[nome] = 0;
      vitMap[nome] += 1;
    });
  });

  var playerList = sa(pres).map(function(n) {
    var g = golsMap[n] || { normais: 0, contra: 0 };
    var v = vitMap[n] || 0;
    return { nome: n, normais: g.normais, contra: g.contra, vitorias: v };
  });

  playerList.sort(function(a, b) {
    if (b.normais !== a.normais) return b.normais - a.normais;
    if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
    return a.nome.localeCompare(b.nome);
  });

  h += '<div style="overflow-x:auto;">';
  h += '<table class="ranking-table">';
  h += '<thead><tr>';
  h += '<th class="rt-th" style="text-align:left;">Jogador</th>';
  h += '<th class="rt-th">⚽ Gols</th>';
  h += '<th class="rt-th">🔴 GC</th>';
  h += '<th class="rt-th">🏆 Vit</th>';
  h += '</tr></thead><tbody>';

  playerList.forEach(function(p) {
    var isSelf = (p.nome === currentUser);
    h += '<tr' + (isSelf ? ' style="background:var(--greenGlow);"' : '') + '>';
    h += '<td class="rt-td rt-name" style="text-align:left;">' + dn(p.nome) + (isSelf ? ' 👈' : '') + '</td>';
    h += '<td class="rt-td rt-num' + (p.normais > 0 ? ' rt-bold' : '') + '">' + p.normais + '</td>';
    h += '<td class="rt-td rt-num" style="' + (p.contra > 0 ? 'color:var(--red);' : '') + '">' + p.contra + '</td>';
    h += '<td class="rt-td rt-num">' + p.vitorias + '</td>';
    h += '</tr>';
  });

  h += '</tbody></table></div>';

  var totalGols = gols.filter(function(g) { return !g.gol_contra; }).length;
  var totalGC = gols.filter(function(g) { return g.gol_contra; }).length;
  var totalPartidas = partidas.length;

  h += '<div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap;">';
  h += '<div style="font-size:12px;color:var(--text2);">Partidas: <span style="font-weight:600;color:var(--text);">' + totalPartidas + '</span></div>';
  h += '<div style="font-size:12px;color:var(--text2);">Gols: <span style="font-weight:600;color:var(--green);">' + totalGols + '</span></div>';
  if (totalGC > 0) {
    h += '<div style="font-size:12px;color:var(--text2);">Gols contra: <span style="font-weight:600;color:var(--red);">' + totalGC + '</span></div>';
  }
  h += '<div style="font-size:12px;color:var(--text2);">Presentes: <span style="font-weight:600;color:var(--text);">' + pres.length + '</span></div>';
  h += '</div>';

  h += '</div>';
  return h;
}

// ============================================================
// TAB: NOTAS (novo sistema de avaliação)
// ============================================================
async function loadVotarNotas() {
  var el = $('votarTabContent');
  el.innerHTML = '<div class="skeleton"></div>';

  // Buscar em paralelo: todos jogadores do grupo, mensalistas ativos, notas existentes do avaliador, todas as notas (para médias)
  var jogPromise = sb.from('jogadores').select('nome').eq('grupo_id', grupoAtual.id);
  var mensPromise = sb.from('mensalistas').select('jogador').eq('grupo_id', grupoAtual.id).is('mes_fim', null);
  var minhasNotasPromise = sb.from('notas_jogadores').select('avaliado, nota').eq('grupo_id', grupoAtual.id).eq('avaliador', currentUser);
  var todasNotasPromise = sb.from('notas_jogadores').select('avaliado, nota').eq('grupo_id', grupoAtual.id);

  var results = await Promise.all([jogPromise, mensPromise, minhasNotasPromise, todasNotasPromise]);

  var jogadores = results[0].data ? results[0].data.map(function(j) { return j.nome; }) : [];
  var mensalistas = results[1].data ? results[1].data.map(function(m) { return m.jogador; }) : [];
  var minhasNotas = results[2].data || [];
  var todasNotas = results[3].data || [];

  // Construir mapa de notas existentes do avaliador
  notasLocais = {};
  minhasNotas.forEach(function(n) { notasLocais[n.avaliado] = n.nota; });

  // Construir mapa de médias
  var mediasMap = {};   // { nome: { soma, count } }
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
    if (nome === currentUser) return; // não pode dar nota para si mesmo
    if (mensaisSet[nome]) listaMensais.push(nome);
    else listaAvulsos.push(nome);
  });

  listaMensais.sort(function(a, b) { return a.localeCompare(b); });
  listaAvulsos.sort(function(a, b) { return a.localeCompare(b); });

  renderNotasForm(listaMensais, listaAvulsos, mediasMap);
}

function renderNotasForm(mensais, avulsos, mediasMap) {
  var el = $('votarTabContent');
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

  var h = '';
  h += '<div class="nota-jogador-row">';
  h += '<div class="nota-jogador-info">';
  h += '<span class="nota-jogador-nome">' + dn(nome) + '</span>';
  h += '<span class="nota-jogador-media" title="Média de ' + mediaCount + ' avaliação(ões)">Média: ' + mediaStr + '</span>';
  h += '</div>';
  h += '<div class="nota-slider-wrap">';
  h += '<input type="range" min="0" max="10" step="1" value="' + valorSlider + '" class="nota-slider' + (temNota ? ' has-value' : '') + '" data-jogador="' + nome + '" oninput="onNotaSliderInput(this)" onchange="onNotaSliderChange(this)">';
  h += '<div class="nota-slider-labels"><span>0</span><span class="nota-valor-display" id="notaVal_' + nome.replace(/[^a-zA-Z0-9]/g, '_') + '">' + (temNota ? notaAtual : '—') + '</span><span>10</span></div>';
  h += '</div>';
  h += '</div>';
  return h;
}

function updateSliderVisual(slider) {
  var val = parseInt(slider.value);
  var pct = (val / 10) * 100;
  // Gerar cor do verde (nota alta) ao vermelho (nota baixa)
  var hue = (val / 10) * 120; // 0=red, 120=green
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

  // Se a nota não mudou, não faz nada
  if (notaAnterior !== undefined && notaAnterior === novaNota) return;

  // Upsert na tabela principal
  var { error: e } = await sb.from('notas_jogadores').upsert({
    grupo_id: grupoAtual.id,
    avaliador: currentUser,
    avaliado: nome,
    nota: novaNota,
    atualizado_em: new Date().toISOString()
  }, { onConflict: 'grupo_id,avaliador,avaliado' });

  if (e) { showToast('Erro ao salvar nota: ' + e.message, true); return; }

  // Inserir histórico
  await sb.from('notas_jogadores_historico').insert({
    grupo_id: grupoAtual.id,
    avaliador: currentUser,
    avaliado: nome,
    nota_anterior: notaAnterior !== undefined ? notaAnterior : null,
    nota_nova: novaNota
  });

  // Atualizar cache local
  notasLocais[nome] = novaNota;

  // Atualizar contador
  var totalJogadores = document.querySelectorAll('.nota-slider').length;
  var totalAvaliados = 0;
  document.querySelectorAll('.nota-slider.has-value').forEach(function() { totalAvaliados++; });

  // Feedback sutil
  showToast(dn(nome) + ': nota ' + novaNota + ' ✓');

  logAsync(currentUser, 'NOTA', nome + ' = ' + novaNota);
}
