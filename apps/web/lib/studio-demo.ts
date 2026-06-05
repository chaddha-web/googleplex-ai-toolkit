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
export const DEMO_TAGLINE = "The shine your space deserves.";

// The droplet monogram used across the generated site.
export const DEMO_LOGO_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Lustre logo">
  <circle cx="24" cy="24" r="23" fill="#20453B"/>
  <path d="M24 9c5.5 7.2 9 12 9 17.2A9 9 0 1 1 15 26.2C15 21 18.5 16.2 24 9Z" fill="#CFE7DB"/>
  <path d="M30.5 14.5l1.1 2.6 2.6 1.1-2.6 1.1-1.1 2.6-1.1-2.6-2.6-1.1 2.6-1.1z" fill="#C39A4D"/>
</svg>`;

// Logo on a transparent/cream ground for the dark/cream variant chips.
export const DEMO_LOGO_GLYPH_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M24 9c5.5 7.2 9 12 9 17.2A9 9 0 1 1 15 26.2C15 21 18.5 16.2 24 9Z" fill="#CFE7DB"/>
  <path d="M30.5 14.5l1.1 2.6 2.6 1.1-2.6 1.1-1.1 2.6-1.1-2.6-2.6-1.1 2.6-1.1z" fill="#C39A4D"/>
</svg>`;

export const DEMO_LOGO_NOTE =
  "A water-drop “sparkle” mark — purity, care and shine, the essence of premium cleaning. Balanced for a full wordmark or a standalone icon.";

export type StudioFounder = { name: string; role: string; vision: string };
export type StudioGuidelines = {
  palette: { hex: string; name: string }[];
  typography: { display: string; body: string };
  voice: string;
};

export const DEMO_FOUNDER: StudioFounder = {
  name: "Fateh",
  role: "Founder & Lead Concierge",
  vision:
    "A clean space changes how a whole day feels. We treat every home like it’s our mother’s — that’s the standard, every single visit."
};

export const DEMO_GUIDELINES: StudioGuidelines = {
  palette: [
    { hex: "#20453B", name: "Eucalyptus" },
    { hex: "#CFE7DB", name: "Mint" },
    { hex: "#C39A4D", name: "Brass" },
    { hex: "#F6F2E9", name: "Cream" },
    { hex: "#18211E", name: "Ink" }
  ],
  typography: { display: "Fraunces", body: "Hanken Grotesk" },
  voice:
    "Calm, premium, trustworthy. Speak plainly and warmly — confident without shouting. Lead with care and reliability; let the results do the bragging."
};

// Kept for the markdown fallback / copy.
export const DEMO_BRAND_KIT = `## Brand names
1. **Lustre** — premium, evokes a clean shine
2. **Pristine Co.** — direct, trustworthy
3. **Halo Home** — calm, aspirational

## Tagline
**${DEMO_TAGLINE}**

## Palette
- \`#20453B\` Eucalyptus · \`#CFE7DB\` Mint · \`#C39A4D\` Brass · \`#F6F2E9\` Cream · \`#18211E\` Ink

## Typography
- **Display:** Fraunces · **Body:** Hanken Grotesk

## Brand story
Lustre is a cleaning concierge for people who value their time. Founded by Fateh,
it pairs vetted professionals with eco-considered products and flat, honest
pricing — a finish you can feel the moment you walk in.`;
