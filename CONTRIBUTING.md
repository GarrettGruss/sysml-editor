# Contributing

This applies to people and to AI agents working in this repository.

## Deploy PRs

Every version of the app is delivered through one deploy PR.

A version is defined by what it gives users: a list of features or a list of fixes. It is not tied to the OpenSpec layout. One version can include several OpenSpec changes, part of one, or fixes that have no OpenSpec change at all.

The deploy PR's description lists the user-facing features and fixes in the version, and is kept up to date as work PRs are merged.

1. **Start a version.** Create the branch `deploy/v<version>` from `main` (for example `deploy/v0.1.0`) and open a pull request from it into `main`. This is the deploy PR. Keep it open until the version is ready.
2. **Do the work in work PRs.** Each piece of work gets its own branch, created from the deploy branch, and its own pull request that targets the deploy branch, not `main`.
3. **Merge work PRs into the deploy branch.** Agents may open, close, and merge pull requests that target a deploy branch. A work PR should pass type checking and tests before it is merged.
4. **Human review.** A human reviews the deploy PR and merges it into `main`. This is the only way changes reach `main`.
5. **Tag the version.** After the deploy PR is merged, tag the merge commit on `main` as `v<version>` and push the tag.

## Who may do what

| Action | Agents | Humans |
|---|---|---|
| Open, close, and merge PRs into a deploy branch | Yes | Yes |
| Open the deploy PR | Yes | Yes |
| Merge the deploy PR into `main` | No | Yes |
| Push directly to `main` | No | No |
| Tag a version on `main` | After the human merge | Yes |

## Checks before merging a work PR

- `npm run typecheck`
- `npm test`
- `openspec validate <change> --strict` when planning files under `openspec/` changed

## Planning

Planned work lives in `openspec/changes/`. See `CLAUDE.md` for the order of the changes and the architecture rules. OpenSpec changes organise the planning; versions organise what ships. A work PR says which OpenSpec change and tasks it implements, if any.
