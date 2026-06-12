const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmount, parseMessage } = require('./parser');

test('parseAmount accepts supported amount formats', () => {
  assert.equal(parseAmount('5000'), 5000);
  assert.equal(parseAmount('$5000'), 5000);
  assert.equal(parseAmount('2k'), 2000);
  assert.equal(parseAmount('2.5k'), 2500);
});

test('parseAmount rejects invalid and non-positive values', () => {
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('-100'), null);
  assert.equal(parseAmount('1500.50'), null);
  assert.equal(parseAmount('1.2345k'), null);
  assert.equal(parseAmount('2,5k'), null);
  assert.equal(parseAmount('1500,50'), null);
});

test('parseMessage accepts amount before or after description', () => {
  assert.deepEqual(parseMessage('5000 cafe'), { amount: 5000, description: 'cafe' });
  assert.deepEqual(parseMessage('super mercado 2.5k'), {
    amount: 2500,
    description: 'super mercado',
  });
});

test('parseMessage removes parenthetical annotations', () => {
  assert.deepEqual(parseMessage('Chicles (chino) 9522'), {
    amount: 9522,
    description: 'Chicles',
  });
});

test('parseMessage requires both an amount and a description', () => {
  assert.equal(parseMessage('5000'), null);
  assert.equal(parseMessage('sin monto'), null);
  assert.equal(parseMessage(''), null);
});
