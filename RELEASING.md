# Releasing

Releases are fully automated. Bump the version, push to main, and CI does the rest.

## Cutting a release

```bash
npm version patch   # or minor / major
git commit -m "release: 1.0.4"
git push
```

## What happens automatically

1. `npm version patch` bumps `package.json`. The `version` script runs `version-bump.mjs`, which:
   - syncs `manifest.json` to the new version
   - adds an entry to `versions.json` mapping the new version to the current `minAppVersion`
   - stages both files

   `.npmrc` sets `git-tag-version=false`, so npm does not create its own commit or tag. Commit and push normally.

2. Pushing to `main` triggers `.github/workflows/release.yml` (it watches `manifest.json`). The workflow:
   - reads the version from `manifest.json`
   - skips everything if a release for that version already exists
   - builds `main.js` in CI (`npm ci && npm run build`)
   - generates GitHub artifact attestations for `main.js` and `styles.css`
   - creates the git tag
   - publishes a GitHub release with `main.js`, `manifest.json`, and `styles.css` attached

These three assets are exactly what Obsidian's community plugin catalog requires. Never upload files by hand.

## Notes

- **Releases publish immediately.** To review before going live, add `--draft` to the `gh release create` line in the workflow, then publish from the GitHub UI.
- **Failed runs are safe to retry.** Every step is idempotent. Re-run from the Actions tab (the workflow also has a `workflow_dispatch` trigger).
- **Tags from CI are lightweight** and will not show GitHub's Verified badge. For a verified tag, sign and push it locally before pushing the version bump:

  ```bash
  git tag -s 1.0.4 -m "1.0.4"
  git push origin 1.0.4
  ```

  The workflow detects the existing tag and builds the release on top of it.
- **Changing `minAppVersion`?** Update it in `manifest.json` before running `npm version`, so the new `versions.json` entry picks it up.
