/**
 * Web has no secure storage (expo-secure-store is native-only), and tokens must not go into
 * localStorage. Keep the session in memory: a page reload signs the user out, which is the safe
 * trade-off for local browser testing.
 */
const memory = new Map<string, string>();

export const deviceStorage = {
  get: async (key: string) => memory.get(key) ?? null,
  set: async (key: string, value: string) => {
    memory.set(key, value);
  },
  remove: async (key: string) => {
    memory.delete(key);
  },
};
