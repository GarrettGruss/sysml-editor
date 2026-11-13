/**
 * What the requirements editor does with a request from its webview: every model change goes through `ModelService`.
 * Questions to the user and navigation are interfaces (`RequirementsUi`, `Navigation`), so this is testable without
 * VS Code. No `vscode`, no DOM.
 */
import type { Element, ModelIndex } from "../model/index.js";
import type { ModelService, OpResult } from "../model-service/service.js";
import { allowedChildKinds } from "../model-service/kinds.js";
import type { Intent } from "./protocol.js";
import { isRequirement, isVerificationCase } from "./relations.js";
import { unescapeTerminator } from "../edit/comment.js";
import { cellFieldKey } from "./protocol.js";
import { statementKey } from "./view-model.js";

export interface PickItem {
  /** What the controller gets back. */
  id: string;
  label: string;
  description?: string;
}

export interface RequirementsUi {
  confirm(message: string, detail: string, action: string): Promise<boolean>;
  pickOne(items: PickItem[], title: string): Promise<string | undefined>;
  pickMany(items: PickItem[], title: string): Promise<string[] | undefined>;
  /** An existing verification case, or the name of a new one (undefined: cancelled). */
  pickVerification(cases: PickItem[], title: string): Promise<{ existing: string } | { create: string } | undefined>;
  inputName(prompt: string): Promise<string | undefined>;
  /** Shown after an operation: the refusal, or the warnings of a success. */
  report(r: OpResult, what: string): void;
}

export interface Navigation {
  revealInTree(el: Element): void;
  goToText(el: Element): void;
  showInDiagram(el: Element): void;
}

export interface ControllerResult {
  ok: boolean;
  message?: string;
  /** The edit was not applied: the element's current text differs from the one the field was opened with. */
  conflict?: { fieldKey: string; current: string };
}

const isPkg = (e: Element) => e.kind === "package" || e.kind === "library package";
const done = (r: OpResult): ControllerResult => (r.ok ? { ok: true } : { ok: false, message: r.reason });
const cancelled: ControllerResult = { ok: true, message: "cancelled" };

export class RequirementsController {
  constructor(
    private readonly service: ModelService,
    private readonly index: ModelIndex,
    private readonly ui: RequirementsUi,
    private readonly nav: Navigation,
    /** The package of the editor's scope, for new requirements and sections. */
    private readonly scopeQn: () => string | undefined,
  ) {}

  private pkg(qn: string): Element | undefined {
    return this.index.findByQualifiedName(qn).find(isPkg);
  }

  /** A package, or a requirement that owns requirements (the document can be opened on either). */
  private container(qn: string): Element | undefined {
    return this.index.findByQualifiedName(qn).find((e) => isPkg(e) || isRequirement(e));
  }

  private requirement(qn: string): Element | undefined {
    return this.index.findByQualifiedName(qn).find(isRequirement);
  }

  /** A statement (satisfy, verify, derivation connection, doc, comment) by its key. */
  private byKey(key: string, pred: (e: Element) => boolean): Element | undefined {
    const hash = key.lastIndexOf("#");
    const uri = key.slice(0, hash);
    const offset = Number(key.slice(hash + 1));
    let found: Element | undefined;
    const walk = (e: Element) => {
      if (found) return;
      if (e.range.start.offset === offset && pred(e)) found = e;
      else e.members.forEach(walk);
    };
    this.index.getDocument(uri)?.model.roots.forEach(walk);
    return found;
  }

  /** The `doc` or `comment` that a paragraph key (see `paragraphKey`) names now. */
  private paragraph(key: string): Element | undefined {
    const uri = key.slice(0, key.indexOf("|"));
    const parts = key.slice(key.indexOf("|") + 1).split("|");
    const idx = Number(parts.pop());
    const kind = parts.pop();
    const ownerKey = parts.join("|");
    if (!Number.isInteger(idx) || (kind !== "doc" && kind !== "comment")) return undefined;
    const owners: Element[] = [];
    if (ownerKey.startsWith("@")) {
      const walk = (e: Element) => {
        if (e.range.start.offset === Number(ownerKey.slice(1))) owners.push(e);
        e.members.forEach(walk);
      };
      this.index.getDocument(uri)?.model.roots.forEach(walk);
    } else owners.push(...this.index.findByQualifiedName(ownerKey).filter((e) => e.uri === uri));
    for (const o of owners) {
      const el = o.members.filter((m) => m.kind === "doc" || m.kind === "comment")[idx];
      if (el?.kind === kind) return el;
    }
    return undefined;
  }

  private conflict(fieldKey: string, current: string): ControllerResult {
    return { ok: false, message: "This text was changed elsewhere since you started editing; nothing was applied.", conflict: { fieldKey, current } };
  }

  private async run(p: Promise<OpResult>, what: string): Promise<ControllerResult> {
    const r = await p;
    this.ui.report(r, what);
    return done(r);
  }

  private elementCandidates(): PickItem[] {
    const skip = new Set(["package", "library package", "import", "expose", "doc", "comment", "metadata", "alias", "satisfy", "verify", "connection", "connect", "end", "extended", "objective"]);
    const out: PickItem[] = [];
    const walk = (e: Element) => {
      if (e.qualifiedName !== undefined && e.name !== undefined && !skip.has(e.kind) && !isRequirement(e)) out.push({ id: e.qualifiedName, label: e.name, description: `${e.kind} - ${e.qualifiedName}` });
      if (out.length < 2000) e.members.forEach(walk);
    };
    for (const u of this.index.uris()) if (!this.index.isReadOnly(u)) this.index.getDocument(u)?.model.roots.forEach(walk);
    return out;
  }

  private requirementCandidates(except: Element): PickItem[] {
    const out: PickItem[] = [];
    const walk = (e: Element) => {
      if (isRequirement(e) && e !== except && e.qualifiedName !== undefined) out.push({ id: e.qualifiedName, label: [e.shortName, e.name].filter(Boolean).join(" "), description: e.qualifiedName });
      e.members.forEach(walk);
    };
    for (const u of this.index.uris()) if (!this.index.isReadOnly(u)) this.index.getDocument(u)?.model.roots.forEach(walk);
    return out;
  }

  private verificationCases(): PickItem[] {
    const out: PickItem[] = [];
    const walk = (e: Element) => {
      if (isVerificationCase(e) && e.qualifiedName !== undefined) out.push({ id: e.qualifiedName, label: e.name ?? e.qualifiedName, description: `${e.kind} - ${e.qualifiedName}` });
      e.members.forEach(walk);
    };
    for (const u of this.index.uris()) if (!this.index.isReadOnly(u)) this.index.getDocument(u)?.model.roots.forEach(walk);
    return out;
  }

  async handle(intent: Intent): Promise<ControllerResult> {
    await this.service.ready();
    const gone = (what: string): ControllerResult => ({ ok: false, message: `${what} no longer exists; the view was refreshed.` });
    switch (intent.type) {
      case "setCell": {
        const el = this.requirement(intent.qn);
        if (!el) return gone("The requirement");
        const props = intent.field === "id" ? { shortName: intent.value.trim() === "" ? null : intent.value.trim() } : intent.field === "name" ? { name: intent.value.trim() } : { documentation: intent.value.trim() === "" ? null : intent.value };
        const current = intent.field === "id" ? (el.shortName ?? "") : intent.field === "name" ? (el.name ?? "") : unescapeTerminator(el.documentation ?? "");
        if (current !== intent.expected) return this.conflict(cellFieldKey(intent.qn, intent.field), current);
        if (intent.field === "name" && intent.value.trim() === "") return { ok: false, message: "A requirement needs a name." };
        return this.run(this.service.setProperties({ element: el }, props), `Changed the ${intent.field === "id" ? "id" : intent.field} of ${intent.qn}`);
      }
      case "addRequirement": {
        const ownerQn = intent.ownerQn ?? this.scopeQn();
        const owner = ownerQn ? this.container(ownerQn) : undefined;
        if (!owner) return { ok: false, message: "Choose a package to add the requirement to." };
        const before = intent.beforeQn ? this.requirement(intent.beforeQn) : undefined;
        if (intent.beforeQn && (!before || before.owner?.qualifiedName !== owner.qualifiedName)) return gone("The requirement the new one goes above");
        if (!allowedChildKinds(owner).includes(intent.kind)) return { ok: false, message: `A requirement cannot be added to ${owner.kind} ${owner.name ?? ""}.` };
        if (intent.name.trim() === "") return { ok: false, message: "A requirement needs a name." };
        return this.run(this.service.createRequirement(owner, { definition: intent.kind === "requirement def", name: intent.name.trim(), ...(intent.id.trim() ? { id: intent.id.trim() } : {}), ...(before ? { before } : {}) }), `Added requirement ${intent.name}`);
      }
      case "deleteRequirement": {
        const el = this.requirement(intent.qn);
        if (!el) return gone("The requirement");
        if (!(await this.ui.confirm(`Delete requirement ${el.name ?? intent.qn}?`, "Its declaration and documentation are removed from the .sysml file. Satisfy, verify and derivation statements that mention it are not changed and will no longer resolve.", "Delete"))) return cancelled;
        return this.run(this.service.deleteElement({ element: el }), `Deleted ${intent.qn}`);
      }
      case "addSatisfy": {
        const req = this.requirement(intent.qn);
        if (!req) return gone("The requirement");
        const pick = await this.ui.pickOne(this.elementCandidates(), `Satisfy ${req.name ?? intent.qn} by...`);
        if (!pick) return cancelled;
        const by = this.index.findByQualifiedName(pick)[0];
        if (!by) return gone("The element");
        return this.run(this.service.satisfy(req, by), `${pick} satisfies ${intent.qn}`);
      }
      case "addVerify": {
        const req = this.requirement(intent.qn);
        if (!req) return gone("The requirement");
        const cases = this.verificationCases();
        let choice: { existing: string } | { create: string } | undefined;
        if (cases.length === 0) {
          const name = await this.ui.inputName("No verification case exists. Name the new verification case");
          choice = name ? { create: name } : undefined;
        } else choice = await this.ui.pickVerification(cases, `Verify ${req.name ?? intent.qn} in...`);
        if (!choice) return cancelled;
        if ("create" in choice) return this.run(this.service.verify(req, { create: choice.create }), `New verification case ${choice.create}`);
        const vc = this.index.findByQualifiedName(choice.existing).find(isVerificationCase);
        if (!vc) return gone("The verification case");
        return this.run(this.service.verify(req, vc), `${choice.existing} verifies ${intent.qn}`);
      }
      case "addDerivedFrom": {
        const req = this.requirement(intent.qn);
        if (!req) return gone("The requirement");
        const pick = await this.ui.pickOne(this.requirementCandidates(req), `${req.name ?? intent.qn} is derived from...`);
        if (!pick) return cancelled;
        const original = this.requirement(pick);
        if (!original) return gone("The requirement");
        return this.run(this.service.derive(original, [req]), `${intent.qn} derived from ${pick}`);
      }
      case "addDerives": {
        const req = this.requirement(intent.qn);
        if (!req) return gone("The requirement");
        const picks = await this.ui.pickMany(this.requirementCandidates(req), `Requirements derived from ${req.name ?? intent.qn}`);
        if (!picks?.length) return cancelled;
        const derived = picks.map((p) => this.requirement(p)).filter((x): x is Element => !!x);
        if (derived.length !== picks.length) return gone("A requirement");
        return this.run(this.service.derive(req, derived), `${picks.join(", ")} derived from ${intent.qn}`);
      }
      case "removeSatisfy": {
        const s = this.byKey(intent.key, (e) => e.kind === "satisfy");
        return s ? this.run(this.service.removeSatisfy(s), "Removed a satisfy relationship") : gone("The satisfy statement");
      }
      case "removeVerify": {
        const s = this.byKey(intent.key, (e) => e.kind === "verify");
        return s ? this.run(this.service.removeVerify(s), "Removed a verification") : gone("The verify statement");
      }
      case "removeDerivation": {
        const c = this.byKey(intent.connectionKey, (e) => e.kind === "connection");
        if (!c) return gone("The derivation");
        const derived = intent.derivedQn ? this.requirement(intent.derivedQn) : undefined;
        return this.run(this.service.removeDerivation(c, derived), "Removed a derivation");
      }
      case "navigate": {
        const el = this.index.findByQualifiedName(intent.qn)[0];
        if (!el) return gone("The element");
        if (intent.to === "tree") this.nav.revealInTree(el);
        else if (intent.to === "text") this.nav.goToText(el);
        else this.nav.showInDiagram(el);
        return { ok: true };
      }
      case "setHeading": {
        const p = this.container(intent.qn);
        if (!p) return gone("The section");
        if ((p.name ?? "") !== intent.expected) return this.conflict(cellFieldKey(intent.qn, "heading"), p.name ?? "");
        if (intent.value.trim() === "") return { ok: false, message: "A heading cannot be empty." };
        return this.run(this.service.setProperties({ element: p }, { name: intent.value.trim() }), `Renamed ${intent.qn}`);
      }
      case "setParagraph": {
        const c = this.paragraph(intent.key);
        if (c && unescapeTerminator(c.documentation ?? "") !== intent.expected) return this.conflict(intent.key, unescapeTerminator(c.documentation ?? ""));
        return c ? this.run(this.service.setParagraph(c, intent.value), "Changed a paragraph") : gone("The paragraph");
      }
      case "addSection": {
        const parent = this.pkg(intent.parentQn);
        if (!parent) return gone("The package");
        const after = intent.afterQn ? this.pkg(intent.afterQn) : undefined;
        const beforeSection = intent.beforeQn ? this.pkg(intent.beforeQn) : undefined;
        if (intent.beforeQn && (!beforeSection || beforeSection.owner?.qualifiedName !== parent.qualifiedName)) return gone("The section the new one goes above");
        if (intent.name.trim() === "") return { ok: false, message: "A heading cannot be empty." };
        return this.run(this.service.addSection(parent, intent.name, { ...(intent.appendix ? { appendix: true } : {}), ...(after ? { after } : {}), ...(beforeSection ? { before: beforeSection } : {}) }), `Added ${intent.appendix ? "appendix" : "section"} ${intent.name}`);
      }
      case "addParagraph": {
        const p = this.pkg(intent.pkgQn);
        if (!p) return gone("The section");
        return this.run(this.service.addParagraph(p, intent.text), "Added a paragraph");
      }
      case "moveSection": {
        const el = this.pkg(intent.qn);
        if (!el?.owner) return gone("The section");
        const siblings = el.owner.members.filter(isPkg);
        const kindOf = (e: Element) => e.members.some((m) => m.kind === "metadata" && (this.index.getDocument(m.uri)?.text.slice(m.range.start.offset, m.range.end.offset) ?? "").startsWith("@Appendix"));
        const group = !el.owner.owner ? siblings.filter((s) => kindOf(s) === kindOf(el)) : siblings;
        const at = group.indexOf(el);
        let to: { before: Element } | { after: Element } | undefined;
        if (intent.how === "up") to = at > 0 ? { before: group[at - 1]! } : undefined;
        else if (intent.how === "down") to = at >= 0 && at < group.length - 1 ? { after: group[at + 1]! } : undefined;
        else {
          const target = this.pkg("beforeQn" in intent.how ? intent.how.beforeQn : intent.how.afterQn);
          if (!target) return gone("The target section");
          if (target.owner !== el.owner) return { ok: false, message: "Sections can be reordered within their parent section." };
          to = "beforeQn" in intent.how ? { before: target } : { after: target };
        }
        if (!to) return { ok: false, message: "The section cannot move further." };
        return this.run(this.service.moveMember(el, to), `Moved ${intent.qn}`);
      }
      case "moveRequirement": {
        const el = this.requirement(intent.qn);
        if (!el?.owner) return gone("The requirement");
        const siblings = el.owner.members.filter(isRequirement);
        const at = siblings.indexOf(el);
        let to: { before: Element } | { after: Element } | { owner: Element; before?: Element; position?: "end" } | undefined;
        if (intent.how === "up") to = at > 0 ? { before: siblings[at - 1]! } : undefined;
        else if (intent.how === "down") to = at >= 0 && at < siblings.length - 1 ? { after: siblings[at + 1]! } : undefined;
        else {
          const owner = this.container(intent.how.ownerQn);
          if (!owner) return gone("The target");
          const before = intent.how.beforeQn ? this.requirement(intent.how.beforeQn) : undefined;
          if (intent.how.beforeQn && !before) return gone("The target requirement");
          to = before ? { owner, before } : { owner, position: "end" };
        }
        if (!to) return { ok: false, message: intent.how === "up" ? "The requirement is already first." : "The requirement is already last." };
        return this.run(this.service.moveMember(el, to), `Moved ${intent.qn}`);
      }
      case "deleteSection": {
        const p = this.pkg(intent.qn);
        if (!p) return gone("The section");
        const c = countContents(p);
        const what = [c.paragraphs && `${c.paragraphs} paragraph${c.paragraphs === 1 ? "" : "s"}`, c.requirements && `${c.requirements} requirement${c.requirements === 1 ? "" : "s"}`, c.sections && `${c.sections} subsection${c.sections === 1 ? "" : "s"}`, c.elements && `${c.elements} other element${c.elements === 1 ? "" : "s"}`].filter(Boolean).join(", ");
        if (!(await this.ui.confirm(`Delete section ${p.name ?? intent.qn}?`, what ? `It contains ${what}, which are removed from the .sysml file with it.` : "It is empty.", "Delete"))) return cancelled;
        return this.run(this.service.deleteElement({ element: p }), `Deleted ${intent.qn}`);
      }
    }
  }
}

/** What a package holds, counted the way the document shows it (also used by the confirmation text). */
export function countContents(pkg: Element): { paragraphs: number; requirements: number; sections: number; elements: number } {
  const c = { paragraphs: 0, requirements: 0, sections: 0, elements: 0 };
  const walk = (p: Element) => {
    for (const m of p.members) {
      if (m.kind === "doc" || m.kind === "comment") c.paragraphs++;
      else if (isRequirement(m)) c.requirements++;
      else if (isPkg(m)) {
        c.sections++;
        walk(m);
      } else if (!["import", "metadata", "satisfy", "verify", "expose"].includes(m.kind)) c.elements++;
    }
  };
  walk(pkg);
  return c;
}

export { statementKey };
