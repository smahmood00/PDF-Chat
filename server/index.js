import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Queue } from 'bullmq';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import OpenAI from 'openai';

// Initialize Azure OpenAI client
const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
  defaultQuery: { "api-version": "2025-01-01-preview" }
});
const queue = new Queue('file-upload-queue', {
  connection: {
    host: 'localhost',
    port: '6379',
  },
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  return res.json({ status: 'All Good!' });
});

app.post('/upload/pdf', upload.single('pdf'), async (req, res) => {
  await queue.add(
    'file-ready',
    JSON.stringify({
      filename: req.file.originalname,
      destination: req.file.destination,
      path: req.file.path,
    })
  );
  return res.json({ message: 'uploaded' });
});

app.get('/chat', async (req, res) => {
  try {
    const userQuery = String(req.query.message || '');
    if (!userQuery.trim()) {
      return res.status(400).json({ error: 'Missing query parameter: message' });
    }

    // 1) Embed the query using Azure OpenAI
    const embeddings = new OpenAIEmbeddings({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
      azureOpenAIApiVersion: "2023-05-15",
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME,
      azureOpenAIBasePath: process.env.AZURE_OPENAI_ENDPOINT,
      configuration: {
        baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME}`,
        defaultQuery: { "api-version": "2023-05-15" },
        apiKey: process.env.AZURE_OPENAI_API_KEY
      }
    });
    
    // Create vector store with Azure embeddings
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: 'http://localhost:6333',
        collectionName: 'langchainjs-testing',
      }
    );

    // Search for relevant chunks
    const results = await vectorStore.similaritySearch(userQuery, 3);
    const context = results.map(r => r.pageContent).join('\n\n');
    // 3) Use Azure OpenAI to generate answer
    const chatResult = await client.chat.completions.create({
      messages: [
        { 
          role: 'system', 
          content: 'You are a helpful AI assistant. Answer questions using ONLY the provided context. If the answer cannot be found in the context, say so clearly.' 
        },
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${userQuery}\n\nAnswer based only on the context above.`
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const answer = chatResult.choices[0]?.message?.content || "I couldn't generate an answer based on the context.";

    return res.json({
      message: answer,
      docs: results,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      error: 'Failed to process chat request',
      message: error.message,
    });
  }
});

app.listen(8000, () => console.log(`Server started on PORT:${8000}`));
