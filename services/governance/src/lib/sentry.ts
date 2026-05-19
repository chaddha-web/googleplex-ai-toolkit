import * as Sentry from '@sentry/node';

export const initSentry = (appName: string) => {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1,
    initialScope: { tags: { app: appName } },
  });
};
