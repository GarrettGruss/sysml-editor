/**
 * The DoDAF 2.02 view mapping as data (design D77) and the UAF-to-DoDAF name table (D85).
 * Titles checked against the DoDAF 2.02 view definitions. No `vscode` import.
 */
import type { DiagramKind } from "../diagram/format.js";

export const VIEW_IDS = [
  "AV-1", "AV-2", "CV-1", "CV-2", "OV-1", "OV-2", "OV-4", "OV-5a", "OV-5b", "OV-6c", "SV-1", "SV-2", "SV-4", "SV-5a", "SV-10c", "StdV-1", "DIV-2",
] as const;
export type ViewId = (typeof VIEW_IDS)[number];

export type ViewForm = "table" | "tree" | "matrix" | "diagram";

export interface ViewMapping {
  id: ViewId;
  /** DoDAF 2.02 view title. */
  title: string;
  /** What the author writes in SysML v2. */
  construct: string;
  form: ViewForm;
  /** Diagram kind for `form: "diagram"`. */
  diagramKind?: DiagramKind;
  /** Metadata definitions (DoDAF library names) that select the elements of the view. */
  selects: readonly string[];
  /** The view is a table that is not built from annotations alone (e.g. documentation of the root package). */
  note?: string;
}

export const VIEWS: readonly ViewMapping[] = [
  { id: "AV-1", title: "Overview and Summary Information", construct: "package doc + @ArchitectureDescription (purpose, scope, viewpointName, dates)", form: "table", selects: ["ArchitectureDescription"] },
  { id: "AV-2", title: "Integrated Dictionary", construct: "every annotated element and its doc", form: "table", selects: [] , note: "all annotated elements" },
  { id: "CV-1", title: "Vision", construct: "@Capability doc plus @Vision text", form: "table", selects: ["Capability", "Vision"] },
  { id: "CV-2", title: "Capability Taxonomy", construct: "@Capability defs and specializes / composition", form: "diagram", diagramKind: "general", selects: ["Capability"] },
  { id: "OV-1", title: "High-Level Operational Concept Graphic", construct: "@OperationalPerformer parts, connections, package doc as narrative", form: "diagram", diagramKind: "general", selects: ["OperationalPerformer", "OV1Graphic"], note: "narrative from documentation; @OV1Graphic { path } replaces the drawing (D81)" },
  { id: "OV-2", title: "Operational Resource Flow Description", construct: "performers; connect = needline, flow of items (@OperationalExchange) = resource flow", form: "diagram", diagramKind: "interconnection", selects: ["OperationalPerformer", "OperationalExchange"] },
  { id: "OV-4", title: "Organizational Relationships Chart", construct: "@Organization parts and their containment, plus relations between organizations", form: "tree", selects: ["Organization"] },
  { id: "OV-5a", title: "Operational Activity Decomposition Tree", construct: "nested actions under an @OperationalActivity (capabilities may head the tree)", form: "tree", selects: ["OperationalActivity", "Capability"] },
  { id: "OV-5b", title: "Operational Activity Model", construct: "one activity's actions, successions, flows", form: "diagram", diagramKind: "actionFlow", selects: ["OperationalActivity"], note: "one diagram per root activity" },
  { id: "OV-6c", title: "Event-Trace Description", construct: "event trace of messages between performers", form: "diagram", diagramKind: "sequence", selects: ["OperationalPerformer"] },
  { id: "SV-1", title: "Systems Interface Description", construct: "@System parts and connect / interface", form: "diagram", diagramKind: "interconnection", selects: ["System"] },
  { id: "SV-2", title: "Systems Resource Flow Description", construct: "ports and flows of items between systems", form: "diagram", diagramKind: "interconnection", selects: ["System"] },
  { id: "SV-4", title: "Systems Functionality Description", construct: "@SystemFunction actions and flows", form: "diagram", diagramKind: "actionFlow", selects: ["SystemFunction"] },
  { id: "SV-5a", title: "Operational Activity to Systems Function Traceability Matrix", construct: "allocate from @SystemFunction to @OperationalActivity; rows activities, columns functions", form: "matrix", selects: ["SystemFunction", "OperationalActivity"] },
  { id: "SV-10c", title: "Systems Event-Trace Description", construct: "message trace between systems", form: "diagram", diagramKind: "sequence", selects: ["System"] },
  { id: "StdV-1", title: "Standards Profile", construct: "@Standard elements, cited by", form: "table", selects: ["Standard"] },
  { id: "DIV-2", title: "Logical Data Model", construct: "item def / attribute def data model", form: "table", selects: [], note: "entity, attribute, type, multiplicity" },
];

export function viewMapping(id: string): ViewMapping | undefined {
  return VIEWS.find((v) => v.id === id);
}

export function isViewId(id: string): id is ViewId {
  return (VIEW_IDS as readonly string[]).includes(id);
}

/** A metadata definition of `DoDAF.sysml` (UAF name) and the DoDAF 2.02 term it stands for. */
export interface UafName {
  uaf: string;
  dodaf: string;
}

export const UAF_TO_DODAF: readonly UafName[] = [
  { uaf: "ArchitectureDescription", dodaf: "Architectural Description (AV-1)" },
  { uaf: "Capability", dodaf: "Capability" },
  { uaf: "Vision", dodaf: "Vision (CV-1)" },
  { uaf: "OperationalPerformer", dodaf: "Performer" },
  { uaf: "OperationalActivity", dodaf: "Operational Activity" },
  { uaf: "OperationalExchange", dodaf: "Resource Flow (OV-2)" },
  { uaf: "Organization", dodaf: "Organization" },
  { uaf: "System", dodaf: "System (resource performer)" },
  { uaf: "SystemFunction", dodaf: "System Function (SV-4)" },
  { uaf: "Standard", dodaf: "Standard" },
  { uaf: "OV1Graphic", dodaf: "OV-1 graphic" },
];
