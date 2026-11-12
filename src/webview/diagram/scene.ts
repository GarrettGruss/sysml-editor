/** Builds the interaction scene from a view model and boxes. No DOM. */
import type { ViewModel } from "../../diagram/view-model.js";
import { absoluteBoxes, describeBox, type Box, type Measure } from "./geometry.js";
import { Scene, type SceneItem } from "./interaction.js";

/** Items in paint order: shallow nodes first, ports last (as `buildSvg` draws them). */
export function buildScene(vm: ViewModel, rel: ReadonlyMap<string, Box>, mins: ReadonlyMap<string, { w: number; h: number }>, measure: Measure): Scene {
  const abs = absoluteBoxes(vm, rel);
  const byId = new Map(vm.nodes.map((n) => [n.id, n] as const));
  const depth = (id: string, g = 0): number => {
    const n = byId.get(id);
    const up = n ? (n.attachedTo ?? n.parent) : undefined;
    return up !== undefined && byId.has(up) && g < 100 ? depth(up, g + 1) + 1 : 0;
  };
  const items: SceneItem[] = [];
  for (const n of vm.nodes) {
    const r = rel.get(n.id), a = abs.get(n.id);
    if (!r || !a) continue;
    const owner = n.attachedTo !== undefined && byId.has(n.attachedTo) ? n.attachedTo : undefined;
    const parent = owner === undefined && n.parent !== undefined && byId.has(n.parent) ? n.parent : undefined;
    items.push({
      id: n.id, rel: { ...r }, abs: { ...a },
      ...(parent !== undefined ? { parent } : {}), ...(owner !== undefined ? { owner } : {}),
      min: mins.get(n.id) ?? { w: 20, h: 20 },
      headerH: n.shape === "port" ? 0 : describeBox(n, measure).headerH,
    });
  }
  const isPort = new Set(items.filter((i) => i.owner !== undefined).map((i) => i.id));
  items.sort((x, y) => Number(isPort.has(x.id)) - Number(isPort.has(y.id)) || depth(x.id) - depth(y.id));
  return new Scene(items);
}
