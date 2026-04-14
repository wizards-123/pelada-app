// ============================================================
// votar.js - Sistema de votação (Seleção + Goleiro + MVP)
// ============================================================

var votSelecaoSelecionados = []; // nomes dos 5 selecionados
var votGoleiro = null;           // nome do goleiro escolhido (entre os 5)
var votMvp = null;               // nome do MVP escolhido (entre os 5)

async function loadVotar() {
  var el = $('votarContent');
  if (!peladaAtual) { el.innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada.</div>'; return; }
  if (!peladaAtual.votacao_aberta) { el.innerHTML = '<div class="empty-state"><span class="emoji">🔒</span>Votação fechada.</div>'; return; }

  showSkeleton('votarContent');

  // Buscar presentes e votos existentes em paralelo
  var presPromise = sb.from('presenca').select('jogador').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id);
  var votosPromise = sb.from('votos').select('*').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id).eq('votante', currentUser);

  // Buscar métricas para a sub-seção
  var golsPromise = sb.from('gols').select('*').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id);
  var partidasPromise = sb.from('partidas').select('*').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id).eq('status', 'Finalizada');

  var results = await Promise.all([presPromise, votosPromise, golsPromise, partidasPromise]);

  var pr = results[0].data;
  var ov = results[1].data;
  var gols = results[2].data || [];
  var partidas = results[3].data || [];

  var pres = pr ? pr.map(function(r) { return r.jogador; }) : [];

  // Reconstruir votos anteriores (se existem)
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
// RENDER FORM
// ============================================================
function renderVoteForm(pres, va, gols, partidas) {
  votSelecaoSelecionados = [];
  votGoleiro = null;
  votMvp = null;

  var isEdit = va !== null;
  var el = $('votarContent');
  var po = sa(pres);

  // Restaurar votos anteriores
  if (isEdit) {
    // Seleção = goleiro + jogadores de linha
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

  // --- Seleção da Rodada ---
  h += '<div class="card">';
  h += '<div class="card-title">🏅 Seleção da Rodada</div>';
  h += '<div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Selecione 5 jogadores. Depois marque quem é o 🧤 Goleiro e quem é o ⭐ MVP.</div>';

  // Chips de seleção
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

  // Área de roles (goleiro + MVP) - aparece quando tem selecionados
  h += '<div id="votRolesSection" style="' + (votSelecaoSelecionados.length > 0 ? '' : 'display:none;') + '">';
  h += '<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px;">';

  // Goleiro
  h += '<div style="margin-bottom:16px;">';
  h += '<div style="font-size:13px;font-weight:600;color:var(--text2);margin-bottom:8px;">🧤 GOLEIRO <span style="font-weight:400;font-size:11px;color:var(--text3);">(entre os selecionados)</span></div>';
  h += '<div class="selecao-container" id="votGoleiroContainer">';
  h += buildRoleChips('goleiro');
  h += '</div>';
  h += '</div>';

  // MVP
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

  // --- Sub-seção de métricas ---
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
  if (n === currentUser) return; // self-vote bloqueado

  var idx = votSelecaoSelecionados.indexOf(n);
  if (idx > -1) {
    // Remover
    votSelecaoSelecionados.splice(idx, 1);
    chip.classList.remove('selected');
    // Se era goleiro ou MVP, limpar
    if (votGoleiro === n) votGoleiro = null;
    if (votMvp === n) votMvp = null;
  } else {
    if (votSelecaoSelecionados.length >= 5) return;
    votSelecaoSelecionados.push(n);
    chip.classList.add('selected');
  }

  // Atualizar counter
  $('votSelCount').textContent = votSelecaoSelecionados.length;

  // Atualizar disabled state
  var chips = document.querySelectorAll('#votSelecaoContainer .chip');
  chips.forEach(function(ch) {
    var nm = ch.getAttribute('data-name');
    if (nm === currentUser) return; // sempre disabled
    if (votSelecaoSelecionados.length >= 5 && !ch.classList.contains('selected')) {
      ch.classList.add('disabled');
    } else {
      ch.classList.remove('disabled');
    }
  });

  // Atualizar seção de roles
  var rolesSection = $('votRolesSection');
  if (votSelecaoSelecionados.length > 0) {
    rolesSection.style.display = '';
  } else {
    rolesSection.style.display = 'none';
  }

  // Rebuild role chips
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

  // Validação extra: goleiro e MVP devem estar entre os selecionados
  if (votSelecaoSelecionados.indexOf(votGoleiro) === -1) { showToast('Goleiro deve estar entre os selecionados!', true); return; }
  if (votSelecaoSelecionados.indexOf(votMvp) === -1) { showToast('MVP deve estar entre os selecionados!', true); return; }

  // Deletar votos anteriores
  await sb.from('votos').delete().eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id).eq('votante', currentUser);

  // Montar rows
  var rows = [];

  // Goleiro
  rows.push({ pelada_id: peladaAtual.id, votante: currentUser, premio: 'Goleiro', votado: votGoleiro, grupo_id: grupoAtual.id });

  // MVP
  rows.push({ pelada_id: peladaAtual.id, votante: currentUser, premio: 'MVP', votado: votMvp, grupo_id: grupoAtual.id });

  // Seleção (os 4 jogadores de linha, ou seja, os selecionados exceto o goleiro)
  votSelecaoSelecionados.forEach(function(n) {
    if (n !== votGoleiro) {
      rows.push({ pelada_id: peladaAtual.id, votante: currentUser, premio: 'Selecao', votado: n, grupo_id: grupoAtual.id });
    }
  });

  var { error: e } = await sb.from('votos').insert(rows);
  if (e) { showToast(e.message, true); return; }

  showToast('Votos registrados! ⚽');
  logAsync(currentUser, 'VOTO', peladaAtual.id);
  loadVotar();
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

  // Calcular gols por jogador (normais e contra separados)
  var golsMap = {}; // { nome: { normais: N, contra: N } }
  pres.forEach(function(n) {
    golsMap[n] = { normais: 0, contra: 0 };
  });

  gols.forEach(function(g) {
    if (!golsMap[g.jogador]) golsMap[g.jogador] = { normais: 0, contra: 0 };
    if (g.gol_contra) {
      golsMap[g.jogador].contra += 1;
    } else {
      golsMap[g.jogador].normais += 1;
    }
  });

  // Calcular vitórias por jogador
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

  // Montar lista ordenada por gols normais desc, depois vitórias desc
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

  // Resumo rápido
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
