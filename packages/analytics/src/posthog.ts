import posthog from 'posthog-js';

export const initAnalytics = (app: 'web' | 'admin') => {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
  });

  posthog.register({ app });
};
