// ============================================================
// config.js - Supabase, estado global, helpers, tema
// ============================================================
const SUPABASE_URL = 'https://ajtguipxovhsnxqxgheb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqdGd1aXB4b3Zoc254cXhnaGViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjUwMjcsImV4cCI6MjA5MTE0MTAyN30.PHCHmSwG2K4I2QzsJ4Jc_1qq_Ya9ryNtvFmFocH9ZCA';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// --- Estado Global ---
var grupoAtual = null;
var currentUser = null;
var isAdm = false;
var isSuperAdmin = false;
var peladaAtual = null;
var allPeladas = [];
var admName = '';
var admPassword = '';
var admNames = [];
var superAdminName = '';
var cachedJogadores = [];
var cachedPresentes = [];
var realtimeChannel = null;
var finConfig = null;
var finMesSelecionado = null;
// --- Helpers ---
function dn(n) {
  if (!n) return '';
  if (admNames.indexOf(n) > -1) return n.replace(' (ADM)', '');
  return n;
}
function sa(a) {
  return a.slice().sort(function(x, y) { return x.localeCompare(y); });
}
function $(id) { return document.getElementById(id); }
function showSkeleton(id) {
  var e = $(id);
  if (e) e.innerHTML = '<div class="skeleton"></div>';
}
function showToast(m, err) {
  var e = $('toast');
  e.textContent = m;
  e.className = 'toast' + (err ? ' error' : '');
  setTimeout(function() { e.classList.add('show'); }, 10);
  setTimeout(function() { e.classList.remove('show'); }, 3000);
}
function logAsync(u, a, d) {
  sb.from('logs').insert({ usuario: u, acao: a, detalhes: d || '', grupo_id: grupoAtual.id }).then();
}
function peladaLabel(p) {
  if (!p) return '';
  return p.nome || p.id;
}
function peladaLabelComData(p) {
  if (!p) return '';
  var df = p.data;
  try { df = new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR'); } catch(e) {}
  return peladaLabel(p) + ' (' + df + ')';
}
function fmtMes(ym) {
  var p = ym.split('-');
  var n = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return n[parseInt(p[1]) - 1] + '/' + p[0];
}
function mesAtual() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function fmtBRL(v) {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}
function gerarMeses(ini, fim) {
  var ms = [], p = ini.split('-'), y = parseInt(p[0]), m = parseInt(p[1]);
  var fp = fim.split('-'), fy = parseInt(fp[0]), fm = parseInt(fp[1]);
  while (y < fy || (y === fy && m <= fm)) {
    ms.push(y + '-' + String(m).padStart(2, '0'));
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return ms;
}
// --- Tema ---
function applyTheme(t) {
  if (t === 'light') document.documentElement.classList.add('light');
  else document.documentElement.classList.remove('light');
  var i = t === 'light' ? '☀️' : '🌙';
  document.querySelectorAll('.theme-toggle-btn').forEach(function(b) { b.textContent = i; });
}
function toggleTheme() {
  var l = document.documentElement.classList.contains('light');
  var t = l ? 'dark' : 'light';
  try { localStorage.setItem('pelada-theme', t); } catch(e) {}
  applyTheme(t);
}
(function() {
  try { applyTheme(localStorage.getItem('pelada-theme') || 'dark'); } catch(e) { applyTheme('dark'); }
})();
