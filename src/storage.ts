/*! Glimmer | Developed by jvz | MIT License */

type StoreKey = 'preferences' | 'saved';

export function readStore<T>(key: StoreKey, fallback: T): T {
  try {
    const current = localStorage.getItem(`glimmer.${key}`);
    if (current !== null) return JSON.parse(current) ?? fallback;

    const legacy = localStorage.getItem(`still-world.${key}`);
    if (legacy === null) return fallback;

    const value = JSON.parse(legacy) as T | null;
    if (value === null) return fallback;
    store(key, value);
    return value;
  } catch {
    return fallback;
  }
}

export function store(key: StoreKey, value: unknown): void {
  try {
    localStorage.setItem(`glimmer.${key}`, JSON.stringify(value));
    // Keep the old value until its replacement has been saved successfully.
    localStorage.removeItem(`still-world.${key}`);
  } catch {
    // Browsing still works when storage is unavailable or full.
  }
}
