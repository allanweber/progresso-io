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
| `pnpm db:migrate`  | Apply migrations                     |
| `pnpm db:bootstrap` | Apply migrations **and** seed the base food/exercise catalog |
| `pnpm db:seed`     | Seed the demo clinic (coach/aluno/admin accounts + data) |
| `pnpm db:push`     | Push schema directly — skips the catalog, see below |
| `pnpm db:studio`   | Open Drizzle Studio                  |

### First-time database setup

```bash
pnpm db:bootstrap   # migrations + base catalog (597 foods, 873 exercises)
pnpm db:seed        # demo clinic and accounts
```

`db:bootstrap` runs the same `scripts/migrate.mjs` the Docker `migrator` service
runs in production, so local matches deploy.

Prefer it over `pnpm db:push` for a fresh database. `push` diffs `schema.ts` and
emits its own DDL, so it silently skips everything that lives only in the
migration SQL — the `pg_trgm`/`unaccent` extensions and the `food_search_trgm` /
`exercise_search_trgm` GIN indexes. A pushed database looks complete but fails
every catalog search with `function unaccent(text) does not exist`.

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
