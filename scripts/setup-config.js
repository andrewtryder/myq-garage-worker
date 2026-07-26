/* global process */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export function loadDotEnv(cwd = process.cwd()) {
  const envPath = path.join(cwd, '.env');
  if (!fs.existsSync(envPath)) return;

  // Prefer Node's built-in .env support when available (Node 20.12+ / 22+).
  try {
    process.loadEnvFile(envPath);
    return;
  } catch {
    // Fall through to a small compatible parser.
  }

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function runCommandSilent(command, args = []) {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status !== 0) return null;
    return result.stdout;
  } catch {
    return null;
  }
}

export function parseWranglerConfig(wranglerPath) {
  if (!fs.existsSync(wranglerPath)) {
    return { workerName: null, kvId: null };
  }

  const content = fs.readFileSync(wranglerPath, 'utf8');
  const workerMatch = content.match(/"name"\s*:\s*"([^"]+)"/);
  const kvMatch = content.match(/"binding"\s*:\s*"GARAGE_STATE"[\s\S]*?"id"\s*:\s*"([^"]+)"/);
  const kvId = kvMatch?.[1] && kvMatch[1] !== '<YOUR_KV_NAMESPACE_ID>' ? kvMatch[1] : null;

  return {
    workerName: workerMatch?.[1] ?? null,
    kvId,
  };
}

export function parseGarageDoorsFromBindings(bindings) {
  const garageDoorsBinding = bindings.find(
    (binding) => binding.name === 'GARAGE_DOORS' && binding.type === 'plain_text',
  );

  if (!garageDoorsBinding?.text) {
    return null;
  }

  try {
    const parsed = JSON.parse(garageDoorsBinding.text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

async function verifyCloudflareToken(token) {
  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return false;
    const result = await response.json();
    return Boolean(result.success && result.result?.status === 'active');
  } catch {
    return false;
  }
}

export async function detectAuth() {
  const whoami = runCommandSilent('npx', ['wrangler', 'whoami']);
  if (whoami) {
    return { method: process.env.CLOUDFLARE_API_TOKEN ? 'token' : 'oauth' };
  }

  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    return { method: 'none' };
  }

  if (await verifyCloudflareToken(token)) {
    return { method: 'token' };
  }

  return { method: 'none' };
}

export function fetchRemoteConfig(_workerName) {
  const config = {
    isDeployed: false,
    garageDoors: null,
    hasApiKey: false,
    kvValid: false,
  };

  const deploymentsRaw = runCommandSilent('npx', ['wrangler', 'deployments', 'list', '--json']);
  if (deploymentsRaw) {
    try {
      const deployments = JSON.parse(deploymentsRaw);
      if (Array.isArray(deployments) && deployments.length > 0) {
        config.isDeployed = true;

        const versionId = deployments[0]?.versions?.[0]?.version_id;
        if (versionId) {
          const versionRaw = runCommandSilent('npx', [
            'wrangler',
            'versions',
            'view',
            versionId,
            '--json',
          ]);
          if (versionRaw) {
            const version = JSON.parse(versionRaw);
            const bindings = version?.resources?.bindings ?? [];
            config.garageDoors = parseGarageDoorsFromBindings(bindings);
          }
        }
      }
    } catch {
      // Ignore malformed remote config responses.
    }
  }

  const secretsRaw = runCommandSilent('npx', ['wrangler', 'secret', 'list', '--format', 'json']);
  if (secretsRaw) {
    try {
      const secrets = JSON.parse(secretsRaw);
      config.hasApiKey =
        Array.isArray(secrets) && secrets.some((secret) => secret.name === 'API_KEY');
    } catch {
      // Ignore malformed secret list responses.
    }
  }

  return config;
}

export function isKvIdValid(kvId) {
  if (!kvId) {
    return false;
  }

  const namespacesRaw = runCommandSilent('npx', ['wrangler', 'kv', 'namespace', 'list']);
  if (!namespacesRaw) {
    return false;
  }

  try {
    const namespaces = JSON.parse(namespacesRaw);
    return Array.isArray(namespaces) && namespaces.some((namespace) => namespace.id === kvId);
  } catch {
    return false;
  }
}

export async function detectExistingConfig(wranglerPath) {
  const local = parseWranglerConfig(wranglerPath);
  const auth = await detectAuth();

  const existingConfig = {
    workerName: local.workerName,
    kvId: local.kvId,
    kvValid: false,
    garageDoors: null,
    hasApiKey: false,
    isDeployed: false,
    auth,
  };

  if (auth.method === 'none') {
    return existingConfig;
  }

  const remote = fetchRemoteConfig(local.workerName);
  existingConfig.isDeployed = remote.isDeployed;
  existingConfig.garageDoors = remote.garageDoors;
  existingConfig.hasApiKey = remote.hasApiKey;
  existingConfig.kvValid = isKvIdValid(local.kvId);

  return existingConfig;
}

export function updateWranglerKvId(wranglerPath, kvId) {
  if (!fs.existsSync(wranglerPath)) {
    return false;
  }

  let wranglerContent = fs.readFileSync(wranglerPath, 'utf8');
  wranglerContent = wranglerContent.replace(
    /"id"\s*:\s*"(?:<YOUR_KV_NAMESPACE_ID>|[a-f0-9]+)"/,
    `"id": "${kvId}"`,
  );
  fs.writeFileSync(wranglerPath, wranglerContent);
  return true;
}

export function autoGenerateKey(appName) {
  return appName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
