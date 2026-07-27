import { apiFetch, ApiError, escapeHtml } from './api';

interface PublicAlertConfig {
  webhookUrl: string;
  thresholdMinutes: number;
  method: 'GET' | 'POST';
  reminderMinutes?: number;
}

interface AlertConfigResponse {
  config: PublicAlertConfig | null;
  doorNames: string[];
}

function fillDoorSelect(select: HTMLSelectElement, doorNames: string[]): void {
  if (doorNames.length === 0) {
    select.innerHTML = '<option value="" disabled selected>No doors configured</option>';
    return;
  }
  select.innerHTML = doorNames
    .map(
      (name, index) =>
        `<option value="${escapeHtml(name)}"${index === 0 ? ' selected' : ''}>${escapeHtml(name)}</option>`,
    )
    .join('');
}

function showResult(el: HTMLElement, message: string, isError: boolean): void {
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle('result-error', isError);
  el.classList.toggle('result-ok', !isError);
}

async function loadDiagnostics(): Promise<void> {
  const el = document.getElementById('diag-meta');
  if (!el) return;
  try {
    const health = await apiFetch<{
      version: string;
      doorCount: number;
      d1Ok: boolean;
      hasAllowedEmailTo: boolean;
      hasApiKey: boolean;
      staleAfterHours: number;
      lastEmailOk: { occurredAt: string } | null;
      lastEmailReject: { occurredAt: string; detail: string | null } | null;
    }>('/health');
    const lines = [
      `Worker v${health.version}`,
      `D1 ${health.d1Ok ? 'ok' : 'unreachable'}`,
      `${health.doorCount} door(s) configured`,
      `ALLOWED_EMAIL_TO ${health.hasAllowedEmailTo ? 'set' : 'not set'}`,
      `API_KEY ${health.hasApiKey ? 'set' : 'not set'}`,
      `Stale after ${health.staleAfterHours}h`,
    ];
    if (health.lastEmailOk) {
      lines.push(`Last email ok: ${health.lastEmailOk.occurredAt}`);
    }
    if (health.lastEmailReject) {
      lines.push(
        `Last reject: ${health.lastEmailReject.detail ?? 'unknown'} @ ${health.lastEmailReject.occurredAt}`,
      );
    }
    el.textContent = lines.join(' · ');
  } catch (err) {
    el.textContent = err instanceof Error ? err.message : 'Failed to load health';
  }
}

async function loadAdmin(): Promise<void> {
  void loadDiagnostics();
  const meta = document.getElementById('alert-meta');
  const webhookInput = document.getElementById('alertWebhookUrl') as HTMLInputElement | null;
  const thresholdInput = document.getElementById('alertThreshold') as HTMLInputElement | null;
  const methodSelect = document.getElementById('alertMethod') as HTMLSelectElement | null;
  const alertDoor = document.getElementById('alertDoor') as HTMLSelectElement | null;
  const simDoor = document.getElementById('simDoor') as HTMLSelectElement | null;

  if (!meta || !webhookInput || !thresholdInput || !methodSelect || !alertDoor || !simDoor) {
    return;
  }

  try {
    const data = await apiFetch<AlertConfigResponse>('/api/alert-config');
    fillDoorSelect(alertDoor, data.doorNames);
    fillDoorSelect(simDoor, data.doorNames);

    if (data.config) {
      meta.textContent = `Webhook configured · Threshold: ${data.config.thresholdMinutes} minutes · Method: ${data.config.method}`;
      webhookInput.placeholder = `${data.config.webhookUrl} (saved — enter a new URL to replace)`;
      webhookInput.dataset.hasSaved = 'true';
      thresholdInput.value = String(data.config.thresholdMinutes);
      methodSelect.value = data.config.method;
    } else {
      meta.textContent = 'No webhook configured yet.';
      webhookInput.dataset.hasSaved = 'false';
    }
  } catch (err) {
    meta.textContent = err instanceof Error ? err.message : 'Failed to load alert config';
  }
}

function wireAdminActions(): void {
  const saveBtn = document.getElementById('alertSaveBtn');
  const testBtn = document.getElementById('alertTestBtn');
  const alertResult = document.getElementById('alertResult');
  const simForm = document.getElementById('simForm') as HTMLFormElement | null;
  const simResult = document.getElementById('simResult');
  const simBtn = document.getElementById('simBtn') as HTMLButtonElement | null;
  const webhookInput = document.getElementById('alertWebhookUrl') as HTMLInputElement | null;
  const thresholdInput = document.getElementById('alertThreshold') as HTMLInputElement | null;
  const methodSelect = document.getElementById('alertMethod') as HTMLSelectElement | null;
  const alertDoor = document.getElementById('alertDoor') as HTMLSelectElement | null;

  saveBtn?.addEventListener('click', async () => {
    if (!webhookInput || !thresholdInput || !methodSelect || !alertResult) return;
    const webhookUrl = webhookInput.value.trim();
    if (!webhookUrl && webhookInput.dataset.hasSaved !== 'true') {
      showResult(alertResult, 'Enter a webhook URL to save.', true);
      return;
    }

    try {
      const body: Record<string, unknown> = {
        thresholdMinutes: Number(thresholdInput.value),
        method: methodSelect.value,
      };
      if (webhookUrl) body.webhookUrl = webhookUrl;

      const data = await apiFetch<{ success: boolean; config: PublicAlertConfig }>(
        '/api/alert-config',
        { method: 'POST', body: JSON.stringify(body) },
      );
      webhookInput.value = '';
      webhookInput.dataset.hasSaved = 'true';
      webhookInput.placeholder = `${data.config.webhookUrl} (saved — enter a new URL to replace)`;
      showResult(alertResult, 'Alert configuration saved.', false);
    } catch (err) {
      showResult(alertResult, err instanceof ApiError ? err.message : 'Save failed', true);
    }
  });

  testBtn?.addEventListener('click', async () => {
    if (!webhookInput || !thresholdInput || !methodSelect || !alertDoor || !alertResult) return;
    const webhookUrl = webhookInput.value.trim();
    const body: Record<string, unknown> = {
      thresholdMinutes: Number(thresholdInput.value),
      method: methodSelect.value,
      doorName: alertDoor.value,
    };
    if (webhookUrl) body.webhookUrl = webhookUrl;

    try {
      const data = await apiFetch<{
        result: { ok?: boolean; skippedReason?: string; error?: string };
      }>('/api/test-alert', { method: 'POST', body: JSON.stringify(body) });
      const result = data.result;
      if (result.error) {
        showResult(alertResult, result.error, true);
      } else if (result.skippedReason) {
        showResult(alertResult, result.skippedReason, true);
      } else {
        showResult(alertResult, 'Test webhook sent successfully.', false);
      }
    } catch (err) {
      showResult(alertResult, err instanceof ApiError ? err.message : 'Test failed', true);
    }
  });

  simForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!simBtn || !simResult) return;
    const door = (document.getElementById('simDoor') as HTMLSelectElement).value;
    const action = (document.getElementById('simAction') as HTMLSelectElement).value;

    simBtn.disabled = true;
    simBtn.textContent = 'Simulating…';
    try {
      const data = await apiFetch<{ success: boolean; door: string; state: string }>(
        '/api/simulate',
        {
          method: 'POST',
          body: JSON.stringify({ deviceName: door, action }),
        },
      );
      showResult(simResult, `Updated ${data.door} → ${data.state}`, false);
    } catch (err) {
      showResult(simResult, err instanceof ApiError ? err.message : 'Simulation failed', true);
    } finally {
      simBtn.disabled = false;
      simBtn.textContent = 'Simulate Event';
    }
  });
}

void loadAdmin().then(wireAdminActions);
