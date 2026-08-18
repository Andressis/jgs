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

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  connectToMongo().catch(err => console.error('Falha ao conectar no MongoDB na inicialização:', err));
});
