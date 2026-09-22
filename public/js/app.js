/* MariLuc Library — frontend
 * SPA com roteamento por History API (URLs reais, sem #), busca funcional
 * no header, menu de usuário com dropdown acessível e área administrativa
 * protegida (o bloqueio de verdade acontece no backend; aqui só evitamos
 * mostrar a UI de admin para quem não tem permissão).
 */
const app = document.getElementById("conteudo");
const toast = document.getElementById("toast");
const headerActions = document.getElementById("headerActions");
const footerAccountCol = document.getElementById("footerAccountCol");
const headerSearchForm = document.getElementById("headerSearchForm");
const headerSearchInput = document.getElementById("headerSearch");

let currentUser = null;
let CATEGORIAS = [];
let FAIXAS_ETARIAS = [];

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function esc(v = "") {
  return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}
function toastMsg(msg, error = false) {
  toast.textContent = msg;
  toast.className = `toast show${error ? " error" : ""}`;
  setTimeout(() => (toast.className = "toast"), 3200);
}
async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || "Ocorreu um erro.");
  return data;
}
async function apiForm(url, method, formData) {
  const res = await fetch(url, { method, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || "Ocorreu um erro.");
  return data;
}
function stars(n = 0) {
  const rounded = Math.round(Number(n));
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}
function cover(capa, nome) {
  return capa
    ? `<img class="cover" src="${esc(capa)}" alt="Capa do livro ${esc(nome)}">`
    : `<div class="cover" role="img" aria-label="Capa não cadastrada para ${esc(nome)}" style="display:grid;place-items:center;padding:20px;text-align:center;color:#d9bf7a;">${esc(nome)}</div>`;
}
function avatar(foto, nome, size = "") {
  return foto
    ? `<img class="avatar ${size}" src="${esc(foto)}" alt="Foto de perfil de ${esc(nome)}">`
    : `<div class="avatar ${size}" aria-hidden="true"></div>`;
}
function setSEO(title, description) {
  document.title = title;
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "description";
    document.head.appendChild(meta);
  }
  if (description) meta.content = description;
  // Como é uma SPA (sem recarregar a página), avisamos leitores de tela
  // sobre a troca de página e movemos o foco para o conteúdo — sem isso,
  // quem navega por teclado/leitor de tela fica "perdido" na navegação.
  if (houveNavegacao) {
    const announcer = document.getElementById("routeAnnouncer");
    if (announcer) announcer.textContent = title;
    requestAnimationFrame(() => app.focus({ preventScroll: true }));
  }
}
function categoriaOptions(selected, withTodos = true) {
  const opts = withTodos ? [`<option value="Todos" ${!selected || selected === "Todos" ? "selected" : ""}>Todas as categorias</option>`] : [];
  return opts.concat(CATEGORIAS.map(c => `<option value="${esc(c)}" ${c === selected ? "selected" : ""}>${esc(c)}</option>`)).join("");
}
function faixaOptions(selected, withTodas = true) {
  const opts = withTodas ? [`<option value="Todas" ${!selected || selected === "Todas" ? "selected" : ""}>Todas as idades</option>`] : [];
  return opts.concat(FAIXAS_ETARIAS.map(f => `<option value="${esc(f)}" ${f === selected ? "selected" : ""}>${esc(f)}</option>`)).join("");
}
function shelfBooks(livros) {
  if (!livros.length) return `<div class="empty">Nenhum livro encontrado com esses critérios.</div>`;
  let rows = "";
  for (let i = 0; i < livros.length; i += 5) {
    rows += `<div class="shelf-row">${livros.slice(i, i + 5).map(l => `
      <a class="book-card" href="/livro/${l.id}" data-link aria-label="Abrir detalhes de ${esc(l.nome)}">
        ${cover(l.capa, l.nome)}
        <div class="book-title">${esc(l.nome)}</div>
        <div class="book-meta">${esc(l.autor)} · ${esc(l.categoria)}</div>
      </a>`).join("")}</div>`;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Roteamento (History API — URLs reais, sem #)                        */
/* ------------------------------------------------------------------ */

let houveNavegacao = false;
function navigate(path) {
  if (location.pathname + location.search === path) return;
  history.pushState({}, "", path);
  houveNavegacao = true;
  route();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}
document.addEventListener("click", e => {
  const link = e.target.closest("[data-link]");
  if (!link) return;
  const url = new URL(link.href, location.origin);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
});
window.addEventListener("popstate", () => { houveNavegacao = true; route(); });

function updateActiveNav(path) {
  document.querySelectorAll(".main-nav a").forEach(a => {
    const linkPath = new URL(a.href, location.origin).pathname;
    if (linkPath === path || (linkPath !== "/" && path.startsWith(linkPath))) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

/* ------------------------------------------------------------------ */
/* Cabeçalho: sessão, avatar/username com dropdown, busca               */
/* ------------------------------------------------------------------ */

async function loadMe() {
  const data = await api("/api/auth/me");
  currentUser = data.usuario;
  renderHeaderActions();
  renderFooterAccount();
}
function renderHeaderActions() {
  if (!currentUser) {
    headerActions.innerHTML = `<a class="btn btn-gold btn-small" href="/entrar" data-link>Entrar</a>`;
    return;
  }
  headerActions.innerHTML = `
    <div class="user-menu">
      <button type="button" class="user-menu-trigger" id="userMenuTrigger" aria-haspopup="true" aria-expanded="false" aria-controls="userMenuDropdown">
        ${currentUser.foto
          ? `<img class="user-menu-avatar" src="${esc(currentUser.foto)}" alt="">`
          : `<span class="user-menu-avatar placeholder" aria-hidden="true">${esc(currentUser.username[0] || "✦").toUpperCase()}</span>`}
        <span class="user-menu-name">@${esc(currentUser.username)}</span>
        ${currentUser.role === "admin" ? `<span class="admin-badge">Admin</span>` : ""}
        <span class="user-menu-caret" aria-hidden="true">▾</span>
      </button>
      <div class="user-menu-dropdown" id="userMenuDropdown" role="menu">
        <a href="/perfil" data-link role="menuitem">👤 Meu perfil</a>
        <a href="/perfil/editar" data-link role="menuitem">✎ Editar perfil</a>
        ${currentUser.role === "admin" ? `<a href="/admin" data-link role="menuitem">⚙️ Painel administrativo</a>` : ""}
        <div class="divider" role="separator"></div>
        <button type="button" id="logoutBtn" role="menuitem" class="danger">⏻ Sair da conta</button>
      </div>
    </div>`;
  const trigger = document.getElementById("userMenuTrigger");
  const dropdown = document.getElementById("userMenuDropdown");
  trigger.addEventListener("click", e => { e.stopPropagation(); toggleUserMenu(trigger, dropdown); });
  trigger.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); openUserMenu(trigger, dropdown); dropdown.querySelector("a,button")?.focus(); }
  });
  dropdown.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeUserMenu(trigger, dropdown); trigger.focus(); }
  });
  document.getElementById("logoutBtn").addEventListener("click", logout);
}
function toggleUserMenu(trigger, dropdown) {
  dropdown.classList.contains("open") ? closeUserMenu(trigger, dropdown) : openUserMenu(trigger, dropdown);
}
function openUserMenu(trigger, dropdown) { dropdown.classList.add("open"); trigger.setAttribute("aria-expanded", "true"); }
function closeUserMenu(trigger, dropdown) { dropdown.classList.remove("open"); trigger.setAttribute("aria-expanded", "false"); }
document.addEventListener("click", () => {
  const trigger = document.getElementById("userMenuTrigger");
  const dropdown = document.getElementById("userMenuDropdown");
  if (trigger && dropdown) closeUserMenu(trigger, dropdown);
});
function renderFooterAccount() {
  footerAccountCol.innerHTML = `<h3>Conta</h3>` + (currentUser
    ? `<a href="/perfil" data-link>Meu perfil</a><a href="/perfil/editar" data-link>Editar perfil</a><button type="button" class="footer-logout" id="footerLogout">Sair</button>`
    : `<a href="/entrar" data-link>Entrar</a>`);
  if (currentUser) document.getElementById("footerLogout").addEventListener("click", logout);
}
headerSearchForm.addEventListener("submit", e => {
  e.preventDefault();
  const q = headerSearchInput.value.trim();
  navigate(`/acervo${q ? `?busca=${encodeURIComponent(q)}` : ""}`);
});

/* ------------------------------------------------------------------ */
/* Home                                                                 */
/* ------------------------------------------------------------------ */

async function home() {
  setSEO("MariLuc Library | Abra um livro. Atravesse uma realidade.",
    "Explore o acervo da MariLuc Library, avalie livros e participe da comunidade de leitores.");
  app.innerHTML = `
    <section class="hero">
      <div class="welcome-card">
        <div class="eyebrow">Uma biblioteca para novos mundos</div>
        <h2>Seja bem-vindo à</h2>
        <h1>MariLuc Library</h1>
        <p>Abra um livro. Atravesse uma realidade. Explore histórias, descubra novas aventuras e compartilhe suas experiências de leitura.</p>
        <a class="btn btn-gold" href="/acervo" data-link>Explorar acervo</a>
        ${currentUser
          ? `<a class="btn btn-outline" href="/perfil" data-link style="margin-left:10px">Meu perfil</a>`
          : `<a class="btn btn-outline" href="/entrar" data-link style="margin-left:10px">Entrar</a>`}
        ${!currentUser ? `<div class="gate">
          <strong>✦ Ainda não faz parte da MariLuc?</strong>
          <p>Crie sua conta gratuitamente para avaliar livros, escrever resenhas e participar da comunidade.</p>
          <a class="btn btn-outline" href="/entrar" data-link>Criar minha conta</a>
        </div>` : ""}
      </div>
    </section>
    <section class="section">
      <div class="section-title"><h2>Livros em destaque</h2><p>Um punhado de histórias para começar sua jornada.</p></div>
      <div class="shelf" id="homeShelf"><div class="empty">Carregando acervo...</div></div>
    </section>
    <section class="section">
      <div class="section-title"><h2>Explore por categoria</h2><p>Encontre o gênero perfeito para o seu momento.</p></div>
      <div class="category-grid" id="homeCategories"></div>
    </section>
    <section class="section">
      <div class="welcome-card" style="text-align:center;max-width:750px">
        <h2 style="color:#efd18a">Faça parte da comunidade</h2>
        <p>Leitores da MariLuc avaliam livros com estrelas, escrevem resenhas e descobrem o que outras pessoas estão lendo. Entre para deixar sua marca no acervo.</p>
        <a class="btn btn-gold" href="/comunidade" data-link>Ver comunidade</a>
      </div>
    </section>`;
  document.getElementById("homeCategories").innerHTML = CATEGORIAS.map(c =>
    `<a class="category-card" href="/acervo?categoria=${encodeURIComponent(c)}" data-link>${esc(c)}</a>`).join("");
  const livros = await api("/api/livros");
  document.getElementById("homeShelf").innerHTML = shelfBooks(livros.slice(0, 10));
}

/* ------------------------------------------------------------------ */
/* Acervo — busca + filtros                                             */
/* ------------------------------------------------------------------ */

let acervoDebounce = null;
async function acervoPage(params) {
  const q = params.get("busca") || "";
  const categoria = params.get("categoria") || "Todos";
  const faixaEtaria = params.get("faixaEtaria") || "Todas";
  setSEO(`MariLuc Library | Acervo`, "Pesquise e filtre os livros do acervo da MariLuc Library por nome, autor, categoria e faixa etária.");
  headerSearchInput.value = q;
  app.innerHTML = `
    <section class="section">
      <div class="section-title"><h2>Acervo</h2><p>Pesquise e filtre os livros da MariLuc Library.</p></div>
      <form class="search-bar" id="acervoForm">
        <div class="field">
          <label for="search">Nome ou autor</label>
          <input class="input" id="search" value="${esc(q)}" placeholder="Pesquisar por nome do livro ou autor..." aria-label="Pesquisar por nome do livro ou autor" autocomplete="off">
          <span class="search-spinner" id="searchSpinner" aria-hidden="true"></span>
        </div>
        <div class="field"><label for="cat">Categoria</label><select id="cat" aria-label="Filtrar por categoria">${categoriaOptions(categoria)}</select></div>
        <div class="field"><label for="faixa">Faixa etária</label><select id="faixa" aria-label="Filtrar por faixa etária">${faixaOptions(faixaEtaria)}</select></div>
        <div class="field"><button class="btn-clear-filters" type="button" id="clearFiltersBtn">Limpar filtros</button></div>
      </form>
      <p class="results-info" id="resultsInfo"></p>
      <div class="shelf" id="shelf"><div class="empty">Carregando...</div></div>
    </section>`;
  // A busca já filtra os resultados automaticamente enquanto o usuário digita
  // ou muda os seletores (com um pequeno atraso para não sobrecarregar a API),
  // então o botão aqui serve para uma ação que realmente falta: limpar tudo de uma vez.
  document.getElementById("acervoForm").addEventListener("submit", e => { e.preventDefault(); runFilter(0); });
  ["search", "cat", "faixa"].forEach(id => {
    const el = document.getElementById(id);
    const evento = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evento, () => {
      clearTimeout(acervoDebounce);
      document.getElementById("searchSpinner")?.classList.add("show");
      acervoDebounce = setTimeout(() => runFilter(), evento === "change" ? 0 : 350);
    });
  });
  document.getElementById("clearFiltersBtn").addEventListener("click", () => {
    document.getElementById("search").value = "";
    document.getElementById("cat").value = "Todos";
    document.getElementById("faixa").value = "Todas";
    runFilter(0);
  });
  updateClearButtonState(q, categoria, faixaEtaria);
  await loadAcervoResults(q, categoria, faixaEtaria);
}
function updateClearButtonState(q, categoria, faixaEtaria) {
  const btn = document.getElementById("clearFiltersBtn");
  if (!btn) return;
  const semFiltro = !q && (!categoria || categoria === "Todos") && (!faixaEtaria || faixaEtaria === "Todas");
  btn.disabled = semFiltro;
}
async function loadAcervoResults(q, categoria, faixaEtaria) {
  const shelf = document.getElementById("shelf");
  if (shelf) shelf.classList.add("is-loading");
  let livros = [];
  try {
    livros = await api(`/api/livros?q=${encodeURIComponent(q)}&categoria=${encodeURIComponent(categoria)}&faixaEtaria=${encodeURIComponent(faixaEtaria)}`);
  } finally {
    document.getElementById("searchSpinner")?.classList.remove("show");
  }
  const info = document.getElementById("resultsInfo");
  if (info) {
    const chips = [];
    if (q) chips.push(`<span class="filter-chip">"${esc(q)}"</span>`);
    if (categoria && categoria !== "Todos") chips.push(`<span class="filter-chip">${esc(categoria)}</span>`);
    if (faixaEtaria && faixaEtaria !== "Todas") chips.push(`<span class="filter-chip">${esc(faixaEtaria)}</span>`);
    info.innerHTML = `<span>${livros.length} livro(s) encontrado(s)</span>${chips.join("")}`;
  }
  if (shelf) {
    shelf.classList.remove("is-loading");
    shelf.innerHTML = livros.length ? shelfBooks(livros) : `<div class="empty">Nenhum livro encontrado com esses critérios.</div>`;
  }
}
function runFilter() {
  const q = document.getElementById("search").value;
  const c = document.getElementById("cat").value;
  const f = document.getElementById("faixa").value;
  const url = `/acervo?busca=${encodeURIComponent(q)}&categoria=${encodeURIComponent(c)}&faixaEtaria=${encodeURIComponent(f)}`;
  history.replaceState({}, "", url);
  updateClearButtonState(q, c, f);
  loadAcervoResults(q, c, f);
}

/* ------------------------------------------------------------------ */
/* Autenticação                                                        */
/* ------------------------------------------------------------------ */

function loginPage() {
  setSEO("MariLuc Library | Entrar", "Entre na sua conta ou crie uma nova conta na MariLuc Library.");
  app.innerHTML = `
    <section class="auth-wrap"><div class="auth-card form">
      <div class="section-title"><h2>Entre na MariLuc</h2><p>Escolha entrar ou criar uma conta.</p></div>
      <div class="tabs" role="tablist">
        <button class="btn tab" id="tabLogin" role="tab" aria-selected="true">Entrar</button>
        <button class="btn tab" id="tabRegister" role="tab" aria-selected="false">Criar conta</button>
      </div>
      <div id="authForm"></div>
    </div></section>`;
  document.getElementById("tabLogin").addEventListener("click", () => showAuth("login"));
  document.getElementById("tabRegister").addEventListener("click", () => showAuth("register"));
  showAuth("login");
}
function showAuth(mode) {
  document.getElementById("tabLogin").setAttribute("aria-selected", String(mode === "login"));
  document.getElementById("tabRegister").setAttribute("aria-selected", String(mode === "register"));
  document.getElementById("authForm").innerHTML = mode === "login" ? `
    <form id="loginForm">
      <div class="field"><label for="email">E-mail</label><input class="input" id="email" type="email" required></div>
      <div class="field">
        <label for="senha">Senha</label>
        <div class="password-wrap">
          <input class="input" id="senha" type="password" required>
          <button type="button" class="password-toggle" data-password-toggle="senha" aria-label="Mostrar senha" aria-pressed="false">Mostrar</button>
        </div>
      </div>
      <div class="form-actions"><button class="btn btn-gold">Entrar</button></div>
    </form>` : `
    <form id="registerForm">
      <div class="form-grid">
        <div class="field"><label for="username">Nome de usuário</label><input class="input" id="username" required maxlength="30"></div>
        <div class="field"><label for="email">E-mail</label><input class="input" id="email" type="email" required></div>
        <div class="field">
          <label for="senha">Senha</label>
          <div class="password-wrap">
            <input class="input" id="senha" type="password" minlength="6" required aria-describedby="senhaAjuda">
            <button type="button" class="password-toggle" data-password-toggle="senha" aria-label="Mostrar senha" aria-pressed="false">Mostrar</button>
          </div>
          <small id="senhaAjuda" class="field-hint">Use pelo menos 6 caracteres.</small>
        </div>
        <div class="field"><label for="bio">Bio</label><input class="input" id="bio" maxlength="120" placeholder="Conte um pouco sobre você" aria-describedby="bioAjuda"><small id="bioAjuda" class="field-hint">Máximo de 120 caracteres.</small></div>
      </div>
      <div class="form-actions"><button class="btn btn-gold">Criar minha conta</button></div>
    </form>`;
  if (mode === "login") document.getElementById("loginForm").addEventListener("submit", doLogin);
  else document.getElementById("registerForm").addEventListener("submit", doRegister);

  const passwordInput = document.getElementById("senha");
  const passwordToggle = document.querySelector('[data-password-toggle="senha"]');

  passwordToggle.addEventListener("click", () => {
    const visible = passwordInput.type === "text";
    passwordInput.type = visible ? "password" : "text";
    passwordToggle.textContent = visible ? "Mostrar" : "Ocultar";
    passwordToggle.setAttribute("aria-label", visible ? "Mostrar senha" : "Ocultar senha");
    passwordToggle.setAttribute("aria-pressed", String(!visible));
  });
}
async function doLogin(e) {
  e.preventDefault();
  try {
    await api("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.value, senha: senha.value }) });
    await loadMe(); toastMsg("Login realizado!"); navigate("/perfil");
  } catch (err) { toastMsg(err.message, true); }
}
async function doRegister(e) {
  e.preventDefault();
  try {
    await api("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.value, email: email.value, senha: senha.value, bio: bio.value }) });
    await loadMe(); toastMsg("Conta criada com sucesso!"); navigate("/perfil");
  } catch (err) { toastMsg(err.message, true); }
}
async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  currentUser = null;
  renderHeaderActions(); renderFooterAccount();
  toastMsg("Você saiu da conta.");
  navigate("/");
}

/* ------------------------------------------------------------------ */
/* Página do livro                                                      */
/* ------------------------------------------------------------------ */

async function bookDetail(id) {
  const l = await api(`/api/livros/${id}`);
  setSEO(`MariLuc Library | ${l.nome}`, `${l.nome}, de ${l.autor}. ${l.sinopse ? l.sinopse.slice(0, 140) : "Confira essa história no acervo da MariLuc Library."}`);
  app.innerHTML = `<section class="detail">
    <a href="/acervo" data-link>← Voltar ao acervo</a>
    <div class="detail-grid" style="margin-top:30px">
      <div>${l.capa ? `<img class="detail-cover" src="${esc(l.capa)}" alt="Capa do livro ${esc(l.nome)}">` : `<div class="detail-cover" style="display:grid;place-items:center;padding:20px;text-align:center;color:#d9bf7a;">${esc(l.nome)}</div>`}</div>
      <div>
        <span class="tag">${esc(l.categoria)}</span><span class="tag">${esc(l.faixaEtaria)}</span>
        <h1 style="font-size:46px;color:#efd18a;margin:12px 0">${esc(l.nome)}</h1>
        <p style="font-size:20px;color:#cbbbd0">por ${esc(l.autor)}</p>
        <div class="stars" aria-label="Média ${l.media} de 5">${stars(l.media)} <span style="color:#cbbbd0">${l.media}/5 (${l.totalAvaliacoes})</span></div>
        <div class="info-list">
          <div class="info-item"><strong>Editora</strong><br>${esc(l.editora)}</div>
          <div class="info-item"><strong>Edição</strong><br>${esc(l.edicao)}</div>
          <div class="info-item"><strong>Faixa etária</strong><br>${esc(l.faixaEtaria)}</div>
          <div class="info-item"><strong>Língua</strong><br>${esc(l.lingua)}</div>
          <div class="info-item"><strong>Páginas</strong><br>${esc(l.paginas)}</div>
        </div>
        <h2>Sinopse</h2><p style="line-height:1.8;color:#cbbbd0">${esc(l.sinopse || "Sinopse ainda não cadastrada.")}</p>
        ${currentUser ? `<div class="form" style="margin:30px 0 0;padding:22px"><h2>Avalie este livro</h2>
          <form id="rateForm">
            <div class="field"><label for="nota">Nota</label><select id="nota" required><option value="5">★★★★★ — 5</option><option value="4">★★★★☆ — 4</option><option value="3">★★★☆☆ — 3</option><option value="2">★★☆☆☆ — 2</option><option value="1">★☆☆☆☆ — 1</option></select></div>
            <div class="field"><label for="comentario">Resenha (opcional)</label><textarea id="comentario" placeholder="O que você achou?"></textarea></div>
            <div class="form-actions"><button class="btn btn-gold">Publicar avaliação</button></div>
          </form></div>` : `<div class="gate"><strong>Quer avaliar este livro?</strong><p>Entre ou crie sua conta para participar da comunidade.</p><a class="btn btn-gold" href="/entrar" data-link>Entrar / Criar conta</a></div>`}
        ${currentUser && currentUser.role === "admin" ? `<div class="form-actions" style="justify-content:flex-start;margin-top:18px">
          <a class="btn btn-outline btn-small" href="/admin/livros/editar/${l.id}" data-link>Editar livro</a>
        </div>` : ""}
      </div>
    </div>
    <section style="margin-top:55px"><div class="section-title"><h2>Resenhas da comunidade</h2></div>
      ${l.avaliacoes.length ? l.avaliacoes.map(a => `<article class="review"><div class="review-head">${avatar(a.usuario?.foto, a.usuario?.username || "")}<strong>${esc(a.usuario?.username || "Leitor")}</strong><span class="stars">${stars(a.nota)}</span></div><p>${esc(a.comentario || "Avaliou este livro sem escrever uma resenha.")}</p></article>`).join("") : `<div class="empty">Ainda não há avaliações. Seja a primeira pessoa da comunidade!</div>`}
    </section>
  </section>`;
  const rateForm = document.getElementById("rateForm");
  if (rateForm) rateForm.addEventListener("submit", e => rateBook(e, l.id));
}
async function rateBook(e, id) {
  e.preventDefault();
  try {
    await api(`/api/livros/${id}/avaliacoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nota: nota.value, comentario: comentario.value }) });
    toastMsg("Sua avaliação foi publicada!"); bookDetail(id);
  } catch (err) { toastMsg(err.message, true); }
}

/* ------------------------------------------------------------------ */
/* Perfil (próprio) e edição de perfil                                  */
/* ------------------------------------------------------------------ */

async function perfil() {
  if (!currentUser) return navigate("/entrar");
  const data = await api(`/api/usuarios/${currentUser.id}`);
  setSEO(`MariLuc Library | Meu perfil`, "Veja suas avaliações e resenhas na MariLuc Library.");
  app.innerHTML = `<section class="section">
    <div class="form profile-card">
      ${avatar(data.usuario.foto, data.usuario.username, "profile-avatar")}
      <div><div class="eyebrow">Meu perfil</div><h1 style="color:#efd18a;margin:4px 0">@${esc(data.usuario.username)}</h1><p style="color:#c7b9cf">${esc(data.usuario.bio || "Sem bio ainda.")}</p></div>
    </div>
    <div class="form-actions" style="justify-content:flex-start;max-width:850px;margin:18px auto 0">
      <a class="btn btn-outline btn-small" href="/perfil/editar" data-link>✎ Editar perfil</a>
    </div>
    <div style="max-width:850px;margin:35px auto">
      <h2 style="color:#efd18a">Minhas avaliações</h2>
      ${data.avaliacoes.length ? data.avaliacoes.map(a => `<div class="review"><a href="/livro/${a.livro?.id}" data-link><strong>${esc(a.livro?.nome || "Livro")}</strong></a> <span class="stars">${stars(a.nota)}</span><p>${esc(a.comentario || "")}</p></div>`).join("") : `<div class="empty">Você ainda não avaliou nenhum livro.</div>`}
    </div>
  </section>`;
}
async function perfilEditar() {
  if (!currentUser) return navigate("/entrar");
  const data = await api(`/api/usuarios/${currentUser.id}`);
  setSEO("MariLuc Library | Editar perfil", "Atualize sua foto, nome de usuário e biografia.");
  app.innerHTML = `<section class="section">
    <div class="section-title"><h2>✎ Editar perfil</h2><p>Atualize como você aparece na comunidade.</p></div>
    <form class="form" id="editProfileForm" style="margin:auto">
      <div class="form-grid">
        <div class="field"><label for="editUsername">Nome de usuário</label><input class="input" id="editUsername" value="${esc(data.usuario.username)}" required maxlength="30"></div>
        <div class="field"><label for="editFoto">Foto de perfil</label><input class="input" id="editFoto" type="file" accept="image/*"></div>
        <div class="field full"><label for="editBio">Biografia</label><textarea id="editBio" maxlength="180">${esc(data.usuario.bio || "")}</textarea></div>
      </div>
      <div class="form-actions">
        <a class="btn btn-outline" href="/perfil" data-link>Cancelar</a>
        <button class="btn btn-gold" type="submit">Salvar alterações</button>
      </div>
    </form>
  </section>`;
  document.getElementById("editProfileForm").addEventListener("submit", updateProfile);
}
async function updateProfile(e) {
  e.preventDefault();
  const fd = new FormData();
  fd.append("username", document.getElementById("editUsername").value);
  fd.append("bio", document.getElementById("editBio").value);
  const file = document.getElementById("editFoto").files[0];
  if (file) fd.append("foto", file);
  try {
    const result = await apiForm(`/api/usuarios/${currentUser.id}`, "PUT", fd);
    currentUser = result.usuario;
    renderHeaderActions();
    toastMsg("Perfil atualizado!");
    navigate("/perfil");
  } catch (err) { toastMsg(err.message, true); }
}

/* ------------------------------------------------------------------ */
/* Comunidade e leitores                                                */
/* ------------------------------------------------------------------ */

async function comunidade() {
  const c = await api("/api/comunidade");
  setSEO("MariLuc Library | Comunidade", "Veja a atividade recente de avaliações e resenhas dos leitores da MariLuc Library.");
  app.innerHTML = `<section class="section"><div class="section-title"><h2>Comunidade</h2><p>Veja o que os leitores estão descobrindo.</p></div>
    <div class="community-grid">
      <div class="stat"><strong>${c.usuarios}</strong>leitores</div>
      <div class="stat"><strong>${c.avaliacoes}</strong>avaliações</div>
      <div class="stat"><strong>${c.resenhas}</strong>resenhas</div>
    </div>
    <div class="form-actions" style="justify-content:center;margin:0 0 30px">
      <a class="btn btn-outline" href="/usuarios" data-link>Pesquisar leitores</a>
    </div>
    <div class="activity"><h2 style="color:#efd18a">Atividade recente</h2>
      ${c.atividades.length ? c.atividades.map(a => `<div class="activity-item"><span>✦</span><div><a href="/usuario/${a.usuario.id}" data-link><strong>${esc(a.usuario.username)}</strong></a> avaliou <a href="/livro/${a.livro?.id}" data-link>${esc(a.livro?.nome || "um livro")}</a> <span class="stars">${stars(a.nota)}</span>${a.comentario ? `<br><span style="color:#bcaec5">${esc(a.comentario)}</span>` : ""}</div></div>`).join("") : `<div class="empty">A comunidade ainda está esperando os primeiros leitores.</div>`}
    </div>
  </section>`;
}
async function usuarios() {
  setSEO("MariLuc Library | Leitores", "Pesquise e conheça os perfis dos leitores da comunidade MariLuc Library.");
  app.innerHTML = `<section class="section">
    <div class="section-title"><h2>Encontrar leitores</h2><p>Pesquise os perfis da comunidade.</p></div>
    <form class="search-bar" id="userSearchForm" style="grid-template-columns:1fr auto">
      <div class="field"><label for="userSearch">Nome de usuário</label><input class="input" id="userSearch" placeholder="Pesquisar por nome de usuário..." aria-label="Pesquisar usuário"></div>
      <div class="field" style="align-self:end"><button class="btn btn-gold" type="submit" style="width:100%">Pesquisar</button></div>
    </form>
    <div id="userResults" class="user-grid"><div class="empty">Carregando leitores...</div></div>
  </section>`;
  document.getElementById("userSearchForm").addEventListener("submit", async e => {
    e.preventDefault();
    const list = await api(`/api/usuarios?q=${encodeURIComponent(document.getElementById("userSearch").value)}`);
    renderUsers(list);
  });
  const list = await api("/api/usuarios");
  renderUsers(list);
}
function renderUsers(list) {
  document.getElementById("userResults").innerHTML = list.length ? list.map(u => `
    <a class="user-card" href="/usuario/${u.id}" data-link>
      ${avatar(u.foto, u.username)}
      <div><strong>${esc(u.username)}</strong><p>${esc(u.bio || "Leitor da MariLuc Library")}</p></div>
    </a>`).join("") : `<div class="empty">Nenhum leitor encontrado.</div>`;
}
async function usuarioPerfil(id) {
  const data = await api(`/api/usuarios/${id}`);
  setSEO(`MariLuc Library | @${data.usuario.username}`, `Perfil de @${data.usuario.username} na MariLuc Library.`);
  app.innerHTML = `<section class="section">
    <a href="/usuarios" data-link>← Voltar para leitores</a>
    <div class="form profile-card" style="margin-top:25px">
      ${avatar(data.usuario.foto, data.usuario.username)}
      <div><div class="eyebrow">Perfil do leitor</div><h1 style="color:#efd18a;margin:4px 0">@${esc(data.usuario.username)}</h1><p style="color:#c7b9cf">${esc(data.usuario.bio || "Esse leitor ainda não escreveu uma bio.")}</p></div>
    </div>
    <div style="max-width:850px;margin:35px auto"><h2 style="color:#efd18a">Avaliações de @${esc(data.usuario.username)}</h2>
      ${data.avaliacoes.length ? data.avaliacoes.map(a => `<div class="review"><a href="/livro/${a.livro?.id}" data-link><strong>${esc(a.livro?.nome || "Livro")}</strong></a> <span class="stars">${stars(a.nota)}</span><p>${esc(a.comentario || "")}</p></div>`).join("") : `<div class="empty">Esse leitor ainda não avaliou livros.</div>`}
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Administração                                                        */
/* ------------------------------------------------------------------ */

function accessDenied() {
  setSEO("MariLuc Library | Acesso não autorizado", "");
  app.innerHTML = `<section class="section"><div class="acesso-negado">
    <div class="icon"></div>
    <h2 style="color:#efd18a">Acesso não autorizado</h2>
    <p style="color:var(--muted)">Essa área é restrita à administração da MariLuc Library.</p>
    <a class="btn btn-gold" href="/" data-link>Voltar para a home</a>
  </div></section>`;
}
async function adminDashboard() {
  if (!currentUser) return navigate("/entrar");
  if (currentUser.role !== "admin") return accessDenied();
  const [sum, livros] = await Promise.all([api("/api/admin/resumo"), api("/api/livros")]);
  setSEO("MariLuc Library | Administração", "");
  app.innerHTML = `<section class="section">
    <div class="section-title"><h2>Administrador</h2><p>MariLuc Library — visão geral e gerenciamento do acervo.</p></div>
    <div class="community-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat"><strong>${sum.livros}</strong>livros</div>
      <div class="stat"><strong>${sum.usuarios}</strong>usuários</div>
      <div class="stat"><strong>${sum.avaliacoes}</strong>avaliações</div>
      <div class="stat"><strong>${sum.resenhas}</strong>resenhas</div>
    </div>
    <div class="form">
      <div class="admin-stats-bar">
        <h2 style="color:#efd18a;margin:0">Gerenciamento de livros</h2>
        <a class="btn btn-gold" href="/admin/livros/novo" data-link>+ Adicionar livro</a>
      </div>
      <div class="admin-list">
        ${livros.map(l => `<div class="admin-item">
          ${l.capa ? `<img class="mini-cover" src="${esc(l.capa)}" alt="">` : `<div class="mini-cover placeholder">✦</div>`}
          <div><strong>${esc(l.nome)}</strong><small>${esc(l.autor)} · ${esc(l.categoria)} · cadastrado em ${new Date(l.criadoEm).toLocaleDateString("pt-BR")}</small></div>
          <div class="admin-actions">
            <a class="btn btn-outline btn-small" href="/admin/livros/editar/${l.id}" data-link>Editar</a>
            <button class="btn btn-danger btn-small" type="button" data-delete-id="${l.id}" data-delete-nome="${esc(l.nome)}">Excluir</button>
          </div>
        </div>`).join("") || `<div class="empty">Nenhum livro cadastrado ainda.</div>`}
      </div>
    </div>
  </section>`;
  document.querySelectorAll("[data-delete-id]").forEach(btn => {
    btn.addEventListener("click", () => deleteBookAdmin(btn.dataset.deleteId, btn.dataset.deleteNome));
  });
}
async function deleteBookAdmin(id, nome) {
  if (!confirm(`Excluir "${nome}"? As avaliações desse livro também serão removidas. Essa ação não pode ser desfeita.`)) return;
  try { await api(`/api/livros/${id}`, { method: "DELETE" }); toastMsg("Livro excluído."); adminDashboard(); }
  catch (err) { toastMsg(err.message, true); }
}
function bookFormField(id, label, type = "text", required = false, value = "", placeholder = "") {
  return `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" type="${type}" ${required ? "required" : ""} value="${esc(value)}" placeholder="${placeholder}"></div>`;
}
async function adminBookForm(id) {
  if (!currentUser) return navigate("/entrar");
  if (currentUser.role !== "admin") return accessDenied();
  const editing = Boolean(id);
  const l = editing ? await api(`/api/livros/${id}`) : {};
  setSEO(`MariLuc Library | ${editing ? "Editar livro" : "Adicionar livro"}`, "");
  app.innerHTML = `<section class="section">
    <div class="section-title"><h2>${editing ? "Editar livro" : "Adicionar livro"}</h2><p>${editing ? "Atualize as informações do acervo." : "Cadastre uma nova história no acervo."}</p></div>
    <form class="form" id="bookForm">
      <div class="form-grid">
        ${bookFormField("nome", "Nome do livro", "text", true, l.nome || "")}
        ${bookFormField("autor", "Autor", "text", true, l.autor || "")}
        ${bookFormField("editora", "Editora", "text", true, l.editora || "")}
        ${bookFormField("edicao", "Edição", "text", true, l.edicao || "")}
        <div class="field"><label for="categoria">Categoria</label><select id="categoria" required>${categoriaOptions(l.categoria, false)}</select></div>
        <div class="field"><label for="faixaEtaria">Faixa etária</label><select id="faixaEtaria" required>${faixaOptions(l.faixaEtaria, false)}</select></div>
        ${bookFormField("lingua", "Língua", "text", true, l.lingua || "Português")}
        ${bookFormField("paginas", "Número de páginas", "number", true, l.paginas || "")}
        <div class="field full"><label for="sinopse">Sinopse</label><textarea id="sinopse" placeholder="Apresente brevemente a história...">${esc(l.sinopse || "")}</textarea></div>
        <div class="field full"><label for="capa">${editing ? "Trocar capa (opcional)" : "Capa do livro"}</label><input class="input" id="capa" type="file" accept="image/*"></div>
      </div>
      <div class="form-actions">
        <a class="btn btn-outline" href="/admin" data-link>Cancelar</a>
        <button class="btn btn-gold" type="submit">${editing ? "Salvar alterações" : "Cadastrar livro"}</button>
      </div>
    </form>
  </section>`;
  document.getElementById("bookForm").addEventListener("submit", e => saveBookAdmin(e, editing ? id : null));
}
async function saveBookAdmin(e, id) {
  e.preventDefault();
  const fd = new FormData();
  ["nome", "autor", "editora", "edicao", "categoria", "faixaEtaria", "lingua", "paginas", "sinopse"].forEach(fid => fd.append(fid, document.getElementById(fid).value));
  const file = document.getElementById("capa").files[0];
  if (file) fd.append("capa", file);
  try {
    const data = id ? await apiForm(`/api/livros/${id}`, "PUT", fd) : await apiForm("/api/livros", "POST", fd);
    toastMsg(id ? "Livro atualizado!" : "Livro cadastrado e adicionado ao acervo!");
    navigate(`/livro/${data.id}`);
  } catch (err) { toastMsg(err.message, true); }
}

/* ------------------------------------------------------------------ */
/* Páginas institucionais (footer)                                      */
/* ------------------------------------------------------------------ */

function sobre() {
  setSEO("MariLuc Library | Sobre", "Conheça a MariLuc Library, biblioteca digital criada como projeto acadêmico de Desenvolvimento de Sistemas.");
  app.innerHTML = `<section class="section prose">
    <div class="section-title"><h2>Sobre a MariLuc Library</h2></div>
    <p>A MariLuc Library é uma biblioteca digital que reúne livros de diferentes gêneros em um espaço com identidade própria: roxo, dourado, atmosfera cósmica e uma pitada de magia.</p>
    <h2>O projeto</h2>
    <p>Este sistema foi desenvolvido como projeto acadêmico da disciplina de Desenvolvimento de Sistemas, implementando cadastro e autenticação de usuários, um acervo pesquisável, avaliações da comunidade e um painel administrativo com CRUD completo de livros.</p>
  </section>`;
}
function categoriasPage() {
  setSEO("MariLuc Library | Categorias", "Explore o acervo da MariLuc Library por categoria.");
  app.innerHTML = `<section class="section">
    <div class="section-title"><h2>Categorias</h2><p>Escolha um gênero para explorar o acervo.</p></div>
    <div class="category-grid">${CATEGORIAS.map(c => `<a class="category-card" href="/acervo?categoria=${encodeURIComponent(c)}" data-link>${esc(c)}</a>`).join("")}</div>
  </section>`;
}
function ajuda() {
  setSEO("MariLuc Library | Ajuda", "Perguntas frequentes sobre a MariLuc Library.");
  app.innerHTML = `<section class="section prose">
    <div class="section-title"><h2>Ajuda</h2></div>
    <h2>Como crio uma conta?</h2>
    <p>Clique em "Entrar" no cabeçalho, escolha a aba "Criar conta" e preencha usuário, e-mail e senha.</p>
    <h2>Como avalio um livro?</h2>
    <p>Abra a página de um livro no acervo, escolha uma nota de 1 a 5 estrelas e, se quiser, escreva uma resenha.</p>
    <h2>Como edito meu perfil?</h2>
    <p>Com a sessão iniciada, abra o menu do seu usuário no cabeçalho e escolha "Editar perfil".</p>
    <h2>Como funciona o painel administrativo?</h2>
    <p>Apenas contas com papel de administrador conseguem acessar <code>/admin</code> para cadastrar, editar e excluir livros do acervo.</p>
  </section>`;
}
function notFound() {
  setSEO("MariLuc Library | Página não encontrada", "");
  app.innerHTML = `<section class="section"><div class="empty">Página não encontrada. <a href="/" data-link>Voltar para a home</a>.</div></section>`;
}

/* ------------------------------------------------------------------ */
/* Router principal                                                     */
/* ------------------------------------------------------------------ */

async function route() {
  try {
    await loadMe();
    const url = new URL(location.href);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    updateActiveNav(path);

    if (path === "/") return home();
    if (path === "/acervo") return acervoPage(url.searchParams);
    if (path === "/entrar") return currentUser ? navigate("/perfil") : loginPage();
    if (path === "/comunidade") return comunidade();
    if (path === "/usuarios") return usuarios();
    if (path === "/perfil") return perfil();
    if (path === "/perfil/editar") return perfilEditar();
    if (path === "/admin") return adminDashboard();
    if (path === "/admin/livros/novo") return adminBookForm(null);
    if (path === "/sobre") return sobre();
    if (path === "/categorias") return categoriasPage();
    if (path === "/ajuda") return ajuda();

    let m = path.match(/^\/admin\/livros\/editar\/([^/]+)$/);
    if (m) return adminBookForm(m[1]);
    m = path.match(/^\/usuario\/([^/]+)$/);
    if (m) return usuarioPerfil(m[1]);
    m = path.match(/^\/livro\/([^/]+)$/);
    if (m) return bookDetail(m[1]);

    return notFound();
  } catch (e) {
    app.innerHTML = `<section class="section"><div class="empty">Não foi possível carregar a página: ${esc(e.message)}</div></section>`;
  }
}

async function init() {
  try {
    [CATEGORIAS, FAIXAS_ETARIAS] = await Promise.all([api("/api/categorias"), api("/api/faixas-etarias")]);
  } catch { CATEGORIAS = []; FAIXAS_ETARIAS = []; }
  route();
}
init();