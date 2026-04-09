// ============================================================
// financeiro.js - Gestão financeira (config, mensalistas,
//   pagamentos, despesas, balanço, devedores)
// ============================================================

async function loadFinanceiro() {
  if (!isAdm) return;
  var el = $('financeiroContent');
  el.innerHTML =
    '<div class="tabs" id="finTabs">' +
    '<button class="tab active" onclick="switchFinTab(\'pagamentos\')">Pagamentos</button>' +
    '<button class="tab" onclick="switchFinTab(\'mensalistas\')">Mensalistas</button>' +
    '<button class="tab" onclick="switchFinTab(\'despesas\')">Despesas</button>' +
    '<button class="tab" onclick="switchFinTab(\'balanco\')">Balanço</button>' +
    '<button class="tab" onclick="switchFinTab(\'devedores\')">Devedores</button>' +
    '<button class="tab" onclick="switchFinTab(\'config\')">Config</button>' +
    '</div>' +
    '<div id="finTabPagamentos"></div>' +
    '<div id="finTabMensalistas" style="display:none;"></div>' +
    '<div id="finTabDespesas" style="display:none;"></div>' +
    '<div id="finTabBalanco" style="display:none;"></div>' +
    '<div id="finTabDevedores" style="display:none;"></div>' +
    '<div id="finTabConfig" style="display:none;"></div>';

  var { data: cfg } = await sb.from('financeiro_config').select('*').eq('grupo_id', grupoAtual.id).single();
  finConfig = cfg;
  finMesSelecionado = mesAtual();
  loadFinPagamentos();
}

function switchFinTab(t) {
  document.querySelectorAll('#finTabs .tab').forEach(function(tb) { tb.classList.remove('active'); });
  ['finTabPagamentos','finTabMensalistas','finTabDespesas','finTabBalanco','finTabDevedores','finTabConfig'].forEach(function(id) {
    var e = $(id); if (e) e.style.display = 'none';
  });
  var tabs = document.querySelectorAll('#finTabs .tab');
  var map = { pagamentos: 0, mensalistas: 1, despesas: 2, balanco: 3, devedores: 4, config: 5 };
  if (tabs[map[t]]) tabs[map[t]].classList.add('active');
  var tid = 'finTab' + t.charAt(0).toUpperCase() + t.slice(1);
  var te = $(tid); if (te) te.style.display = 'block';

  if (t === 'pagamentos') loadFinPagamentos();
  else if (t === 'mensalistas') loadFinMensalistas();
  else if (t === 'despesas') loadFinDespesas();
  else if (t === 'balanco') loadFinBalanco();
  else if (t === 'devedores') loadFinDevedores();
  else if (t === 'config') loadFinConfig();
}

// --- CONFIG ---
async function loadFinConfig() {
  var el = $('finTabConfig');
  var c = finConfig;
  el.innerHTML = '<div class="card"><div class="card-title">⚙️ Config Financeiro</div>' +
    '<div class="vote-category"><label>Mensalidade (R$)</label><input type="number" class="vote-select" id="finCfgM" value="' + (c ? c.valor_mensalidade : 150) + '" step="0.01"></div>' +
    '<div class="vote-category"><label>Diária (R$)</label><input type="number" class="vote-select" id="finCfgD" value="' + (c ? c.valor_diaria : 30) + '" step="0.01"></div>' +
    '<div class="vote-category"><label>Mês Início</label><input type="month" class="vote-select" id="finCfgI" value="' + (c ? c.mes_inicio : mesAtual()) + '"></div>' +
    '<div class="vote-category"><label>Saldo Inicial (R$)</label><input type="number" class="vote-select" id="finCfgS" value="' + (c ? c.saldo_inicial : 0) + '" step="0.01"></div>' +
    '<button class="btn btn-primary" onclick="salvarFinConfig()">Salvar</button></div>';
}

async function salvarFinConfig() {
  var vm = parseFloat($('finCfgM').value) || 0;
  var vd = parseFloat($('finCfgD').value) || 0;
  var mi = $('finCfgI').value;
  var si = parseFloat($('finCfgS').value) || 0;
  if (!mi) { showToast('Mês!', true); return; }

  if (finConfig) {
    await sb.from('financeiro_config').update({ valor_mensalidade: vm, valor_diaria: vd, mes_inicio: mi, saldo_inicial: si, atualizado_em: new Date().toISOString() }).eq('grupo_id', grupoAtual.id);
  } else {
    await sb.from('financeiro_config').insert({ grupo_id: grupoAtual.id, valor_mensalidade: vm, valor_diaria: vd, mes_inicio: mi, saldo_inicial: si });
  }

  var { data: cfg } = await sb.from('financeiro_config').select('*').eq('grupo_id', grupoAtual.id).single();
  finConfig = cfg;
  showToast('Salvo!');
  logAsync(currentUser, 'FIN_CONFIG', 'M:' + vm + ' D:' + vd + ' I:' + mi);
}

// --- MENSALISTAS ---
async function loadFinMensalistas() {
  var el = $('finTabMensalistas');
  showSkeleton('finTabMensalistas');

  var { data: jg } = await sb.from('jogadores').select('nome').eq('grupo_id', grupoAtual.id).order('nome');
  var jl = (jg || []).map(function(r) { return r.nome; });
  var { data: ms } = await sb.from('mensalistas').select('*').eq('grupo_id', grupoAtual.id);
  ms = ms || [];

  var h = '<div class="card"><div class="card-title">➕ Novo Mensalista</div>' +
    '<div style="margin-bottom:8px;"><select class="vote-select" id="finNM"><option value="">Jogador...</option>';
  sa(jl).forEach(function(n) { h += '<option value="' + n + '">' + dn(n) + '</option>'; });
  h += '</select></div>' +
    '<div class="vote-category"><label>A partir de</label><input type="month" class="vote-select" id="finMI" value="' + mesAtual() + '"></div>' +
    '<button class="btn btn-primary" onclick="addMens()">Adicionar</button></div>';

  var at = ms.filter(function(m) { return !m.mes_fim || m.mes_fim >= mesAtual(); });
  h += '<div class="card"><div class="card-title">📋 Mensalistas Ativos (' + at.length + ')</div>';
  if (at.length === 0) h += '<div class="text-muted">Nenhum.</div>';
  else {
    at.forEach(function(m) {
      h += '<div class="flex-between" style="padding:10px 0;border-bottom:1px solid rgba(36,48,73,0.3);">' +
        '<div><div style="font-size:14px;font-weight:500;">' + dn(m.jogador) + '</div>' +
        '<div class="text-muted" style="font-size:11px;">Desde ' + fmtMes(m.mes_inicio) + (m.mes_fim ? ' até ' + fmtMes(m.mes_fim) : '') + '</div></div>' +
        '<button style="padding:6px 10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid var(--red);background:transparent;color:var(--red);" onclick="encMens(' + m.id + ')">Encerrar</button></div>';
    });
  }
  h += '</div>';
  el.innerHTML = h;
}

async function addMens() {
  var n = $('finNM').value, mi = $('finMI').value;
  if (!n) { showToast('Jogador!', true); return; }
  if (!mi) { showToast('Mês!', true); return; }
  var { error: e } = await sb.from('mensalistas').insert({ grupo_id: grupoAtual.id, jogador: n, mes_inicio: mi, mes_fim: null });
  if (e) { showToast(e.message.includes('duplicate') ? 'Já é mensalista.' : e.message, true); return; }
  showToast(dn(n) + ' mensalista desde ' + fmtMes(mi));
  logAsync(currentUser, 'ADD_MENS', n + ' ' + mi);
  loadFinMensalistas();
}

async function encMens(id) {
  var mf = prompt('Último mês (AAAA-MM):', mesAtual());
  if (!mf) return;
  if (!/^\d{4}-\d{2}$/.test(mf)) { showToast('Formato AAAA-MM!', true); return; }
  await sb.from('mensalistas').update({ mes_fim: mf }).eq('id', id);
  showToast('Encerrado em ' + fmtMes(mf));
  logAsync(currentUser, 'ENC_MENS', 'ID ' + id);
  loadFinMensalistas();
}

// --- PAGAMENTOS ---
async function loadFinPagamentos() {
  var el = $('finTabPagamentos');
  showSkeleton('finTabPagamentos');
  if (!finConfig) { el.innerHTML = '<div class="empty-state"><span class="emoji">⚙️</span>Configure primeiro (aba Config).</div>'; return; }

  var mes = finMesSelecionado || mesAtual();
  var meses = gerarMeses(finConfig.mes_inicio, mesAtual());

  var { data: ms } = await sb.from('mensalistas').select('*').eq('grupo_id', grupoAtual.id); ms = ms || [];
  var { data: pg } = await sb.from('pagamentos').select('*').eq('grupo_id', grupoAtual.id).eq('mes', mes); pg = pg || [];
  var { data: pa } = await sb.from('presenca').select('jogador, pelada_id').eq('grupo_id', grupoAtual.id); pa = pa || [];
  var { data: pl } = await sb.from('peladas').select('id, data').eq('grupo_id', grupoAtual.id); pl = pl || [];

  // Mensalistas do mês
  var mm = [];
  ms.forEach(function(m) { if (m.mes_inicio <= mes && (!m.mes_fim || m.mes_fim >= mes)) mm.push(m.jogador); });

  // Peladas do mês
  var pdm = pl.filter(function(p) { return p.data && p.data.substring(0, 7) === mes; });
  var pids = pdm.map(function(p) { return p.id; });

  // Diaristas (presentes não mensalistas)
  var dm = {};
  pa.forEach(function(pr) {
    if (pids.indexOf(pr.pelada_id) === -1) return;
    if (mm.indexOf(pr.jogador) > -1) return;
    if (!dm[pr.jogador]) dm[pr.jogador] = [];
    dm[pr.jogador].push(pr.pelada_id);
  });

  // Map pagamentos
  var pm = {};
  pg.forEach(function(p) { pm[p.jogador + '|' + p.tipo + '|' + (p.pelada_id || '')] = p; });

  // Seletor mês
  var mo = '';
  meses.forEach(function(m) { mo += '<option value="' + m + '"' + (m === mes ? ' selected' : '') + '>' + fmtMes(m) + '</option>'; });

  var h = '<div class="card"><div class="flex-between"><div class="card-title" style="margin-bottom:0;">💰 Pagamentos</div><select class="vote-select" style="width:140px;margin-bottom:0;" onchange="finMesSelecionado=this.value;loadFinPagamentos();">' + mo + '</select></div></div>';

  // Mensalistas
  h += '<div class="card"><div class="card-title">📋 Mensalistas (' + mm.length + ')</div>';
  if (mm.length === 0) h += '<div class="text-muted">Nenhum neste mês.</div>';
  else {
    sa(mm).forEach(function(n) {
      var k = n + '|mensalidade|';
      var p = pm[k];
      var vc = p ? p.valor_cobrado : finConfig.valor_mensalidade;
      var vp = p ? p.valor_pago : 0;
      var pg2 = p ? p.pago : false;
      h += '<div style="padding:10px 0;border-bottom:1px solid rgba(36,48,73,0.3);">' +
        '<div class="flex-between"><span style="font-size:14px;">' + dn(n) + '</span><span style="font-size:12px;color:' + (pg2 ? 'var(--green)' : 'var(--red)') + ';">' + (pg2 ? '✅ ' + fmtBRL(vp) : '❌ ' + fmtBRL(vp) + '/' + fmtBRL(vc)) + '</span></div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;">';
      if (!pg2) h += '<button class="btn btn-primary" style="width:auto;padding:6px 14px;font-size:12px;" onclick="mPago(\'' + n.replace(/'/g, "\\'") + '\',\'mensalidade\',null,' + vc + ')">Pago</button>';
      h += '<button class="btn btn-secondary" style="width:auto;padding:6px 14px;font-size:12px;" onclick="ePag(\'' + n.replace(/'/g, "\\'") + '\',\'mensalidade\',null)">Editar</button>';
      if (pg2) h += '<button class="btn btn-secondary" style="width:auto;padding:6px 14px;font-size:12px;color:var(--red);border-color:var(--red);" onclick="dPago(\'' + n.replace(/'/g, "\\'") + '\',\'mensalidade\',null)">Desfazer</button>';
      h += '</div></div>';
    });
  }
  h += '</div>';

  // Diaristas
  var dk = Object.keys(dm);
  h += '<div class="card"><div class="card-title">🎫 Diaristas (' + dk.length + ')</div>';
  if (dk.length === 0) h += '<div class="text-muted">Nenhum neste mês.</div>';
  else {
    sa(dk).forEach(function(n) {
      dm[n].forEach(function(pid) {
        var k = n + '|diaria|' + pid;
        var p = pm[k];
        var vc = p ? p.valor_cobrado : finConfig.valor_diaria;
        var vp = p ? p.valor_pago : 0;
        var pg2 = p ? p.pago : false;
        var pr2 = pdm.find(function(x) { return x.id === pid; });
        var df = pid;
        try { df = new Date(pr2.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}
        h += '<div style="padding:8px 0;border-bottom:1px solid rgba(36,48,73,0.3);">' +
          '<div class="flex-between"><span style="font-size:13px;">' + dn(n) + ' <span class="text-muted">(' + df + ')</span></span><span style="font-size:11px;color:' + (pg2 ? 'var(--green)' : 'var(--red)') + ';">' + (pg2 ? '✅ ' + fmtBRL(vp) : '❌ ' + fmtBRL(vp) + '/' + fmtBRL(vc)) + '</span></div>' +
          '<div style="display:flex;gap:6px;margin-top:4px;">';
        if (!pg2) h += '<button class="btn btn-primary" style="width:auto;padding:4px 10px;font-size:11px;" onclick="mPago(\'' + n.replace(/'/g, "\\'") + '\',\'diaria\',\'' + pid + '\',' + vc + ')">Pago</button>';
        h += '<button class="btn btn-secondary" style="width:auto;padding:4px 10px;font-size:11px;" onclick="ePag(\'' + n.replace(/'/g, "\\'") + '\',\'diaria\',\'' + pid + '\')">Editar</button>';
        if (pg2) h += '<button class="btn btn-secondary" style="width:auto;padding:4px 10px;font-size:11px;color:var(--red);border-color:var(--red);" onclick="dPago(\'' + n.replace(/'/g, "\\'") + '\',\'diaria\',\'' + pid + '\')">Desfazer</button>';
        h += '</div></div>';
      });
    });
  }
  h += '</div>';
  el.innerHTML = h;
}

async function mPago(j, t, pid, vc) {
  var mes = finMesSelecionado;
  var q = sb.from('pagamentos').select('id').eq('grupo_id', grupoAtual.id).eq('jogador', j).eq('mes', mes).eq('tipo', t);
  if (pid) q = q.eq('pelada_id', pid); else q = q.is('pelada_id', null);
  var { data: ex } = await q;

  if (ex && ex.length > 0) {
    await sb.from('pagamentos').update({ pago: true, valor_pago: vc, valor_cobrado: vc, atualizado_em: new Date().toISOString() }).eq('id', ex[0].id);
  } else {
    await sb.from('pagamentos').insert({ grupo_id: grupoAtual.id, jogador: j, mes: mes, tipo: t, pelada_id: pid, valor_cobrado: vc, valor_pago: vc, pago: true });
  }
  showToast('Pago!');
  loadFinPagamentos();
}

async function dPago(j, t, pid) {
  var mes = finMesSelecionado;
  var q = sb.from('pagamentos').select('id').eq('grupo_id', grupoAtual.id).eq('jogador', j).eq('mes', mes).eq('tipo', t);
  if (pid) q = q.eq('pelada_id', pid); else q = q.is('pelada_id', null);
  var { data: ex } = await q;

  if (ex && ex.length > 0) {
    await sb.from('pagamentos').update({ pago: false, valor_pago: 0, atualizado_em: new Date().toISOString() }).eq('id', ex[0].id);
  }
  showToast('Desfeito.');
  loadFinPagamentos();
}

async function ePag(j, t, pid) {
  var mes = finMesSelecionado;
  var dv = t === 'mensalidade' ? finConfig.valor_mensalidade : finConfig.valor_diaria;

  var nvc = prompt('Valor cobrado de ' + dn(j) + ' (R$):', dv);
  if (nvc === null) return;
  nvc = parseFloat(nvc);
  if (isNaN(nvc)) { showToast('Inválido!', true); return; }

  var nvp = prompt('Valor pago (R$):', nvc);
  if (nvp === null) return;
  nvp = parseFloat(nvp);
  if (isNaN(nvp)) { showToast('Inválido!', true); return; }

  var pg = nvp >= nvc;
  var q = sb.from('pagamentos').select('id').eq('grupo_id', grupoAtual.id).eq('jogador', j).eq('mes', mes).eq('tipo', t);
  if (pid) q = q.eq('pelada_id', pid); else q = q.is('pelada_id', null);
  var { data: ex } = await q;

  if (ex && ex.length > 0) {
    await sb.from('pagamentos').update({ valor_cobrado: nvc, valor_pago: nvp, pago: pg, atualizado_em: new Date().toISOString() }).eq('id', ex[0].id);
  } else {
    await sb.from('pagamentos').insert({ grupo_id: grupoAtual.id, jogador: j, mes: mes, tipo: t, pelada_id: pid, valor_cobrado: nvc, valor_pago: nvp, pago: pg });
  }
  showToast('Atualizado!');
  loadFinPagamentos();
}

// --- DESPESAS ---
async function loadFinDespesas() {
  var el = $('finTabDespesas');
  showSkeleton('finTabDespesas');

  var { data: ds } = await sb.from('despesas').select('*').eq('grupo_id', grupoAtual.id).order('mes_competencia', { ascending: false });
  ds = ds || [];

  var cats = { campo: 'Campo', goleiros: 'Goleiros', confraternizacoes: 'Confraternizações', material_esportivo: 'Material Esportivo', outros: 'Outros' };
  var co = '';
  Object.keys(cats).forEach(function(k) { co += '<option value="' + k + '">' + cats[k] + '</option>'; });

  var h = '<div class="card"><div class="card-title">➕ Nova Despesa</div>' +
    '<div class="vote-category"><label>Categoria</label><select class="vote-select" id="finDC">' + co + '</select></div>' +
    '<div class="vote-category"><label>Mês Competência</label><input type="month" class="vote-select" id="finDM" value="' + mesAtual() + '"></div>' +
    '<div class="vote-category"><label>Valor (R$)</label><input type="number" class="vote-select" id="finDV" step="0.01"></div>' +
    '<div class="vote-category"><label>Descrição</label><input type="text" class="vote-select" id="finDD" placeholder="Ex: Aluguel campo"></div>' +
    '<button class="btn btn-primary" onclick="addDesp()">Adicionar</button></div>';

  h += '<div class="card"><div class="card-title">📋 Despesas (' + ds.length + ')</div>';
  if (ds.length === 0) h += '<div class="text-muted">Nenhuma.</div>';
  else {
    ds.forEach(function(d) {
      h += '<div class="flex-between" style="padding:10px 0;border-bottom:1px solid rgba(36,48,73,0.3);">' +
        '<div><div style="font-size:13px;font-weight:500;">' + (cats[d.categoria] || d.categoria) + '</div>' +
        '<div class="text-muted" style="font-size:11px;">' + fmtMes(d.mes_competencia) + (d.descricao ? ' — ' + d.descricao : '') + '</div></div>' +
        '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:14px;font-weight:600;color:var(--red);">' + fmtBRL(d.valor) + '</span>' +
        '<button style="padding:4px 8px;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit;border:1px solid var(--red);background:transparent;color:var(--red);" onclick="remDesp(' + d.id + ')">✕</button></div></div>';
    });
  }
  h += '</div>';
  el.innerHTML = h;
}

async function addDesp() {
  var c = $('finDC').value, m = $('finDM').value, v = parseFloat($('finDV').value), d = $('finDD').value.trim();
  if (!m || !v) { showToast('Preencha!', true); return; }
  await sb.from('despesas').insert({ grupo_id: grupoAtual.id, mes_competencia: m, categoria: c, valor: v, descricao: d });
  showToast('Adicionada!');
  logAsync(currentUser, 'ADD_DESP', c + ' ' + m + ' ' + v);
  loadFinDespesas();
}

async function remDesp(id) {
  if (!confirm('Remover?')) return;
  await sb.from('despesas').delete().eq('id', id);
  showToast('Removida.');
  loadFinDespesas();
}

// --- BALANÇO ---
async function loadFinBalanco() {
  var el = $('finTabBalanco');
  showSkeleton('finTabBalanco');
  if (!finConfig) { el.innerHTML = '<div class="empty-state"><span class="emoji">⚙️</span>Configure primeiro.</div>'; return; }

  var meses = gerarMeses(finConfig.mes_inicio, mesAtual());
  var { data: pg } = await sb.from('pagamentos').select('*').eq('grupo_id', grupoAtual.id); pg = pg || [];
  var { data: ds } = await sb.from('despesas').select('*').eq('grupo_id', grupoAtual.id); ds = ds || [];

  var sa2 = finConfig.saldo_inicial;
  var h = '<div class="card"><div class="card-title">📊 Balanço</div><div style="overflow-x:auto;"><table class="log-table">' +
    '<tr><th>Mês</th><th>Saldo Ini</th><th>Rec. Mens.</th><th>Rec. Diár.</th><th>Despesas</th><th>Fluxo</th><th>Saldo Fim</th></tr>';

  meses.forEach(function(mes) {
    var rm = 0, rd = 0, dt = 0;
    pg.forEach(function(p) { if (p.mes === mes && p.pago) { if (p.tipo === 'mensalidade') rm += Number(p.valor_pago); else rd += Number(p.valor_pago); } });
    ds.forEach(function(d) { if (d.mes_competencia === mes) dt += Number(d.valor); });

    var fl = rm + rd - dt;
    var si = sa2;
    var sf = si + fl;
    sa2 = sf;

    h += '<tr><td style="font-weight:600;">' + fmtMes(mes) + '</td>' +
      '<td>' + fmtBRL(si) + '</td>' +
      '<td style="color:var(--green);">' + fmtBRL(rm) + '</td>' +
      '<td style="color:var(--green);">' + fmtBRL(rd) + '</td>' +
      '<td style="color:var(--red);">' + fmtBRL(dt) + '</td>' +
      '<td style="color:' + (fl >= 0 ? 'var(--green)' : 'var(--red)') + ';font-weight:600;">' + fmtBRL(fl) + '</td>' +
      '<td style="color:' + (sf >= 0 ? 'var(--green)' : 'var(--red)') + ';font-weight:600;">' + fmtBRL(sf) + '</td></tr>';
  });

  h += '</table></div></div>';
  el.innerHTML = h;
}

// --- DEVEDORES ---
async function loadFinDevedores() {
  var el = $('finTabDevedores');
  showSkeleton('finTabDevedores');
  if (!finConfig) { el.innerHTML = '<div class="empty-state"><span class="emoji">⚙️</span>Configure primeiro.</div>'; return; }

  var meses = gerarMeses(finConfig.mes_inicio, mesAtual());
  var { data: ms } = await sb.from('mensalistas').select('*').eq('grupo_id', grupoAtual.id); ms = ms || [];
  var { data: pg } = await sb.from('pagamentos').select('*').eq('grupo_id', grupoAtual.id); pg = pg || [];
  var { data: pa } = await sb.from('presenca').select('jogador, pelada_id').eq('grupo_id', grupoAtual.id); pa = pa || [];
  var { data: pl } = await sb.from('peladas').select('id, data').eq('grupo_id', grupoAtual.id); pl = pl || [];

  var pm = {};
  pg.forEach(function(p) { pm[p.jogador + '|' + p.tipo + '|' + p.mes + '|' + (p.pelada_id || '')] = p; });

  var devs = [];

  meses.forEach(function(mes) {
    // Mensalistas devendo
    ms.forEach(function(m) {
      if (m.mes_inicio <= mes && (!m.mes_fim || m.mes_fim >= mes)) {
        var k = m.jogador + '|mensalidade|' + mes + '|';
        var p = pm[k];
        var vc = p ? Number(p.valor_cobrado) : finConfig.valor_mensalidade;
        var vp = p ? Number(p.valor_pago) : 0;
        if (!p || !p.pago) devs.push({ jogador: m.jogador, tipo: 'Mensalidade', mes: mes, cobrado: vc, pago: vp, pendente: vc - vp });
      }
    });

    // Diaristas devendo
    var pdm = pl.filter(function(p) { return p.data && p.data.substring(0, 7) === mes; });
    var pids = pdm.map(function(p) { return p.id; });
    var mmn = [];
    ms.forEach(function(m) { if (m.mes_inicio <= mes && (!m.mes_fim || m.mes_fim >= mes)) mmn.push(m.jogador); });

    pa.forEach(function(pr) {
      if (pids.indexOf(pr.pelada_id) === -1) return;
      if (mmn.indexOf(pr.jogador) > -1) return;
      var k = pr.jogador + '|diaria|' + mes + '|' + pr.pelada_id;
      var p = pm[k];
      var vc = p ? Number(p.valor_cobrado) : finConfig.valor_diaria;
      var vp = p ? Number(p.valor_pago) : 0;
      if (!p || !p.pago) {
        var pf = pdm.find(function(x) { return x.id === pr.pelada_id; });
        var df = pr.pelada_id;
        try { df = new Date(pf.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}
        devs.push({ jogador: pr.jogador, tipo: 'Diária (' + df + ')', mes: mes, cobrado: vc, pago: vp, pendente: vc - vp });
      }
    });
  });

  devs.sort(function(a, b) { var c = a.jogador.localeCompare(b.jogador); return c !== 0 ? c : a.mes.localeCompare(b.mes); });

  var h = '<div class="card"><div class="card-title">🚨 Devedores (' + devs.length + ')</div>';
  if (devs.length === 0) {
    h += '<div style="text-align:center;padding:20px;color:var(--green);font-size:14px;">✅ Tudo em dia!</div>';
  } else {
    h += '<div style="overflow-x:auto;"><table class="log-table"><tr><th>Jogador</th><th>Tipo</th><th>Mês</th><th>Cobrado</th><th>Pago</th><th>Pendente</th></tr>';
    devs.forEach(function(d) {
      h += '<tr><td style="font-weight:500;">' + dn(d.jogador) + '</td><td>' + d.tipo + '</td><td>' + fmtMes(d.mes) + '</td><td>' + fmtBRL(d.cobrado) + '</td><td>' + fmtBRL(d.pago) + '</td><td style="color:var(--red);font-weight:600;">' + fmtBRL(d.pendente) + '</td></tr>';
    });
    h += '</table></div>';
  }
  h += '</div>';
  el.innerHTML = h;
}
