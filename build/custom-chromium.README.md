# Chromium Kernel

Default behavior:

- XBrowseR now uses official Chromium snapshots from the public Chromium snapshots bucket.
- Versions are identified by snapshot revision, for example `r1606646`.
- Downloaded kernels are stored under `data/browser-kernels/official/<revision>`.

## In-App Management

Use the sidebar `Chromium Kernel` section to:

- refresh recent official revisions
- download a revision
- activate an installed revision

## Optional Manual Import

If you still want to stage a local Chromium zip or extracted directory manually:

```powershell
npm run browser:stage -- --source <zip-or-dir> --version <version>
```

This copies the browser into `bin/chromium` and writes local metadata.

## Notes

- Switching away from `Chrome for Testing` removes the visible CfT product marker, but it does not fix the current CDP leakage by itself.
- If you want Cloudflare-sensitive manual browsing, the next work item is splitting manual browsing from agent automation and reducing `Runtime.enable` / auto-attach usage.
