import { caseRoutes } from '../features/cases/api/case-routes.js';
import { ledgerRoutes } from '../features/ledger/api/ledger-routes.js';
import { strategyRoutes } from '../features/strategies/api/strategy-routes.js';
import { composeHandler } from './compose.js';
import { dynamoServices } from './dynamo.js';

/** Case create/read/update, strategy saves and the case ledger: the API's writing Lambda. */
export const handler = composeHandler((config) => {
  const { cases, strategies, ledger } = dynamoServices(config);
  const authMode = config.authMode;
  return {
    ...caseRoutes({ cases, authMode }),
    ...strategyRoutes({ strategies, authMode }),
    ...ledgerRoutes({ cases, ledger, authMode }),
  };
});
