# Performance Optimization Guide

## 🚀 Current Performance Issues & Solutions

### Before Optimization (5-6 minutes for 49 images)
- **Sequential Processing**: Images processed one by one
- **Conservative Rate Limiting**: 30 req/min (double the API limit)
- **Low Worker Concurrency**: Only 2 concurrent workers
- **No Batch Processing**: Each image processed individually

### After Optimization (Target: 2-3 minutes for 49 images)
- **Parallel Processing**: Up to 8 concurrent image workers
- **Correct Rate Limiting**: 15 req/min (matches Gemini API limit)
- **Burst Processing**: 5 req/sec burst capability
- **Priority Queuing**: Staggered job processing for optimal throughput
- **Enhanced Monitoring**: Real-time performance tracking

## 📊 Performance Improvements

### Worker Concurrency
- **Folder Workers**: 2 → 5 (2.5x improvement)
- **Image Workers**: 2 → 8 (4x improvement)
- **Total Throughput**: 8x improvement potential

### Rate Limiting
- **API Compliance**: Now correctly uses 15 req/min (Gemini 2.0 Flash-Lite limit)
- **Burst Processing**: Allows 5 requests per second for short bursts
- **Smart Staggering**: Jobs are queued with delays to optimize rate limit usage

### Queue Management
- **Priority System**: Higher priority jobs processed first
- **Staggered Delays**: Prevents rate limit collisions
- **Better Memory Management**: Reduced job retention for better performance

## 🛠️ How to Use the Optimizations

### 1. Start Optimized Workers
```bash
# Start the optimized workers
npm run workers

# Or use PM2 for production
npm run workers:start
```

### 2. Monitor Performance
```bash
# Check real-time performance
npm run performance

# Monitor worker status
npm run workers:status

# View worker logs
npm run workers:logs
```

### 3. Environment Configuration
Create a `.env` file with optimized settings:
```env
# Performance Optimization Settings
MAX_IMAGES_PER_FOLDER=200
WORKER_CONCURRENCY_FOLDER=5
WORKER_CONCURRENCY_IMAGE=8
GEMINI_RATE_LIMIT=15
GEMINI_BURST_SIZE=5
GEMINI_BURST_WINDOW=1000
```

## 📈 Expected Performance Results

### For 49 Images (Your Current Case)
- **Before**: 5-6 minutes
- **After**: 2-3 minutes
- **Improvement**: 50-60% faster

### For Larger Folders (100-200 images)
- **Before**: 10-20 minutes
- **After**: 4-8 minutes
- **Improvement**: 50-60% faster

### Scaling Factors
- **Small folders (1-50 images)**: 2-3x faster
- **Medium folders (51-200 images)**: 2-2.5x faster
- **Large folders (200+ images)**: 1.5-2x faster

## 🔧 Advanced Optimization Options

### 1. Increase Worker Concurrency
```typescript
// In lib/workers.ts
concurrency: 12, // Increase from 8 to 12 for even more parallelism
```

### 2. Adjust Rate Limiting
```typescript
// In lib/gemini.ts
export const enhancedRateLimiter = new BurstRateLimiter(
  15,    // requests per minute
  60000, // window in milliseconds
  8,     // burst size (increase from 5)
  500    // burst window (decrease from 1000)
)
```

### 3. Batch Processing
For very large folders, consider implementing batch processing:
```typescript
// Process images in batches of 10
const batchSize = 10
for (let i = 0; i < images.length; i += batchSize) {
  const batch = images.slice(i, i + batchSize)
  await Promise.all(batch.map(processImage))
}
```

## 📊 Monitoring & Troubleshooting

### Performance Metrics to Watch
1. **Jobs per minute**: Should be close to 15 (rate limit)
2. **Worker concurrency**: Should show 8 active image workers
3. **Queue backlog**: Should stay under 50 for optimal performance
4. **Success rate**: Should be above 95%

### Common Issues & Solutions

#### High Queue Backlog
```bash
# Check queue status
npm run performance

# If backlog > 50, increase concurrency
# Edit lib/workers.ts and increase concurrency values
```

#### Rate Limit Errors
```bash
# Check rate limiter stats
npm run performance

# If hitting rate limits frequently, adjust burst settings
# Edit lib/gemini.ts burst parameters
```

#### Worker Failures
```bash
# Check worker logs
npm run workers:logs

# Restart workers if needed
npm run workers:restart
```

## 🎯 Best Practices

### 1. Folder Size Management
- **Recommended**: Keep folders under 200 images
- **Optimal**: 50-100 images per folder
- **Maximum**: 500 images (with performance degradation)

### 2. Worker Management
- **Development**: Use `npm run workers`
- **Production**: Use PM2 with `npm run workers:start`
- **Monitoring**: Regular performance checks with `npm run performance`

### 3. Rate Limit Optimization
- **Burst Processing**: Use for small folders (1-20 images)
- **Steady Processing**: Use for large folders (100+ images)
- **Monitoring**: Watch for rate limit warnings

## 🚀 Future Optimization Ideas

### 1. Multi-Model Processing
- Use multiple Gemini models in parallel
- Distribute load across different API endpoints

### 2. Intelligent Batching
- Group similar images for batch processing
- Implement priority-based processing

### 3. Caching & Optimization
- Cache common image patterns
- Implement progressive image loading

### 4. Load Balancing
- Multiple worker instances
- Geographic distribution of workers

## 📝 Performance Testing

### Test Scenarios
1. **Small folder (10 images)**: Should complete in 1-2 minutes
2. **Medium folder (50 images)**: Should complete in 2-3 minutes
3. **Large folder (100 images)**: Should complete in 4-6 minutes

### Benchmark Commands
```bash
# Test performance
npm run performance

# Monitor real-time
npm run workers:logs

# Check database stats
npm run folder:status
```

## 🔍 Troubleshooting Commands

```bash
# Clear all queues (emergency reset)
npm run queue:clear

# Check system health
npm run health-check

# Restart all workers
npm run workers:restart

# View performance metrics
npm run performance
```

---

**Note**: These optimizations are designed to work within Gemini API limits while maximizing throughput. Always monitor your API usage to ensure you stay within your tier limits.