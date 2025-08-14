# Google Drive Image Searcher

🎯 Recommended Daily Workflow
Start workers once (they'll keep running):
```npm run start:workers-only```
Start dev server (in another terminal):
```npm run dev```
Add folders via the web interface
```npm run workers:status```
Delete folders safely:
```npm run folder:delete <folderId>```

run locally with
```
# Start everything (dev server + workers)
npm run start:all
```

For Production
```
# Install PM2 globally
npm install -g pm2

# Start workers with PM2
npm run workers:start

# Check status
npm run workers:status

# View logs
npm run workers:logs

# Stop workers
npm run workers:stop
```

A powerful Next.js application that allows you to search through images in public Google Drive folders using AI-powered semantic search.

## Features

- 🔗 **Public Google Drive Integration**: Paste any public Google Drive folder URL
- 🖼️ **Instant Image Display**: View thumbnails immediately while processing happens in background
- 🤖 **AI-Powered Captioning**: Uses Gemini 2.5 Flash to generate detailed captions and tags
- 🔍 **Semantic Search**: Find images using natural language queries with vector similarity
- ⚡ **Real-time Progress**: Live updates on processing status with Server-Sent Events
- 🎯 **Background Processing**: Efficient job queues with BullMQ and Redis

## Quick Start

1. **Clone and install dependencies**:
   \`\`\`bash
   npm install
   \`\`\`

2. **Set up your environment**:
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your API keys and database URLs
   \`\`\`

3. **Set up the database and generate Prisma client**:
   \`\`\`bash
   npm run setup-dev
   \`\`\`

4. **Start the development server**:
   \`\`\`bash
   npm run dev
   \`\`\`

5. **Start the background workers** (in a separate terminal):
   \`\`\`bash
   npm run workers
   \`\`\`

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string with pgvector support
- `REDIS_URL`: Redis connection string for job queues
- `GOOGLE_DRIVE_API_KEY`: Google Drive API key for accessing public folders
- `GEMINI_API_KEY`: Google AI API key for image captioning

## Usage

1. Visit `http://localhost:3000`
2. Paste a public Google Drive folder URL
3. Watch as images are displayed immediately and processed in the background
4. Use the search box to find images using natural language queries
5. View detailed captions and similarity scores

## Architecture

- **Frontend**: Next.js 15 with React Server Components
- **Database**: PostgreSQL with pgvector for vector similarity search
- **Background Jobs**: BullMQ with Redis for reliable job processing
- **AI**: Google Gemini 2.5 Flash for image analysis and text embeddings
- **Real-time Updates**: Server-Sent Events for live progress tracking

## Scripts

- `npm run dev` - Start development server
- `npm run workers` - Start background job workers
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema to database
- `npm run health-check` - Check system health
- `npm run clean-queues` - Clean job queues
# v0-drive
