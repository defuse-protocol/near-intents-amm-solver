import Big from 'big.js';
import bs58 from 'bs58';
import { IMessage, SignStandardEnum } from '../interfaces/intents.interface';
import { IQuoteRequestData, IQuoteResponseData } from '../interfaces/websocket.interface';
import { CacheService } from './cache.service';
import { intentsContract } from '../configs/intents.config';
import { marginPercent, quoteDeadlineExtraMs, quoteDeadlineMaxMs } from '../configs/quoter.config';
import { tokens } from '../configs/tokens.config';
import { NearService } from './near.service';
import { IntentsService } from './intents.service';
import { LoggerService } from './logger.service';
import { serializeIntent } from '../utils/hashing';
import { makeNonReentrant } from '../utils/make-nonreentrant';

type State = {
  reserves: Record<string, string>;
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
    const reserves = await this.intentsService.getBalancesOnContract(tokens);
    if (!this.currentState || !reserves.every((reserve, i) => reserve === this.currentState!.reserves[tokens[i]])) {
      this.currentState = {
        reserves: reserves.reduce((m, reserve, i) => ((m[tokens[i]] = reserve), m), {} as Record<string, string>),
        nonce: this.intentsService.generateDeterministicNonce(`reserves:${reserves.join(':')}`),
      };
    }
    this.logger.debug(`Current state: ${JSON.stringify(this.currentState)}`);
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

    const reserveIn = currentState.reserves[params.defuse_asset_identifier_in];
    if (!reserveIn) {
      logger.error(`Reserve for token ${params.defuse_asset_identifier_in} not found`);
      return;
    }
    const reserveOut = currentState.reserves[params.defuse_asset_identifier_out];
    if (!reserveOut) {
      logger.error(`Reserve for token ${params.defuse_asset_identifier_out} not found`);
      return;
    }

    const amount = this.calculateQuote(
      params.defuse_asset_identifier_in,
      params.defuse_asset_identifier_out,
      params.exact_amount_in,
      params.exact_amount_out,
      reserveIn,
      reserveOut,
      marginPercent,
      logger,
    );
    if (amount === '0') {
      logger.info('Calculated amount is 0');
      return;
    }

    const amountOut = params.exact_amount_out ? params.exact_amount_out : amount;

    if (new Big(amountOut).gte(new Big(reserveOut))) {
      logger.error(
        `Solver account doesn't have enough ${params.defuse_asset_identifier_out} tokens on contract to quote`,
      );
      return;
    }

    const quoteDeadlineMs = params.min_deadline_ms + quoteDeadlineExtraMs;
    const standard = SignStandardEnum.nep413;
    const message: IMessage = {
      signer_id: this.nearService.getIntentsAccountId(),
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
    tokenIn: string,
    tokenOut: string,
    amountIn: string | undefined,
    amountOut: string | undefined,
    reserveIn: string,
    reserveOut: string,
    marginPercent: number,
    logger: LoggerService,
  ) {
    let amountStr = '0';

    if (amountIn) {
      amountStr = getAmountOut(new Big(amountIn), new Big(reserveIn), new Big(reserveOut), marginPercent);
      logger.info(
        `Calculated quote result for ${tokenIn} / ${amountIn} -> ${tokenOut} = ${amountStr} with margin ${marginPercent}%`,
      );
    } else if (amountOut) {
      amountStr = getAmountIn(new Big(amountOut), new Big(reserveIn), new Big(reserveOut), marginPercent);
      logger.info(
        `Calculated quote result for ${tokenIn} -> ${tokenOut} / ${amountOut} = ${amountStr} with margin ${marginPercent}%`,
      );
    }

    return amountStr;
  }
}

export function getAmountOut(amountIn: Big, reserveIn: Big, reserveOut: Big, marginPercent: number) {
  if (amountIn.lte(0)) throw new Error('INSUFFICIENT_INPUT_AMOUNT');
  if (reserveIn.lte(0) || reserveOut.lte(0)) throw new Error('INSUFFICIENT_LIQUIDITY');
  const marginBips = Math.floor(marginPercent * 100);
  const amountInWithFee = amountIn.mul(10000 - marginBips);
  const numerator = amountInWithFee.mul(reserveOut);
  const denominator = reserveIn.mul(10000).add(amountInWithFee);
  return numerator.div(denominator).toFixed(0, Big.roundDown);
}

export function getAmountIn(amountOut: Big, reserveIn: Big, reserveOut: Big, marginPercent: number) {
  if (amountOut.lte(0)) throw new Error('INSUFFICIENT_OUTPUT_AMOUNT');
  if (reserveIn.lte(0) || reserveOut.lte(amountOut)) throw new Error('INSUFFICIENT_LIQUIDITY');
  const marginBips = Math.floor(marginPercent * 100);
  const numerator = reserveIn.mul(amountOut).mul(10000);
  const denominator = reserveOut.sub(amountOut).mul(10000 - marginBips);
  return numerator.div(denominator).toFixed(0, Big.roundUp);
}
