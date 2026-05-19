export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    console.warn('[turnstile] dev bypass');
    return true;
  }

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip
      })
    });
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    console.error('[turnstile] verify error', e);
    return false;
  }
}
