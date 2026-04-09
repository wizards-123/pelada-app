// ============================================================
// votar.js - Sistema de votação
// ============================================================

var selecaoSelecionados = [];

async function loadVotar() {
  var el = $('votarContent');
  if (!peladaAtual) { el.innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada.</div>'; return; }
  if (!peladaAtual.votacao_aberta) { el.innerHTML = '<div class="empty-state"><span class="emoji">🔒</span>Votação fechada.</div>'; return; }

  showSkeleton('votarContent');

  var { data: pr } = await sb.from('presenca').select('jogador').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id);
  var pres = pr ? pr.map(function(r) { return r.jogador; }) : [];

  var { data: ov } = await sb.from('votos').select('*').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id).eq('votante', currentUser);
  var va = null;
  if (ov && ov.length > 0) {
    va = { goleiro: '', mvp: '', decepcao: '', revelacao: '', selecao: [] };
    ov.forEach(function(v) {
      if (v.premio === 'Goleiro') va.goleiro = v.votado;
      else if (v.premio === 'MVP') va.mvp = v.votado;
      else if (v.premio === 'Decepcao') va.decepcao = v.votado;
      else if (v.premio === 'Revelacao') va.revelacao = v.votado;
      else if (v.premio === 'Selecao') va.selecao.push(v.votado);
    });
  }
  renderVoteForm(pres, va);
}

function renderVoteForm(pres, va) {
  selecaoSelecionados = [];
  var isE = va !== null, el = $('votarContent'), po = sa(pres);

  function bO(sv) {
    var o = '<option value="">Selecione...</option>';
    po.forEach(function(n) { o += '<option value="' + n + '"' + (n === sv ? ' selected' : '') + '>' + dn(n) + '</option>'; });
    return o;
  }

  var sA = isE ? va.selecao : [];
  selecaoSelecionados = sA.slice();

  var ch = '';
  po.forEach(function(n) {
    var iS = sA.indexOf(n) > -1;
    ch += '<div class="chip' + (iS ? ' selected' : '') + (selecaoSelecionados.length >= 4 && !iS ? ' disabled' : '') + '" data-name="' + n + '" onclick="toggleSelecao(this)">' + dn(n) + '</div>';
  });

  var eb = isE ? '<div class="voted-indicator" style="background:var(--blueGlow);border-color:rgba(59,130,246,0.3);color:var(--blue);">✏️ Altere e reenvie.</div>' : '';
  var df = peladaAtual.data;
  try { df = new Date(peladaAtual.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}

  el.innerHTML = eb +
    '<div class="section-desc">Pelada: ' + peladaAtual.id + ' (' + df + ')</div>' +
    '<div class="vote-category"><label><span class="emoji">🧤</span>Goleiro</label><select class="vote-select" id="voteGoleiro">' + bO(isE ? va.goleiro : '') + '</select></div>' +
    '<div class="vote-category"><label><span class="emoji">⭐</span>MVP</label><select class="vote-select" id="voteMvp">' + bO(isE ? va.mvp : '') + '</select></div>' +
    '<div class="vote-category"><label><span class="emoji">😞</span>Decepção</label><select class="vote-select" id="voteDecepcao">' + bO(isE ? va.decepcao : '') + '</select></div>' +
    '<div class="vote-category"><label><span class="emoji">🌟</span>Revelação</label><select class="vote-select" id="voteRevelacao">' + bO(isE ? va.revelacao : '') + '</select></div>' +
    '<div class="vote-category"><label><span class="emoji">🏅</span>Seleção (4)</label><div class="selecao-container" id="selecaoContainer">' + ch + '</div><div class="selecao-counter mt8">Selecionados: <span id="selecaoCount">' + selecaoSelecionados.length + '</span>/4</div></div>' +
    '<button class="btn btn-primary mt16" onclick="submitVotos()">' + (isE ? 'Atualizar' : 'Enviar') + '</button>';
}

function toggleSelecao(c) {
  var n = c.getAttribute('data-name'), x = selecaoSelecionados.indexOf(n);
  if (x > -1) { selecaoSelecionados.splice(x, 1); c.classList.remove('selected'); }
  else { if (selecaoSelecionados.length >= 4) return; selecaoSelecionados.push(n); c.classList.add('selected'); }

  $('selecaoCount').textContent = selecaoSelecionados.length;
  document.querySelectorAll('#selecaoContainer .chip').forEach(function(ch) {
    if (selecaoSelecionados.length >= 4 && !ch.classList.contains('selected')) ch.classList.add('disabled');
    else ch.classList.remove('disabled');
  });
}

async function submitVotos() {
  var g = $('voteGoleiro').value, m = $('voteMvp').value, d = $('voteDecepcao').value, r = $('voteRevelacao').value;
  if (!g || !m || !d || !r) { showToast('Preencha tudo!', true); return; }
  if (selecaoSelecionados.length !== 4) { showToast('Selecione 4!', true); return; }

  await sb.from('votos').delete().eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id).eq('votante', currentUser);

  var rows = [
    { pelada_id: peladaAtual.id, votante: currentUser, premio: 'Goleiro', votado: g, grupo_id: grupoAtual.id },
    { pelada_id: peladaAtual.id, votante: currentUser, premio: 'MVP', votado: m, grupo_id: grupoAtual.id },
    { pelada_id: peladaAtual.id, votante: currentUser, premio: 'Decepcao', votado: d, grupo_id: grupoAtual.id },
    { pelada_id: peladaAtual.id, votante: currentUser, premio: 'Revelacao', votado: r, grupo_id: grupoAtual.id }
  ];
  selecaoSelecionados.forEach(function(s) {
    rows.push({ pelada_id: peladaAtual.id, votante: currentUser, premio: 'Selecao', votado: s, grupo_id: grupoAtual.id });
  });

  var { error: e } = await sb.from('votos').insert(rows);
  if (e) { showToast(e.message, true); return; }

  showToast('Votos registrados! ⚽');
  logAsync(currentUser, 'VOTO', peladaAtual.id);
  loadVotar();
}
