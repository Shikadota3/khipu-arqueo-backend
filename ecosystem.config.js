module.exports = {
  apps: [{
    name: 'khipu-backend',
    script: 'dist/server.js',
    instances: 4,
    exec_mode: 'cluster',
  }]
}