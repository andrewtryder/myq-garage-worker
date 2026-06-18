/* global process */
import { execSync } from 'child_process';
import fs from 'fs';

export function loadDotEnv(cwd = process.cwd()) {
  const envPath = `${cwd}/.env`;
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function runCommandSilent(command) {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
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
  const kvMatch = content.match(
    /"binding"\s*:\s*"GARAGE_STATE"[\s\S]*?"id"\s*:\s*"([a-f0-9]+)"/,
  );

  return {
    workerName: workerMatch?.[1] ?? null,
    kvId: kvMatch?.[1] ?? null,
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

export async function detectAuth() {
  const whoami = runCommandSilent('npx wrangler whoami');
  if (whoami) {
    return { method: process.env.CLOUDFLARE_API_TOKEN ? 'token' : 'oauth' };
  }

  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    return { method: 'none' };
  }

  const verify = runCommandSilent(
    `curl -sS -H "Authorization: Bearer ${token}" "https://api.cloudflare.com/client/v4/user/tokens/verify"`,
  );

  if (!verify) {
    return { method: 'none' };
  }

  try {
    const result = JSON.parse(verify);
    if (result.success && result.result?.status === 'active') {
      return { method: 'token' };
    }
  } catch {
    return { method: 'none' };
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

  const deploymentsRaw = runCommandSilent('npx wrangler deployments list --json');
  if (deploymentsRaw) {
    try {
      const deployments = JSON.parse(deploymentsRaw);
      if (Array.isArray(deployments) && deployments.length > 0) {
        config.isDeployed = true;

        const versionId = deployments[0]?.versions?.[0]?.version_id;
        if (versionId) {
          const versionRaw = runCommandSilent(`npx wrangler versions view ${versionId} --json`);
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

  const secretsRaw = runCommandSilent('npx wrangler secret list --format json');
  if (secretsRaw) {
    try {
      const secrets = JSON.parse(secretsRaw);
      config.hasApiKey = Array.isArray(secrets) && secrets.some((secret) => secret.name === 'API_KEY');
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

  const namespacesRaw = runCommandSilent('npx wrangler kv namespace list');
  if (!namespacesRaw) {
    return false;
  }

  try {
    const namespaces = JSON.parse(namespacesRaw);
    return (
      Array.isArray(namespaces) &&
      namespaces.some((namespace) => namespace.id === kvId)
    );
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
  wranglerContent = wranglerContent.replace(/"id"\s*:\s*"[a-f0-9]+"/, `"id": "${kvId}"`);
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
