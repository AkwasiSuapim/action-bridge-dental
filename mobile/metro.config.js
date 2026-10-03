// Metro config: the app consumes the shared contracts package (built dist/) and the shared
// regression fixtures from the repository, while every third-party import (e.g. zod) resolves
// from this app's node_modules so there is exactly one copy in the bundle.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const fs = require('fs');

const config = getDefaultConfig(__dirname);
const contracts = path.resolve(__dirname, '../packages/contracts');
const fixtures = path.resolve(__dirname, '../docs/fixtures');

if (!fs.existsSync(path.join(contracts, 'dist/index.js'))) {
  throw new Error(
    'Shared contracts are not built yet. From the repository root run: npm ci && npm run build ' +
      '(or `npm run setup`), then start Expo again.',
  );
}

config.watchFolders = [...(config.watchFolders ?? []), contracts, fixtures];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@actionbridge/contracts') {
    return { type: 'sourceFile', filePath: path.join(contracts, 'dist/index.js') };
  }
  const fromShared = context.originModulePath.startsWith(contracts);
  if (fromShared && !moduleName.startsWith('.')) {
    return context.resolveRequest({ ...context, originModulePath: path.join(__dirname, 'package.json') }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
