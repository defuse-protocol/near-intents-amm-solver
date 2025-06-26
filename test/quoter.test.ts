import Big from 'big.js';
import { getBuyQuote, getSellQuote } from '../src/services/quoter.service';
import { LoggerService } from '../src/services/logger.service';
import { QuoterService } from '../src/services/quoter.service';
import { NearService } from '../src/services/near.service';
import { CacheService } from '../src/services/cache.service';
import { IntentsService } from '../src/services/intents.service';

const BUY_FEE = 0.01;
const SELL_FEE = 0.1;
const STEP_SIZE = 0.02;

const logger = new LoggerService('test');

test('getSellQuote should return expected payout and apply fee', () => {
  const tokenInDecimals = 9;
  const tokenOutDecimals = 6;

  const amountInHuman = new Big(100); // 100 tokens
  const amountInYocto = amountInHuman.mul(Big(10).pow(tokenInDecimals)).toFixed(0);

  const payoutYocto = getSellQuote(amountInYocto, logger, tokenInDecimals, tokenOutDecimals);

  const rawUSD = amountInHuman.mul(STEP_SIZE);
  const expectedUSD = rawUSD.mul(1 - SELL_FEE);
  const expectedYocto = expectedUSD.mul(Big(10).pow(tokenOutDecimals)).round(0, Big.roundDown);

  expect(payoutYocto).toBe(expectedYocto.toFixed(0));
});

test('getBuyQuote should return expected tokens and apply fee', () => {
  const tokenInDecimals = 9;
  const tokenOutDecimals = 6;

  const amountOutUSD = new Big(500);
  const amountOutYocto = amountOutUSD.mul(Big(10).pow(tokenOutDecimals)).toFixed(0);

  const amountInYocto = getBuyQuote(amountOutYocto, logger, tokenInDecimals, tokenOutDecimals);

  const grossUSD = amountOutUSD.div(1 - BUY_FEE);
  const expectedTokens = grossUSD.div(STEP_SIZE);
  const expectedYocto = expectedTokens.mul(Big(10).pow(tokenInDecimals)).round(0, Big.roundDown);

  expect(amountInYocto).toBe(expectedYocto.toFixed(0));
});

test('buy then sell should result in small net loss due to fees', () => {
  const tokenInDecimals = 9;
  const tokenOutDecimals = 6;

  const usdToSpend = new Big(500);
  const usdToSpendYocto = usdToSpend.mul(Big(10).pow(tokenOutDecimals)).toFixed(0);

  const buyTokensYocto = getBuyQuote(usdToSpendYocto, logger, tokenInDecimals, tokenOutDecimals);
  const usdBackYocto = getSellQuote(buyTokensYocto, logger, tokenInDecimals, tokenOutDecimals);

  const usdBack = new Big(usdBackYocto).div(Big(10).pow(tokenOutDecimals));

  expect(Number(usdBack)).toBeLessThan(Number(usdToSpend));
  expect(Number(usdBack)).toBeGreaterThan(Number(usdToSpend.mul(1 - BUY_FEE - SELL_FEE).toFixed(2)));
});

jest.mock('../src/configs/tokens', () => ({
  tokens: [
    { assetId: 'nep141:usdt.tether-token.near', decimals: 6 },
    { assetId: 'nep141:sol.omft.near', decimals: 9 },
  ],
}));

test('quote response uses raw values and formats intent correctly', async () => {
  const mockCache = new CacheService();
  const mockNear = {
    getAccountId: () => 'test-account.near',
    signMessage: async () => ({ signature: Buffer.from('sig'), publicKey: { data: Buffer.from('pk') } }),
  } as unknown as NearService;
  const mockIntents = {
    generateDeterministicNonce: () => 'mock-nonce',
    getBalancesOnContract: async () => ['1000000000', '1000000000000'],
  } as unknown as IntentsService;

  const service = new QuoterService(mockCache, mockNear, mockIntents);

  service.__setTestState({
    bondingCurve: {
      'nep141:usdt.tether-token.near': '1000000000000',
      'nep141:sol.omft.near': '1000000000000000',
    },
    nonce: '1111111111111111111111111111111111111111111',
  });

  const quote = await service.getQuoteResponse({
    quote_id: 'test-quote-id',
    defuse_asset_identifier_in: 'nep141:usdt.tether-token.near',
    defuse_asset_identifier_out: 'nep141:sol.omft.near',
    exact_amount_in: '100000000', // 0.1 token with 9 decimals
    min_deadline_ms: 5000,
  });

  expect(quote).toBeDefined();
  expect(quote?.quote_output.amount_out).toMatch(/^\d+$/); // raw yocto string
  expect(quote?.signed_data.payload.message).toContain('token_diff');
});
