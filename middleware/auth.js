// middleware/auth.js
// Autenticação (sessão) e autorização (papel de administrador) de verdade:
// as rotas administrativas são bloqueadas no backend, não só escondidas no
// frontend, então mesmo chamando a API diretamente um usuário comum não
// consegue executar ações de admin.
const bcrypt = require("bcryptjs");
const { readDB, writeDB } = require("../data/db");

function getSessionUser(req) {
  if (!req.session.userId) return null;
  const db = readDB();
  return db.usuarios.find(u => u.id === req.session.userId) || null;
}

// Exige que exista um usuário logado.
function auth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ erro: "Você precisa estar logado." });
  req.usuarioAtual = user;
  next();
}

// Exige que o usuário logado tenha papel de administrador.
// Retorna 401 se não estiver logado e 403 se estiver logado mas não for admin,
// para o frontend distinguir "faça login" de "acesso não autorizado".
function requireAdmin(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ erro: "Você precisa estar logado." });
  if (user.role !== "admin") return res.status(403).json({ erro: "Acesso não autorizado. Essa área é restrita a administradores." });
  req.usuarioAtual = user;
  next();
}

// Garante que exista pelo menos uma conta de administrador de demonstração,
// criada com senha com hash (nunca em texto puro e nunca exposta no frontend).
async function seedAdmin() {
  const db = readDB();
  const jaTemAdmin = db.usuarios.some(u => u.role === "admin");
  if (jaTemAdmin) return;

  const senhaHash = await bcrypt.hash("Admin@123", 10);
  const nextId = db.usuarios.length ? Math.max(...db.usuarios.map(u => Number(u.id) || 0)) + 1 : 1;
  db.usuarios.push({
    id: nextId,
    username: "admin",
    email: "admin@mariluc.com",
    senha: senhaHash,
    foto: "",
    bio: "Administração da MariLuc Library.",
    role: "admin",
    criadoEm: new Date().toISOString()
  });
  await writeDB(db);
  console.log("✦ Conta de administrador de demonstração criada: admin@mariluc.com / Admin@123");
}

module.exports = { auth, requireAdmin, getSessionUser, seedAdmin };
