# Googolplex Landing

Marketing landing page for the Googolplex ecosystem — a Web3 + Social + AI coding platform.

Built with **Next.js 14 (App Router)**, **Tailwind CSS**, and **framer-motion**.
Design originally prototyped in [Claude Design](https://claude.ai/design) and ported to a stable, scalable React/TypeScript codebase.

## Stack

- Next.js 14.2 (App Router, RSC, static export-friendly)
- TypeScript (strict)
- Tailwind CSS 3
- framer-motion 11 for scroll/in-view animations
- Inline SVG icons (no icon-pack dependency)
- Instrument Serif + Helvetica Regular via Google Fonts / CDN

## Sections

1. **Hero** — full-bleed crossfade-loop video, liquid-glass nav + email pill
2. **About** — "Pioneering ideas for minds that create, build, and inspire"
3. **Featured Video** — rounded video + glass approach card
4. **Philosophy** — "Innovation × Vision" two-column block
5. **Trust** — social proof / brand strip
6. **Services** — "What we do" two-card grid with hover video zoom
7. **Benefit** — white card with 72% / 65% / 39% stats and halftone orbs
8. **Testimonials** — portrait collage on white
9. **FAQ** — horizontal carousel with active deep-blue card
10. **Footer CTA** — "Pure Insight. Zero Noise." on video background + liquid-glass footer

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in RESEND_API_KEY + OTP_SECRET
npm run dev
# → http://localhost:3010
```

## Environment variables

The OTP flow on `/signup` and `/login` is powered by [Resend](https://resend.com).
See `.env.example` for the full list. Quick summary:

| Var | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | prod | Without it, `/api/otp/request` logs the code to the **server console** instead of emailing (great for local dev). |
| `RESEND_FROM` | prod | A verified-domain sender like `GoogolPlex <hello@yourdomain.com>`. Defaults to Resend's shared sandbox sender. |
| `OTP_SECRET` | prod | HMAC secret for signing the OTP cookie. Generate with `openssl rand -hex 32`. |

Set these in **Vercel → Project → Settings → Environment Variables** for the
deployed site. Never commit the real values.

## Build

```bash
npm run build
npm run start
```

## Project structure

```
app/
  layout.tsx          # <html>, fonts, metadata
  page.tsx            # composes all sections
  globals.css         # tailwind + .liquid-glass utility + placeholder gradients
components/
  video.tsx           # FadeLoopVideo, LoopVideo, FooterBgVideo
  icons.tsx           # inline SVG icon set
  sections/
    hero.tsx
    about.tsx
    featured.tsx
    philosophy.tsx
    trust.tsx
    services.tsx
    benefit.tsx
    testimonials.tsx
    faq.tsx
    footer.tsx
lib/
  assets.ts           # CloudFront video URLs + headshot URLs (swap before launch)
```

## Notes

- Video assets currently point at the CloudFront URLs from the design handoff —
  **replace with self-hosted versions before going to production**.
- Headshot images in `Testimonials` are external placeholders — swap for licensed
  photos.
- `Sign Up` / `Login` nav links point at placeholder routes (`/signup`, `/login`)
  — wire these to your real auth flow.
