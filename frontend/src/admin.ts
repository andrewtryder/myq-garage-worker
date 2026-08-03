import { apiFetch, ApiError, escapeHtml, formatRelativeTime } from './api';
import { icons } from './icons';

interface WebhookArgument {
  key: string;
  value: string;
}

interface PublicAlertConfig {
  webhookUrl: string;
  method: 'GET' | 'POST';
  contentType: 'application/json' | 'application/x-www-form-urlencoded' | 'text/plain';
  arguments: WebhookArgument[];
}

interface DoorAlertSettings {
  doorId: string;
  doorName: string;
  alertsEnabled: boolean;
  notifyAfterMinutes: number;
  reminderIntervalMinutes: number | null;
}

interface AlertConfigResponse {
  config: PublicAlertConfig | null;
  doors: DoorAlertSettings[];
  doorNames: string[];
}

const DEFAULT_ARGS: WebhookArgument[] = [
  { key: 'title', value: 'Garage Door Alert' },
  { key: 'message', value: '{{door}} has been {{state}} for {{minutes}}.' },
  { key: 'door', value: '{{door}}' },
  { key: 'state', value: '{{state}}' },
  { key: 'minutes', value: '{{minutes}}' },
  { key: 'timestamp', value: '{{timestamp}}' },
];

let doorSettings: DoorAlertSettings[] = [];
let argRows: WebhookArgument[] = [...DEFAULT_ARGS];

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

function syncContentTypeVisibility(): void {
  const method = (document.getElementById('alertMethod') as HTMLSelectElement | null)?.value;
  const wrap = document.getElementById('contentTypeWrap');
  if (wrap) wrap.hidden = method === 'GET';
}

function renderArgs(): void {
  const list = document.getElementById('argsList');
  if (!list) return;
  if (argRows.length === 0) {
    list.innerHTML = '<p class="field-hint">No arguments yet.</p>';
    return;
  }
  list.innerHTML = argRows
    .map(
      (arg, index) => `
      <div class="arg-row" data-index="${index}">
        <input class="arg-input arg-key" data-index="${index}" placeholder="key" value="${escapeHtml(arg.key)}" />
        <input class="arg-input arg-value" data-index="${index}" placeholder="value" value="${escapeHtml(arg.value)}" />
        <button type="button" class="arg-remove" data-index="${index}">Remove</button>
      </div>`,
    )
    .join('');
}

function readArgsFromDom(): WebhookArgument[] {
  const keys = [...document.querySelectorAll<HTMLInputElement>('.arg-key')];
  const values = [...document.querySelectorAll<HTMLInputElement>('.arg-value')];
  const args: WebhookArgument[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i].value.trim();
    const value = values[i]?.value ?? '';
    if (!key) continue;
    args.push({ key, value });
  }
  return args;
}

function renderDoorAlertCards(): void {
  const grid = document.getElementById('door-alerts-grid');
  if (!grid) return;
  if (doorSettings.length === 0) {
    grid.innerHTML = '<p class="empty">No doors configured.</p>';
    return;
  }

  grid.innerHTML = doorSettings
    .map((door) => {
      const on = door.alertsEnabled;
      return `
        <article class="admin-door-card" data-door-id="${escapeHtml(door.doorId)}">
          <div class="door-header">
            <div class="door-title">
              ${icons.door()}
              <h3 class="door-name">${escapeHtml(door.doorName)}</h3>
            </div>
            <button
              type="button"
              class="alert-toggle ${on ? 'on' : 'off'}"
              data-door-id="${escapeHtml(door.doorId)}"
              aria-pressed="${on ? 'true' : 'false'}"
            >
              ${on ? icons.bell() : icons.bellOff()}
              <span>${on ? 'Alerts on' : 'Alerts off'}</span>
            </button>
          </div>
          <div class="door-alert-fields">
            <div>
              <label class="field-label" for="notify-${escapeHtml(door.doorId)}">Notify after (min)</label>
              <input
                id="notify-${escapeHtml(door.doorId)}"
                class="sim-input door-notify"
                type="number"
                min="1"
                data-door-id="${escapeHtml(door.doorId)}"
                value="${door.notifyAfterMinutes}"
              />
            </div>
            <div>
              <label class="field-label" for="remind-${escapeHtml(door.doorId)}">Reminder every (min)</label>
              <input
                id="remind-${escapeHtml(door.doorId)}"
                class="sim-input door-remind"
                type="number"
                min="0"
                data-door-id="${escapeHtml(door.doorId)}"
                value="${door.reminderIntervalMinutes ?? 0}"
                placeholder="0 = once"
              />
            </div>
          </div>
        </article>`;
    })
    .join('');
}

function collectDoorSettingsFromDom(): DoorAlertSettings[] {
  return doorSettings.map((door) => {
    const notifyEl = document.querySelector<HTMLInputElement>(
      `.door-notify[data-door-id="${CSS.escape(door.doorId)}"]`,
    );
    const remindEl = document.querySelector<HTMLInputElement>(
      `.door-remind[data-door-id="${CSS.escape(door.doorId)}"]`,
    );
    const notifyAfterMinutes = Number(notifyEl?.value ?? door.notifyAfterMinutes);
    const remindRaw = Number(remindEl?.value ?? door.reminderIntervalMinutes ?? 0);
    return {
      ...door,
      notifyAfterMinutes: Number.isFinite(notifyAfterMinutes) ? notifyAfterMinutes : 30,
      reminderIntervalMinutes: !Number.isFinite(remindRaw) || remindRaw <= 0 ? null : remindRaw,
    };
  });
}

async function loadDiagnostics(): Promise<void> {
  const el = document.getElementById('diag-strip');
  if (!el) return;
  try {
    const health = await apiFetch<{
      version: string;
      doorCount: number;
      d1Ok: boolean;
      staleAfterHours: number;
      lastEmailOk: { occurredAt: string } | null;
      lastEmailReject: { occurredAt: string; detail: string | null } | null;
    }>('/health');
    const lastEmail = health.lastEmailOk?.occurredAt
      ? formatRelativeTime(health.lastEmailOk.occurredAt).replace(/^\(|\)$/g, '') ||
        health.lastEmailOk.occurredAt
      : health.lastEmailReject
        ? `reject ${formatRelativeTime(health.lastEmailReject.occurredAt).replace(/^\(|\)$/g, '')}`
        : 'none';
    el.innerHTML = `
      <div class="stat"><span class="stat-label">Worker</span><span class="stat-value">v${escapeHtml(health.version)}</span></div>
      <div class="stat"><span class="stat-label">Doors</span><span class="stat-value">${health.doorCount}</span></div>
      <div class="stat"><span class="stat-label">Last email</span><span class="stat-value">${escapeHtml(lastEmail)}</span></div>
      <div class="stat"><span class="stat-label">Stale after</span><span class="stat-value">${health.staleAfterHours}h</span></div>
      <div class="stat"><span class="stat-label">D1</span><span class="stat-value">${health.d1Ok ? 'ok' : 'down'}</span></div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="empty">${escapeHtml(err instanceof Error ? err.message : 'Failed to load health')}</p>`;
  }
}

async function loadAdmin(): Promise<void> {
  void loadDiagnostics();
  const meta = document.getElementById('alert-meta');
  const webhookInput = document.getElementById('alertWebhookUrl') as HTMLInputElement | null;
  const methodSelect = document.getElementById('alertMethod') as HTMLSelectElement | null;
  const contentType = document.getElementById('alertContentType') as HTMLSelectElement | null;
  const alertDoor = document.getElementById('alertDoor') as HTMLSelectElement | null;
  const simDoor = document.getElementById('simDoor') as HTMLSelectElement | null;

  if (!meta || !webhookInput || !methodSelect || !contentType || !alertDoor || !simDoor) {
    return;
  }

  try {
    const data = await apiFetch<AlertConfigResponse>('/api/alert-config');
    fillDoorSelect(alertDoor, data.doorNames);
    fillDoorSelect(simDoor, data.doorNames);
    doorSettings = data.doors ?? [];
    renderDoorAlertCards();

    if (data.config) {
      meta.textContent = `Webhook configured · ${data.config.method} · ${data.config.contentType}`;
      webhookInput.placeholder = `${data.config.webhookUrl} (saved — enter a new URL to replace)`;
      webhookInput.dataset.hasSaved = 'true';
      methodSelect.value = data.config.method;
      contentType.value = data.config.contentType;
      argRows = data.config.arguments?.length > 0 ? [...data.config.arguments] : [...DEFAULT_ARGS];
    } else {
      meta.textContent = 'No webhook configured yet.';
      webhookInput.dataset.hasSaved = 'false';
      argRows = [...DEFAULT_ARGS];
    }
    renderArgs();
    syncContentTypeVisibility();
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
  const methodSelect = document.getElementById('alertMethod') as HTMLSelectElement | null;
  const contentType = document.getElementById('alertContentType') as HTMLSelectElement | null;
  const alertDoor = document.getElementById('alertDoor') as HTMLSelectElement | null;
  const argAddBtn = document.getElementById('argAddBtn');
  const argsList = document.getElementById('argsList');
  const doorGrid = document.getElementById('door-alerts-grid');

  methodSelect?.addEventListener('change', syncContentTypeVisibility);

  argAddBtn?.addEventListener('click', () => {
    argRows = readArgsFromDom();
    argRows.push({ key: '', value: '' });
    renderArgs();
  });

  argsList?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const btn = target.closest('.arg-remove') as HTMLButtonElement | null;
    if (!btn) return;
    const index = Number(btn.dataset.index);
    argRows = readArgsFromDom();
    argRows.splice(index, 1);
    renderArgs();
  });

  doorGrid?.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const btn = target.closest('.alert-toggle') as HTMLButtonElement | null;
    if (!btn || !alertResult) return;
    const doorId = btn.dataset.doorId;
    if (!doorId) return;
    const door = doorSettings.find((d) => d.doorId === doorId);
    if (!door) return;

    const nextEnabled = !door.alertsEnabled;
    door.alertsEnabled = nextEnabled;
    renderDoorAlertCards();

    try {
      const data = await apiFetch<{ success: boolean; door: DoorAlertSettings }>(
        `/api/doors/${encodeURIComponent(doorId)}/alerts`,
        {
          method: 'POST',
          body: JSON.stringify({ enabled: nextEnabled }),
        },
      );
      const idx = doorSettings.findIndex((d) => d.doorId === doorId);
      if (idx >= 0) doorSettings[idx] = data.door;
      renderDoorAlertCards();
    } catch (err) {
      door.alertsEnabled = !nextEnabled;
      renderDoorAlertCards();
      showResult(alertResult, err instanceof ApiError ? err.message : 'Toggle failed', true);
    }
  });

  saveBtn?.addEventListener('click', async () => {
    if (!webhookInput || !methodSelect || !contentType || !alertResult) return;
    const webhookUrl = webhookInput.value.trim();
    if (!webhookUrl && webhookInput.dataset.hasSaved !== 'true') {
      showResult(alertResult, 'Enter a webhook URL to save.', true);
      return;
    }

    const doors = collectDoorSettingsFromDom();
    doorSettings = doors;

    try {
      const body: Record<string, unknown> = {
        method: methodSelect.value,
        contentType: contentType.value,
        arguments: readArgsFromDom(),
        doors: doors.map((d) => ({
          doorId: d.doorId,
          alertsEnabled: d.alertsEnabled,
          notifyAfterMinutes: d.notifyAfterMinutes,
          reminderIntervalMinutes: d.reminderIntervalMinutes,
        })),
      };
      if (webhookUrl) body.webhookUrl = webhookUrl;

      const data = await apiFetch<{
        success: boolean;
        config: PublicAlertConfig;
        doors: DoorAlertSettings[];
      }>('/api/alert-config', { method: 'POST', body: JSON.stringify(body) });
      webhookInput.value = '';
      webhookInput.dataset.hasSaved = 'true';
      webhookInput.placeholder = `${data.config.webhookUrl} (saved — enter a new URL to replace)`;
      if (data.doors) doorSettings = data.doors;
      renderDoorAlertCards();
      showResult(alertResult, 'Configuration saved.', false);
    } catch (err) {
      showResult(alertResult, err instanceof ApiError ? err.message : 'Save failed', true);
    }
  });

  testBtn?.addEventListener('click', async () => {
    if (!webhookInput || !methodSelect || !contentType || !alertDoor || !alertResult) return;
    const webhookUrl = webhookInput.value.trim();
    const body: Record<string, unknown> = {
      method: methodSelect.value,
      contentType: contentType.value,
      arguments: readArgsFromDom(),
      doorName: alertDoor.value,
    };
    if (webhookUrl) body.webhookUrl = webhookUrl;

    try {
      const data = await apiFetch<{
        result: {
          sent?: boolean;
          skippedReason?: string;
          error?: string;
          webhookStatus?: number;
          responseBody?: string;
        };
      }>('/api/test-alert', { method: 'POST', body: JSON.stringify(body) });
      const result = data.result;
      if (result.error) {
        showResult(alertResult, result.error, true);
      } else if (result.skippedReason) {
        showResult(
          alertResult,
          `${result.skippedReason}${result.webhookStatus ? ` (HTTP ${result.webhookStatus})` : ''}${result.responseBody ? `\n${result.responseBody}` : ''}`,
          true,
        );
      } else {
        showResult(
          alertResult,
          `Test webhook sent (HTTP ${result.webhookStatus ?? 200})${result.responseBody ? `\n${result.responseBody}` : ''}`,
          false,
        );
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
      const data = await apiFetch<{
        success: boolean;
        door: string;
        state: string;
        applied: boolean;
      }>('/api/simulate', {
        method: 'POST',
        body: JSON.stringify({ deviceName: door, action }),
      });
      const note = data.applied
        ? `Updated ${data.door} → ${data.state}`
        : `Not applied for ${data.door}; current state remains ${data.state}`;
      showResult(simResult, note, !data.applied);
    } catch (err) {
      showResult(simResult, err instanceof ApiError ? err.message : 'Simulation failed', true);
    } finally {
      simBtn.disabled = false;
      simBtn.textContent = 'Simulate Event';
    }
  });
}

void loadAdmin().then(wireAdminActions);
