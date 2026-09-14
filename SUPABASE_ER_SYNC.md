# Supabase COMELEC ER Sync

This backend fetches official ER JSON directly from COMELEC using the request path and headers proven by `Save-ComelecErJsonFiles.ps1`. Raw ER files stay in the private `comelec-er-json` Storage bucket; they are not committed to GitHub.

## Deploy

1. Link this folder to the intended Supabase project, then run the database migration and deploy `sync-comelec-ers`.
2. Set the function secret `COMELEC_SYNC_SECRET` to a long random value.
3. Store the project URL, publishable key, and the same sync secret in Supabase Vault.
4. Create a Supabase Cron job that POSTs to `sync-comelec-ers` every minute with `x-comelec-sync-secret` and a small JSON body such as `{"discovery_limit":8,"er_limit":25}`.

The first runs discover province, municipality, barangay, and precinct IDs in batches. Later runs recheck stored ER JSON files every 15 minutes, skip unchanged files by SHA-256 hash, and replace only changed files. Discovery is repeated after 24 hours.

Do not expose the service-role key or the sync secret in the GitHub Pages dashboard.
