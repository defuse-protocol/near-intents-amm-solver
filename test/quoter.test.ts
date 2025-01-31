import Big from 'big.js';
import { getAmountIn, getAmountOut } from '../src/services/quoter.service';

const margin = 0.3;

test('getAmountOut should be consistent for back and forth', () => {
  const amountIn = new Big(10);
  const reserveIn = new Big(10000);
  const reserveOut = new Big(100000000);
  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut, margin);

  console.log(`getAmountOut(${amountIn}, ${reserveIn}, ${reserveOut}, ${margin}) -> ${amountOut}`);

  const newReserveOut = reserveOut.sub(amountOut);
  const newReserveIn = reserveIn.add(amountIn);
  const newAmountIn = getAmountOut(new Big(amountOut), newReserveOut, newReserveIn, margin);

  console.log(`getAmountOut(${amountOut}, ${newReserveOut}, ${newReserveIn}, ${margin}) -> ${newAmountIn}`);

  expect(Number(newAmountIn)).toBeLessThan(Number(amountIn));
  expect(Number(newAmountIn)).toBeGreaterThanOrEqual(Math.floor(Number(amountIn) / (1 + (2 * margin) / 100)));
});

test('getAmountIn should be consistent for back and forth', () => {
  const amountOut = new Big(10);
  const reserveIn = new Big(100000000);
  const reserveOut = new Big(10000);
  const amountIn = getAmountIn(amountOut, reserveIn, reserveOut, margin);

  console.log(`getAmountIn(${amountOut}, ${reserveIn}, ${reserveOut}, ${margin}) -> ${amountIn}`);

  const newReserveOut = reserveOut.sub(amountOut);
  const newReserveIn = reserveIn.add(amountIn);
  const newAmountOut = getAmountIn(new Big(amountIn), newReserveOut, newReserveIn, margin);

  console.log(`getAmountIn(${amountIn}, ${newReserveOut}, ${newReserveIn}, ${margin}) -> ${newAmountOut}`);

  expect(Number(newAmountOut)).toBeGreaterThan(Number(amountOut));
  expect(Number(newAmountOut)).toBeLessThanOrEqual(Math.ceil(Number(amountOut) * (1 + (2 * margin) / 100)));
});
