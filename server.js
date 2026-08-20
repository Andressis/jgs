// server.js
// Servidor Express para rodar no Render.
//   1. Serve os arquivos estáticos do site (pasta /public)
//   2. Login do cliente (participante) — obrigatório para enviar resultados
//   3. Gravação/consulta dos resultados no MongoDB Atlas
//   4. Área administrativa: gerencia clientes e envios

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
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

/* =========================================================================
   Helpers
   ========================================================================= */

// Gera uma senha temporária legível (evita 0/O, 1/l/I, que se confundem)
function generateTempPassword(len = 8){
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++){
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  return out;
}

function generateToken(){
  return crypto.randomBytes(24).toString('hex');
}

function normalizeUsername(u){
  return String(u || '').trim().toLowerCase();
}

/* =========================================================================
   CLIENTES — autenticação (login de quem envia os resultados)
   ========================================================================= */

// Exige um token de cliente válido (header x-client-token)
async function requireClient(req, res, next){
  try{
    const token = req.headers['x-client-token'];
    if (!token) return res.status(401).json({ ok:false, error:'Não autenticado.' });

    const database = await connectToMongo();
    const client = await database.collection('clients').findOne({ activeToken: token, active: true });
    if (!client) return res.status(401).json({ ok:false, error:'Sessão inválida ou expirada. Faça login novamente.' });

    req.client = client;
    next();
  }catch(err){
    console.error('Erro na autenticação do cliente:', err);
    res.status(500).json({ ok:false, error:'Erro interno de autenticação.' });
  }
}

app.post('/api/client/login', async (req, res) => {
  try{
    const username = normalizeUsername(req.body && req.body.username);
    const password = (req.body && req.body.password) || '';
    if (!username || !password) {
      return res.status(400).json({ ok:false, error:'Informe usuário e senha.' });
    }

    const database = await connectToMongo();
    const client = await database.collection('clients').findOne({ username });
    if (!client || !client.active) {
      return res.status(401).json({ ok:false, error:'Usuário ou senha inválidos.' });
    }

    const match = await bcrypt.compare(password, client.passwordHash);
    if (!match) {
      return res.status(401).json({ ok:false, error:'Usuário ou senha inválidos.' });
    }

    const token = generateToken();
    await database.collection('clients').updateOne(
      { _id: client._id },
      { $set: { activeToken: token, tokenCreatedAt: new Date() } }
    );

    res.status(200).json({
      ok: true,
      token,
      nome: client.nome || client.username,
      mustChangePassword: !!client.mustChangePassword
    });
  }catch(err){
    console.error('Erro no login do cliente:', err);
    res.status(500).json({ ok:false, error:'Erro interno ao efetuar login.' });
  }
});

app.get('/api/client/me', requireClient, (req, res) => {
  res.status(200).json({
    ok: true,
    username: req.client.username,
    nome: req.client.nome || req.client.username,
    mustChangePassword: !!req.client.mustChangePassword
  });
});

// Cliente define a senha definitiva (obrigatório no primeiro acesso)
app.post('/api/client/change-password', requireClient, async (req, res) => {
  try{
    const newPassword = (req.body && req.body.newPassword) || '';
    if (newPassword.length < 6) {
      return res.status(400).json({ ok:false, error:'A nova senha deve ter pelo menos 6 caracteres.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const newToken = generateToken(); // renova o token por segurança

    const database = await connectToMongo();
    await database.collection('clients').updateOne(
      { _id: req.client._id },
      { $set: { passwordHash, mustChangePassword: false, activeToken: newToken, tokenCreatedAt: new Date() } }
    );

    res.status(200).json({ ok:true, token: newToken });
  }catch(err){
    console.error('Erro ao trocar senha do cliente:', err);
    res.status(500).json({ ok:false, error:'Erro interno ao trocar a senha.' });
  }
});

app.post('/api/client/logout', requireClient, async (req, res) => {
  try{
    const database = await connectToMongo();
    await database.collection('clients').updateOne(
      { _id: req.client._id },
      { $set: { activeToken: null } }
    );
    res.status(200).json({ ok:true });
  }catch(err){
    console.error('Erro ao sair:', err);
    res.status(500).json({ ok:false, error:'Erro interno ao sair.' });
  }
});

/* =========================================================================
   Envio de resultados — agora exige login do cliente
   ========================================================================= */
app.post('/api/save-results', requireClient, async (req, res) => {
  try {
    if (req.client.mustChangePassword) {
      return res.status(403).json({ ok:false, error:'Defina sua senha definitiva antes de enviar resultados.' });
    }

    const { codigo, fields, rows } = req.body || {};

    if (!codigo) {
      return res.status(400).json({ ok: false, error: 'Campo "codigo" é obrigatório.' });
    }

    const database = await connectToMongo();
    const collection = database.collection('submissions');

    const doc = {
      codigo,
      fields: fields || {},        // objeto plano { id_do_campo: valor }
      rows: rows || [],            // as mesmas linhas [Seção, Campo, Valor] usadas no PDF
      clientUsername: req.client.username,
      clientNome: req.client.nome || req.client.username,
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

/* =========================================================================
   Área administrativa (protegida por senha)
   ========================================================================= */
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

/* ---------- Envios ---------- */

// Lista resumida de todos os envios, mais recentes primeiro
app.get('/api/admin/submissions', requireAdmin, async (req, res) => {
  try {
    const database = await connectToMongo();
    const docs = await database.collection('submissions')
      .find({}, { projection: {
        codigo: 1, createdAt: 1, clientUsername: 1, clientNome: 1,
        'fields.tecnico_nome': 1, 'fields.data_calibracao': 1
      } })
      .sort({ createdAt: -1 })
      .toArray();
    res.status(200).json({ ok: true, submissions: docs });
  } catch (err) {
    console.error('Erro ao listar envios:', err);
    res.status(500).json({ ok: false, error: 'Erro interno ao listar os envios.' });
  }
});

// Dados completos de um envio específico (usado para PDF, XML e visualização)
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

// Exclui um envio
app.delete('/api/admin/submissions/:codigo', requireAdmin, async (req, res) => {
  try {
    const database = await connectToMongo();
    const result = await database.collection('submissions').deleteOne({ codigo: req.params.codigo });
    if (!result.deletedCount) return res.status(404).json({ ok: false, error: 'Envio não encontrado.' });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir envio:', err);
    res.status(500).json({ ok: false, error: 'Erro interno ao excluir o envio.' });
  }
});

/* ---------- Clientes (login dos participantes) ---------- */

app.get('/api/admin/clients', requireAdmin, async (req, res) => {
  try {
    const database = await connectToMongo();
    const docs = await database.collection('clients')
      .find({}, { projection: { passwordHash: 0, activeToken: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    res.status(200).json({ ok: true, clients: docs });
  } catch (err) {
    console.error('Erro ao listar clientes:', err);
    res.status(500).json({ ok: false, error: 'Erro interno ao listar os clientes.' });
  }
});

// Cria um cliente com senha temporária de uso único
app.post('/api/admin/clients', requireAdmin, async (req, res) => {
  try {
    const username = normalizeUsername(req.body && req.body.username);
    const nome = (req.body && req.body.nome) ? String(req.body.nome).trim() : '';

    if (!username) {
      return res.status(400).json({ ok: false, error: 'Informe um nome de usuário.' });
    }

    const database = await connectToMongo();
    const existing = await database.collection('clients').findOne({ username });
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Já existe um cliente com esse usuário.' });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const doc = {
      username,
      nome,
      passwordHash,
      mustChangePassword: true,
      active: true,
      activeToken: null,
      tokenCreatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await database.collection('clients').insertOne(doc);

    // a senha temporária só é retornada aqui, nesta resposta — não fica salva em texto puro
    res.status(201).json({ ok: true, username, tempPassword });
  } catch (err) {
    console.error('Erro ao criar cliente:', err);
    res.status(500).json({ ok: false, error: 'Erro interno ao criar o cliente.' });
  }
});

// Edita nome/status, ou gera nova senha temporária (resetPassword: true)
app.put('/api/admin/clients/:username', requireAdmin, async (req, res) => {
  try {
    const username = normalizeUsername(req.params.username);
    const database = await connectToMongo();
    const client = await database.collection('clients').findOne({ username });
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente não encontrado.' });

    const update = { updatedAt: new Date() };
    let tempPassword = null;

    if (typeof req.body.nome === 'string') update.nome = req.body.nome.trim();
    if (typeof req.body.active === 'boolean') update.active = req.body.active;

    if (req.body.resetPassword) {
      tempPassword = generateTempPassword();
      update.passwordHash = await bcrypt.hash(tempPassword, 10);
      update.mustChangePassword = true;
      update.activeToken = null; // derruba a sessão atual do cliente, se houver
    }

    await database.collection('clients').updateOne({ _id: client._id }, { $set: update });

    res.status(200).json({ ok: true, tempPassword });
  } catch (err) {
    console.error('Erro ao editar cliente:', err);
    res.status(500).json({ ok: false, error: 'Erro interno ao editar o cliente.' });
  }
});

app.delete('/api/admin/clients/:username', requireAdmin, async (req, res) => {
  try {
    const username = normalizeUsername(req.params.username);
    const database = await connectToMongo();
    const result = await database.collection('clients').deleteOne({ username });
    if (!result.deletedCount) return res.status(404).json({ ok: false, error: 'Cliente não encontrado.' });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir cliente:', err);
    res.status(500).json({ ok: false, error: 'Erro interno ao excluir o cliente.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  connectToMongo().catch(err => console.error('Falha ao conectar no MongoDB na inicialização:', err));
});
