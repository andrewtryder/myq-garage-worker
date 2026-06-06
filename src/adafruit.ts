import { Env } from './types';

export async function postToAdafruit(env: Env, feedKey: string, value: string): Promise<void> {
  const url = `https://io.adafruit.com/api/v2/${env.ADAFRUIT_USERNAME}/feeds/${feedKey}/data`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AIO-Key': env.ADAFRUIT_IO_KEY,
    },
    body: JSON.stringify({ value }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Failed to post to Adafruit IO', res.status, text);
    throw new Error(`Adafruit IO error ${res.status}`);
  }

  console.log(`Updated feed ${feedKey} to ${value}`);
}

export async function getLastFromAdafruit(
  env: Env,
  feedKey: string,
): Promise<{ value: string; createdAt: string } | null> {
  const url =
    `https://io.adafruit.com/api/v2/${env.ADAFRUIT_USERNAME}` +
    `/feeds/${feedKey}/data/last?include=value,created_at`;

  const res = await fetch(url, {
    headers: {
      'X-AIO-Key': env.ADAFRUIT_IO_KEY,
    },
  });

  if (!res.ok) {
    console.error('Failed to read from Adafruit IO', feedKey, res.status);
    return null;
  }

  const data = (await res.json()) as { value?: string; created_at?: string };
  return {
    value: String(data.value || '').toUpperCase(),
    createdAt: data.created_at || '',
  };
}
