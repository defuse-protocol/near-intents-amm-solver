import Big from 'big.js';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';
import { IMessage, SignStandardEnum } from '../interfaces/intents.interface';
import { IQuoteRequestData, IQuoteResponseData } from '../interfaces/websocket.interface';
import { CacheService } from './cache.service';
import { intentsContract } from '../configs/intents.config';
import { quoteDeadlineExtraMs, quoteDeadlineMaxMs } from '../configs/quoter.config';
import { NearService } from './near.service';
import { IntentsService } from './intents.service';
import { LoggerService } from './logger.service';
import { serializeIntent } from '../utils/hashing';
import { makeNonReentrant } from '../utils/make-nonreentrant';
import { tokens } from '../configs/tokens';

const BUY_FEE = 0.01; // 1%
const SELL_FEE = 0.1; // 10%
const STEP_SIZE = new Big(0.02); // $0.02 per token
const STATE_FILE = path.join(__dirname, '../../data/bonding-curve.json');

interface BondingCurveState {
  [assetId: string]: string; // balances in yocto
}

type State = {
  bondingCurve: BondingCurveState;
  nonce: string;
};

export class QuoterService {
  private currentState?: State;
  private logger = new LoggerService('quoter');

  public constructor(
    private readonly cacheService: CacheService,
    private readonly nearService: NearService,
    private readonly intentsService: IntentsService,
  ) {}

  public updateCurrentState = makeNonReentrant(async () => {
    const sortedTokens = [...tokens].sort((a, b) => a.assetId.localeCompare(b.assetId));
    const assetIds = sortedTokens.map((t) => t.assetId);
    const balances = await this.intentsService.getBalancesOnContract(assetIds);

    const bondingCurveState: BondingCurveState = {};
    assetIds.forEach((assetId, idx) => {
      bondingCurveState[assetId] = balances[idx];
      this.logger.info(`${assetId} balance: ${balances[idx]}`);
    });

    const nonceSeed = assetIds.map((id, i) => `${id}:${balances[i]}`).join('|');

    const newState: State = {
      bondingCurve: bondingCurveState,
      nonce: this.intentsService.generateDeterministicNonce(`supply:${nonceSeed}`),
    };

    fs.writeFileSync(STATE_FILE, JSON.stringify(bondingCurveState, null, 2));
    this.currentState = newState;

    this.logger.debug(`Updated bonding curve state: ${JSON.stringify(this.currentState)}`);
  });

  public async getQuoteResponse(params: IQuoteRequestData): Promise<IQuoteResponseData | undefined> {
    const logger = this.logger.toScopeLogger(params.quote_id);

    if (params.min_deadline_ms > quoteDeadlineMaxMs) {
      logger.info(`min_deadline_ms exceeds maximum allowed value: ${params.min_deadline_ms} > ${quoteDeadlineMaxMs}`);
      return;
    }

    const { currentState } = this;
    if (!currentState) {
      logger.error(`Quoter state is not yet initialized`);
      return;
    }

    const amount = this.calculateQuote(params, logger);

    if (amount === '0') {
      logger.info('Calculated amount is 0');
      return;
    }

    const quoteDeadlineMs = params.min_deadline_ms + quoteDeadlineExtraMs;
    const standard = SignStandardEnum.nep413;

    const tokenInDecimals = tokens.find((t) => t.assetId === params.defuse_asset_identifier_in)?.decimals;
    const tokenOutDecimals = tokens.find((t) => t.assetId === params.defuse_asset_identifier_out)?.decimals;

    const amountInRaw = params.exact_amount_in ?? amount;
    const amountOutRaw = params.exact_amount_out ?? amount;

    this.logger.debug(`Decimals - tokenIn: ${tokenInDecimals}, tokenOut: ${tokenOutDecimals}`);

    const message: IMessage = {
      signer_id: this.nearService.getAccountId(),
      deadline: new Date(Date.now() + quoteDeadlineMs).toISOString(),
      intents: [
        {
          intent: 'token_diff',
          diff: {
            [params.defuse_asset_identifier_in]: amountInRaw,
            [params.defuse_asset_identifier_out]: `-${amountOutRaw}`,
          },
        },
      ],
    };

    const messageStr = JSON.stringify(message);
    const nonce = currentState.nonce;
    const recipient = intentsContract;
    const quoteHash = serializeIntent(messageStr, recipient, nonce, standard);
    const signature = await this.nearService.signMessage(quoteHash);

    const quoteResp: IQuoteResponseData = {
      quote_id: params.quote_id,
      quote_output: {
        amount_in: params.exact_amount_out ? amountInRaw : undefined,
        amount_out: params.exact_amount_in ? amountOutRaw : undefined,
      },
      signed_data: {
        standard,
        payload: {
          message: messageStr,
          nonce,
          recipient,
        },
        signature: `ed25519:${bs58.encode(signature.signature)}`,
        public_key: `ed25519:${bs58.encode(signature.publicKey.data)}`,
      },
    };

    this.cacheService.set(bs58.encode(quoteHash), quoteResp, quoteDeadlineMs / 1000);

    this.logger.info(`amountInRaw: ${amountInRaw}, amountOutRaw: ${amountOutRaw}`);
    this.logger.info(`Generated message: ${messageStr}`);
    this.logger.info(`Quote hash: ${bs58.encode(quoteHash)}`);

    return quoteResp;
  }

  public calculateQuote(params: IQuoteRequestData, logger: LoggerService): string {
    const tokenIn = tokens.find((t) => t.assetId === params.defuse_asset_identifier_in)!;
    const tokenOut = tokens.find((t) => t.assetId === params.defuse_asset_identifier_out)!;

    const tokenInDecimals = tokenIn.decimals;
    const tokenOutDecimals = tokenOut.decimals;

    if (params.exact_amount_in) {
      logger.info(`Calculating sell quote for amountIn: ${params.exact_amount_in}`);
      return getSellQuote(params.exact_amount_in, logger, tokenInDecimals, tokenOutDecimals);
    } else if (params.exact_amount_out) {
      logger.info(`Calculating buy quote for amountOut: ${params.exact_amount_out}`);
      return getBuyQuote(params.exact_amount_out, logger, tokenInDecimals, tokenOutDecimals);
    }

    logger.warn(`Neither amountIn nor amountOut provided`);
    return '0';
  }

  public applyAcceptedQuote(params: IQuoteRequestData) {
    if (!this.currentState) {
      throw new Error('State is not initialized');
    }

    const isSell = !!params.exact_amount_in;
    const assetId = isSell ? params.defuse_asset_identifier_out : params.defuse_asset_identifier_in;

    const delta = new Big(params.exact_amount_in ?? params.exact_amount_out ?? '0');
    const currentSupply = new Big(this.currentState.bondingCurve[assetId] ?? '0');

    const updatedSupply = isSell ? currentSupply.plus(delta) : currentSupply.minus(delta);
    this.currentState.bondingCurve[assetId] = updatedSupply.toFixed(0);

    fs.writeFileSync(STATE_FILE, JSON.stringify(this.currentState.bondingCurve, null, 2));
    this.logger.info(
      `Applied accepted ${isSell ? 'sell' : 'buy'} quote on ${assetId}. Updated supply: ${updatedSupply.toFixed(0)}`,
    );
  }

  /** Test-only method */
  public __setTestState(state: State) {
    this.currentState = state;
  }
}

export function getSellQuote(
  exactAmountIn: string,
  logger: LoggerService,
  tokenInDecimals: number,
  tokenOutDecimals: number,
): string {
  const amountIn = new Big(exactAmountIn).div(Big(10).pow(tokenInDecimals));
  const payout = amountIn.mul(STEP_SIZE);
  const payoutAfterFee = payout.mul(new Big(1).minus(SELL_FEE));
  const payoutYocto = payoutAfterFee.mul(Big(10).pow(tokenOutDecimals)).round(0, Big.roundDown);
  logger.info(
    `Sell ${amountIn.toFixed()} tokens yields $${payoutAfterFee.toFixed(6)} after ${
      SELL_FEE * 100
    }% fee (flat rate $${STEP_SIZE.toFixed(2)} per token)`,
  );
  return payoutYocto.gt(0) ? payoutYocto.toFixed(0) : '1';
}

export function getBuyQuote(
  exactAmountOut: string,
  logger: LoggerService,
  tokenInDecimals: number,
  tokenOutDecimals: number,
): string {
  const amountOut = new Big(exactAmountOut).div(Big(10).pow(tokenOutDecimals));
  const grossCost = amountOut.div(new Big(1).minus(BUY_FEE));
  const amountIn = grossCost.div(STEP_SIZE);
  const amountInYocto = amountIn.mul(Big(10).pow(tokenInDecimals)).round(0, Big.roundDown);
  logger.info(
    `Buy $${amountOut.toFixed(6)} costs ${amountIn.toFixed()} tokens (flat rate $${STEP_SIZE.toFixed(
      2,
    )} per token before ${BUY_FEE * 100}% fee)`,
  );
  return amountInYocto.gt(0) ? amountInYocto.toFixed(0) : '1';
}
