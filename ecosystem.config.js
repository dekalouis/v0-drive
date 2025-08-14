module.exports = {
  apps: [
    {
      name: 'drive-image-workers',
      script: 'npm',
      args: 'run workers',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: './logs/workers-error.log',
      out_file: './logs/workers-out.log',
      log_file: './logs/workers-combined.log',
      time: true,
    },
  ],
} 