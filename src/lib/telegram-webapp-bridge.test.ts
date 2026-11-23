import assert from 'node:assert/strict';
import test from 'node:test';
import {
  waitForTelegramWebAppBridge,
  type TelegramWebAppBridge,
} from './telegram-webapp-bridge';

function makeBridge(): TelegramWebAppBridge {
  return {
    initData: 'signed-init-data',
    ready() {},
    expand() {},
    openLink() {},
    openTelegramLink() {},
  };
}

test('waits for a Telegram bridge that becomes available after hydration', async () => {
  const bridge = makeBridge();
  let reads = 0;

  const result = await waitForTelegramWebAppBridge({
    readBridge: () => {
      reads += 1;
      return reads >= 3 ? bridge : null;
    },
    pollMs: 2,
    timeoutMs: 200,
  });

  assert.equal(result, bridge);
  assert.ok(reads >= 3);
});

test('rejects when the Telegram bridge never becomes available', async () => {
  await assert.rejects(
    waitForTelegramWebAppBridge({
      readBridge: () => null,
      pollMs: 2,
      timeoutMs: 20,
    }),
    /bridge was not available/,
  );
});

test('an abort signal cancels the bridge wait', async () => {
  const controller = new AbortController();
  const pending = waitForTelegramWebAppBridge({
    readBridge: () => null,
    pollMs: 2,
    timeoutMs: 1_000,
    signal: controller.signal,
  });

  controller.abort();

  await assert.rejects(pending, (error: unknown) => {
    return error instanceof DOMException && error.name === 'AbortError';
  });
});
