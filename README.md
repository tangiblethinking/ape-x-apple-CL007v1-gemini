# Ape X Job Hunt — Apple HIG Edition

A white-label job search application using Apple's Human Interface Guidelines.

**Current repo:** https://github.com/tangiblethinking/ape-x-apple-CL001

---

## What Changed

### Design System
- **Typography** — SF Pro system font stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text"`) with tight letter-spacing (`-0.02em` to `-0.03em`) matching Apple's display type
- **Color palette** — Apple system colors: `#007AFF` blue, `#34C759` green, `#FF3B30` red, `#FF9500` orange, `#AF52DE` purple — no custom brand tints
- **Backgrounds** — `#F2F2F7` grouped background, `#FFFFFF` primary, translucent materials (`rgba(255,255,255,0.85)`) with backdrop blur
- **Border radius** — 12–28px rounded corners on cards, 50px pills on buttons (Apple's "full-radius" CTA style)
- **Shadows** — Subtle `0 1px 4px rgba(0,0,0,0.06)` on cards; `0 20px 60px rgba(0,0,0,0.2)` on modals
- **Buttons** — Pill-shaped (`border-radius: 50px`); filled (blue), tinted (blue-bg), gray, destructive (red-tinted), plain
- **Borders** — Hairline `0.5px` separators matching iOS grouped table style

### UI Components
- **Nav bar** — Translucent `rgba(242,242,247,0.85)` with `backdrop-filter: blur(20px) saturate(180%)`, 52px height, blue active-tab indicator
- **Modals/Sheets** — Frosted glass (`rgba(255,255,255,0.94)` + blur), `border-radius: 20px`, spring animation (`cubic-bezier(0.32, 0.72, 0, 1)`)
- **Cards** — White on grouped gray, `border-radius: 16px`, hairline border
- **Chips/Tags** — Full-radius pill shape with system-color tints
- **Loading overlay** — Dark blur overlay replacing solid black; dot-pulse indicator
- **Inputs** — Rounded 10px corners, filled gray background, focus ring with blue glow

### What Stays the Same
- All functionality — job search, board, applied tracker, settings
- All API routes (search passes, extract-profile, generate, analyze-job)
- Storage library and instructions engine
- Two-pass verified search logic

---

## Setup

```bash
npm install
npm run dev
```

Requires Anthropic and Serper API keys (enter in Settings tab).

---

## Stack
Next.js · TypeScript · Anthropic Claude API · Serper Search API
# Force rebuild
