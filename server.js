const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");

const { readDB, writeDB, nextId, publicUser, CATEGORIAS, FAIXAS_ETARIAS } = require("./data/db");
const { auth, requireAdmin, seedAdmin } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// O Render fica atrás de um proxy HTTPS: sem isso, o Express não reconhece
// a conexão como segura e o cookie de sessão pode não se comportar bem.
app.set("trust proxy", 1);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "mariluc-library-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));
app.use(express.static(path.join(__dirname, "public")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = file.fieldname === "capa"
      ? path.join(__dirname, "public/uploads/books")
      : path.join(__dirname, "public/uploads/profiles");
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Envie uma imagem."));
    cb(null, true);
  }
});

/* ------------------------------------------------------------------ */
/* Autenticação                                                        */
/* ------------------------------------------------------------------ */

app.get("/api/auth/me", (req, res) => {
  const db = readDB();
  const user = db.usuarios.find(u => u.id === req.session.userId);
  res.json({ usuario: user ? publicUser(user) : null });
});

app.post("/api/auth/register", async (req, res) => {
  const { username, email, senha, bio = "" } = req.body;
  if (!username || !email || !senha || senha.length < 6) {
    return res.status(400).json({ erro: "Preencha usuário, e-mail e uma senha de pelo menos 6 caracteres." });
  }
  const db = readDB();
  if (db.usuarios.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
    return res.status(409).json({ erro: "Esse nome de usuário já está em uso." });
  }
  if (db.usuarios.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
    return res.status(409).json({ erro: "Esse e-mail já está cadastrado." });
  }
  const senhaHash = await bcrypt.hash(senha, 10);
  const user = {
    id: nextId(db.usuarios), username: username.trim(), email: email.trim(),
    senha: senhaHash, foto: "", bio: String(bio).trim(), role: "usuario",
    criadoEm: new Date().toISOString()
  };
  db.usuarios.push(user);
  await writeDB(db);
  req.session.userId = user.id;
  res.status(201).json({ usuario: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, senha } = req.body;
  const db = readDB();
  const user = db.usuarios.find(u => u.email.toLowerCase() === String(email || "").trim().toLowerCase());
  if (!user || !(await bcrypt.compare(senha || "", user.senha))) {
    return res.status(401).json({ erro: "E-mail ou senha incorretos." });
  }
  req.session.userId = user.id;
  res.json({ usuario: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* ------------------------------------------------------------------ */
/* Perfil do usuário logado                                            */
/* ------------------------------------------------------------------ */

app.put("/api/usuarios/:id", auth, upload.single("foto"), async (req, res) => {
  const db = readDB();
  const id = Number(req.params.id);
  if (req.usuarioAtual.id !== id) return res.status(403).json({ erro: "Você só pode editar seu próprio perfil." });
  const i = db.usuarios.findIndex(u => Number(u.id) === id);
  if (i === -1) return res.status(404).json({ erro: "Usuário não encontrado." });
  const u = db.usuarios[i];
  if (req.body.username && db.usuarios.some(x => x.id !== id && x.username.toLowerCase() === req.body.username.trim().toLowerCase())) {
    return res.status(409).json({ erro: "Esse nome de usuário já está em uso." });
  }
  u.username = String(req.body.username || u.username).trim();
  u.bio = String(req.body.bio ?? u.bio).trim().slice(0, 180);
  if (req.file) u.foto = `/uploads/profiles/${req.file.filename}`;
  await writeDB(db);
  res.json({ usuario: publicUser(u) });
});

/* ------------------------------------------------------------------ */
/* Administração — protegida de verdade no backend                     */
/* ------------------------------------------------------------------ */

app.get("/api/admin/resumo", requireAdmin, (req, res) => {
  const db = readDB();
  res.json({
    livros: db.livros.length,
    usuarios: db.usuarios.length,
    avaliacoes: db.avaliacoes.length,
    resenhas: db.avaliacoes.filter(a => a.comentario).length
  });
});

/* ------------------------------------------------------------------ */
/* Livros — leitura é pública, criação/edição/exclusão são de admin    */
/* ------------------------------------------------------------------ */

app.get("/api/livros", (req, res) => {
  const db = readDB();
  let livros = [...db.livros];
  const q = String(req.query.q || "").trim().toLowerCase();
  const categoria = String(req.query.categoria || "").trim();
  const faixaEtaria = String(req.query.faixaEtaria || "").trim();
  if (q) livros = livros.filter(l => l.nome.toLowerCase().includes(q) || l.autor.toLowerCase().includes(q));
  if (categoria && categoria !== "Todos") livros = livros.filter(l => l.categoria === categoria);
  if (faixaEtaria && faixaEtaria !== "Todas") livros = livros.filter(l => l.faixaEtaria === faixaEtaria);
  res.json(livros);
});

app.get("/api/livros/:id", (req, res) => {
  const db = readDB();
  const livro = db.livros.find(l => String(l.id) === String(req.params.id));
  if (!livro) return res.status(404).json({ erro: "Livro não encontrado." });
  const avaliacoes = db.avaliacoes.filter(a => String(a.livroId) === String(livro.id));
  const media = avaliacoes.length
    ? avaliacoes.reduce((sum, a) => sum + Number(a.nota), 0) / avaliacoes.length
    : 0;
  const avaliacoesComUsuarios = avaliacoes
    .slice()
    .sort((a, b) => new Date(b.data) - new Date(a.data))
    .map(a => {
      const u = db.usuarios.find(x => x.id === a.usuarioId);
      return { ...a, usuario: u ? publicUser(u) : null };
    });
  res.json({ ...livro, media: Number(media.toFixed(1)), totalAvaliacoes: avaliacoes.length, avaliacoes: avaliacoesComUsuarios });
});

function validarLivro(b, { parcial = false } = {}) {
  const required = ["nome", "autor", "editora", "edicao", "categoria", "faixaEtaria", "lingua", "paginas"];
  if (!parcial && required.some(k => !String(b[k] || "").trim())) {
    return "Preencha todos os campos obrigatórios.";
  }
  if (b.categoria && !CATEGORIAS.includes(b.categoria)) return "Categoria inválida.";
  if (b.faixaEtaria && !FAIXAS_ETARIAS.includes(b.faixaEtaria)) return "Faixa etária inválida.";
  if (b.paginas && (!Number.isFinite(Number(b.paginas)) || Number(b.paginas) <= 0)) return "Número de páginas inválido.";
  return null;
}

// CREATE — apenas administradores cadastram livros no acervo.
app.post("/api/livros", requireAdmin, upload.single("capa"), async (req, res) => {
  const b = req.body;
  const erro = validarLivro(b);
  if (erro) return res.status(400).json({ erro });

  const db = readDB();
  const livro = {
    id: nextId(db.livros),
    nome: b.nome.trim(), autor: b.autor.trim(), editora: b.editora.trim(),
    edicao: b.edicao.trim(), categoria: b.categoria, faixaEtaria: b.faixaEtaria.trim(),
    lingua: b.lingua.trim(), paginas: Number(b.paginas), sinopse: String(b.sinopse || "").trim(),
    capa: req.file ? `/uploads/books/${req.file.filename}` : "",
    criadoEm: new Date().toISOString()
  };
  db.livros.push(livro);
  await writeDB(db);
  res.status(201).json(livro);
});

// UPDATE — apenas administradores.
app.put("/api/livros/:id", requireAdmin, upload.single("capa"), async (req, res) => {
  const db = readDB();
  const i = db.livros.findIndex(l => String(l.id) === String(req.params.id));
  if (i === -1) return res.status(404).json({ erro: "Livro não encontrado." });
  const b = req.body;
  const erro = validarLivro(b, { parcial: true });
  if (erro) return res.status(400).json({ erro });

  const atual = db.livros[i];
  const novo = {
    ...atual,
    nome: b.nome ?? atual.nome, autor: b.autor ?? atual.autor, editora: b.editora ?? atual.editora,
    edicao: b.edicao ?? atual.edicao, categoria: b.categoria ?? atual.categoria,
    faixaEtaria: b.faixaEtaria ?? atual.faixaEtaria, lingua: b.lingua ?? atual.lingua,
    paginas: b.paginas ? Number(b.paginas) : atual.paginas, sinopse: b.sinopse ?? atual.sinopse
  };
  if (req.file) novo.capa = `/uploads/books/${req.file.filename}`;
  db.livros[i] = novo;
  await writeDB(db);
  res.json(novo);
});

// DELETE — apenas administradores, e pede confirmação no frontend.
app.delete("/api/livros/:id", requireAdmin, async (req, res) => {
  const db = readDB();
  const id = Number(req.params.id);
  const antes = db.livros.length;
  db.livros = db.livros.filter(l => Number(l.id) !== id);
  if (db.livros.length === antes) return res.status(404).json({ erro: "Livro não encontrado." });
  db.avaliacoes = db.avaliacoes.filter(a => Number(a.livroId) !== id);
  await writeDB(db);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Avaliações — qualquer usuário logado pode avaliar um livro          */
/* ------------------------------------------------------------------ */

app.post("/api/livros/:id/avaliacoes", auth, async (req, res) => {
  const nota = Number(req.body.nota);
  const comentario = String(req.body.comentario || "").trim();
  const db = readDB();
  const livroId = Number(req.params.id);
  if (!db.livros.some(l => Number(l.id) === livroId)) return res.status(404).json({ erro: "Livro não encontrado." });
  if (![1, 2, 3, 4, 5].includes(nota)) return res.status(400).json({ erro: "A nota deve ser de 1 a 5." });
  const existente = db.avaliacoes.find(a => a.livroId === livroId && a.usuarioId === req.usuarioAtual.id);
  if (existente) {
    existente.nota = nota;
    existente.comentario = comentario;
    existente.data = new Date().toISOString();
  } else {
    db.avaliacoes.push({
      id: nextId(db.avaliacoes), usuarioId: req.usuarioAtual.id, livroId,
      nota, comentario, data: new Date().toISOString()
    });
  }
  await writeDB(db);
  res.status(201).json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Comunidade e usuários                                               */
/* ------------------------------------------------------------------ */

app.get("/api/comunidade", (req, res) => {
  const db = readDB();
  const atividades = [...db.avaliacoes]
    .sort((a, b) => new Date(b.data) - new Date(a.data))
    .slice(0, 20)
    .map(a => ({
      ...a,
      usuario: publicUser(db.usuarios.find(u => u.id === a.usuarioId) || { id: 0, username: "Leitor", role: "usuario" }),
      livro: db.livros.find(l => l.id === a.livroId) || null
    }));
  res.json({ usuarios: db.usuarios.length, avaliacoes: db.avaliacoes.length, resenhas: db.avaliacoes.filter(a => a.comentario).length, atividades });
});

app.get("/api/usuarios", (req, res) => {
  const db = readDB();
  const q = String(req.query.q || "").trim().toLowerCase();
  let usuarios = db.usuarios.map(publicUser);
  if (q) usuarios = usuarios.filter(u => u.username.toLowerCase().includes(q));
  res.json(usuarios);
});

app.get("/api/usuarios/:id", (req, res) => {
  const db = readDB();
  const u = db.usuarios.find(x => String(x.id) === String(req.params.id));
  if (!u) return res.status(404).json({ erro: "Usuário não encontrado." });
  const avaliacoes = db.avaliacoes
    .filter(a => a.usuarioId === u.id)
    .sort((a, b) => new Date(b.data) - new Date(a.data))
    .map(a => ({ ...a, livro: db.livros.find(l => l.id === a.livroId) || null }));
  res.json({ usuario: publicUser(u), avaliacoes });
});

app.get("/api/categorias", (req, res) => res.json(CATEGORIAS));
app.get("/api/faixas-etarias", (req, res) => res.json(FAIXAS_ETARIAS));

/* ------------------------------------------------------------------ */
/* SPA — qualquer rota que não seja /api ou /uploads devolve o index    */
/* ------------------------------------------------------------------ */

app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ erro: err.message || "Ocorreu um erro." });
});

seedAdmin()
  .catch(err => console.error("Não foi possível preparar a conta de administrador:", err))
  .finally(() => {
    app.listen(PORT, () => console.log(`MariLuc Library rodando em http://localhost:${PORT}`));
  });
