# SpikeCut — Build Plan

> Reference product: klippah.com (used for feature/UX inspiration only — all branding, copy, logos and imagery are our own).
> Brand name: **SpikeCut** (spikecut.com / spikecut.io — confirm with registrar). Visual identity: near-black + electric lime `#c8ff2e`, coral `#ff5a36` for live states; Bricolage Grotesque / Inter / JetBrains Mono.

Decisions locked in:
- **Scope:** full product (marketing site + autonomous clipping app)
- **Payments:** Paystack (NGN/GHS/USD, cards, bank transfer, mobile money)
- **Hosting:** Vercel (web) + Supabase (Postgres, Auth, Storage) + a separate worker host for video processing

---

## 1. Architecture

```
                ┌─────────────────────────── Vercel ───────────────────────────┐
  Browser ───▶  │  Web app (Vite + React + TS + Tailwind v4)                   │
                │  API routes (Hono on Vercel Functions)                        │
                │   • auth-gated REST  • Paystack webhooks  • OAuth callbacks   │
                └───────────────┬───────────────────────────────┬──────────────┘
                                │                               │
                         Supabase                         Upstash Redis
                 (Postgres + Auth + Realtime)          (BullMQ job queues)
                                │                               │
                                └──────────────┬────────────────┘
                                               ▼
                         ┌──────────── Worker host (Railway / Fly / Hetzner) ───────────┐
                         │  monitor-worker  (Node)  poll Twitch/YouTube/Kick live status │
                         │  ingest-worker   (Py)    streamlink / yt-dlp → rolling buffer │
                         │  detect-worker   (Py)    chat spikes + audio + transcript     │
                         │  render-worker   (Py)    ffmpeg 9:16 reframe + captions       │
                         │  publish-worker  (Node)  YouTube / Instagram / Facebook APIs  │
                         └───────────────────────────────┬──────────────────────────────┘
                                                         ▼
                                           Cloudflare R2 (temp media, TTL cleanup)
```

Why a separate worker host: Vercel functions have execution-time and binary limits — ffmpeg, Whisper and long-running stream capture can't run there.

### Stack
| Layer | Choice |
|---|---|
| Frontend | Vite, React 19, TypeScript, Tailwind v4, shadcn/ui, Framer Motion, TanStack Query, React Router |
| API | Hono (deployed as Vercel Functions), Zod validation |
| DB / Auth | Supabase Postgres + Supabase Auth (email, Google), Row Level Security |
| Queue | BullMQ on Upstash Redis |
| Media | ffmpeg, streamlink, yt-dlp, faster-whisper, MediaPipe face detection, PySceneDetect |
| Storage | Cloudflare R2 (cheap egress), lifecycle rule deletes media after N days |
| Payments | Paystack (one-time charge for day pass, Subscriptions/Plans for monthly) |
| Email | Resend |
| Monitoring | Sentry, Vercel Analytics, worker health dashboard |

---

## 2. Data model (initial)

- `profiles` — user, plan, credits_balance, currency, country
- `workspaces` / `workspace_members` — agency multi-client, seats
- `targets` — creator to watch (platform, channel_id, handle, active)
- `streams` — detected live sessions/uploads (target_id, status, started_at, viewer_count)
- `moments` — scored candidates (stream_id, start/end, score, signals json)
- `clips` — rendered output (moment_id, r2_key, caption_template, status, duration)
- `social_accounts` — connected YouTube/IG/FB (encrypted tokens, scopes, expiry)
- `publications` — clip × account × scheduled_at, status, platform_post_id
- `clip_metrics` — views/likes/shares pulled back from platforms
- `subscriptions` / `payments` / `credit_ledger` — Paystack refs, credit grants & spends
- `templates` — brand caption styles, fonts, colors, watermark (optional)

---

## 3. Phases

### Phase 0 — Foundation (week 1)
- Repo setup: npm workspaces monorepo → `apps/web` ✅, `apps/api`, `workers/node`, `workers/py`, `packages/shared`
- Brand: name, logo, color tokens (dark UI, single accent), type scale, component library ✅ (`apps/web/src/index.css`, `src/lib/brand.ts`)
- Supabase project, migrations, RLS policies; Vercel project; R2 bucket; Upstash
- CI: lint, typecheck, tests, preview deploys

### Phase 1 — Marketing site (week 1–2)
Pages: Home, Features, How it works, Pricing, For clippers, For creators, For agencies, Guide (clipping 101), Resources kit, About, Contact, Privacy, Terms, Copyright/DMCA, Login, Signup.
Home sections: hero → 5-step flow → supported platforms → live-now grid → features grid → "for clippers" outcomes → pricing → FAQ → CTA → footer.
- Original copy written for our brand
- Geo-based price display (NGN/GHS/USD)
- SEO meta, OG images, sitemap, responsive at phone width

### Phase 2 — Accounts, app shell, billing (week 2–3)
- Supabase auth (email + Google), onboarding flow
- Dashboard layout: Targets, Live, Clips, Schedule, Accounts, Analytics, Billing, Settings
- Paystack: day pass (one-time, 24h access), monthly plans (Launch / Creator / Pro / Agency style tiers), webhooks → credit ledger
- Plan limits enforcement (targets, credits, seats, social connections)

### Phase 3 — Targets & live monitoring (week 3–4)
- Add creator by URL/handle → resolve channel IDs
- Twitch Helix API (+ EventSub `stream.online`), YouTube Data API (search live / PubSubHubbub for uploads), Kick (unofficial — flag as beta)
- Live status + viewer counts in real time (Supabase Realtime)
- Public "live now" grid on the marketing site, embedded players

### Phase 4 — Clip pipeline (week 4–8) — the core
1. **Ingest:** streamlink rolling buffer for live; yt-dlp for VODs/uploads → R2
2. **Signals:** Twitch chat via IRC (messages/sec, emote bursts), audio loudness/laughter peaks, Whisper transcript with hook-phrase scoring
3. **Scoring:** weighted viral score → top N moments per stream; dedupe & min gap
4. **Render:** cut with padding, 9:16 reframe with face/speaker tracking (MediaPipe + smoothing), quality checks (black frames, silence)
5. **Captions:** word-level timestamps → animated ASS subtitles burned by ffmpeg; template presets
6. **Review queue:** approve/trim/re-caption in UI, or auto-approve per target
- Credits deducted per rendered clip

### Phase 5 — Social publishing (week 6–9, start app reviews in week 1!)
- OAuth: Google (YouTube Data API upload scope), Meta (Instagram Graph API content publishing + Facebook Pages)
- Scheduler with "best time" heuristics, per-platform caption/hashtags
- Retry, token refresh, rate-limit handling
- TikTok: "coming soon" until Content Posting API approval

### Phase 6 — Analytics & agency (week 9–11)
- Pull metrics from platforms → per creator / template / hook performance
- Multi-client workspaces, seats & roles, bulk scheduling

### Phase 7 — Hardening & launch (week 11–12)
- Load test workers, autoscaling, cost dashboard (compute per clip vs. credit price)
- Legal pages, DMCA process, creator opt-out list
- Beta → launch

---

## 4. Critical-path risks

| Risk | Mitigation |
|---|---|
| Meta & Google app review takes weeks | Submit for review in Phase 0 with demo video; build publishing behind feature flag |
| Clipping third-party content (copyright / ToS) | Creator-permission model, opt-out list, DMCA flow, clear terms; position for clippers working with creators |
| Compute cost of 24/7 monitoring + Whisper | Only ingest when live, process chat signal first and transcribe only candidate windows; GPU on demand |
| Platform scraping fragility (Kick, yt-dlp) | Isolate per-platform adapters; mark non-official integrations beta |
| Paystack subscription edge cases | Idempotent webhooks, credit ledger as source of truth |

---

## 5. Accounts / keys needed from the owner
- Domain + brand name/logo
- Supabase, Vercel, Cloudflare (R2), Upstash, worker host account
- Paystack business account (live + test keys)
- Twitch developer app, Google Cloud project (YouTube Data API), Meta developer app
- Resend, Sentry

## 6. Status
- ✅ Brand chosen: SpikeCut
- ✅ Monorepo + design tokens + logo mark
- ✅ Homepage (hero, platforms, how it works, live now, features, audiences, pricing w/ NGN/GHS/USD, FAQ, CTA), /features, /how-it-works, /pricing
- ⏳ Remaining Phase 1 pages: for-clippers, for-creators, for-agencies, guide, kit, about, contact, privacy, terms, copyright (currently placeholders)
- ✅ Phase 2 code: Supabase auth (email/password, Google, reset), onboarding, dashboard shell, billing page,
  Paystack checkout/verify/cancel/webhook (Hono API → Vercel edge), credit buckets, plan-sync script,
  schema + RLS in `supabase/migrations/0001_accounts_billing.sql`
- ⏳ Phase 2 go-live: fill `apps/web/.env.local`, run migration, configure Supabase auth URLs, sync Paystack plans, test checkout
- ⏳ Owner: register domain, start Meta + Google app review
