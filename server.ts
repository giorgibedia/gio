import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = 3000;

// Initialize GoogleGenAI with the user's Vertex AI credentials
const privateKey = "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCspmVrGRSi1pwC\nLV77Sfom1riFu76LDgdkSQpNTlMnea4iM72hmb7URh1kTDTTx6Xzw70Vl3RGykWc\nNczD5Z/pcxLv1gDWG1svHp4Gkt3FLmpqbt2pacq6OpwKu6PDrmW2FMUYBbtMpAQT\nF+EJn+6p4DqsoQRVC8BDmRNW64aN20D5powU8wQ2ZlkUBJ/9i6GcHeHrPu8zkEzO\nizQ3LoD5Iq2N8n42NN2ihy93SG6nnmGJeml+iN7GnDRboykgq1qNGRm0Z1dJd3mU\nYu7wAhX/KlS9lfnh5nS6olbvqTpFy7URmksR71xulaklmSb6WDQr61TZ7P64Katf\nf0IL68itAgMBAAECggEAOR1o4qeu6HnHrX6187qS2yNgcrlbvSO8dUQmeNGG98Gs\nxhrIynuSoiW51nLRbRgYgc5IsKpkaIDEy3sOzOWbY77STm5E44+0OB/QVktiuzby\nNFiN0twxGS+HbJOLhxIcCsLPOvW2cxG1WV2mcCks6pzHvFEeHkZfad1rhO8wmZ+a\nI5IuKkG36fT9VkNyLfYHBV/yGS3Cz1GdRkJCQP2fMurH9Uer0FZrzJnF185qj+9I\nDhaFHfBlNzR1pb905tW2wMqqBjYYV9no+aEgZOhsJ+wFwiiuTCK5MzPJ6xkeZHhQ\nC10JW1cXHUmF8dRBjJE9JSg/UbY6fVI+2bRrVrs9LwKBgQDbT3Mzn4PityUhGlAC\nD1euzn+qbU1dqZCaiXemYVf0549itun9d4nO4Yk7BLmAS0Do8jiFAxtUJCW0azUv\nqEX3ubhoTVUWg+j6CyPV4to+Dy67JMtXOiXL1fGf7Z0jHvXyXHpkcC4vn8DI6omJ\n3wE7y6WGdSHET7ap5P6VEAw38wKBgQDJiJd3pl+DUS6C9Uk7K7ak0ENtMs/c93Vc\nRlhnyxswl8KMfyznx6s9MaHRpJdMav80B7bk303uG89fjcAMj2V3uDh7yN/QrjKe\nE58VY/sb1ZobO6hqsDHnopuZ3JYeTOChKMsWpN3YUwHHRUpFRrZjDKOUGU/H2QK6\nlbXsNQvE3wKBgQDUGVSa+oy8eM+p4h66v0fXwdJqaudFzDYTnxteiApeyow7thc6\nkZ9vu2PS9lDJKP6Py6Kp0UVe7M6iXITFoIJ6gN090nyWF+D74kY4FvtmxZw2VfFq\nXMwtBK54M3+jdc/7I0EjXfLtEB2MsnduJYS15dAh56pOh6FrUhJ861ZFzQKBgFT+\nNRrx4IAqIZp7RcodkmaJqpYIAt/mwOkMhcYoQyxIJHVKQS7y50Xkg6E9b817pmtU\nAY8emegcdGWRC3iAlUNbPv79ZV7FyHUgQ0wrIUDI4bgwfcOY0UMmMcc+31SiCW4O\nHTBMkX7k6vAWSc9TliHJt8cCscHPxLXZ46JdcLwzAoGBAImqNTBR9FYrEmhHoK4x\nGZtGCCT2S7vzVq+wHR2Wbqd90YNfklkRTuC23EU03ZguE/LemP8AevCxNmchwJxw\nh0oz8qOyET1rMwPi5IHSwDdqgewnZ6nEYwwff3ObE8XIEj36+9ThI7PRVpM8yF56\nV1cDPUNSaHXef/aXf3BDQ26O\n-----END PRIVATE KEY-----\n".replace(/\\n/g, '\n');

const ai = new GoogleGenAI({
  vertexai: true,
  project: 'kinetic-axle-482412-m5',
  location: 'us-central1',
  credentials: {
    client_email: 'vertex-ai-dev@kinetic-axle-482412-m5.iam.gserviceaccount.com',
    private_key: privateKey,
  },
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Configure JSON request body size support
app.use(express.json({ limit: '10mb' }));

// Vertex AI Generate Image API Route
app.post('/api/generate-image', async (req, res) => {
  const { prompt, images, aspectRatio, imageSize } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'A text prompt is required.' });
  }

  try {
    console.log(`Generating image via Vertex AI for prompt: "${prompt}", with ${images?.length || 0} reference images.`);
    
    // Build parts array dynamically. Reference images must be sent as inlineData parts before the text prompt.
    const parts: any[] = [];
    
    if (images && Array.isArray(images)) {
      for (const img of images) {
        if (typeof img === 'string' && img.startsWith('data:')) {
          const match = img.match(/^data:(.+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }
      }
    }
    
    // Add prompt text as the final part
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: {
        parts: parts,
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio || '1:1',
          imageSize: imageSize || '1K',
        },
      },
    });

    let imageUrl = null;
    let textFeedback = '';

    const responseParts = response.candidates?.[0]?.content?.parts || [];
    for (const part of responseParts) {
      if (part.inlineData) {
        imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      } else if (part.text) {
        textFeedback += part.text;
      }
    }

    if (imageUrl) {
      return res.json({ imageUrl, textFeedback });
    } else {
      return res.status(500).json({
        error: 'No image element returned by Vertex AI.',
        feedback: textFeedback,
      });
    }
  } catch (error: any) {
    console.error('Vertex AI Image Generation Error:', error);
    return res.status(500).json({
      error: error.message || 'An unexpected error occurred during image generation.',
    });
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
