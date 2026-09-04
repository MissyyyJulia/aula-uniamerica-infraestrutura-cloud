const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const serverless = require('serverless-http'); // <-- NOVA IMPORTAÇÃO

// Inicializando o app Express
const app = express();

// Middleware para habilitar CORS e processar JSON
app.use(cors());
app.use(bodyParser.json());

// Conexão com o MongoDB usando Variável de Ambiente
// O AWS Lambda vai injetar a variável MONGO_URI com o endereço real do banco
const mongoURI = process.env.MONGO_URI;

// Evita conectar várias vezes se o Lambda reutilizar a instância (Warm Start)
let isConnected;

const connectToDatabase = async () => {
  if (isConnected) {
    console.log('Usando conexão existente com o MongoDB');
    return;
  }
  try {
    const db = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    isConnected = db.connections[0].readyState;
    console.log('Novo banco conectado!');
  } catch (err) {
    console.error('Erro ao conectar ao MongoDB:', err);
  }
};

// Middleware para garantir que o banco está conectado antes de qualquer rota
app.use(async (req, res, next) => {
  await connectToDatabase();
  next();
});

// Definindo o modelo de Tarefa (To-do)
const TodoSchema = new mongoose.Schema({
  text: { type: String, required: true },
  completed: { type: Boolean, default: false },
});

const Todo = mongoose.model('Todo', TodoSchema);

// Rota para obter todas as tarefas (GET)
app.get('/todos', async (req, res) => {
  try {
    const todos = await Todo.find();
    res.json(todos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Rota para adicionar uma nova tarefa (POST)
app.post('/todos', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ message: 'O campo "text" é obrigatório' });
  }

  const todo = new Todo({ text, completed: false });

  try {
    const newTodo = await todo.save();
    res.status(201).json(newTodo);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Rota para marcar uma tarefa como concluída (PATCH)
app.patch('/todos/:id', async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({ message: 'Tarefa não encontrada' });
    }

    todo.completed = !todo.completed;
    await todo.save();
    res.json(todo);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Rota para excluir uma tarefa (DELETE)
app.delete('/todos/:id', async (req, res) => {
  try {
    const todo = await Todo.findByIdAndDelete(req.params.id);

    if (!todo) {
      return res.status(404).json({ message: 'Tarefa não encontrada' });
    }

    res.json({ message: 'Tarefa excluída com sucesso' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// REMOVEMOS O app.listen(port) E ADICIONAMOS A EXPORTAÇÃO PARA O LAMBDA:
module.exports.handler = serverless(app);