import * as SecureStore from 'expo-secure-store';

/** Small private values on iOS and Android: platform secure storage (Keychain / Keystore). */
export const deviceStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
