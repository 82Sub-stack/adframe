/**
 * Simple concurrency limiter for Puppeteer instances.
 */

class ConcurrencyQueue {
  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async run(fn) {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this.running++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          this._processNext();
        }
      };

      if (this.running < this.maxConcurrent) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  _processNext() {
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const next = this.queue.shift();
      next();
    }
  }

  get pendingCount() {
    return this.queue.length;
  }

  get runningCount() {
    return this.running;
  }
}

function parseConcurrency(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

const defaultConcurrency = process.env.NODE_ENV === 'production' ? 1 : 3;
const configuredConcurrency = parseConcurrency(process.env.MOCKUP_CONCURRENCY, defaultConcurrency);

module.exports = new ConcurrencyQueue(configuredConcurrency);
