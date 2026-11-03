import { search } from './powSearch.js';

// Worker adapter: the same search runs in a tight loop. It yields only to keep
// the worker's message queue responsive and posts progress at most every ~50 ms.
const PACE_MS = 50;

// The first message starts the search; later `control` messages change its live settings.
let control = null;
self.onmessage = async ({ data }) => {
  if (data.type === 'control') {
    if (control) Object.assign(control, data.control);
    return;
  }
  let lastYield = performance.now();
  let lastPost = -Infinity;
  control = data.control ? { ...data.control } : null;
  try {
    const result = await search({
      ...data, control,
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
