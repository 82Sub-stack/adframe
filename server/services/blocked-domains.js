/**
 * Blocked domains that should never be suggested as publisher websites.
 * Sourced from blocked_domains.yaml config.
 */

const BLOCKED_DOMAINS = [
  // Social platforms
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'tiktok.com',
  'linkedin.com',
  'reddit.com',
  'pinterest.com',

  // Search engines
  'google.com',
  'bing.com',
  'yahoo.com',
  'duckduckgo.com',

  // Aggregators
  'news.google.com',
  'flipboard.com',
  'feedly.com',
  'apple.news',

  // Ecommerce
  'amazon.*',
  'ebay.*',
  'aliexpress.com',

  // Other excluded
  'wikipedia.org',
  'youtube.com',
  'vimeo.com',
];

module.exports = { BLOCKED_DOMAINS };
