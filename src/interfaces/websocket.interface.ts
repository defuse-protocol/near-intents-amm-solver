import type { SignedIntent } from '../services/intents.service';

export enum RelayMethod {
  SUBSCRIBE = 'subscribe',
  ACKNOWLEDGE = 'acknowledge',
  QUOTE_RESPONSE = 'quote_response',
}

export enum RelayEventKind {
  QUOTE = 'quote',
  QUOTE_STATUS = 'quote_status',
}

export interface IJsonrpcRelayRequest {
  id: number;
  jsonrpc: string;
  method: RelayMethod;
  params: unknown[];
}

export interface IJsonrpcEventNotification {
  jsonrpc: string;
  method: 'event';
  params: Record<string, unknown>;
}

export interface IJsonrpcResponse {
  id: number;
  jsonrpc: string;
  result?: unknown;
  error?: unknown;
}

export interface IMetadata {
  traceparent?: string;
  partner_id?: string;
}

export interface IQuoteRequestData {
  quote_id: string;
  defuse_asset_identifier_in: string;
  defuse_asset_identifier_out: string;
  exact_amount_in?: string;
  exact_amount_out?: string;
  min_deadline_ms: number;
}

export interface IQuoteResponseData {
  quote_id: string;
  quote_output: {
    amount_out?: string;
    amount_in?: string;
  };
  signed_data: SignedIntent;
  other_quote_hashes?: string[];
}

export interface ISubscription {
  subscriptionId: string;
  eventKind: RelayEventKind;
}

export interface IPublishedQuoteData {
  quote_hash: string;
  intent_hash: string;
  tx_hash: string;
}
