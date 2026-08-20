const chokidar = require('chokidar');
const path = require('node:path');
const { spawn } = require('node:child_process');

const watchedPaths = ['src/main', 'config'];
const ignoredPaths = ['src/**/*.spec.ts'];
const watchedExtensions = new Set(['.ts', '.js', '.json', '.njk']);

let childProcess = null;
let restartTimer = null;
let stopping = false;

function startChild() {
  childProcess = spawn(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', path.resolve(__dirname, 'start-dev.js')],
    {
      stdio: 'inherit',
      env: process.env,
    }
  );

  childProcess.on('exit', code => {
    childProcess = null;

    if (!stopping) {
      console.log(`[watcher] child exited with code ${code ?? 'null'}, waiting for changes`);
    }
  });
}

function restartChild(reason) {
  console.log(`[watcher] restarting due to ${reason}`);

  if (!childProcess) {
    startChild();
    return;
  }

  const processToStop = childProcess;
  childProcess = null;

  processToStop.once('exit', () => {
    if (!stopping) {
      startChild();
    }
  });

  processToStop.kill('SIGTERM');
}

function scheduleRestart(reason) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => restartChild(reason), 100);
}

function shutdown(signal) {
  stopping = true;
  clearTimeout(restartTimer);

  if (!childProcess) {
    process.exit(0);
    return;
  }

  childProcess.once('exit', () => process.exit(0));
  childProcess.kill(signal);
}

const watcher = chokidar.watch(watchedPaths, {
  ignored: ignoredPaths,
  ignoreInitial: true,
  usePolling: true,
  interval: 150,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 50,
  },
});

watcher.on('ready', () => {
  console.log('[watcher] watching src/main and config for ts/js/json/njk changes');
  startChild();
});

watcher.on('all', (eventName, filePath) => {
  if (!watchedExtensions.has(path.extname(filePath))) {
    return;
  }

  scheduleRestart(`${eventName} ${filePath}`);
});

watcher.on('error', error => {
  console.error('[watcher] failed:', error);
  shutdown('SIGTERM');
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
