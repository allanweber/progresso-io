# Progresso IO

SaaS platform for personal coaches in Brazil — student management, workouts,
diets, WhatsApp automation, check-ins and progress tracking. All UI copy is in
Brazilian Portuguese.

## Tech stack

- **Next.js (App Router)** — self-hosted via `output: "standalone"`
- **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** components
- **lucide-react** icons
- **Drizzle ORM** + PostgreSQL (`postgres` driver)

## Getting started

```bash
npm install
cp .env.example .env   # set DATABASE_URL
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script                | Description                          |
| --------------------- | ------------------------------------ |
| `npm run dev`         | Start the dev server                 |
| `npm run build`       | Production build (standalone output) |
| `npm run start`       | Serve the production build           |
| `npm run lint`        | Run ESLint                           |
| `npm run db:generate` | Generate Drizzle migrations          |
| `npm run db:migrate`  | Apply migrations                     |
| `npm run db:push`     | Push schema to the database directly |
| `npm run db:studio`   | Open Drizzle Studio                  |

## Project structure

```
src/
  app/                  # App Router routes, layout, global styles
  components/
    brand/              # Logo and brand elements
    landing/            # Landing page sections (composed in app/page.tsx)
    ui/                 # shadcn/ui primitives (button, card, badge)
  db/                   # Drizzle client + schema
  lib/                  # utils + content data (landing-content.ts)
```

## Self-hosting

The app builds to a standalone Node server. After `npm run build`:

```bash
node .next/standalone/server.js
```

Remember to copy `.next/static` and `public/` alongside the standalone output
when deploying to a separate location. See the
[Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting).
