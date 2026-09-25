import type { ClientOptions } from 'ws';
import { privateRelayWsUrl } from './private-intents.config';
import { isConfidentialMode } from './solver-mode.config';

export const publicRelayWsUrl = process.env.RELAY_WS_URL || 'wss://solver-relay-v2.chaindefuser.com/ws';
const solverInstanceId = process.env.SOLVER_INSTANCE_ID?.trim();

function withSolverInstanceId(url: string) {
  if (!solverInstanceId) {
    return url;
  }

  const relayUrl = new URL(url);
  relayUrl.searchParams.set('instance_id', solverInstanceId);
  return relayUrl.toString();
}

export const wsRelayUrl = isConfidentialMode ? withSolverInstanceId(privateRelayWsUrl) : publicRelayWsUrl;

const partnerJwt = process.env.PARTNER_JWT?.trim();

export const wsRelayOptions: ClientOptions | undefined = partnerJwt
  ? {
      headers: {
        Authorization: `Bearer ${partnerJwt}`,
      },
    }
  : undefined;
