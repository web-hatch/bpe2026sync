# Supabase COMELEC ER Sync

This backend fetches official ER JSON directly from COMELEC using the request path and headers proven by `Save-ComelecErJsonFiles.ps1`. Raw ER files stay in the private `comelec-er-json` Storage bucket; they are not committed to GitHub.

## Deploy

1. Link this folder to the intended Supabase project, then run the database migration and deploy `sync-comelec-ers`.
2. Set the function secret `COMELEC_SYNC_SECRET` to a long random value.
3. Invoke the function once with `enable_schedule: true`. It securely saves the internal secret in Supabase Vault and creates the one-minute Cron job.

The first runs discover province, municipality, barangay, and precinct IDs in batches. Later runs recheck stored ER JSON files every 15 minutes, skip unchanged files by SHA-256 hash, and replace only changed files. Discovery is repeated after 24 hours.

Do not expose the service-role key or the sync secret in the GitHub Pages dashboard.
