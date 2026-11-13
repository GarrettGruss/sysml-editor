# Contributing

This applies to people and to AI agents working in this repository.

## Deploy PRs

Every version of the app is delivered through one deploy PR.

A version is defined by what it gives users: a list of features or a list of fixes. It is not tied to the OpenSpec layout. One version can include several OpenSpec changes, part of one, or fixes that have no OpenSpec change at all.

The deploy PR's description lists the user-facing features and fixes in the version, and is kept up to date as work PRs are merged.

### Deploy PR title and description become the merge commit

The repository is set to use the pull request's title and description as the merge commit message. The deploy PR's title and description are therefore written as a [Conventional Commits](https://www.conventionalcommits.org/) message:

- **Title:** `<type>: release v<version>, <short summary>`, where the type is `feat` if the version adds a feature and `fix` if it only fixes defects; add `!` after the type for a breaking change (for example `feat!:`). Example: `feat: release v0.1.0, SysML v2 model tree, diagrams, editing and requirements`.
- **Description (above the marker):** the commit body. A short paragraph, then the user-facing features and fixes as plain bullet lists under `Features:` and `Fixes:`, then any footers (`BREAKING CHANGE: ...`, `Refs: #<pr>, ...`). No headings, tables or images; it must read well in `git log`.
- **Marker:** everything else the reviewer needs (merged work PRs, assumptions, decisions needed, what no test verifies, known issues, how to test) goes below this line, on a line of its own:

  ```
  ---- DELETE BEFORE MERGING ----
  ```

  The reviewer deletes the marker and everything below it before merging, so only the commit message remains.

Keep the part above the marker up to date as work PRs are merged, like the rest of the description.

Work PRs follow the same convention for their titles (`feat(diagram): ...`, `fix(tree): ...`, `docs: ...`, `test: ...`), so the history of the deploy branch reads as a changelog.

1. **Start a version.** Create the branch `deploy/v<version>` from `main` (for example `deploy/v0.1.0`) and open a pull request from it into `main`. This is the deploy PR. Keep it open until the version is ready.
2. **Do the work in work PRs.** Each piece of work gets its own branch, created from the deploy branch, and its own pull request that targets the deploy branch, not `main`.
3. **Merge work PRs into the deploy branch.** Agents may open, close, and merge pull requests that target a deploy branch. A work PR should pass type checking and tests before it is merged.
4. **Human review.** A human reviews the deploy PR, deletes everything from the `---- DELETE BEFORE MERGING ----` line down, and merges it into `main`. The PR title and remaining description become the merge commit message. This is the only way changes reach `main`.
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
