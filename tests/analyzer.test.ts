import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeMessage } from '../src/analyzer';

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

test('analyzeMessage throws on failed LLM responses instead of returning unrelated fallback', async () => {
  global.fetch = async () => new Response('bad request', { status: 400 }) as unknown as ReturnType<typeof fetch>;

  await assert.rejects(
    () => analyzeMessage('2025 North Orbit 10m for sale, $1200'),
    /LLM request failed/,
  );
});

test('analyzeMessage parses successful structured LLM responses', async () => {
  global.fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          brand: 'North',
          item: 'kite',
          size: '10m',
          year: '2025',
          price: '1200',
          currency: 'USD',
          condition: 'like new',
          sentiment: 'selling',
        }),
      },
    }],
  }), { status: 200 }) as unknown as ReturnType<typeof fetch>;

  const analysis = await analyzeMessage('2025 North Orbit 10m for sale, $1200');

  assert.equal(analysis.sentiment, 'selling');
  assert.equal(analysis.brand, 'North');
});
