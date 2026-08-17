// Central configuration with environment overrides.
const config = {
  port: Number(process.env.PORT || 3000),
  currency: 'USD',
  freeShippingThreshold: 80,
  taxRegion: process.env.TAX_REGION || 'us-default',
  lowStockThreshold: 5,
  webhookRetryLimit: 3,
};

module.exports = config;
