import * as SecureStore from 'expo-secure-store';

/** Session persistence on iOS and Android: platform secure storage (Keychain / Keystore). */
export const sessionStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
