/* global process */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { loadDotEnv } from './setup-config.js';

const GARAGE_DOORS_VAR_PATTERN = /\n\s*"GARAGE_DOORS"\s*:\s*(?:"(?:\\.|[^"\\])*"|\{[^}]*\}),?/g;

/**
 * Patch wrangler.jsonc for deploy without shell-quoting issues.
 * GARAGE_DOORS is written as a JSON string in vars so the worker receives valid JSON.
 */
export function injectDeployVars(wranglerPath, { d1DatabaseId, garageDoors } = {}) {
  if (!fs.existsSync(wranglerPath)) {
    throw new Error(`wrangler config not found: ${wranglerPath}`);
  }

  let content = fs.readFileSync(wranglerPath, 'utf8');

  if (d1DatabaseId) {
    content = content.replace(
      /"database_id"\s*:\s*"(?:<YOUR_D1_DATABASE_ID>|[a-f0-9-]+)"/,
      `"database_id": "${d1DatabaseId}"`,
    );
  }

  if (garageDoors !== undefined && garageDoors !== null && garageDoors !== '') {
    const jsonStr = typeof garageDoors === 'string' ? garageDoors : JSON.stringify(garageDoors);
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('GARAGE_DOORS must be a JSON object mapping door names to door ids');
    }

    const jsoncValue = JSON.stringify(jsonStr);
    content = content.replace(GARAGE_DOORS_VAR_PATTERN, '');
    content = content.replace(
      /("VERSION"\s*:\s*"[^"]*"\s*,?)/,
      `$1\n    "GARAGE_DOORS": ${jsoncValue},`,
    );
  }

  fs.writeFileSync(wranglerPath, content);
}

export function removeInjectedGarageDoors(wranglerPath) {
  if (!fs.existsSync(wranglerPath)) return;

  let content = fs.readFileSync(wranglerPath, 'utf8');
  content = content.replace(GARAGE_DOORS_VAR_PATTERN, '');
  fs.writeFileSync(wranglerPath, content);
}

/**
 * Copy wrangler.jsonc to a temp file in the project root, inject deploy vars, and
 * return that path. Keeping the file in cwd preserves relative `main` / schema paths.
 * Avoids mutating the tracked config in CI or local deploys.
 */
export function writeDeployConfig(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const sourcePath = options.sourcePath ?? path.join(cwd, 'wrangler.jsonc');
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`wrangler config not found: ${sourcePath}`);
  }

  const sourceDir = path.dirname(sourcePath);
  const tmpPath = path.join(sourceDir, `.wrangler.deploy.${process.pid}.${Date.now()}.jsonc`);
  fs.copyFileSync(sourcePath, tmpPath);

  injectDeployVars(tmpPath, {
    d1DatabaseId: options.d1DatabaseId ?? process.env.D1_DATABASE_ID,
    garageDoors: options.garageDoors ?? process.env.GARAGE_DOORS,
  });

  return tmpPath;
}

export function runWranglerDeploy(args, { env = process.env, inherit = true } = {}) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
    env,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || 'wrangler deploy failed');
  }

  return result;
}

function readPackageVersion(cwd = process.cwd()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  return pkg.version;
}

function appendGithubOutput(key, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

export function deployWorker(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const configPath = writeDeployConfig({
    cwd,
    d1DatabaseId: options.d1DatabaseId ?? process.env.D1_DATABASE_ID,
    garageDoors: options.garageDoors ?? process.env.GARAGE_DOORS,
  });

  const version = options.version ?? readPackageVersion(cwd);
  const message = options.message ?? `Deploy v${version}`;
  const args = [
    'deploy',
    '--minify',
    '--config',
    configPath,
    '--tag',
    `v${version}`,
    '--message',
    message,
    ...(options.extraArgs ?? []),
  ];

  if (options.dryRun) {
    args.push('--dry-run');
  }

  runWranglerDeploy(args, { env: process.env, inherit: options.inherit ?? true });
  return configPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  const writeConfig = process.argv.includes('--write-config');
  const injectOnly = process.argv.includes('--inject-only');
  loadDotEnv();

  if (writeConfig || injectOnly) {
    const configPath = writeDeployConfig();
    console.log(configPath);
    appendGithubOutput('wrangler_config', configPath);
  } else {
    deployWorker({ dryRun });
  }
}
