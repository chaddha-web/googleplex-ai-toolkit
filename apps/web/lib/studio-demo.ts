/**
 * GoogolPlex Studio — demo payload.
 *
 * When STUDIO_DEMO_MODE is on (or no AI key is configured), the Studio returns
 * this hand-built result instead of calling a provider. It matches the live
 * showcase store committed at demo-sites/lustre-by-fateh.html, so "Generate"
 * looks exactly like the real pipeline during a recording — no API key needed.
 */

export const DEMO_SLUG = "lustre-by-fateh";
export const DEMO_STORE_NAME = "Lustre";

// The droplet monogram used across the generated site.
export const DEMO_LOGO_SVG = `<svg width="64" height="64" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Lustre logo">
  <circle cx="24" cy="24" r="23" fill="#20453B"/>
  <path d="M24 9c5.5 7.2 9 12 9 17.2A9 9 0 1 1 15 26.2C15 21 18.5 16.2 24 9Z" fill="#CFE7DB"/>
  <path d="M30.5 14.5l1.1 2.6 2.6 1.1-2.6 1.1-1.1 2.6-1.1-2.6-2.6-1.1 2.6-1.1z" fill="#C39A4D"/>
</svg>`;

export const DEMO_BRAND_KIT = `## Brand names
1. **Lustre** — premium, evokes a clean shine
2. **Pristine Co.** — direct, trustworthy
3. **Halo Home** — calm, aspirational

## Tagline
**The shine your space deserves.**

## Palette
- \`#20453B\` — Eucalyptus *(primary)*
- \`#F6F2E9\` — Cream *(surface)*
- \`#CFE7DB\` — Mint *(accent)*
- \`#C39A4D\` — Brass *(highlight)*
- \`#18211E\` — Ink *(text)*

## Typography
- **Display:** Fraunces *(characterful serif)*
- **Body:** Hanken Grotesk *(clean grotesque)*

## Brand story
Lustre is a cleaning concierge for people who value their time. Founded by Fateh,
it pairs vetted professionals with eco-considered products and flat, honest
pricing — treating every home to a finish you can feel the moment you walk in.

## First 3 steps
1. Publish the booking landing page (done — live below).
2. Turn on flat-rate online booking + payments via your GoogolPlex wallet.
3. Launch a recurring-clean plan and invite your first 10 clients.`;
