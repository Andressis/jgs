// server.js
// Servidor Express para rodar no Render.
// Faz duas coisas:
//   1. Serve os arquivos estáticos do site (pasta /public) — index.html, styles.css, script.js, logo.png
//   2. Expõe a rota POST /api/save-results, que grava os dados do formulário no MongoDB Atlas

const path = require('path');
const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000; // o Render define PORT automaticamente

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'jgs_proficiencia';

if (!MONGODB_URI) {
  console.error('ERRO: variável de ambiente MONGODB_URI não definida. Configure-a no Render em Environment.');
}

let db = null;
let mongoClient = null;

async function connectToMongo(){
  if (db) return db;
  mongoClient = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });
  await mongoClient.connect();
  db = mongoClient.db(MONGODB_DB);
  console.log('Conectado ao MongoDB Atlas, banco:', MONGODB_DB);
  return db;
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/save-results', async (req, res) => {
  try {
    const { codigo, fields, rows } = req.body || {};

    if (!codigo) {
      return res.status(400).json({ ok: false, error: 'Campo "codigo" é obrigatório.' });
    }

    const database = await connectToMongo();
    const collection = database.collection('submissions');

    const doc = {
      codigo,
      fields: fields || {},   // objeto plano { id_do_campo: valor }
      rows: rows || [],       // as mesmas linhas [Seção, Campo, Valor] usadas no PDF
      createdAt: new Date(),
      userAgent: req.headers['user-agent'] || null,
    };

    const result = await collection.updateOne(
      { codigo },
      { $set: doc },
      { upsert: true }
    );

    return res.status(200).json({
      ok: true,
      codigo,
      upsertedId: result.upsertedId || null,
      updated: result.matchedCount > 0,
    });
  } catch (err) {
    console.error('Erro ao salvar no MongoDB:', err);
    return res.status(500).json({ ok: false, error: 'Erro interno ao salvar os dados.' });
  }
});

// health check simples — útil para o Render confirmar que o serviço está de pé
app.get('/api/health', (req, res) => res.status(200).json({ ok: true }));

/* ---------------- Área administrativa (protegida por senha) ---------------- */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function requireAdmin(req, res, next){
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ ok: false, error: 'ADMIN_PASSWORD não configurada no servidor.' });
  }
  const sent = req.headers['x-admin-password'];
  if (!sent || sent !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'Senha inválida.' });
  }
  next();
}

// Verifica a senha (usado pela tela de login em /admin)
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ ok: false, error: 'ADMIN_PASSWORD não configurada no servidor.' });
  }
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Senha incorreta.' });
});

// Lista resumida de todos os envios, mais recentes primeiro
app.get('/api/admin/submissions', requireAdmin, async (req, res) => {
  try {
    const database = await connectToMongo();
    const docs = await database.collection('submissions')
      .find({}, { projection: { codigo: 1, createdAt: 1, 'fields.contato_nome': 1, 'fields.contato_email': 1, 'fields.data_calibracao': 1 } })
      .sort({ createdAt: -1 })
      .toArray();
    res.status(200).json({ ok: true, submissions: docs });
  } catch (err) {
    console.error('Erro ao listar envios:', err);
    res.status(500).json({ ok: false, error: 'Erro interno ao listar os envios.' });
  }
});

// Dados completos de um envio específico (usado para remontar o PDF)
app.get('/api/admin/submissions/:codigo', requireAdmin, async (req, res) => {
  try {
    const database = await connectToMongo();
    const doc = await database.collection('submissions').findOne({ codigo: req.params.codigo });
    if (!doc) return res.status(404).json({ ok: false, error: 'Envio não encontrado.' });
    res.status(200).json({ ok: true, submission: doc });
  } catch (err) {
    console.error('Erro ao buscar envio:', err);
    res.status(500).json({ ok: false, error: 'Erro interno ao buscar o envio.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  connectToMongo().catch(err => console.error('Falha ao conectar no MongoDB na inicialização:', err));
});
