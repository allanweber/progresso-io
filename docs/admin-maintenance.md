# Admin — data maintenance

`/admin/maintenance` (sidebar "Manutenção", admin-only) is a tabbed page for
platform data operations. Today it has one tab: **Anamneses**.

## Anamneses tab

A cross-clinic view of every clinic's anamneses — **table on desktop, cards on
mobile** — with columns Clínica · Anamnese (objetivo/modalidade) · **Origem** ·
atualizada · Excluir. Filters: clinic, origin (Sistema/Clínica), name search.

### Provenance (Origem)

Driven by `anamnesis.source_key` (see `docs/anamneses.md`): non-null ⇒
**Sistema** (seeded/imported from the starter set), null ⇒ **Clínica**
(coach-authored). Existing rows from before this feature have no `source_key`,
so they read as Clínica until re-imported.

### Hard delete

Any anamnese can be permanently deleted (cross-tenant). The confirm dialog names
the anamnese + clinic and shows how many students were assigned from it —
**their filled snapshots are preserved**; only `student_anamnesis.source_anamnesis_id`
is nulled (FK `ON DELETE SET NULL`).

### Import system starters

"Importar starters" opens a dialog: pick a **target clinic** + select some/all
of the system starters, Import. **Idempotent by `source_key`** — starters the
clinic already has are skipped; the result reports "N importada(s), M já
existiam". Imported rows use the current starter JSON (masks/keys), with
`coach_id = clinic.owner`. This UI replaces the old one-time backfill migration.

## Layers

- **DAL** (`src/server/dal/admin.ts`, cross-tenant): `listAnamnesesAcrossClinics`,
  `hardDeleteAnamnesis`, `importStartersToClinic`.
- **API** (admin-only via `getAdminSession`): `GET /api/admin/anamneses`,
  `DELETE /api/admin/anamneses/[id]`, `POST /api/admin/anamneses/import`,
  `GET /api/admin/anamneses/starters`; clinic list from `GET /api/admin/clinics`.
