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

## 🔧 **Worker Management**

### Start workers:
```bash
npm run workers:start
```

### Stop workers:
```bash
npm run workers:stop
```

### Restart workers:
```bash
npm run workers:restart
```

### View worker logs:
```bash
npm run workers:logs
```

### Check worker status:
```bash
npm run workers:status
```

## 📝 **Best Practices for Data Deletion**

1. **Always use the safe delete script** instead of manual DB deletion
2. **If you manually delete from DB**, run `npm run queue:clear` immediately
3. **Check folder status** before and after operations
4. **Restart workers** if you encounter processing issues

## 🔧 **Troubleshooting**

- **Workers not processing**: Run `npm run queue:clear` then restart workers
- **Folder stuck in pending**: Run `npm run folder:retry <folderId>`
- **Database/Queue mismatch**: Run `npm run queue:clear` and restart workers
- **Workers not running automatically**: Use `npm run start:workers-only` for persistent background workers

## 🎯 **Recommended Workflow**

1. **Start workers once**: `npm run start:workers-only` (they'll keep running)
2. **Start dev server**: `npm run dev` (in another terminal)
3. **Add folders**: Use the web interface
4. **Monitor**: Use `npm run workers:status` to check worker health
5. **Delete data**: Use `npm run folder:delete <folderId>` for safe deletion 