# Maskan HR — independent hosting

Arabic HR platform for the four companies, hosted on Vercel with a Supabase backend.

- `app/`: Next.js UI and HTTP-only Supabase session proxy.
- `backend/`: Supabase Edge Function, PostgreSQL compatibility adapter, and private HR schema.
- `public/`: company logo and the V38 export utility.

Required Vercel environment keys: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. No database password or service key is sent to Vercel or the browser. Edge Functions use their built-in database credentials.

Database tables are isolated in the non-exposed `hr` schema, with RLS enabled and all anon/authenticated table grants revoked. All data operations pass verified user authentication, active-session checks and HR membership/role/company/project permissions. Membership is provisioned separately; it is never granted to the first visitor.

Attachments are stored privately as database bytea, with SHA-256 verification and authorized downloads. Maximum attachment size is 4 MiB for the Vercel proxy. PostgreSQL transactions preserve atomic record/audit changes and serialize concurrent guarded updates.

`npm ci` then `npm run build`. Deploy `backend/index.ts` and its relative dependencies as the `maskan-hr` Edge Function. The function performs its own token and session verification. Do not make the private HR schema publicly accessible.

No employee records, attachments, credentials, runtime databases, or legacy passwords are included in this repository. The initial migration copied the current Site snapshot (232 employees, 347 records, 232 archive rows and 3 Excel files). Runtime data and attachments remaining solely on the user's V38 computer require its export utility; no unavailable files are fabricated.
