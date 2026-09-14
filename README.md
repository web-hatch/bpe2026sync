# BARMM Election Results

This is a static GitHub Pages site that shows party-list totals calculated from
downloaded COMELEC election-return JSON files. It does not use Supabase.

## Build snapshot totals

Build the landing-page snapshot from locally downloaded election-return JSON
files:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-party-list-totals.ps1
```

The script reads `outputs/raw-er-json/` and creates the compact public file
`data/party-list-totals.json`. The raw download directory stays local and is
excluded from Git; publish only the generated totals file.

To rebuild automatically while downloading new JSON files, keep this watcher
open in a separate PowerShell window:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\watch-party-list-totals.ps1
```

It waits 15 seconds after the latest JSON change before rebuilding. Press
`Ctrl+C` to stop it.
