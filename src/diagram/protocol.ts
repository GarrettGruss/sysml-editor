/** Messages between the extension host and the diagram webview. No `vscode` import, no DOM. */
import type { ViewModel } from "./view-model.js";

export type PngTheme = "light";

export interface NodeBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MetricsNode extends NodeBox {
  parent?: string;
  attachedTo?: string;
}

export type HostToWebview =
  | { type: "render"; viewModel: ViewModel }
  | { type: "exportPng"; requestId: number; theme: PngTheme }
  | { type: "getMetrics"; requestId: number };

export type WebviewToHost =
  | { type: "ready" }
  /** Positions the webview computed for nodes that had none; relative to the parent node. */
  | { type: "layoutChanged"; nodes: NodeBox[]; edges: { id: string; points: { x: number; y: number }[] }[] }
  | { type: "pngResult"; requestId: number; base64: string }
  | {
      type: "metricsResult";
      requestId: number;
      /** Absolute canvas coordinates. */
      nodes: MetricsNode[];
      edges: { id: string; source: string; target: string }[];
      overlaps: number;
      /** Text elements wider than their box. */
      overflows: number;
    }
  | { type: "openAsText" }
  | { type: "error"; message: string };
