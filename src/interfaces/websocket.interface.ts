import { SignStandardEnum } from './intents.interface';

export enum RelayMethod {
  SUBSCRIBE = 'subscribe',
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

export type TrustedMetadata =
  | {
      source: '1click';
      partner_id: string; // partner_id from JWT token of 1click client
      quote_type: 'main_quote' | 'min_deposit_amount' | 'min_withdrawal_amount' | 'after_deposit';
      quote_request_data: {
        dry: boolean;
        slippageTolerance: number;
      };
    }
  | {
      source: 'router';
      upstream_metadata: IMetadata; // metadata from a quote request received by the router-solver
      upstream_trusted_metadata: TrustedMetadata; // trusted metadata from a quote request received by the router-solver
    };

export interface IQuoteRequestData {
  quote_id: string;
  defuse_asset_identifier_in: string;
  defuse_asset_identifier_out: string;
  exact_amount_in?: string;
  exact_amount_out?: string;
  min_deadline_ms: number;
  min_wait_ms?: number;
  max_wait_ms?: number;
  protocol_fee_included?: boolean;
  trusted_metadata?: TrustedMetadata;
}

export interface IQuoteResponseData {
  quote_id: string;
  quote_output: {
    amount_out?: string;
    amount_in?: string;
  };
  signed_data: {
    standard: SignStandardEnum;
    payload: {
      message: string;
      nonce: string;
      recipient: string;
    };
    signature: string;
    public_key: string;
  };
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
