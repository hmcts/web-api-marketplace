import { lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

export function cleanupPlaywrightModules(baseDirectory = path.join(currentDirectory, '..')) {
  const commonRoot = path.join(baseDirectory, 'node_modules', '@hmcts', 'playwright-common');
  if (!safeLstat(commonRoot)) return;

  const nestedModules = path.join(commonRoot, 'node_modules');
  if (!safeLstat(nestedModules)) mkdirSync(nestedModules, { recursive: true });

  const topLevelModules = path.join(baseDirectory, 'node_modules');
  for (const name of ['@playwright', 'playwright', 'playwright-core']) {
    linkTarget(path.join(nestedModules, name), path.join(topLevelModules, name));
  }
}

function linkTarget(nestedTarget, topLevelTarget) {
  if (!safeLstat(topLevelTarget) || safeRealpath(nestedTarget) === safeRealpath(topLevelTarget)) return;

  const nestedStats = safeLstat(nestedTarget);
  if (nestedStats?.isSymbolicLink()) unlinkSync(nestedTarget);
  else if (nestedStats) rmSync(nestedTarget, { recursive: true, force: true });

  symlinkSync(topLevelTarget, nestedTarget, 'junction');
}

function safeLstat(target) {
  try {
    return lstatSync(target);
  } catch {
    return undefined;
  }
}

function safeRealpath(target) {
  try {
    return realpathSync(target);
  } catch {
    return undefined;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  cleanupPlaywrightModules();
}
