function timeoutError() {
  const error = new Error('Mockup generation timed out. Try a different website or retry in a moment.');
  error.code = 'MOCKUP_TIMEOUT';
  return error;
}

async function runWithDeadline(operation, timeoutMs, parentSignal) {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal.reason || timeoutError());
  if (parentSignal?.aborted) onParentAbort();
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(timeoutError()), timeoutMs);
  let onAbort;
  try {
    controller.signal.throwIfAborted();
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    return await Promise.race([operation(controller.signal), aborted]);
  } finally {
    clearTimeout(timer);
    if (onAbort) controller.signal.removeEventListener('abort', onAbort);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

module.exports = { runWithDeadline };
