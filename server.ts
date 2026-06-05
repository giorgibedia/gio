import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import handler from './api/generate-image';

const app = express();
const PORT = 3000;

// Configure JSON request body size support
app.use(express.json({ limit: '10mb' }));

// Vertex AI Generate Image API Route routed to Serverless Handler
app.post('/api/generate-image', async (req, res) => {
  try {
    await handler(req, res);
  } catch (err: any) {
    console.error("Local route delegation failed:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer();
