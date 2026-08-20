const { execFileSync } = require('node:child_process');
const path = require('node:path');

execFileSync(path.resolve(__dirname, '../bin/generate-ssl-options.sh'), {
  stdio: 'inherit',
});

require('../src/main/server.ts');
