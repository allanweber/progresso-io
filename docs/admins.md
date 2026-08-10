# Platform admins — invite, activate & remove

Platform admins (`role = "admin"`) work **across** clinics and belong to none
(`clinic_id IS NULL`). The very first admin is still seeded from the `ADMIN_EMAIL`
env var (see `docs/` on auth); every admin after that is created in-app from the
**Admins** page (`/admin/admins`, admin-only).

## Invite → activate (mirrors the student flow)

There is no "create user" button — an admin is **invited by e-mail** and sets
their own password, exactly like a student activating their aluno login:

1. An admin opens **Convidar admin** and enters a **name + e-mail**. The API
   (`POST /api/admin/admins`) rejects an e-mail that already belongs to any user
   or to a pending invite (admin creation is for brand-new accounts only — no
   promoting existing coaches/alunos), then stores a row in `admin_invitation`
   and e-mails the set-password link. **No user row exists yet.**
2. The invitee opens `/admin-invite/accept?token=…` and chooses a password. Only
   then is the user created: `POST /api/admin-invitations/accept` signs them up,
   promotes them to `role = "admin"` with `clinic_id = NULL`, drops the throwaway
   clinic sign-up created, and marks the invite accepted. It never signs them in
   — they're sent to `/login`.

Until step 2, the invite shows as **Pendente** in the list; after it, the person
shows as **Ativo**. Pending invites can be **resent** (fresh token, supersedes
the old one) or **revoked** (deletes the pending row — no user existed).

The `admin_invitation` table parallels the student `invitation` but is tied to
**no clinic and no student** — it carries only the invitee's name + e-mail. The
raw token is only in the e-mailed link; the DB stores its SHA-256 hash. TTL is 7
days; one live invite per e-mail (previous unaccepted ones are superseded).

## Remove (permanent) + guard rails

Removing an admin is a **hard delete** of the user row (a hand-rolled Drizzle
delete in the admin DAL, scoped to `role = "admin"` so it can never hit a coach
or aluno). Their `session` and `account` rows cascade away; an admin owns no
clinic or clinic-scoped data, so nothing else is touched.

Three guards block a delete (enforced in the route **and** mirrored by disabling
the button in the UI):

- **You can't delete yourself** — no removing your own access mid-session.
- **You can't delete the bootstrap admin** — the `ADMIN_EMAIL` account is an
  immovable break-glass login.
- **You can't delete the last admin** — the platform always keeps ≥ 1.

## API

- `GET  /api/admin/admins` — activated admins + pending invites (each admin row
  tagged `isSelf` / `isBootstrap` so the UI can lock its delete).
- `POST /api/admin/admins` — invite a new admin (name + e-mail).
- `DELETE /api/admin/admins/[id]` — hard-delete an activated admin (guards above).
- `POST /api/admin/admin-invitations/[id]/resend` — resend a pending invite.
- `DELETE /api/admin/admin-invitations/[id]` — revoke a pending invite.
- `GET/POST /api/admin-invitations/accept` — public: validate the token / set the
  password and activate.

All `/api/admin/*` routes gate on `getAdminSession()`; the accept endpoints are
public (the token is the credential), like the student invite-accept.

## Clinic manager (hard-delete a tenant)

The admin **Manutenção** page has a **Clínicas** tab listing every clinic with its
owner and coach/student counts. An admin can **hard-delete** a clinic — the whole
tenant. `admin.hardDeleteClinic` runs in one transaction: deleting the `clinic`
row cascades every clinic-scoped table (students, invitations, diets, workouts,
anamneses, the clinic's own foods/exercises + rules, notifications) via their
`clinic_id` FKs, then its user accounts (coaches + activated alunos) are removed,
cascading their sessions + accounts. Platform admins have no clinic, so this can
never touch one. It's irreversible, so the UI requires **typing the clinic name**
to confirm. `GET /api/admin/clinics` returns the enriched list (the other admin
screens' clinic filters read just id+name off it); `DELETE /api/admin/clinics/[id]`
performs the delete.

## DAL

- `src/server/dal/admin-invitations.ts` — `createAdminInvitation` (supersede),
  `findPendingByToken`, `hasPendingInvite`, `listPendingInvites`,
  `getPendingInvite`, `markAccepted`, `revokeInvite`.
- `src/server/dal/admin.ts` — `listAdmins`, `countAdmins`, `getUserById`,
  `getUserByEmail`, `deleteAdminUser` (role-scoped hard delete).

## UI

- **Admins** sidebar item (`/admin/admins`, admin nav only) and a card on the
  `/admin` landing. The page (a client component) lists active admins + pending
  invites in one table with an **Ativo** / **Pendente** badge and a "(você)"
  marker on your own row; **Convidar admin** opens a TanStack Form dialog; row
  actions are Excluir (active, with a confirm dialog) and Reenviar / Revogar
  (pending). The set-password screen is the shared `InviteAcceptForm` with
  `kind="admin"`.
