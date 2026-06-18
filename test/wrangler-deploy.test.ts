import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  injectDeployVars,
  removeInjectedGarageDoors,
} from '../scripts/wrangler-deploy.js';

const BASE_WRANGLER = `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "myq-garage-worker",
  "vars": {
    "VERSION": "0.1.8"
  },
  "kv_namespaces": [
    {
      "binding": "GARAGE_STATE",
      "id": "<YOUR_KV_NAMESPACE_ID>"
    }
  ]
}
`;

describe('injectDeployVars', () => {
  let tempDir;
  let wranglerPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrangler-deploy-'));
    wranglerPath = path.join(tempDir, 'wrangler.jsonc');
    fs.writeFileSync(wranglerPath, BASE_WRANGLER);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes valid JSON string GARAGE_DOORS into wrangler.jsonc', () => {
    injectDeployVars(wranglerPath, {
      kvNamespaceId: 'abc123',
      garageDoors: { 'Garage Door Left': 'garage-left', 'Garage Door Right': 'garage-right' },
    });

    const content = fs.readFileSync(wranglerPath, 'utf8');
    expect(content).toContain('"id": "abc123"');
    expect(content).toContain('"GARAGE_DOORS"');

    const match = content.match(/"GARAGE_DOORS"\s*:\s*("(?:\\.|[^"\\])*")/);
    expect(match).not.toBeNull();
    const stored = JSON.parse(JSON.parse(match[1]));
    expect(stored['Garage Door Left']).toBe('garage-left');
    expect(stored['Garage Door Right']).toBe('garage-right');
  });

  it('removes injected GARAGE_DOORS after deploy cleanup', () => {
    injectDeployVars(wranglerPath, {
      garageDoors: '{"Garage Door Left":"garage-left"}',
    });
    removeInjectedGarageDoors(wranglerPath);

    const content = fs.readFileSync(wranglerPath, 'utf8');
    expect(content).not.toContain('GARAGE_DOORS');
  });
});
