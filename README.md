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
pnpm install
cp .env.example .env   # set DATABASE_URL
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script                | Description                          |
| --------------------- | ------------------------------------ |
| `pnpm dev`         | Start the dev server                 |
| `pnpm build`       | Production build (standalone output) |
| `pnpm start`       | Serve the production build           |
| `pnpm lint`        | Run ESLint                           |
| `pnpm db:generate` | Generate Drizzle migrations          |
| `pnpm db:seed`     | Apply migrations, seed the base catalogs and the demo clinic |
| `pnpm db:studio`   | Open Drizzle Studio                  |

### First-time database setup

```bash
pnpm db:seed   # migrations, base catalogs (597 foods, 5,632 exercises) and demo clinic
```

`db:seed` first runs the same `scripts/migrate.mjs` that the Docker `migrator`
service runs in production, so local matches deploy. Then it seeds the demo
clinic and its accounts.

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

The app builds to a standalone Node server. After `pnpm build`:

```bash
node .next/standalone/server.js
```

Remember to copy `.next/static` and `public/` alongside the standalone output
when deploying to a separate location. See the
[Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting).


### Database Setup

Make sure you have a PostgreSQL database set up in docker

```bash
docker run --name progresso -e POSTGRES_PASSWORD=progresso -e POSTGRES_USER=progresso -e POSTGRES_DB=progresso -p 5438:5432 -d postgres
```

## Before commit

Before commit run the skills:

- Shadcn improve: /improve
- impeccable audit: /impeccable audit
- /code-review
- /security-review

Run sometimes

```prompt
run a refinement check with /thermo-nuclear-code-quality-review and /improve-codebase-architecture
```
