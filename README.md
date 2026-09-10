# Roomly
Thai internal meeting-room booking for three rooms (10 / 15 / 20 seats).

## Stack
React + TypeScript + Vite, Lucide icons, Vercel Node Functions, PostgreSQL (pg), Zod.
The PostgreSQL exclusion constraint is the authoritative concurrency guard; browser filtering is only presentation.

## Local development
```sh
npm ci
npm test
npm run build
npx vercel dev
```
Use `vercel dev` for same-origin API + UI. `npm run dev` runs only the Vite UI.
Copy .env.example to .env.local; never commit real credentials. Vercel CLI can pull project environment variables.

## Database / first administrator
1. Connect a dedicated PostgreSQL database to the Vercel project (Neon Free, Singapore).
2. Set DATABASE_URL and a cryptographically random SESSION_SECRET of at least 32 characters. APP_ORIGIN is optional; if unset POST requests must match their request host. Set it to the production HTTPS URL when available.
3. Load local environment with Node's `--env-file=.env.local`, then run `npm run migrate` (or `node --env-file=.env.local --import tsx scripts/migrate.ts`).
4. Set ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD in the process environment and run create-admin. Supply credentials privately, never as CLI arguments or repository content.
5. Admin must change the temporary password at first login and can create employee accounts in the app.
6. Redeploy after changing production variables.

## Validation
`npm test` covers validation, capacities, boundaries, intervals and password hashing.
For real PostgreSQL concurrency validation, set TEST_DATABASE_URL to an isolated test database and run `npx tsx tests/database.integration.ts`. The test uses and removes its own random schema. Never point this at production.
Production smoke must cover authentication, password change, ownership checks, concurrent conflicts, editing and cancellation. See REQUIREMENTS.md.

## Security and operation
- No self-signup or public booking records. Cookies are Secure, HttpOnly and SameSite=Strict.
- Server validates input and permissions; database prevents overlaps under concurrent requests.
- Parameterized SQL; salted scrypt password hashes; random opaque sessions, hashed in database.
- Login rate limits persist in PostgreSQL. Admin account creation is a one-off operator action.
- Session expiry 12h. Revoke sessions on password reset and account disable.
- No secrets or real employee data in source. Public repository contains application code only.
- Plan backups/retention in the database provider before organizational rollout. Audit events are retained until managed by the database owner.
- Schedule display polls every 30 seconds; final writes always validate against the database.
- Check current plan limits before expanding usage.

## References
- PostgreSQL range exclusion constraints: https://www.postgresql.org/docs/current/rangetypes.html
- Vercel integration CLI: https://vercel.com/docs/cli/integration
