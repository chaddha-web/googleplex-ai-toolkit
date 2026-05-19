import { Turnstile, TurnstileInstance } from '@marsidev/react-turnstile';
import { useRef } from 'react';

export const TurnstileWidget = ({ onSuccess, onError }: { onSuccess: (token: string) => void; onError: () => void }) => {
  const turnstileRef = useRef<TurnstileInstance>(null);

  return (
    <Turnstile
      ref={turnstileRef}
      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
      onSuccess={onSuccess}
      onError={onError}
    />
  );
};
