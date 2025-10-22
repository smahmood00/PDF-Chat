# PDF RAG (Retrieval-Augmented Generation) Application

A full-stack application that allows users to upload PDFs, process them using Azure OpenAI embeddings, and chat with the content using Azure GPT-4.

## Architecture

### Frontend (Next.js)
- File upload interface
- Chat interface
- Real-time response display
- Split-screen layout (30% upload, 70% chat)

### Backend (Node.js/Express)
- PDF processing with background jobs
- Azure OpenAI integration for embeddings and chat
- Vector storage with Qdrant
- Queue management with BullMQ/Valkey

### Infrastructure
- **Valkey**: Redis-compatible queue service (port 6379)
- **Qdrant**: Vector database for embeddings (port 6333)
- **Azure OpenAI**: Embeddings and chat completions

## Prerequisites

- Node.js (latest LTS version)
- Docker and Docker Compose
- Azure OpenAI API access with:
  - GPT-4 deployment
  - text-embedding-3-small deployment

## Environment Setup

Create `server/.env` with:
```env
AZURE_OPENAI_API_KEY=your_api_key
AZURE_OPENAI_ENDPOINT=your_endpoint  # e.g., https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=your_chat_deployment  # e.g., gpt-4
AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME=text-embedding-3-small
```

## Installation & Setup

1. **Start Infrastructure**
```bash
# From project root
docker-compose up -d
```

2. **Create Qdrant Collection**
```bash
# Create collection for Azure embeddings (1536 dimensions)
curl -X PUT "http://localhost:6333/collections/langchainjs-testing" \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":1536,"distance":"Cosine"}}'
```

3. **Install Dependencies**
```bash
# Server
cd server
npm install

# Client
cd client
npm install
```

4. **Start Services**
```bash
# Terminal 1 - Server
cd server
npm run dev

# Terminal 2 - Worker
cd server
npm run dev:worker

# Terminal 3 - Client
cd client
npm run dev
```

## Usage

1. Open http://localhost:3000 in your browser
2. Upload a PDF using the left panel
3. Wait for processing confirmation
4. Ask questions about the PDF content in the chat interface
5. View responses with relevant context from the PDF

## How It Works

1. **PDF Upload**
   - PDF is saved to server/uploads/
   - Job is queued in Valkey/Redis

2. **Background Processing**
   - Worker picks up the job
   - PDF is loaded and processed
   - Text is embedded using Azure OpenAI
   - Vectors are stored in Qdrant

3. **Chat Interface**
   - User query is embedded using Azure OpenAI
   - Similar chunks are retrieved from Qdrant
   - Context is sent to Azure GPT-4
   - Response is displayed with source context

## Architecture Diagram

```
┌─────────────┐     ┌──────────┐     ┌─────────┐
│  Next.js UI │────>│  Express │────>│ BullMQ  │
└─────────────┘     │  Server  │     └─────────┘
                    └──────────┘          │
                         │                ▼
                         │           ┌─────────┐
                         │           │ Worker  │
                         │           └─────────┘
                         │                │
                    ┌────▼────┐          │
                    │ Qdrant  │<─────────┘
                    └─────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ Azure OpenAI │
                  └──────────────┘
```

## Development

- Server code in `server/`
- Client code in `client/`
- Infrastructure config in `docker-compose.yml`
- Environment variables in `server/.env`

## Troubleshooting

1. **Vector Dimension Mismatch**
   - Ensure Qdrant collection is created with size=1536 for Azure embeddings

2. **Queue Issues**
   - Check if Valkey is running: `docker-compose ps`
   - Verify Redis connection in server config

3. **Azure OpenAI Errors**
   - Verify API key and endpoints
   - Check deployment names match your Azure setup

## License

ISC License
