import { describe, expect, test } from "vitest";
import { ModelIndex, defaultDocumentParser } from "../model/index.js";
import { applyEdits, groupByUri } from "./text.js";
import { planNest } from "./nest.js";
import type { PlanResult } from "./types.js";

const URI = "file:///w/m.sysml";
function setup(text: string) {
  const ix = new ModelIndex();
  ix.setDocument(URI, text);
  return { ix, q: (qn: string) => ix.findByQualifiedName(qn)[0]! };
}
function after(plan: PlanResult, text: string): string {
  expect(plan.ok, JSON.stringify(plan)).toBe(true);
  if (!plan.ok) return "";
  const out = applyEdits(text, groupByUri(plan.edits).get(URI) ?? []);
  expect(defaultDocumentParser(URI, out).errors).toEqual([]);
  return out;
}
const fails = (p: PlanResult) => {
  expect(p.ok).toBe(false);
  return p.ok ? "" : p.reason;
};

const DOC = `package P {
    state def M {
        state idle;
        state big {
            state inner;
        }
        state test;
        transition first idle then test;
        transition first test then big;
    }
}
`;

describe("planNest", () => {
  test("moves a state into a state and rewrites outside references", () => {
    const { ix, q } = setup(DOC);
    const plan = planNest(ix, q("P::M::test"), q("P::M::big"));
    const out = after(plan, DOC);
    expect(out).toMatch(/state big \{\s+state inner;\s+state test;\s+\}/);
    expect(out).toContain("then P::M::big::test;");
    expect(out).toContain("first P::M::big::test then big;");
    expect(plan.ok && plan.nest?.newQn).toBe("P::M::big::test");
  });

  test("references from inside the new owner keep the short name", () => {
    const text = `package P {
    state def M {
        state big {
            state a;
            transition first a then test;
        }
        state test;
    }
}
`;
    const { ix, q } = setup(text);
    const out = after(planNest(ix, q("P::M::test"), q("P::M::big")), text);
    expect(out).toContain("first a then test;");
  });

  test("moving out reverses it", () => {
    const { ix, q } = setup(DOC);
    const out = after(planNest(ix, q("P::M::big::inner"), q("P::M")), DOC);
    expect(out).toMatch(/state big \{\s+\}/);
    expect(out).toMatch(/state inner;/);
  });

  test("refuses a name clash with a reason", () => {
    const text = `package P {
    state def M {
        state big { state test; }
        state test;
    }
}
`;
    const { ix, q } = setup(text);
    expect(fails(planNest(ix, q("P::M::test"), q("P::M::big")))).toMatch(/already|test/);
  });

  test("refuses a kind that cannot be owned", () => {
    const text = `package P {
    part def A { part x; }
    state def M { state s; }
}
`;
    const { ix, q } = setup(text);
    expect(fails(planNest(ix, q("P::A::x"), q("P::M")))).toMatch(/cannot own/);
  });

  test("refuses when a name inside would be captured", () => {
    const text = `package P {
    state def M {
        state target;
        state moved {
            state a;
            transition first a then target;
        }
        state big {
            state target;
        }
    }
}
`;
    const { ix, q } = setup(text);
    expect(fails(planNest(ix, q("P::M::moved"), q("P::M::big")))).toMatch(/refer to something else|would/);
  });

  test("actions and parts nest too", () => {
    const text = `package P {
    part def A {
        part wheel;
        part axle;
    }
    action def Go {
        action a;
        action b;
    }
}
`;
    const { ix, q } = setup(text);
    const o1 = after(planNest(ix, q("P::A::wheel"), q("P::A::axle")), text);
    expect(o1).toMatch(/part axle \{\s+part wheel;/);
  });
});
