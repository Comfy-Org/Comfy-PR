module.exports = {
  apps: [
    {
      name: "comfy-pr-bot",
      script: "./bot-start.sh",
      interpreter: "bash",
      instances: 1,
      autorestart: true,
      watch: ["bot/**/*.ts"], // Watch bot files for changes
      ignore_watch: ["bot/.logs", "node_modules", ".cache", "logs"],
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
      error_file: "./logs/bot-error.log",
      out_file: "./logs/bot-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      // Crash recovery settings
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 4000,
      // Exponential backoff restart delay
      exp_backoff_restart_delay: 100,
    },
  ],
};
