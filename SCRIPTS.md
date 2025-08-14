# Essential Scripts

## 🚀 **Starting the Application**

### Start everything (workers + dev server):
```bash
npm run start:all
```

### Start only workers (persistent background):
```bash
npm run start:workers-only
```

### Start workers manually:
```bash
npm run workers:start
```

## 🗑️ **Safe Data Deletion**

### Delete a specific folder:
```bash
npm run folder:delete <folderId>
# or
npx tsx scripts/safe-delete.ts <folderId>
```

### Clear all queue data (when you manually delete from DB):
```bash
npm run queue:clear
# or
npx tsx scripts/clear-all-queues.ts
```

## 📊 **Monitoring & Debugging**

### Check folder status:
```bash
npm run folder:status <folderId>
# or
npx tsx scripts/check-folder-status.ts <folderId>
```

### Retry failed folder processing:
```bash
npm run folder:retry <folderId>
# or
npx tsx scripts/retry-folder.ts <folderId>
```

## 🔧 **Configuration**

### Environment Variables
- `MAX_IMAGES_PER_FOLDER` - Set maximum images per folder (default: no limit)
  - Example: `MAX_IMAGES_PER_FOLDER=200`
  - Set to `0` or leave unset to disable the limit

### Example .env file:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/drive_searcher
REDIS_URL=redis://localhost:6379
GOOGLE_DRIVE_API_KEY=your_api_key_here
GEMINI_API_KEY=your_gemini_key_here
MAX_IMAGES_PER_FOLDER=200
```

## 📝 **Best Practices for Data Deletion**

1. **Always use the safe delete script** when removing folders from the database
2. **Clear queue data** after manual database deletions to prevent conflicts
3. **Check folder status** before retrying to understand the current state
4. **Monitor worker logs** to ensure background processing is working

## 🚀 **Railway Deployment**

### Environment Variables for Railway:
- Add all required environment variables in Railway project settings
- Set `MAX_IMAGES_PER_FOLDER=200` for production (recommended)
- Use Railway's PostgreSQL and Redis services

### Deployment Commands:
```bash
# Pre-deploy Command
npm run db:push

# Start Command
npm run start:all
``` 