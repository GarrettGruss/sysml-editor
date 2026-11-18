# Contributing

This applies to people and to AI agents working in this repository.

## Deploy PRs

Every version of the app is delivered through one deploy PR.

A version is defined by what it gives users: a list of features or a list of fixes. It is not tied to the OpenSpec layout. One version can include several OpenSpec changes, part of one, or fixes that have no OpenSpec change at all.

The deploy PR's description lists the user-facing features and fixes in the version, and is kept up to date as work PRs are merged.

### Deploy PR title and description become the merge commit

The repository is set to use the pull request's title and description as the merge commit message. The deploy PR's title and description are therefore written as a [Conventional Commits](https://www.conventionalcommits.org/) message:

- **Title:** `<type>: release v<version>, <short summary>`, where the type is `feat` if the version adds a feature and `fix` if it only fixes defects; add `!` after the type for a breaking change (for example `feat!:`). Example: `feat: release v0.1.0, SysML v2 model tree, diagrams, editing and requirements`.
- **Description (above the marker):** the commit body. A short paragraph, then the user-facing features and fixes as plain bullet lists under `Features:` and `Fixes:`, then any footers (`BREAKING CHANGE: ...`, `Refs: #<pr>, ...`, `Closes #<issue>, ...`; see [Issue tracking](#issue-tracking)). When AI agents did the work, end with the trailer `Co-Authored-By: Claude <noreply@anthropic.com>` so the merge commit credits them. No headings, tables or images; it must read well in `git log`.
- **Marker:** everything else the reviewer needs (merged work PRs, assumptions, decisions needed, what no test verifies, known issues, how to test) goes below this line, on a line of its own:

  ```
  ---- DELETE BEFORE MERGING ----
  ```

  The reviewer deletes the marker and everything below it before merging, so only the commit message remains.

Keep the part above the marker up to date as work PRs are merged, like the rest of the description.

Work PRs follow the same convention for their titles (`feat(diagram): ...`, `fix(tree): ...`, `docs: ...`, `test: ...`), so the history of the deploy branch reads as a changelog.

1. **Start a version.** Create the milestone `v<version>` and assign the planned issues to it. Create the branch `deploy/v<version>` from `main` (for example `deploy/v0.1.0`) and open a pull request from it into `main`. This is the deploy PR. Keep it open until the version is ready.
2. **Do the work in work PRs.** Each piece of work gets its own branch, created from the deploy branch, and its own pull request that targets the deploy branch, not `main`, and names its issue.
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

## Issue tracking

Work is tracked in GitHub issues, Scrum style. The human maintainer is the product owner: they set priorities and decide what goes into a version.

- **Backlog.** Every piece of work is an issue: a feature, a defect, a test or a documentation task. Open issues with no milestone form the product backlog, ordered by priority label.
- **Sprints are versions.** Each version has a milestone named `v<version>`, matching its deploy branch and deploy PR. Sprint planning assigns backlog issues to the milestone; the milestone's issues are the version's scope. Issues that do not finish move to the next milestone or back to the backlog.
- **Board.** A GitHub Project board shows the sprint with the columns Backlog, Ready, In progress, In review and Done.
- **Labels:**
  - type: `feature`, `bug`, `test`, `docs`, `chore`;
  - priority: `P1` (this sprint), `P2` (next), `P3` (later);
  - size estimate: `size:S`, `size:M`, `size:L`. Split anything larger than L.

### Writing an issue

- **Title:** a Conventional Commits style summary, such as `feat(diagram): align and distribute selected nodes`.
- **Body:** a user story ("As a <role>, I want <capability>, so that <benefit>") or, for a defect, the steps to reproduce, expected and actual result. Then the acceptance criteria as a checklist, and links to the OpenSpec change, acceptance scenarios or related issues.
- **Ready** when it has acceptance criteria, a type, priority and size label, and no open question for the product owner.
- **Done** when its acceptance criteria are met, its work PR is merged into the deploy branch with checks passing, and the version is merged into `main`.

### Linking issues and pull requests

- A work PR names its issue in the description: `Refs #<issue>`. GitHub closes issues only from merges into `main`, so a work PR into a deploy branch cannot close one.
- The deploy PR's commit body ends with a footer `Closes #<issue>, #<issue>, ...` listing every issue the version completes, so merging it into `main` closes them.
- While working, comment on the issue with progress, decisions needed and blockers, and move its card on the board.

### Who may do what with issues

| Action | Agents | Humans |
|---|---|---|
| Create issues, add labels, comment, move cards | Yes | Yes |
| Propose priority, size and milestone | Yes | Yes |
| Decide priority and which issues are in a version | No | Yes |
| Close an issue as won't do or duplicate | No, propose it in a comment | Yes |

## Planning

Planned work lives in `openspec/changes/`. An OpenSpec change usually has one issue that tracks it; a large change can have one issue per task group. See `CLAUDE.md` for the order of the changes and the architecture rules. OpenSpec changes organise the planning; versions organise what ships. A work PR says which OpenSpec change and tasks it implements, if any.

### Local integration runs

`npm run test:integration` takes a machine-wide lock (a file in the temp directory), so a second run waits until the first finishes instead of starting another VS Code. Several at once exhausted memory on a 7 GB WSL machine. Set `SYSML_TEST_NO_LOCK=1` to skip the lock.
