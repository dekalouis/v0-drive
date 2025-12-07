# Environment Variables

## Required Variables

### Database
- `DATABASE_URL` - PostgreSQL connection string with pgvector extension
  - Example: `postgresql://username:password@localhost:5432/drive_searcher`

### Redis
- `REDIS_URL` - Redis connection string for BullMQ queues
  - Example: `redis://localhost:6379`

### Authentication (Clerk)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk publishable key (public, starts with `pk_`)
- `CLERK_SECRET_KEY` - Clerk secret key (private, starts with `sk_`)
  - Get these from: https://dashboard.clerk.com

### API Keys
- `GOOGLE_DRIVE_API_KEY` - Google Drive API key for accessing public folders
- `GEMINI_API_KEY` - Google Gemini API key for image captioning and embeddings

## Optional Variables

### Image Limits
- `MAX_IMAGES_PER_FOLDER` - Maximum number of images allowed per folder
  - **Default**: No limit (null/undefined)
  - **Example**: `200` (recommended for performance)
  - **Note**: Set to `0` or leave unset to disable the limit

## Example .env File

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/drive_searcher

# Redis
REDIS_URL=redis://localhost:6379

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
CLERK_SECRET_KEY=sk_test_your_secret_key_here

# API Keys
GOOGLE_DRIVE_API_KEY=your_google_drive_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Image Limits
MAX_IMAGES_PER_FOLDER=200
```

## Railway Deployment

When deploying to Railway, add these environment variables in your Railway project settings:

1. Go to your Railway project dashboard
2. Click on your service
3. Go to the "Variables" tab
4. Add each environment variable with its corresponding value

### Recommended Railway Settings

For production deployment, we recommend:
- `MAX_IMAGES_PER_FOLDER=200` - Prevents performance issues with very large folders
- Use Railway's PostgreSQL and Redis services for database and queue management 