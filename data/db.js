// data/db.js
// Camada de acesso ao "banco de dados" em JSON (requisito da Somativa 1).
// Centraliza leitura/escrita para que o restante da aplicação nunca
// mexa direto no arquivo db.json.
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "db.json");

const CATEGORIAS = [
  "Fantasia", "Romance", "Mistério", "Terror", "Ficção científica",
  "Aventura", "Drama", "Clássico", "Infantil", "Juvenil", "Outros"
];

const FAIXAS_ETARIAS = ["Livre", "10+", "12+", "14+", "16+", "18+"];

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const vazio = { livros: [], usuarios: [], avaliacoes: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(vazio, null, 2), "utf8");
    return vazio;
  }
  const raw = fs.readFileSync(DB_PATH, "utf8");
  const db = raw.trim() ? JSON.parse(raw) : {};
  db.livros = db.livros || [];
  db.usuarios = db.usuarios || [];
  db.avaliacoes = db.avaliacoes || [];
  return db;
}

// Serializa as gravações para reduzir condições de corrida quando
// várias requisições tentam escrever no JSON ao mesmo tempo.
let writeQueue = Promise.resolve();
function writeDB(db) {
  writeQueue = writeQueue.then(() =>
    fs.promises.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8")
  );
  return writeQueue;
}

function nextId(list) {
  return list.length ? Math.max(...list.map(x => Number(x.id) || 0)) + 1 : 1;
}

// Nunca devolve a senha (nem o hash) para o cliente.
function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    foto: u.foto || "",
    bio: u.bio || "",
    role: u.role || "usuario",
    criadoEm: u.criadoEm || null
  };
}

module.exports = { readDB, writeDB, nextId, publicUser, CATEGORIAS, FAIXAS_ETARIAS, DB_PATH };
