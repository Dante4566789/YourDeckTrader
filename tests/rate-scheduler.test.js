import test from 'node:test';
import assert from 'node:assert/strict';

import { createRequestScheduler } from '../src/lib/rate-scheduler.js';

function fakeClock() {
  let current = 0;
  const sleeps = [];
  return {
    now: () => current,
    sleep: async (ms) => {
      sleeps.push(ms);
      current += ms;
    },
    advance: (ms) => {
      current += ms;
    },
    sleeps,
  };
}

test('la coda marketplace rispetta 1,1 secondi tra due richieste', async () => {
  const clock = fakeClock();
  const scheduler = createRequestScheduler({
    now: clock.now,
    sleep: clock.sleep,
    marketplaceIntervalMs: 1100,
  });

  await scheduler.acquire('marketplace');
  await scheduler.acquire('marketplace');
  await scheduler.acquire('marketplace');

  assert.deepEqual(clock.sleeps, [1100, 1100]);
});

test('la coda generale blocca oltre 200 richieste in 10 secondi', async () => {
  const clock = fakeClock();
  const scheduler = createRequestScheduler({
    now: clock.now,
    sleep: clock.sleep,
    windowMs: 10_000,
    maxRequests: 3,
  });

  await Promise.all([
    scheduler.acquire('general'),
    scheduler.acquire('general'),
    scheduler.acquire('general'),
  ]);
  assert.deepEqual(clock.sleeps, []);

  await scheduler.acquire('general');
  assert.deepEqual(clock.sleeps, [10_000]);
});

test('le richieste generali non attendono il vincolo marketplace', async () => {
  const clock = fakeClock();
  const scheduler = createRequestScheduler({
    now: clock.now,
    sleep: clock.sleep,
    marketplaceIntervalMs: 1100,
  });

  await scheduler.acquire('general');
  await scheduler.acquire('marketplace');
  await scheduler.acquire('general');

  assert.deepEqual(clock.sleeps, []);
});

test('le acquisizioni concorrenti sono serializzate', async () => {
  const clock = fakeClock();
  const scheduler = createRequestScheduler({
    now: clock.now,
    sleep: clock.sleep,
    marketplaceIntervalMs: 1100,
  });

  await Promise.all([
    scheduler.acquire('marketplace'),
    scheduler.acquire('marketplace'),
    scheduler.acquire('marketplace'),
  ]);

  assert.deepEqual(clock.sleeps, [1100, 1100]);
  assert.equal(scheduler.snapshot().requestsInWindow, 3);
});
