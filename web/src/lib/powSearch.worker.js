import { search } from './powSearch.js';

// Worker adapter: the same search runs in a tight loop. It yields only to keep
// the worker's message queue responsive and posts progress at most every ~50 ms.
const PACE_MS = 50;

self.onmessage = async ({ data }) => {
  let lastYield = performance.now();
  let lastPost = -Infinity;
  try {
    const result = await search({
      ...data,
      onProgress: progress => {
        const now = performance.now();
        if (now - lastPost < PACE_MS) return false;
        lastPost = now;
        self.postMessage({ type: 'progress', progress });
      },
      yieldControl: () => {
        const now = performance.now();
        if (now - lastYield < PACE_MS) return undefined;
        lastYield = now;
        return new Promise(resolve => setTimeout(resolve, 0));
      }
    });
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
