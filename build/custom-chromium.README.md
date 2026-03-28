# Custom Chromium

This repository is the browser app repository, not the Chromium build repository.

Build your custom Chromium in the sibling project:

- `E:\0JHX\Project\xbrowser-chromium-build`

Then stage the produced zip or extracted folder into this app repository.

## Goal

Replace `Chrome for Testing` with your own Chromium build and stage it into `bin/chromium`.

## Stage Into XBrowseR

After your separate Chromium repo finishes building, stage the generated zip or extracted folder:

```powershell
npm run browser:stage -- --source <zip-or-dir> --version <version>
```

Example:

```powershell
npm run browser:stage -- --source ..\xbrowser-chromium-build\out\releases\xbrowser-chromium-147.0.0.0-ungoogled.1.zip --version 147.0.0.0-ungoogled.1
```

This does three things:
- Copies the browser files into `bin/chromium`
- Writes `bin/chromium/.browser-version.json`
- Writes `build/browser-source.json`

## Notes

- `Custom Chromium` removes the explicit CfT product marker, but it does not fix the current CDP leakage by itself.
- If you want Cloudflare-sensitive manual browsing, the next work item is splitting manual browsing from agent automation and reducing `Runtime.enable` / auto-attach usage.
