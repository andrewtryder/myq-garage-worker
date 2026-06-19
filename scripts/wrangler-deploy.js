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
export function injectDeployVars(wranglerPath, { kvNamespaceId, garageDoors } = {}) {
  if (!fs.existsSync(wranglerPath)) {
    throw new Error(`wrangler config not found: ${wranglerPath}`);
  }

  let content = fs.readFileSync(wranglerPath, 'utf8');

  if (kvNamespaceId) {
    content = content.replace(
      /"id"\s*:\s*"(?:<YOUR_KV_NAMESPACE_ID>|[a-f0-9]+)"/,
      `"id": "${kvNamespaceId}"`,
    );
  }

  if (garageDoors !== undefined && garageDoors !== null && garageDoors !== '') {
    const jsonStr = typeof garageDoors === 'string' ? garageDoors : JSON.stringify(garageDoors);
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('GARAGE_DOORS must be a JSON object mapping door names to KV keys');
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

export function deployWorker(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const wranglerPath = path.join(cwd, 'wrangler.jsonc');

  loadDotEnv(cwd);

  injectDeployVars(wranglerPath, {
    kvNamespaceId: options.kvNamespaceId ?? process.env.KV_NAMESPACE_ID,
    garageDoors: options.garageDoors ?? process.env.GARAGE_DOORS,
  });

  const version = options.version ?? readPackageVersion(cwd);
  const message = options.message ?? `Deploy v${version}`;
  const args = [
    'deploy',
    '--minify',
    '--tag',
    `v${version}`,
    '--message',
    message,
    ...(options.extraArgs ?? []),
  ];

  if (options.dryRun) {
    args.push('--dry-run');
  }

  try {
    runWranglerDeploy(args, { env: process.env, inherit: options.inherit ?? true });
  } finally {
    if (options.cleanupGarageDoors !== false) {
      removeInjectedGarageDoors(wranglerPath);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  const injectOnly = process.argv.includes('--inject-only');
  loadDotEnv();

  if (injectOnly) {
    injectDeployVars(path.join(process.cwd(), 'wrangler.jsonc'), {
      kvNamespaceId: process.env.KV_NAMESPACE_ID,
      garageDoors: process.env.GARAGE_DOORS,
    });
  } else {
    deployWorker({ dryRun });
  }
}
