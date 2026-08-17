/* =========================================================
   BLOG — Evolução na Capacidade de Processamento
   script.js — comportamento compartilhado entre as páginas

   Os artigos e comentários agora ficam num banco de dados
   online (Supabase), então todo mundo vê o mesmo conteúdo,
   de qualquer computador, e nada se perde ao recarregar.
   ========================================================= */

/* =========================================================
   1) CONFIGURAÇÃO — já preenchida com o projeto blog-Capstone
   Se um dia precisar trocar, os valores estão em:
   Supabase > Project Settings > API Keys > "Publishable key"
   Essa chave pode ficar visível no código: quem controla o que
   o visitante pode fazer são as policies (RLS) do banco.
   ========================================================= */
const SUPABASE_URL = 'https://stljgvdozrpovmzjpnhs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EdQkQVAWja-Ov0CqDEUC1Q_VQAzWrFu';

// ---------- efeito de "digitação" no hero (usado no index) ----------
function typeEffect(elementId, text, speed = 28) {
  const el = document.getElementById(elementId);
  if (!el) return;
  let i = 0;
  el.textContent = '';
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  function step() {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      el.appendChild(cursor);
      i++;
      setTimeout(step, speed);
    }
  }
  step();
}

// ---------- revelação de elementos ao rolar a página ----------
function initScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  items.forEach((item) => observer.observe(item));
}

// ---------- toast simples de feedback ----------
function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2400);
}

// ---------- utilidades ----------
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function randomKey() {
  return 'k-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

/* =========================================================
   2) CAMADA DE DADOS — conversa com o Supabase pela API REST
   ========================================================= */

const API = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1';

function isConfigured() {
  return !SUPABASE_URL.includes('SEU-PROJETO') && !SUPABASE_ANON_KEY.includes('COLE_AQUI');
}

function apiHeaders(extra) {
  return Object.assign({
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  }, extra || {});
}

async function apiRequest(path, options) {
  const res = await fetch(API + path, Object.assign({ headers: apiHeaders() }, options));
  if (!res.ok) {
    const detalhe = await res.text().catch(() => '');
    throw new Error('Supabase respondeu ' + res.status + ': ' + detalhe);
  }
  if (res.status === 204) return null;
  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

// busca todos os artigos já com os comentários de cada um
async function fetchArticles() {
  const query = '/articles' +
    '?select=id,author,title,body,created_at,comments(id,author,body,created_at)' +
    '&order=created_at.desc' +
    '&comments.order=created_at.asc';
  const data = await apiRequest(query, { method: 'GET' });
  return (data || []).map((a) => Object.assign({}, a, {
    comments: Array.isArray(a.comments) ? a.comments : [],
  }));
}

async function createArticle(author, title, body) {
  const delete_key = randomKey();
  const criado = await apiRequest('/articles', {
    method: 'POST',
    headers: apiHeaders({ 'Prefer': 'return=representation' }),
    body: JSON.stringify({ author, title, body, delete_key }),
  });
  const artigo = Array.isArray(criado) ? criado[0] : criado;
  if (artigo && artigo.id) lembrarChaveDeExclusao(artigo.id, delete_key);
  return artigo;
}

async function createComment(articleId, author, body) {
  return apiRequest('/comments', {
    method: 'POST',
    headers: apiHeaders({ 'Prefer': 'return=representation' }),
    body: JSON.stringify({ article_id: articleId, author, body }),
  });
}

async function removeArticle(articleId) {
  const chave = obterChaveDeExclusao(articleId);
  if (!chave) return false;
  await apiRequest('/articles?id=eq.' + encodeURIComponent(articleId) +
    '&delete_key=eq.' + encodeURIComponent(chave), { method: 'DELETE' });
  esquecerChaveDeExclusao(articleId);
  return true;
}

/* --- chaves de exclusão -------------------------------------------------
   Quem publica o artigo guarda uma chave secreta no próprio navegador.
   O botão "Remover artigo" só aparece para quem tem essa chave, para um
   colega não apagar o texto do outro sem querer.
   ---------------------------------------------------------------------- */
const KEYS_STORAGE = 'blog_processamento_minhas_chaves_v1';

function lerChaves() {
  try {
    return JSON.parse(localStorage.getItem(KEYS_STORAGE) || '{}') || {};
  } catch (e) {
    return {};
  }
}
function lembrarChaveDeExclusao(id, chave) {
  try {
    const todas = lerChaves();
    todas[id] = chave;
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(todas));
  } catch (e) {
    console.warn('Não foi possível guardar a chave de exclusão:', e);
  }
}
function obterChaveDeExclusao(id) {
  return lerChaves()[id] || null;
}
function esquecerChaveDeExclusao(id) {
  try {
    const todas = lerChaves();
    delete todas[id];
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(todas));
  } catch (e) { /* ignora */ }
}

/* =========================================================
   3) RENDERIZAÇÃO
   ========================================================= */

function renderArticleCard(article) {
  const comentarios = article.comments || [];
  const commentsHTML = comentarios.length
    ? comentarios.map((c) => `
      <div class="comment-item">
        <div class="article-meta"><span class="author">${escapeHTML(c.author)}</span><span>${formatDate(c.created_at)}</span></div>
        <p>${escapeHTML(c.body)}</p>
      </div>
    `).join('')
    : `<p class="form-hint">Nenhum comentário ainda. Seja o primeiro a comentar.</p>`;

  const podeRemover = !!obterChaveDeExclusao(article.id);
  const botaoRemover = podeRemover ? `
      <div style="margin-top:14px; text-align:right;">
        <button type="button" class="btn-ghost btn" data-delete-id="${escapeHTML(article.id)}" style="font-size:0.7rem; padding:6px 10px;">Remover artigo</button>
      </div>` : '';

  return `
    <article class="article-card" data-article-id="${escapeHTML(article.id)}">
      <div class="article-meta">
        <span class="author">${escapeHTML(article.author)}</span>
        <span>${formatDate(article.created_at)}</span>
      </div>
      <h3>${escapeHTML(article.title)}</h3>
      <div class="article-body">${escapeHTML(article.body)}</div>

      <div class="comments-list">${commentsHTML}</div>

      <form class="comment-form" data-comment-for="${escapeHTML(article.id)}">
        <div class="inline-row">
          <input type="text" name="commentAuthor" placeholder="Seu nome" required maxlength="60" />
        </div>
        <textarea name="commentBody" placeholder="Escreva um comentário sobre este artigo..." required maxlength="600" style="min-height:70px"></textarea>
        <div style="display:flex; gap:10px; align-items:center;">
          <button type="submit" class="btn">Comentar</button>
        </div>
      </form>
      ${botaoRemover}
    </article>
  `;
}

function mostrarEstado(feed, texto) {
  feed.innerHTML = `<div class="empty-state">${escapeHTML(texto)}</div>`;
}

async function renderArticles() {
  const feed = document.getElementById('articles-feed');
  if (!feed) return;

  if (!isConfigured()) {
    mostrarEstado(feed, '// configure SUPABASE_URL e SUPABASE_ANON_KEY no início do arquivo script.js');
    return;
  }

  try {
    const articles = await fetchArticles();
    if (!articles.length) {
      mostrarEstado(feed, '// nenhum artigo publicado ainda — seja o primeiro aluno a publicar acima');
      return;
    }
    feed.innerHTML = articles.map(renderArticleCard).join('');
  } catch (e) {
    console.error('Erro ao carregar artigos:', e);
    mostrarEstado(feed, '// não foi possível carregar os artigos. Verifique sua conexão e recarregue a página.');
  }
}

/* =========================================================
   4) PÁGINA DE ARTIGOS
   ========================================================= */

function travarBotao(form, travado, textoOcupado) {
  const btn = form.querySelector('button[type=submit]');
  if (!btn) return;
  if (travado) {
    btn.dataset.textoOriginal = btn.textContent;
    btn.textContent = textoOcupado;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.textoOriginal || btn.textContent;
    btn.disabled = false;
  }
}

function initArticlesPage() {
  const form = document.getElementById('article-form');
  const feed = document.getElementById('articles-feed');
  if (!form || !feed) return;

  renderArticles();

  // publicar artigo
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const author = form.author.value.trim();
    const title = form.title.value.trim();
    const body = form.body.value.trim();
    if (!author || !title || !body) return;

    travarBotao(form, true, 'Publicando...');
    try {
      await createArticle(author, title, body);
      form.reset();
      await renderArticles();
      showToast('Artigo publicado com sucesso.');
      feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      showToast('Não foi possível publicar. Tente de novo.');
    } finally {
      travarBotao(form, false);
    }
  });

  // comentar (delegação de eventos, pois os cards são criados dinamicamente)
  feed.addEventListener('submit', async (e) => {
    if (!e.target.matches('.comment-form')) return;
    e.preventDefault();
    const formComentario = e.target;
    const articleId = formComentario.getAttribute('data-comment-for');
    const author = formComentario.commentAuthor.value.trim();
    const body = formComentario.commentBody.value.trim();
    if (!author || !body) return;

    travarBotao(formComentario, true, 'Enviando...');
    try {
      await createComment(articleId, author, body);
      await renderArticles();
      showToast('Comentário adicionado.');
    } catch (err) {
      console.error(err);
      showToast('Não foi possível enviar o comentário. Tente de novo.');
      travarBotao(formComentario, false);
    }
  });

  // remover artigo
  feed.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-id]');
    if (!btn) return;
    const ok = confirm('Remover este artigo e todos os seus comentários?');
    if (!ok) return;
    btn.disabled = true;
    try {
      const removido = await removeArticle(btn.getAttribute('data-delete-id'));
      await renderArticles();
      showToast(removido ? 'Artigo removido.' : 'Só quem publicou o artigo pode removê-lo.');
    } catch (err) {
      console.error(err);
      showToast('Não foi possível remover o artigo.');
      btn.disabled = false;
    }
  });
}

// ---------- inicialização geral ----------
document.addEventListener('DOMContentLoaded', () => {
  initScrollReveal();
  initArticlesPage();
});
