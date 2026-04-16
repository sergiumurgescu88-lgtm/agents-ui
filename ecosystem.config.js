module.exports = {
  apps: [{
    name: 'buddy',
    script: '/opt/agents-ui/server.js',
    cwd: '/opt/agents-ui',
    env_file: '/opt/agents-ui/.env'
  }]
};
