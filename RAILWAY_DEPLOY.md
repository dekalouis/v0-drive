# Railway Deployment Guide

## Pre-Deploy Command

For the **main project** (not workers or Prisma DB service), use one of these options:

### Option 1: Use the migration script (Recommended)
```bash
npm run deploy:migrate
```
or directly:
```bash
./scripts/deploy-migrate.sh
```

This script:
- Checks if DATABASE_URL is available
- Runs `prisma migrate deploy` to apply pending migrations
- Exits gracefully if DATABASE_URL is missing (won't block deployment)
- Uses bash (no dependencies needed)

### Option 2: Direct Prisma command
```bash
npx prisma migrate deploy
```

**Note:** If you get connection errors, the script will exit gracefully and won't block deployment.

**Important:** Use `prisma migrate deploy` (not `prisma db push`) for production deployments. The `db push` command is for development only.

## Railway Service Configuration

### Main Project Service
- **Pre-deploy command:** `npm run deploy:migrate` or `npx prisma migrate deploy`
- **Start command:** `npm run build && npm run start`
- **Environment variables needed:**
  - `DATABASE_URL` (from Railway PostgreSQL service)
  - `REDIS_URL` (from Railway Redis service)
  - `GOOGLE_DRIVE_API_KEY`
  - `GEMINI_API_KEY`
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (optional, for auth)
  - `CLERK_SECRET_KEY` (optional, for auth)

### Workers Service
- **Pre-deploy command:** (none needed)
- **Start command:** `npm run workers`
- **Environment variables needed:**
  - `DATABASE_URL`
  - `REDIS_URL`
  - `GOOGLE_DRIVE_API_KEY`
  - `GEMINI_API_KEY`
  - (No Clerk keys needed)

### Prisma DB Service
- **Pre-deploy command:** (none needed - this is just the database)
- **Start command:** (none - it's a managed database)
- **Environment variables:** (managed by Railway)

## Troubleshooting

### Pre-deploy command fails with "DATABASE_URL not set"
- Make sure the PostgreSQL service is provisioned and linked to your main project
- Check that `DATABASE_URL` is available in the service's environment variables
- The migration script will skip gracefully if DATABASE_URL is missing

### Pre-deploy command fails with connection errors
- Ensure the PostgreSQL service is running and accessible
- Check that the database credentials in `DATABASE_URL` are correct
- Verify network connectivity between services

### Migrations fail
- Check that all migration files are committed to git
- Ensure the database has the `vector` extension enabled (should be in migration)
- Run `npx prisma migrate status` to see pending migrations
- **If you see pgvector errors**: See [RAILWAY_PGVECTOR_SETUP.md](./RAILWAY_PGVECTOR_SETUP.md) for detailed setup instructions

## Notes

- The `postinstall` script automatically runs `prisma generate` after `npm install`
- Migrations are applied during pre-deploy, before the app starts
- If migrations fail, the deployment will continue (the script exits with code 0)
- You can manually run migrations later if needed: `railway run npx prisma migrate deploy`
