const DOOR_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/**
 * Validate door name → id map. Throws Error on invalid input.
 * Keep in sync with src/config.ts validateGarageDoors.
 */
export function validateGarageDoors(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('GARAGE_DOORS must be a JSON object mapping names to door ids');
  }

  const result = {};
  const seenNames = new Set();
  const seenIds = new Set();

  for (const [name, id] of Object.entries(raw)) {
    if (typeof id !== 'string') {
      throw new Error('GARAGE_DOORS values must be strings');
    }
    const trimmedName = name.trim();
    const trimmedId = id.trim();

    if (!trimmedName) {
      throw new Error('GARAGE_DOORS door names must be non-empty');
    }
    if (!trimmedId) {
      throw new Error(`GARAGE_DOORS id for "${trimmedName}" must be non-empty`);
    }
    if (!DOOR_ID_PATTERN.test(trimmedId)) {
      throw new Error(`GARAGE_DOORS id "${trimmedId}" must match ${DOOR_ID_PATTERN}`);
    }

    const nameKey = trimmedName.toLowerCase();
    if (seenNames.has(nameKey)) {
      throw new Error(`GARAGE_DOORS has case-insensitive duplicate name "${trimmedName}"`);
    }
    if (seenIds.has(trimmedId)) {
      throw new Error(`GARAGE_DOORS has duplicate id "${trimmedId}"`);
    }

    seenNames.add(nameKey);
    seenIds.add(trimmedId);
    result[trimmedName] = trimmedId;
  }

  return result;
}

export function parseAndValidateGarageDoors(garageDoors) {
  const jsonStr = typeof garageDoors === 'string' ? garageDoors : JSON.stringify(garageDoors);
  const parsed = JSON.parse(jsonStr);
  return validateGarageDoors(parsed);
}
