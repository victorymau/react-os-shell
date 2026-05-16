export const config = {
  port: Number(process.env.PORT) || 3001,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  isProd: process.env.NODE_ENV === 'production',
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  sweepIntervalMs: 5 * 60 * 1000,
  imapKeepAliveMs: 4 * 60 * 1000,
  bodyLimit: '50mb',
};
