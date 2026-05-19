import posthog from 'posthog-js';

export function initPostHog() {
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: 'https://us.i.posthog.com',
      persistence: 'memory',
      autocapture: false,
      capture_pageview: true,
      ip: false,
    });
  }
}

export const captureEvent = (eventName: string, properties?: any) => {
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.capture(eventName, properties);
  }
};
