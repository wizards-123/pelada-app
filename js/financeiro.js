// --- BALANÇO ---
async function loadFinBalanco() {
  var el = $('finTabBalanco');
  showSkeleton('finTabBalanco');
  if (!finConfig) { el.innerHTML = '<div class="empty-state"><span class="emoji">⚙️</span>Configure primeiro.</div>'; return; }

  var meses = gerarMeses(finConfig.mes_inicio, mesAtual());
  var { data: pg } = await sb.from('pagamentos').select('*').eq('grupo_id', grupoAtual.id); pg = pg || [];
  var { data: ds } = await sb.from('despesas').select('*').eq('grupo_id', grupoAtual.id); ds = ds || [];

  // Calcular dados por mês
  var dados = [];
  var sa2 = finConfig.saldo_inicial;
  meses.forEach(function(mes) {
    var rm = 0, rd = 0, dt = 0;
    pg.forEach(function(p) { if (p.mes === mes && p.pago) { if (p.tipo === 'mensalidade') rm += Number(p.valor_pago); else rd += Number(p.valor_pago); } });
    ds.forEach(function(d) { if (d.mes_competencia === mes) dt += Number(d.valor); });
    var fl = rm + rd - dt;
    var si = sa2;
    var sf = si + fl;
    sa2 = sf;
    dados.push({ mes: mes, si: si, rm: rm, rd: rd, dt: dt, fl: fl, sf: sf });
  });

  var linhas = [
    { label: 'Saldo Ini',   key: 'si', cor: null },
    { label: 'Rec. Mens.',  key: 'rm', cor: 'var(--green)' },
    { label: 'Rec. Diár.',  key: 'rd', cor: 'var(--green)' },
    { label: 'Despesas',    key: 'dt', cor: 'var(--red)' },
    { label: 'Fluxo',       key: 'fl', cor: null, bold: true, dynamic: true },
    { label: 'Saldo Fim',   key: 'sf', cor: null, bold: true, dynamic: true }
  ];

  var h = '<div class="card"><div class="card-title">📊 Balanço</div>' +
    '<div style="overflow-x:auto;"><table class="log-table" style="min-width:max-content;">';

  // Header: vazio + meses
  h += '<tr><th style="position:sticky;left:0;z-index:2;background:var(--card-bg);min-width:100px;"></th>';
  dados.forEach(function(d) {
    h += '<th style="min-width:90px;text-align:right;white-space:nowrap;">' + fmtMes(d.mes) + '</th>';
  });
  h += '</tr>';

  // Linhas de métricas
  linhas.forEach(function(ln) {
    h += '<tr><td style="position:sticky;left:0;z-index:1;background:var(--card-bg);font-weight:600;white-space:nowrap;">' + ln.label + '</td>';
    dados.forEach(function(d) {
      var v = d[ln.key];
      var cor = ln.cor;
      if (ln.dynamic) cor = v >= 0 ? 'var(--green)' : 'var(--red)';
      var st = 'text-align:right;white-space:nowrap;';
      if (cor) st += 'color:' + cor + ';';
      if (ln.bold) st += 'font-weight:600;';
      h += '<td style="' + st + '">' + fmtBRL(v) + '</td>';
    });
    h += '</tr>';
  });

  h += '</table></div></div>';
  el.innerHTML = h;
}
