/*
 * A very basic to-do list REST API server using Express and SQLite.
 */
import express, { type Request, type Response } from 'express';
import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { exit } from 'process';

type Todo = {
  id: number;
  task: string;
  completed: boolean;
  created_at: string;
};

type TodoInput = {
  task: string;
  completed?: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'todos.db');

const app = express();
const port = 3000;
let db: Database;
try {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
} catch (err) {
  if (err && typeof err === 'object' && 'message' in err)
    console.error('Error opening database ' + err.message);
  exit(1);
}

console.log('Connected to the SQLite database.');
try {
  await db.run(
    `CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task TEXT NOT NULL,
            completed BOOLEAN NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
  );
} catch (err) {
  if (err && typeof err === 'object' && 'message' in err)
    console.error('Error creating table ' + err.message);
  exit(1);
}
console.log("Table 'todos' is ready.");

// --- 5. Middleware ---
app.use(express.json());

// --- 6. API Logic Functions ---
const getAllTodos = async (): Promise<Todo[]> => {
  const sql = 'SELECT * FROM todos ORDER BY created_at DESC';
  console.log('getting all todos');
  return await db.all(sql, []);
};
const getTodoById = async (id: number): Promise<Todo | undefined> => {
  const sql = 'SELECT * FROM todos WHERE id = ?';
  console.log('getting todo by id');
  return await db.get(sql, [id]);
};
const createTodo = async (data: TodoInput): Promise<Todo> => {
  const sql = 'INSERT INTO todos (task, completed) VALUES (?, ?)';
  const params = [data.task, data.completed ?? false];
  const result = await db.run(sql, params);
  if (result.lastID === undefined) {
    throw new Error('Unable to create task');
  }
  console.log('creating todo', params);
  return {
    id: result.lastID,
    ...data,
    completed: data.completed ?? false,
    created_at: new Date().toISOString(),
  };
};
const updateTodo = async (
  id: number,
  data: Partial<TodoInput>,
): Promise<{ changes: number; data: Partial<TodoInput> }> => {
  const sql = `UPDATE todos set
                task = COALESCE(?, task),
                completed = COALESCE(?, completed)
               WHERE id = ?`;
  const params = [data.task, data.completed, id];
  const result = await db.run(sql, params);
  console.log('update todo', params);
  return { changes: result.changes ?? 0, data };
};

const deleteTodo = async (id: number): Promise<{ changes: number }> => {
  const sql = 'DELETE FROM todos WHERE id = ?';
  const result = await db.run(sql, [id]);
  console.log('delete todo');
  return { changes: result.changes ?? 0 };
};

// --- 7. API Routes ---
app.get('/todos', async (_, res: Response) => {
  try {
    const rows = await getAllTodos();
    res.json({
      message: 'success',
      data: rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/todos/:id', async (req: Request, res: Response) => {
  try {
    const row = await getTodoById(Number(req.params['id']));
    if (row) {
      res.json({
        message: 'success',
        data: row,
      });
    } else {
      res.status(404).json({ message: 'No to-do found with that ID.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/todos', async (req: Request, res: Response) => {
  if (!req.body.task) {
    res.status(400).json({ error: "Missing 'task' field in request body." });
    return;
  }
  try {
    const result = await createTodo(req.body);
    res.status(201).json({
      message: 'success',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/todos/:id', async (req: Request, res: Response) => {
  try {
    const { changes } = await updateTodo(Number(req.params['id']), req.body);
    if (changes === 0) {
      res
        .status(404)
        .json({ message: `No to-do found with ID ${req.params['id']}` });
    } else {
      res.json({
        message: 'success',
        data: await getTodoById(Number(req.params['id'])),
        changes: changes,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/todos/:id', async (req: Request, res: Response) => {
  try {
    const { changes } = await deleteTodo(Number(req.params['id']));
    if (changes === 0) {
      res
        .status(404)
        .json({ message: `No to-do found with ID ${req.params['id']}` });
    } else {
      res.json({ message: 'deleted', changes: changes });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- 8. Default Route for Not Found ---
app.use((_, res: Response) => {
  res.status(404).send('404: Page not found');
});

// --- 9. Start the Server ---
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// --- 10. Graceful Shutdown ---
process.on('SIGINT', () => {
  db.close();
});
