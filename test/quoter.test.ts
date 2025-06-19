import Big from 'big.js';
import { getBuyQuote, getSellQuote } from '../src/services/quoter.service';
import { LoggerService } from '../src/services/logger.service';

const SUPPLY = new Big(1000);
const BUY_FEE = 0.01;
const SELL_FEE = 0.1;
const logger = new LoggerService('test');

test('getSellQuote should return expected payout and apply fee', () => {
  const amountIn = new Big(100); // selling 100 tokens
  const payout = getSellQuote(amountIn, SUPPLY, logger);

  const rawPayout = SUPPLY.plus(amountIn).pow(2).minus(SUPPLY.pow(2)).mul(0.01);
  const expected = rawPayout.mul(1 - SELL_FEE);

  expect(Number(payout)).toBeCloseTo(Number(expected.toFixed(2)), 2);
});

test('getBuyQuote should return expected tokens and apply fee', () => {
  const amountOutUSD = new Big(500); // want to buy $500 worth of tokens
  const costInTokens = getBuyQuote(amountOutUSD, SUPPLY, logger);

  const gross = amountOutUSD.div(1 - BUY_FEE);
  const newTotal = gross.div(0.01).add(SUPPLY.pow(2));
  const expected = newTotal.sqrt().minus(SUPPLY);

  expect(Number(costInTokens)).toBeCloseTo(Number(expected.toFixed(0)), 0);
});

test('buy then sell should result in small net loss due to fees', () => {
  const usdToSpend = new Big(500);
  const buyTokens = new Big(getBuyQuote(usdToSpend, SUPPLY, logger));
  const usdBack = new Big(getSellQuote(buyTokens, SUPPLY, logger));

  expect(Number(usdBack)).toBeLessThan(Number(usdToSpend));
  expect(Number(usdBack)).toBeGreaterThan(Number(usdToSpend.mul(1 - BUY_FEE - SELL_FEE).toFixed(2)));
});
