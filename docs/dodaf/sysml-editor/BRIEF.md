# Operational brief: SysML Editor (DoDAF 2.02 pilot, issue #108)

Legend: **[doc]** stated in the repo documents (README, docs/agents.md, docs/trade-study.md, CONTRIBUTING.md, package.json, CLAUDE.md); **[code]** read from the source layout; **[inferred]** my reading, for the product owner to confirm.

## 1. Mission and vision (AV-1 input)
- Mission [doc]: provide a graphical, model-aware editor for SysML v2 inside VS Code, where the SysML text is the single source of truth and graphical editors never disagree with it.
- Vision [doc/inferred]: AI-native systems modeling: an agent and a human edit the same model, diagrams and requirements through one set of tools; architecture documents (DoDAF 2.02) are generated from the model.
- Scope [doc]: VS Code only, no standalone mode. Current version 0.4.0 in package.json; 0.5.0 adds DoDAF generation.
- Architecture description purpose [inferred]: demonstrate the DoDAF generator on the product itself and expose tooling gaps.

## 2. Capabilities (CV-1, CV-2) [inferred names, grounded in README/agents.md]
| Capability | Basis |
|---|---|
| Model SysML v2 textually and structurally (parse, index, browse) | [doc] Model view, parser |
| Edit the model safely (minimal text edits, rename, delete, auto-save) | [doc] |
| Draw and edit diagrams (General, Interconnection, Requirements, Action Flow, State, Sequence) | [doc] |
| Author and review requirements (table, document, verification matrix) | [doc] |
| Expose the model to AI agents (MCP, language model tools, skills) | [doc] |
| Drive and test the UI by agent | [doc] sysml_ui_* tools |
| Generate architecture documents (DoDAF 2.02) | [doc] sysml_dodaf_generate |
CV-2 (taxonomy): the capabilities specialise into Modeling, Visualization, Requirements Management, Agent Integration, Documentation. Dependencies [inferred]: Visualization, Requirements, Agent Integration and Documentation all depend on Modeling; Documentation also depends on Visualization.

## 3. Operational performers (OV-2/OV-4) [inferred roles]
- Systems engineer: authors the model and diagrams in VS Code.
- AI agent (e.g. Claude Code): reads and edits the model, diagrams and requirements via MCP; generates documents.
- Reviewer: reads diagrams, requirements documents, the verification matrix and the generated DoDAF document; comments.
- Maintainer / developer: builds, releases, merges PRs (CONTRIBUTING.md) [doc].
- Product owner: sets scope and reviews briefs [doc/inferred].
- External: VS Code platform, MCP host (agent client).

## 4. Organizations (OV-4) [inferred]
- Project team: product owner (human), maintainers; humans alone merge the deploy PR into main [doc].
- Agent team: lead orchestrator, implementation, review agents (CLAUDE.md roles) [doc].
- Customer organizations: engineering teams using the editor [inferred].
- Platform providers: Microsoft (VS Code), Anthropic/MCP community, OMG (SysML v2 standard) [inferred].
Relationships: product owner directs maintainers and agents; reviewers belong to customer or project teams.

## 5. Operational activities (OV-5a/b) [inferred decomposition]
Top: **Develop System Architecture Models**
1. Model the system: create/rename/delete/modify elements; connect and satisfy.
2. Diagram the model: create diagram, add/remove elements, lay out, save.
3. Manage requirements: create requirements, relate (satisfy/verify/derive), read verification matrix.
4. Review the architecture: inspect model tree, validate, view diagrams and documents.
5. Generate documents: plan and generate DoDAF views.
6. Maintain the tool (outside the operational scope unless the owner wants it): build, test, release.
OV-5b flow (Model, Diagram) -> Review; Model -> Manage requirements -> Review; Model -> Generate documents -> Review; Review -> Model (feedback loop).

## 6. Key operational exchanges (OV-2) [inferred]
- Systems engineer -> AI agent: modeling request (information: intent).
- AI agent -> Systems engineer: proposed/applied model and diagram changes.
- AI agent -> Reviewer: generated architecture document.
- Systems engineer <-> Reviewer: model/diagram for review, review findings.
- Maintainer -> Systems engineer/agent: new release (extension, CLI, skills).
- Product owner -> Maintainer/agent: scope, operational brief.

## 7. Operational event trace (OV-6c) [inferred]
Scenario "Agent-assisted architecture authoring": Systems engineer requests a model change -> AI agent edits model -> AI agent creates and lays out diagram -> Systems engineer reviews the diagram, requests a correction -> AI agent corrects -> AI agent generates the document -> Reviewer reads the document and returns findings.

## 8. Standards (StdV-1) [doc unless noted]
SysML v2 (OMG), KerML (OMG), SysML v2 standard library/ release fixtures, MCP (Model Context Protocol), VS Code Extension API (^1.106), DoDAF 2.02, ANTLR4 grammar (vendored, parser), Language Model Tools API (VS Code), ELK (elkjs layout), Node 22 LTS, Markdown (documents), PNG/SVG output, UAF (metadata library referenced by the generator [doc: issue]).

## 9. System side (from code; to be refined in modeling) [code]
- Systems/components: Extension Host (src/extension.ts, agent-integration), Parser (src/parser, parse-worker), Model Index/Service (src/model, model-service), Edit Planner (src/edit), Diagram Webview (src/diagram, webview), Requirements Webview (src/requirements), Model Tree View (src/tree), MCP Server and MCP Bridge (src/mcp, mcp-bridge), Agent Tool Handlers (src/agent-tools), DoDAF Generator (src/dodaf), CLI (cli/).
- Functions: parse, index, plan edits, render/lay out diagrams, validate, serve agent tools, generate DoDAF, install skills.
- Data: `.sysml` text, `.sysmld` diagram files, model index, agent tool messages (JSON over MCP), generated Markdown/SVG/PNG, DoDAF metadata library.
- System event trace (SV-10c): Agent -> MCP bridge -> Extension host (MCP server) -> Tool handler -> Edit planner -> `.sysml` saved -> Model index updated -> Diagram webview refresh -> result returned to agent.
- Constraints [doc]: parser, index, planner, serialization, tool handlers are vscode-free; webviews talk only by postMessage.

## 10. Questions for the product owner
1. Is "capability" meant at the product level (as in section 2) or should it follow user-visible features per release?
2. Confirm the performer list; is a separate "customer organization" in scope or only the project team?
3. Should operational activities include maintaining/releasing the tool, or only using it?
4. Is the OV-6c scenario right, or prefer a review-and-approve scenario?
5. Which StdV-1 entries are mandatory vs emerging (e.g. UAF, MCP version)?
6. Should the system model include the CLI and installer as systems?
7. Any security/classification or AV-1 metadata (author, dates, scope statement) to use?
