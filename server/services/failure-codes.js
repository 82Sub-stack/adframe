const FAILURE_CODES = {
  INVALID_INPUT: 'invalid_input',
  BLOCKED_DOMAIN: 'blocked_domain',
  PREFLIGHT_BLOCKED: 'preflight_blocked',
  PREFLIGHT_UNREACHABLE: 'preflight_unreachable',
  PREFLIGHT_ERROR: 'preflight_error',
  MOCKUP_TIMEOUT: 'mockup_timeout',
  SSL_ERROR: 'ssl_error',
  NO_RELIABLE_SLOT: 'no_reliable_slot',
  INVALID_SLOT_ID: 'invalid_slot_id',
  RESOURCE_LIMIT: 'resource_limit',
  CAPTURE_NAVIGATION_FAILED: 'capture_navigation_failed',
  DOM_INJECTION_FAILED: 'dom_injection_failed',
  OUTPUT_QUALITY_WARNING: 'output_quality_warning',
  OUTPUT_QUALITY_FAILED: 'output_quality_failed',
  CAPTURE_CONTENT_MISSING: 'capture_content_missing',
  ADTAG_RENDER_FAILED: 'adtag_render_failed',
  UNKNOWN: 'unknown',
};

function inferFailureCode(error) {
  const message = error?.message || '';

  if (error?.code === 'MOCKUP_TIMEOUT' || /timeout/i.test(message)) {
    return FAILURE_CODES.MOCKUP_TIMEOUT;
  }
  if (/ERR_SSL_VERSION_OR_CIPHER_MISMATCH|ERR_SSL_PROTOCOL_ERROR|ERR_CERT_/i.test(message)) {
    return FAILURE_CODES.SSL_ERROR;
  }
  if (error?.code === 'NO_RELIABLE_SLOT') {
    return FAILURE_CODES.NO_RELIABLE_SLOT;
  }
  if (error?.code === 'INVALID_SLOT_ID') {
    return FAILURE_CODES.INVALID_SLOT_ID;
  }
  if (/Target closed|Session closed|browser has disconnected|ENOMEM|heap out of memory|Cannot find context/i.test(message)) {
    return FAILURE_CODES.RESOURCE_LIMIT;
  }

  return error?.code || FAILURE_CODES.UNKNOWN;
}

module.exports = {
  FAILURE_CODES,
  inferFailureCode,
};
