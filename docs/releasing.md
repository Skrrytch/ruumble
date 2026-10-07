# Releasing a new version

How to publish a new Ruumble version on GitHub. Written so that a developer can follow it by hand and an AI assistant can follow it step by step: every step has the exact command, what it changes and how to check it worked.

## In short

```sh
# on main, working tree clean, CHANGELOG.md has entries under ## [Unreleased]
tools/release.sh 0.29.0            # bumps versions, image tags, changelog; runs checks; commits "Release 0.29.0"
git push origin main               # then wait until CI on main is green
git tag v0.29.0
git push origin v0.29.0            # starts .github/workflows/release.yml, which publishes everything
```

Nothing else. **The GitHub release and the Docker image are made only by the workflow.** Never create a release with `gh release create` or the GitHub web UI, and never push an image by hand.

## What a release is

A release is a git tag `v<version>` on a commit of `main`. Pushing the tag starts the GitHub Actions workflow **Release** (`.github/workflows/release.yml`). It:

1. runs CI again (lint, tests, build, browser tests, plugin),
2. checks that the versions agree (see [What the workflow checks](#what-the-workflow-checks)),
3. builds and pushes the Docker image `ghcr.io/skrrytch/ruumble` with the tags `<version>`, `<major>.<minor>` and `latest` (linux/amd64 and linux/arm64),
4. creates the GitHub release titled `Ruumble <version>` with these assets: the plugin bundle `ruumble-<plugin version>.mumble_plugin`, both Compose templates, `ruumble-icons.zip`, `THIRD_PARTY_NOTICES.md`, `SHA256SUMS`. The release notes are the version's section of `CHANGELOG.md` plus install notes.

Servers that update automatically (e.g. Watchtower on `latest` or `<major>.<minor>`) only see a new version once step 3 has run. A GitHub release without the image updates nobody.

## Versions

| What | Where | Changed by |
|---|---|---|
| Service and web UI (one shared version) | `bridge/package.json`, `web/package.json` | `tools/release.sh` |
| Image tag in templates and docs | `deploy/compose/ruumble.docker-compose.yml`, `deploy/compose/mumble-with-ruumble.docker-compose.yml`, `docs/operations.md`, `docs/operations/maintenance.md` | `tools/release.sh` |
| Changelog section `## [<version>] - <date>` and its link reference | `CHANGELOG.md` | `tools/release.sh` |
| Plugin | `plugin/CMakeLists.txt`, `project(ruumble_plugin VERSION x.y.z)` | by hand, only when the plugin changed |

Do not edit the service/web version or the image tags by hand. Doing only part of it (e.g. the two `package.json` files) makes the workflow fail after the tag is pushed.

Choosing the number ([Semantic Versioning](https://semver.org/)): patch (`0.28.1 → 0.28.2`) for fixes and small behaviour changes, minor (`0.28.2 → 0.29.0`) for new features. Anything an operator has to do when updating (new env var, migration, new Mumble permission) goes into the changelog section.

## During development

Every user-visible change adds a line to `CHANGELOG.md` under `## [Unreleased]`, in the existing style (`### Added` / `### Changed` / `### Fixed`, a bold short title, then one or two sentences). Do **not** create a `## [<version>]` section yourself and do not bump versions in feature commits; `tools/release.sh` refuses to run if the section already exists.

If the plugin changed, the line above the subsections names the new plugin version, e.g. `Plugin 0.6.0.` or `Plugin 0.5.0 (unchanged).` (see earlier sections). `tools/release.sh` does not write this line; add it under `## [Unreleased]` before releasing.

## Step by step

### 1. Prepare

```sh
git switch main
git pull --ff-only
git status --porcelain              # must print nothing
```

Check `CHANGELOG.md`: `## [Unreleased]` has entries for everything since the last release (compare with `git log v<last version>..HEAD --oneline`). If the plugin changed, set its new version in `plugin/CMakeLists.txt`, build and test it (see [development.md](development.md#build-and-test)) and commit that first.

### 2. Run the release script

```sh
tools/release.sh <version>          # e.g. tools/release.sh 0.29.0, without "v"
```

It stops with `release: ...` if main is not checked out, the tree is dirty, the tag or changelog section already exists, or `[Unreleased]` is empty. Otherwise it changes the seven files from the table above, runs `pnpm lint && pnpm test && pnpm build` (several minutes) and commits `Release <version>`.

Check the commit:

```sh
git show --stat HEAD
```

Expected: subject `Release <version>`, and exactly these files changed: `CHANGELOG.md`, `bridge/package.json`, `web/package.json`, the two Compose templates, `docs/operations.md`, `docs/operations/maintenance.md`.

### 3. Push to main and wait for CI

```sh
git push origin main
gh run list -w CI -b main -L 1      # find the run for the release commit
gh run watch <run id> --exit-status
```

Only continue when CI is green. If it fails, fix on `main` with a normal commit and wait again; the version stays the same because nothing is tagged yet.

### 4. Optional: dry run

```sh
gh workflow run release.yml --ref main
```

It runs the whole workflow without publishing: builds the image for both platforms and uploads the assets and notes as a workflow artifact `release-dryrun`. Worth doing when the Dockerfile, the plugin build or the workflow changed.

### 5. Tag and push the tag

```sh
git tag v<version>
git push origin v<version>
```

A lightweight tag on the release commit, named with a leading `v`. This is the moment of publishing.

### 6. Check the result

```sh
gh run list -w Release -L 1                       # must end with "success"
gh release view v<version>                        # title "Ruumble <version>", assets listed
docker buildx imagetools inspect ghcr.io/skrrytch/ruumble:<version>
```

Expected: the Release run succeeded (about 5–10 minutes), the release is titled `Ruumble <version>` and has the assets listed above, and the image exists for `linux/amd64` and `linux/arm64`. `ghcr.io/skrrytch/ruumble:latest` now points to the same digest.

## What the workflow checks

The job "Image and GitHub release", step "Check versions", stops with one of these errors:

| Error | Cause |
|---|---|
| `bridge (x) and web (y) versions differ` | Only one `package.json` was bumped. |
| `tag vX does not match the service version Y` | Tag pushed on the wrong commit, or the version was not bumped. |
| `CHANGELOG.md has no section for X` | No `## [X]` heading. |
| `<file> does not use the image tag X` | Image tag in that template or doc not updated. |

All four are avoided by using `tools/release.sh`.

## When the Release workflow failed after the tag was pushed

Then nothing was published: no image, no GitHub release. Do **not** create the release by hand to "finish" it; that gives a release without image and assets that automatic updates ignore.

1. Find the cause: `gh run view <run id> --log-failed`.
2. Fix it on `main` with a normal commit, run `pnpm lint && pnpm test && pnpm build`, push, wait for CI.
3. Move the tag to the fixed commit. If a GitHub release exists for the tag (e.g. created by hand), delete it first, because the workflow creates the release itself and fails if it exists:

   ```sh
   gh release delete v<version> --yes            # only if `gh release view v<version>` finds one
   git push origin :refs/tags/v<version>          # delete the remote tag
   git tag -f v<version>                          # move the local tag to HEAD
   git push origin v<version>
   ```

Moving the tag is fine here only because no image of this version was ever pushed. If the image exists already (the workflow got past the step "Build and push the image"), never move the tag; release the fix as the next patch version instead.

## Builds between releases

A build for one's own server that is not a release names its commit, so `/api/version` and the start log show exactly what runs:

```sh
docker build -f deploy/Dockerfile --build-arg BUILD_VERSION="$(git describe --tags --dirty | sed 's/^v//')" -t ruumble:<version> .
```

The plugin is x86_64 only (Linux and Windows), so the arm64 image serves the same bundle under `/download`.
