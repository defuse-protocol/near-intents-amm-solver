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

const BUY_FEE = 0.01; // 1%
const SELL_FEE = 0.1; // 10%
const STEP_SIZE = new Big(0.02); // $0.02 per token
const STEP_SIZE_OVER_2 = STEP_SIZE.div(2);
const STATE_FILE = path.join(__dirname, '../../data/bonding-curve.json');

interface BondingCurveState {
  supply: number; // total tokens in circulation
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
    const rawState = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed: BondingCurveState = JSON.parse(rawState);
    this.currentState = {
      bondingCurve: parsed,
      nonce: this.intentsService.generateDeterministicNonce(`supply:${parsed.supply}`),
    };
    this.logger.debug(`Loaded bonding curve state: ${JSON.stringify(this.currentState)}`);
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

    const isSell = !!params.exact_amount_in;
    const amount = this.calculateQuote(
      params.exact_amount_in,
      params.exact_amount_out,
      currentState.bondingCurve,
      logger,
    );

    if (amount === '0') {
      logger.info('Calculated amount is 0');
      return;
    }

    // Update and persist new supply
    const delta = new Big(params.exact_amount_in || amount);
    const newSupply = isSell
      ? new Big(currentState.bondingCurve.supply).plus(delta) // selling = supply increases
      : new Big(currentState.bondingCurve.supply).minus(delta); // buying = supply decreases
    currentState.bondingCurve.supply = parseInt(newSupply.toFixed(0));
    fs.writeFileSync(STATE_FILE, JSON.stringify(currentState.bondingCurve, null, 2));

    const quoteDeadlineMs = params.min_deadline_ms + quoteDeadlineExtraMs;
    const standard = SignStandardEnum.nep413;
    const message: IMessage = {
      signer_id: this.nearService.getAccountId(),
      deadline: new Date(Date.now() + quoteDeadlineMs).toISOString(),
      intents: [
        {
          intent: 'token_diff',
          diff: {
            [params.defuse_asset_identifier_in]: params.exact_amount_in ? params.exact_amount_in : amount,
            [params.defuse_asset_identifier_out]: `-${params.exact_amount_out ? params.exact_amount_out : amount}`,
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
        amount_in: params.exact_amount_out ? amount : undefined,
        amount_out: params.exact_amount_in ? amount : undefined,
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

    return quoteResp;
  }

  public calculateQuote(
    amountIn: string | undefined,
    amountOut: string | undefined,
    state: BondingCurveState,
    logger: LoggerService,
  ): string {
    if (amountIn) {
      return getSellQuote(new Big(amountIn), new Big(state.supply), logger);
    } else if (amountOut) {
      return getBuyQuote(new Big(amountOut), new Big(state.supply), logger);
    }
    return '0';
  }
}

export function getSellQuote(amountIn: Big, supply: Big, logger: LoggerService): string {
  const newSupply = supply.plus(amountIn);
  const payout = newSupply.pow(2).minus(supply.pow(2)).mul(STEP_SIZE_OVER_2);
  const payoutAfterFee = payout.mul(new Big(1).minus(SELL_FEE));
  logger.info(
    `Sell ${amountIn.toFixed()} tokens from supply ${supply.toFixed()} yields $${payoutAfterFee.toFixed(2)} after ${
      SELL_FEE * 100
    }% fee`,
  );
  return payoutAfterFee.toFixed(2);
}

export function getBuyQuote(amountOut: Big, supply: Big, logger: LoggerService): string {
  const grossCost = amountOut.div(new Big(1).minus(BUY_FEE));
  const newTotal = grossCost.div(STEP_SIZE_OVER_2).add(supply.pow(2));
  const newSupply = newTotal.sqrt();
  const amountIn = newSupply.minus(supply);
  logger.info(
    `Buy ${amountOut.toFixed(2)} USD from supply ${supply.toFixed()} costs ${amountIn.toFixed()} tokens (before ${
      BUY_FEE * 100
    }% fee)`,
  );
  return amountIn.toFixed(0);
}
