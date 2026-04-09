// ============================================================
// home.js - Página inicial
// ============================================================
async function loadHome() {
  showSkeleton('homeContent');
  var { data: p } = await sb.from('peladas').select('*').eq('grupo_id', grupoAtual.id).order('criado_em', { ascending: false });
  allPeladas = p || [];
  peladaAtual = allPeladas[0] || null;
  if (!peladaAtual) {
    $('homeContent').innerHTML = '<div class="empty-state"><span class="emoji">📭</span>Nenhuma pelada agendada.</div>';
    return;
  }
  var { data: pr } = await sb.from('presenca').select('jogador').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id);
  cachedPresentes = pr ? pr.map(function(r) { return r.jogador; }) : [];
  var { data: vc } = await sb.from('votos').select('id').eq('pelada_id', peladaAtual.id).eq('grupo_id', grupoAtual.id).eq('votante', currentUser).limit(1);
  renderHome(cachedPresentes, vc && vc.length > 0);
}
function renderHome(pres, jv) {
  var el = $('homeContent'), p = peladaAtual;
  var sb2 = p.votacao_aberta ? '<span class="badge badge-green">Votação Aberta</span>'
    : p.status === 'Encerrada' ? '<span class="badge badge-red">Encerrada</span>'
    : p.status === 'Realizada' ? '<span class="badge badge-blue">Realizada</span>'
    : '<span class="badge badge-gold">Agendada</span>';
  var po = sa(pres), ph = '';
  if (po.length > 0) {
    ph = '<div class="mt12" style="display:flex;flex-wrap:wrap;gap:6px;">';
    po.forEach(function(n) { ph += '<span class="badge badge-blue">' + dn(n) + '</span>'; });
    ph += '</div>';
  } else {
    ph = '<div class="text-muted mt8">Nenhum jogador confirmado.</div>';
  }
  var vs = '';
  if (p.votacao_aberta) {
    vs = jv
      ? '<div class="voted-indicator mt12">✅ Já votou!</div><div style="margin-top:8px;"><button class="btn btn-secondary" onclick="navigateTo(\'Votar\')">✏️ Alterar</button></div>'
      : '<div style="margin-top:12px;"><button class="btn btn-primary" onclick="navigateTo(\'Votar\')">🗳️ Votar</button></div>';
  }
  var df = p.data;
  try { df = new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}
  el.innerHTML = '<div class="card status-card' + (p.status === 'Encerrada' ? ' closed' : '') + '">' +
    '<div class="flex-between mb16"><div class="card-title" style="margin-bottom:0;">Pelada da Semana</div>' + sb2 + '</div>' +
    '<div class="status-row"><span class="status-label">Nome</span><span class="status-value">' + peladaLabel(p) + '</span></div>' +
    '<div class="status-row"><span class="status-label">Data</span><span class="status-value">' + df + '</span></div>' +
    '<div class="status-row"><span class="status-label">Jogadores</span><span class="status-value">' + pres.length + '</span></div>' +
    '<div style="margin-top:12px;"><span class="status-label">Convocados:</span>' + ph + '</div>' + vs + '</div>';
}
