import 'dotenv/config';
import { Worker } from 'bullmq';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { Document } from '@langchain/core/documents';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CharacterTextSplitter } from '@langchain/textsplitters';
import { randomUUID } from 'crypto';

// Initialize Azure OpenAI embeddings
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

const worker = new Worker(
  'file-upload-queue',
  async (job) => {
    console.log(`Job:`, job.data);
    const data = JSON.parse(job.data);
    /*
    Path: data.path
    read the pdf from path,
    chunk the pdf,
    call the openai embedding model for every chunk,
    store the chunk in qdrant db
    */

    try {
      // Load the PDF
      const loader = new PDFLoader(data.path);
      const docs = await loader.load();

      console.log(`PDF loaded with ${docs.length} pages`);

      // Upsert each page into Qdrant via REST
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const text = doc.pageContent || '';
        console.log(`Processing page ${i + 1}: ${text.substring(0, 100)}...`);

        // Create vector store if it doesn't exist
        const vectorStore = await QdrantVectorStore.fromExistingCollection(
          embeddings,
          {
            url: 'http://localhost:6333',
            collectionName: 'langchainjs-testing',
          }
        );

        // Add document to vector store
        await vectorStore.addDocuments([new Document({
          pageContent: text,
          metadata: {
            page: i + 1,
            source: data.path,
          }
        })]);
        
        console.log(`Added page ${i + 1} to vector store`);
      }

      console.log(`All pages upserted to Qdrant`);
    } catch (error) {
      console.error('Error processing PDF:', error);
    }
  },
  {
    concurrency: 100,
    connection: {
      host: 'localhost',
      port: '6379',
    },
  }
);
