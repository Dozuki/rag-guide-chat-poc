# RAG Dozuki Guide Application

A production-ready Retrieval-Augmented Generation (RAG) application built with FastAPI, Inngest, and Qdrant. This application allows you to ingest guides from the Dozuki platform (hansaw.dozuki.com), store their embeddings in a vector database, and query them using natural language with AI-powered responses.

## Features

- **Dozuki Guide Ingestion**: 
  - Single guide ingestion with instant processing
  - Site-wide ingestion with real-time progress tracking
  - Pause/resume capability for large-scale ingestions
  - Batch processing with configurable batch sizes
  - Automatic error recovery and detailed error reporting
- **Vector Search**: Efficient semantic search using Qdrant vector database
- **AI-Powered Q&A**: Query your guides using natural language with AWS Bedrock (Claude 4.5 Sonnet)
- **Workflow Orchestration**: Robust async workflow management with Inngest for throttling, rate limiting, and observability
- **Interactive UI**: Streamlit-based web interface with tabbed layout for different workflows
- **Conversational Chat Frontend**: React + Vite single-page app for a polished, reference-aware chat experience
- **Production Ready**: Built with FastAPI, includes proper error handling, rate limiting, and progress persistence

## Architecture

```
┌─────────────┐
│  Streamlit  │ (User Interface)
│     UI      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   FastAPI   │ (REST API + Inngest Handler)
│   Backend   │
└──────┬──────┘
       │
       ├──────────────┐
       ▼              ▼
┌─────────────┐  ┌──────────┐
│   Inngest   │  │  Qdrant  │
│  Workflows  │  │  Vector  │
│             │  │    DB    │
└──────┬──────┘  └────┬─────┘
       │              │
       ├──────────────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐
│  AWS Bedrock │     │   Dozuki     │
│ Titan Embed  │     │     API      │
│  & Claude    │     └──────────────┘
└──────────────┘
```

## Prerequisites

- Python 3.13 or higher
- Docker (for running Qdrant)
- Node.js and npm (for Inngest CLI)
- [uv](https://github.com/astral-sh/uv) package manager
- AWS account with Bedrock access (Claude 4.5 Sonnet and Titan Embed v2 models enabled)
- AWS credentials configured (via AWS CLI or environment variables)
- Dozuki account credentials for hansaw.dozuki.com

## Installation

### 1. Install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Clone the Repository

```bash
git clone <repository-url>
cd RAGPythonApp
```

### 3. Set Up AWS Credentials

You have three options for configuring AWS credentials:

**Option 1: Using .env file (Recommended for development)**

Create a `.env` file in the project root:

```bash
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_DEFAULT_REGION=us-east-1
```

Make sure you have access to AWS Bedrock and have enabled the following models in your AWS account:
- `amazon.titan-embed-text-v2:0` (Titan Embed v2)
- `anthropic.claude-sonnet-4-5-20250929-v1:0` (Claude 4.5 Sonnet)

### 4. Install Dependencies

Dependencies will be automatically installed when you run the application with `uv`.

## Running the Application

You need to start three services for the application to work:

### 1. Start Qdrant Vector Database

```bash
docker run -d \
  --name qdrantRagDb \
  -p 6333:6333 \
  -v "./qdrant_storage:/qdrant/storage" \
  qdrant/qdrant
```

### 2. Start the FastAPI Backend

```bash
uv run uvicorn main:app
```

The API will be available at `http://127.0.0.1:8000`

### 3. Start the Inngest Dev Server

```bash
npx inngest-cli@latest dev -u http://127.0.0.1:8000/api/inngest --no-discovery
```

The Inngest dashboard will be available at `http://127.0.0.1:8288`

### 4. Start the Streamlit UI

```bash
uv run streamlit run streamlit_app.py
```

The UI will be available at `http://localhost:8501`

### 5. Start the Chat Frontend

```bash
cd chat_frontend
npm install
npm run dev
```

The chat UI will be available at `http://localhost:5173` and proxies API calls to `http://127.0.0.1:8000` by default. Set `VITE_API_BASE_URL` in a `.env` file if your backend is hosted elsewhere.

## Usage

### Using the Chat Frontend

1. Navigate to `http://localhost:5173` after starting the chat frontend.
2. Ask questions in the composer at the bottom of the page. The assistant replies with answers and embedded references.
3. Click **Settings** to adjust the number of context chunks retrieved per question (top-k) or to paste a Dozuki API token so citations include guide titles and URLs.
4. Use **New Conversation** to clear the transcript while keeping your settings.

#### Chat Frontend Environment Variables

Create a `.env` file inside `chat_frontend` (or set variables in your deployment platform) to adjust runtime behaviour:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000   # Override the backend URL (defaults to same origin)
VITE_DEFAULT_TOP_K=5                      # Default number of context chunks retrieved
VITE_DEFAULT_DOZUKI_TOKEN=api XXXXX       # Optional token for richer citation metadata
VITE_DOZUKI_BASE_URL=https://hansaw.dozuki.com  # Base URL to build fallback guide links
```

### Using the Streamlit UI

1. Navigate to `http://localhost:8501`
2. Login with your Dozuki credentials for hansaw.dozuki.com via the sidebar

#### Single Guide Ingestion
1. Go to the "📄 Single Guide" tab
2. Enter a guide ID to ingest (you can find guide IDs in the URL of guides on the Dozuki site)
3. Click "Ingest Guide" and wait for completion
4. The guide will be added to your ingested guides list

#### Site-Wide Ingestion
1. Go to the "🌐 Entire Site" tab
2. Adjust the batch size if needed (default: 10 guides per batch)
3. Click "🚀 Start Site Ingestion" to begin (or "▶️ Resume" if previously paused)
4. Monitor real-time progress with:
   - Total guides count
   - Processed/failed guides
   - Total chunks created
   - Current guide being processed
   - Progress bar showing completion percentage
5. Use "⏸️ Pause Ingestion" to stop at any time
   - Progress is saved automatically
   - Resume exactly where you left off
6. Failed guides will be listed with error details
7. The system processes guides efficiently:
   - Fetches all guide IDs first
   - Processes each guide individually
   - Handles errors gracefully without stopping

#### Querying Your Guides
1. Go to the "❓ Ask Questions" tab
2. Enter your question in the text input
3. Adjust the number of chunks to retrieve (default: 5)
4. Click "Ask" to get an AI-generated answer based on your guides

### Using the API Directly

#### Authenticate with Dozuki

```python
import requests

url = "https://hansaw.dozuki.com/api/2.0/user/token"
headers = {
    "X-App-Id": "9c9e0e7ae61d3a70bfe4debb87ad145a",
    "Content-Type": "application/json"
}
data = {
    "email": "your_email@example.com",
    "password": "your_password"
}

response = requests.post(url, headers=headers, json=data)
token = response.json()["authToken"]
```

#### Ingest a Guide

Send an event to Inngest to trigger guide ingestion:

```python
import inngest

client = inngest.Inngest(app_id="rag_app", is_production=False)

await client.send(
    inngest.Event(
        name="rag/ingest_guide",
        data={
            "guide_id": 222,
            "token": "your_auth_token",
            "source_id": "guide_222"
        }
    )
)
```

#### Ingest Entire Site

Send an event to trigger site-wide ingestion:

```python
await client.send(
    inngest.Event(
        name="rag/ingest_site",
        data={
            "token": "your_auth_token",
            "site_id": "hansaw",
            "batch_size": 10  # Guides per batch
        }
    )
)
```

To pause an ongoing site ingestion:

```python
await client.send(
    inngest.Event(
        name="rag/pause_site_ingestion",
        data={"site_id": "hansaw"}
    )
)
```

#### Query Guides

Send a query event:

```python
await client.send(
    inngest.Event(
        name="rag/query_guide_ai",
        data={
            "question": "How do I adjust the tool release piston?",
            "top_k": 5
        }
    )
)
```

#### Chat Endpoint (REST)

Call the FastAPI chat endpoint directly for synchronous responses (used by the React frontend):

```http
POST /api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "How do I adjust the tool release piston?" }
  ],
  "top_k": 5,
  "token": "api your-dozuki-token"  // optional
}
```

Response:

```json
{
  "answer": "Start by disconnecting power ...",
  "sources": ["hansaw_guide_222"],
  "num_contexts": 5,
  "source_guides": [
    {
      "guide_id": 222,
      "title": "Adjust the Tool Release Piston",
      "url": "https://hansaw.dozuki.com/Guide/Adjust-the-Tool-Release-Piston/222"
    }
  ]
}
```

If you omit the `token`, the response still includes raw source identifiers but not enriched guide metadata.

## Project Structure

```
RAGPythonApp/
├── main.py              # FastAPI application with Inngest functions
├── streamlit_app.py     # Streamlit user interface
├── data_loader.py       # Dozuki API integration and guide processing
├── vector_db.py         # Qdrant vector database client
├── custom_types.py      # Pydantic models for type safety
├── pyproject.toml       # Project dependencies and metadata
├── chat_frontend/       # React chat application (Vite + TypeScript)
└── qdrant_storage/      # Qdrant data directory (Docker volume)
```

## Key Components

### Inngest Functions

- **RAG: Ingest Guide**: Processes Dozuki guides with throttling (2 requests/minute) and rate limiting (1 request per guide every 4 hours)
- **RAG: Query Guide**: Retrieves relevant context and generates AI-powered answers using Claude 4.5 Sonnet on AWS Bedrock

### Rate Limiting

- Throttling: Maximum 2 guide ingestions per minute
- Rate Limit: Same guide can only be ingested once every 4 hours
- Prevents abuse and manages API costs

### Vector Storage

- Uses Qdrant for efficient similarity search
- Stores guide chunks with metadata (source, text)
- Generates deterministic UUIDs based on source and chunk index

### Dozuki Integration

- Authenticates with Dozuki API using email/password
- Fetches guide content including:
  - Title, summary, and metadata
  - Step-by-step instructions
  - Required parts and tools
  - Introduction and conclusion
- Extracts and chunks text content for RAG processing

## Development

### Running Tests

```bash
uv run pytest
```

### Code Formatting

```bash
uv run black .
```

### Type Checking

```bash
uv run mypy .
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AWS_ACCESS_KEY_ID` | AWS access key for Bedrock API | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for Bedrock API | Yes |
| `AWS_DEFAULT_REGION` | AWS region (default: `us-east-1`) | No |
| `INNGEST_API_BASE` | Base URL for Inngest API (default: `http://127.0.0.1:8288/v1`) | No |

## Troubleshooting

### Qdrant Connection Issues

If you can't connect to Qdrant, ensure the Docker container is running:

```bash
docker ps | grep qdrantRagDb
```

### Inngest Events Not Processing

Check the Inngest dashboard at `http://127.0.0.1:8288` to see function execution logs and errors.

### AWS Bedrock API Errors

Verify your AWS credentials are correctly configured and you have:
- Enabled access to AWS Bedrock in your AWS account
- Requested access to Claude 4.5 Sonnet and Titan Embed v2 models
- Sufficient permissions in your IAM role/user

### Dozuki Authentication Errors

- Ensure you have valid credentials for hansaw.dozuki.com
- Check that you're using the correct email and password
- Verify the guide ID exists and is accessible with your account

### Guide Not Found

If you receive a "Failed to fetch guide" error:
- Verify the guide ID is correct
- Ensure your account has access to the guide
- Check that the guide exists on hansaw.dozuki.com

## License

MIT
