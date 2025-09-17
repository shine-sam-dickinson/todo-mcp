/* A simple MCP server that connects to a todo REST API
 * and exposes it via MCP tools and resources.
 *
 * There is very little error handling in this example
 */
import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = 'http://localhost:3000';

type Todo = {
  id: number;
  task: string;
  completed: boolean;
  created_at: string;
};

// Helpers
const mimeType = 'application/json';
const headers = {
  'Content-Type': mimeType,
};
const fetchHelper: typeof fetch = (input, init?) =>
  fetch(`${BASE_URL}${input}`, init);
// End helpers

// Create an MCP server
const server = new McpServer({
  name: 'todo-server',
  version: '0.0.1',
  capabilities: {
    resources: {},
  },
});

// MCP Tool registrations
server.registerTool(
  'list',
  {
    description:
      'Call whenever the user wishes to get a list of all their todo items',
    title: 'List all the ids of todo items',
  },
  async () => {
    const data = (await fetchHelper('/todos').then((res) => res.json())).data;
    return {
      content: [
        { type: 'text', text: `Found ${data.length} items` },
        ...data.map((item: Todo) => ({
          type: 'resource_link',
          uri: `todo://item/${item.id}`,
          name: String(item.id),
          description: JSON.stringify(item.task),
          mimeType,
          annotations: {
            audience: ['assistant'],
            priority: 0.9,
          },
        })),
      ],
    };
  },
);

server.registerTool(
  'get',
  {
    title: 'Get todo by id',
    description: 'Get a single todo item by its id',
    inputSchema: { id: z.number() },
  },
  async ({ id }) => {
    const data: Todo = (
      await fetchHelper(`/todos/${id}`).then((res) => res.json())
    ).data;
    return {
      content: [
        { type: 'text', text: 'found todo item' },
        {
          type: 'resource_link',
          uri: `todo://item/${id}`,
          name: String(id),
          description: data.task,
          mimeType,
          annotations: {
            audience: ['assistant'],
            priority: 0.9,
          },
        },
      ],
    };
  },
);
server.registerTool(
  'update',
  {
    title: 'Update todo by id',
    description: 'Update a single todo item by its id',
    inputSchema: {
      id: z.number(),
      task: z.string().optional(),
      completed: z.boolean().optional(),
    },
  },
  async ({ id, task, completed }) => {
    const data = (
      await fetchHelper(`/todos/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ task: task?.length ? task : null, completed }),
      })
        .then((res) => {
          if (res.ok) return res;
          if (res.status >= 500)
            throw new Error(`Bad response - ${res.status} - ${res.statusText}`);
          throw new Error(`Bad request - ${res.status} - ${res.statusText}`);
        })
        .then((res) => res.json())
    ).data;
    return data;
  },
);

server.registerTool(
  'add',
  {
    title: 'Add todo item',
    description: 'Call when the user wants to add a new todo item',
    inputSchema: { task: z.string() },
  },
  async ({ task }) => {
    const data = await fetchHelper('/todos', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        task,
      }),
    })
      .then((resp) => resp.text())
      .then((txt) => {
        console.error(txt);
        return txt;
      })
      .then((txt) => JSON.parse(txt));
    return {
      content: [
        {
          type: 'resource_link',
          uri: `todo://item/${data.data.id}`,
          name: String(data.data.id),
          description: task,
          mimeType,
          annotations: {
            audience: ['assistant'],
            priority: 0.9,
          },
        },
      ],
    };
  },
);

server.registerTool(
  'delete',
  {
    title: 'Delete todo item by id',
    description:
      'Call whenever the user wishes to delete an existing todo item by its id',
    inputSchema: { id: z.number() },
  },
  async ({ id }) => {
    await fetchHelper(`/todos/${id}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        id,
      }),
    })
      .then((res) => {
        if (res.ok) return res;
        if (res.status >= 500)
          throw new Error(`Bad response - ${res.status} - ${res.statusText}`);
        throw new Error(`Bad request - ${res.status} - ${res.statusText}`);
      })
      .then((res) => res.json());
    return {
      content: [
        {
          type: 'text',
          text: 'deleted successfully',
          annotations: {
            audience: ['assistant'],
            priority: 0.9,
          },
        },
      ],
    };
  },
);

// MCP Resource registrations
server.registerResource(
  'all',
  'todo://all',
  {
    title: 'All TODO items',
    description: 'Call whenever the user wants all todo items',
    mimeType,
  },
  async (uri) => {
    const data = await fetchHelper(`/todos`).then((res) => res.json());
    return {
      contents: [
        {
          mimeType,
          uri: uri.href,
          text: JSON.stringify(data),
        },
      ],
    };
  },
);
server.registerResource(
  'item',
  new ResourceTemplate('todo://item/{id}', { list: undefined }),
  {
    title: 'Single TODO item',
    description: 'Get a single todo item based on id',
    mimeType,
  },
  async (uri, { id }) => {
    const data = await fetchHelper(`/todos/${id}`).then((res) => res.json());
    return {
      contents: [
        {
          mimeType,
          uri: uri.href,
          text: JSON.stringify(data),
        },
      ],
    };
  },
);
// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
