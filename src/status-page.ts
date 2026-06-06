export interface DoorState {
  value: string;
  createdAt: string;
}

export function statusColor(value: string): string {
  const upperVal = value.toUpperCase();
  switch (upperVal) {
    case 'OPEN':
      return '#ff4d4f'; // red
    case 'CLOSED':
      return '#52c41a'; // green
    case 'STOPPED':
      return '#faad14'; // amber
    default:
      return '#8c8c8c'; // grey / unknown
  }
}

export function statusLabel(value: string | undefined): string {
  if (!value) return 'UNKNOWN';
  return value.toUpperCase();
}

export function renderStatusPage(rightDoor: DoorState | null, leftDoor: DoorState | null): string {
  const rightValue = rightDoor?.value || '';
  const rightTime = rightDoor?.createdAt || 'N/A';
  const leftValue = leftDoor?.value || '';
  const leftTime = leftDoor?.createdAt || 'N/A';

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Garage Status – MyQ / Adafruit IO</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
                   sans-serif;
      background: radial-gradient(circle at top, #1f2933, #050816);
      color: #f9fafb;
      display: flex;
      min-height: 100vh;
      align-items: center;
      justify-content: center;
    }
    .wrapper {
      max-width: 900px;
      width: 100%;
      padding: 24px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      letter-spacing: 0.03em;
    }
    .subtitle {
      margin-bottom: 24px;
      color: #9ca3af;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }
    .card {
      background: rgba(15,23,42,0.9);
      border-radius: 16px;
      padding: 18px 20px;
      box-shadow: 0 14px 45px rgba(0,0,0,0.35);
      border: 1px solid rgba(148,163,184,0.2);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .door-name {
      font-weight: 600;
      font-size: 16px;
    }
    .status-pill {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #0b1120;
    }
    .meta {
      font-size: 12px;
      color: #9ca3af;
    }
    .status-open   { background-color: ${statusColor('OPEN')}; }
    .status-closed { background-color: ${statusColor('CLOSED')}; }
    .status-stopped{ background-color: ${statusColor('STOPPED')}; }
    .status-unknown{ background-color: ${statusColor('UNKNOWN')}; }
  </style>
</head>
<body>
  <div class="wrapper">
    <h1>Garage Door Status</h1>
    <div class="subtitle">
      Source: MyQ email notifications → Cloudflare Email Worker → Adafruit IO feeds.
    </div>
    <div class="grid">
      <div class="card">
        <div class="card-header">
          <div class="door-name">Garage Door Right</div>
          <span class="status-pill ${
            rightValue === 'OPEN'
              ? 'status-open'
              : rightValue === 'CLOSED'
                ? 'status-closed'
                : rightValue === 'STOPPED'
                  ? 'status-stopped'
                  : 'status-unknown'
          }">
            ${statusLabel(rightValue)}
          </span>
        </div>
        <div class="meta">
          Last update: ${rightTime}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="door-name">Garage Door Left</div>
          <span class="status-pill ${
            leftValue === 'OPEN'
              ? 'status-open'
              : leftValue === 'CLOSED'
                ? 'status-closed'
                : leftValue === 'STOPPED'
                  ? 'status-stopped'
                  : 'status-unknown'
          }">
            ${statusLabel(leftValue)}
          </span>
        </div>
        <div class="meta">
          Last update: ${leftTime}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
