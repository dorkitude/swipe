import 'dotenv/config';

export const env = {
  // Server
  port: parseInt(process.env.PORT || '2567', 10),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/swipe',

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:2567/auth/google/callback',

  // Client
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
} as const;

export function validateEnv(): void {
  const required = ['DATABASE_URL'] as const;

  for (const key of required) {
    if (!process.env[key]) {
      console.warn(`Warning: ${key} is not set`);
    }
  }

  if (env.nodeEnv === 'production') {
    if (!env.googleClientId || !env.googleClientSecret) {
      throw new Error('Google OAuth credentials are required in production');
    }
    if (env.sessionSecret === 'dev-secret-change-in-production') {
      throw new Error('SESSION_SECRET must be set in production');
    }
  }
}
