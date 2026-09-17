const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const serverless = require('serverless-http');

const { logEvento } = require('./logger');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// ======================================================
// MONGODB
// ======================================================

const mongoURI = process.env.MONGO_URI;

let isConnected;

const connectToDatabase = async () => {
  if (isConnected) {
    return;
  }

  try {
    const db = await mongoose.connect(mongoURI);

    isConnected = db.connections[0].readyState;
  } catch (err) {
    // Não imprime err, URI, senha ou outras informações sensíveis
    throw new Error('Falha na conexão com MongoDB');
  }
};

// ======================================================
// CONTEXTO DA REQUISIÇÃO
// ======================================================

app.use((req, res, next) => {
  /*
   * serverless-http disponibiliza informações do evento
   * original do API Gateway em req.apiGateway.
   */
  req.requestId =
    req.apiGateway?.context?.awsRequestId ||
    req.headers['x-request-id'] ||
    null;

  next();
});

// ======================================================
// CONEXÃO COM BANCO
// ======================================================

app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    /*
     * Não fazemos log estruturado aqui porque queremos
     * exatamente UM evento por requisição.
     *
     * O erro será tratado nas rotas.
     */
    next(err);
  }
});

// ======================================================
// MODEL
// ======================================================

const TodoSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },

  completed: {
    type: Boolean,
    default: false,
  },
});

const Todo = mongoose.models.Todo ||
  mongoose.model('Todo', TodoSchema);

// ======================================================
// GET /todos
// ======================================================

app.get('/todos', async (req, res) => {
  const start = Date.now();

  let dbStart = null;
  let dbDurationMs = null;

  try {
    dbStart = Date.now();

    const todos = await Todo.find();

    dbDurationMs = Date.now() - dbStart;

    const durationMs = Date.now() - start;

    logEvento({
      level: 'INFO',
      requestId: req.requestId,
      method: req.method,
      route: '/todos',
      status: 200,
      durationMs,
      dbDurationMs,
      message: 'Tarefas consultadas com sucesso',
    });

    return res.status(200).json(todos);

  } catch (err) {
    if (dbStart !== null) {
      dbDurationMs = Date.now() - dbStart;
    }

    const durationMs = Date.now() - start;

    logEvento({
      level: 'ERROR',
      requestId: req.requestId,
      method: req.method,
      route: '/todos',
      status: 500,
      durationMs,
      dbDurationMs,
      message: 'Erro ao consultar tarefas',
    });

    return res.status(500).json({
      message: 'Erro interno do servidor',
    });
  }
});

// ======================================================
// POST /todos
// ======================================================

app.post('/todos', async (req, res) => {
  const start = Date.now();

  const { text } = req.body;

  if (!text) {
    const durationMs = Date.now() - start;

    logEvento({
      level: 'WARN',
      requestId: req.requestId,
      method: req.method,
      route: '/todos',
      status: 400,
      durationMs,
      dbDurationMs: null,
      message: 'Campo text não informado',
    });

    return res.status(400).json({
      message: 'O campo "text" é obrigatório',
    });
  }

  const todo = new Todo({
    text,
    completed: false,
  });

  let dbStart = null;
  let dbDurationMs = null;

  try {
    dbStart = Date.now();

    const newTodo = await todo.save();

    dbDurationMs = Date.now() - dbStart;

    const durationMs = Date.now() - start;

    logEvento({
      level: 'INFO',
      requestId: req.requestId,
      method: req.method,
      route: '/todos',
      status: 201,
      durationMs,
      dbDurationMs,
      message: 'Tarefa criada com sucesso',
    });

    return res.status(201).json(newTodo);

  } catch (err) {
    if (dbStart !== null) {
      dbDurationMs = Date.now() - dbStart;
    }

    const durationMs = Date.now() - start;

    logEvento({
      level: 'ERROR',
      requestId: req.requestId,
      method: req.method,
      route: '/todos',
      status: 500,
      durationMs,
      dbDurationMs,
      message: 'Erro ao criar tarefa',
    });

    return res.status(500).json({
      message: 'Erro interno do servidor',
    });
  }
});

// ======================================================
// PATCH /todos/:id
// ======================================================

app.patch('/todos/:id', async (req, res) => {
  const start = Date.now();

  let dbDurationMs = 0;
  let dbStart = null;

  try {
    // Operação 1: busca
    dbStart = Date.now();

    const todo = await Todo.findById(req.params.id);

    dbDurationMs += Date.now() - dbStart;
    dbStart = null;

    if (!todo) {
      const durationMs = Date.now() - start;

      logEvento({
        level: 'WARN',
        requestId: req.requestId,
        method: req.method,
        route: '/todos/:id',
        status: 404,
        durationMs,
        dbDurationMs,
        message: 'Tarefa não encontrada',
      });

      return res.status(404).json({
        message: 'Tarefa não encontrada',
      });
    }

    todo.completed = !todo.completed;

    // Operação 2: atualização
    dbStart = Date.now();

    await todo.save();

    dbDurationMs += Date.now() - dbStart;
    dbStart = null;

    const durationMs = Date.now() - start;

    logEvento({
      level: 'INFO',
      requestId: req.requestId,
      method: req.method,
      route: '/todos/:id',
      status: 200,
      durationMs,
      dbDurationMs,
      message: 'Tarefa atualizada com sucesso',
    });

    return res.status(200).json(todo);

  } catch (err) {
    if (dbStart !== null) {
      dbDurationMs += Date.now() - dbStart;
    }

    const durationMs = Date.now() - start;

    logEvento({
      level: 'ERROR',
      requestId: req.requestId,
      method: req.method,
      route: '/todos/:id',
      status: 500,
      durationMs,
      dbDurationMs,
      message: 'Erro ao atualizar tarefa',
    });

    return res.status(500).json({
      message: 'Erro interno do servidor',
    });
  }
});

// ======================================================
// DELETE /todos/:id
// ======================================================

app.delete('/todos/:id', async (req, res) => {
  const start = Date.now();

  let dbStart = null;
  let dbDurationMs = null;

  try {
    dbStart = Date.now();

    const todo = await Todo.findByIdAndDelete(req.params.id);

    dbDurationMs = Date.now() - dbStart;
    dbStart = null;

    if (!todo) {
      const durationMs = Date.now() - start;

      logEvento({
        level: 'WARN',
        requestId: req.requestId,
        method: req.method,
        route: '/todos/:id',
        status: 404,
        durationMs,
        dbDurationMs,
        message: 'Tarefa não encontrada',
      });

      return res.status(404).json({
        message: 'Tarefa não encontrada',
      });
    }

    const durationMs = Date.now() - start;

    logEvento({
      level: 'INFO',
      requestId: req.requestId,
      method: req.method,
      route: '/todos/:id',
      status: 200,
      durationMs,
      dbDurationMs,
      message: 'Tarefa excluída com sucesso',
    });

    return res.status(200).json({
      message: 'Tarefa excluída com sucesso',
    });

  } catch (err) {
    if (dbStart !== null) {
      dbDurationMs = Date.now() - dbStart;
    }

    const durationMs = Date.now() - start;

    logEvento({
      level: 'ERROR',
      requestId: req.requestId,
      method: req.method,
      route: '/todos/:id',
      status: 500,
      durationMs,
      dbDurationMs,
      message: 'Erro ao excluir tarefa',
    });

    return res.status(500).json({
      message: 'Erro interno do servidor',
    });
  }
});

app.use((err, req, res, next) => {
  logEvento({
    level: 'ERROR',
    requestId: req.requestId,
    method: req.method,
    route: req.route?.path || req.path,
    status: 500,
    durationMs: null,
    dbDurationMs: null,
    message: 'Falha ao processar requisição'
  });

  return res.status(500).json({
    message: 'Erro interno do servidor'
  });
});


// ======================================================
// EXPORTAÇÃO LAMBDA
// ======================================================

module.exports.handler = serverless(app);