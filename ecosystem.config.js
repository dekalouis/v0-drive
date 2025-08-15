module.exports = {
  apps: [
    {
      name: 'drive-image-workers',
      script: 'npm',
      args: 'run workers',
      cwd: './',
      instances: 2, // Increased from 1 to 2 for better scaling
      exec_mode: 'cluster', // Use cluster mode for multiple instances
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
      // Performance optimization settings
      max_restarts: 10,
      min_uptime: '10s',
      // Load balancing
      instance_var: 'INSTANCE_ID',
    },
  ],
} 