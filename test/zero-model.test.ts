import { describe, it, expect } from "vitest";
import {
  entriesOf, deepMerge, flattenLeaves, summarizeModel, selectKeys,
  patchElements, deleteElements, addElement, nextKey, replaceInModel,
  type ZeroModel,
} from "../src/tools/zero-model.js";

// Синтетическая модель в духе Zero Block: словарь элементов, ключ = id.
function objModel(): Record<string, Record<string, unknown>> {
  return {
    "100": { type: "text", text: "Доходность от 45% годовых", left: 280, top: 222, color: "#E8B53D" },
    "101": { type: "button", text: "Оставить заявку", link: "https://t.me/+OLD", left: 392, top: 576 },
    "102": { type: "shape", left: 360, top: 360, width: 480, settings: { radius: 16 } },
  };
}
function arrModel(): Record<string, unknown>[] {
  return [
    { type: "text", text: "Привет", left: 10 },
    { type: "button", text: "Жми", link: "/go" },
  ];
}

describe("entriesOf", () => {
  it("normalizes object map", () => {
    expect(entriesOf(objModel()).map((e) => e.key)).toEqual(["100", "101", "102"]);
  });
  it("normalizes array with index keys", () => {
    expect(entriesOf(arrModel()).map((e) => e.key)).toEqual(["0", "1"]);
  });
});

describe("deepMerge", () => {
  it("merges nested objects, replaces arrays, keeps untouched keys", () => {
    const out = deepMerge(
      { a: 1, nested: { x: 1, y: 2 }, arr: [1, 2] },
      { nested: { y: 9, z: 3 }, arr: [9] },
    );
    expect(out).toEqual({ a: 1, nested: { x: 1, y: 9, z: 3 }, arr: [9] });
  });
  it("deletes a key when patch value is null", () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: null })).toEqual({ a: 1 });
  });
  it("does not mutate the original", () => {
    const orig = { nested: { x: 1 } };
    deepMerge(orig, { nested: { x: 5 } });
    expect(orig.nested.x).toBe(1);
  });
});

describe("flattenLeaves", () => {
  it("flattens nested objects and arrays to dotted/bracket paths", () => {
    const leaves = flattenLeaves({ a: 1, b: { c: "x" }, d: [{ e: "y" }] });
    expect(leaves).toEqual({ a: 1, "b.c": "x", "d[0].e": "y" });
  });
});

describe("summarizeModel", () => {
  it("classifies text, links and geometry; omits raw by default", () => {
    const sum = summarizeModel(objModel());
    const btn = sum.find((e) => e.key === "101")!;
    expect(btn.type).toBe("button");
    expect(btn.text).toContain("Оставить заявку");
    expect(btn.links).toContain("https://t.me/+OLD");
    expect(btn.geometry).toMatchObject({ left: 392, top: 576 });
    expect(btn.raw).toBeUndefined();
  });
  it("includes raw object when requested", () => {
    expect(summarizeModel(objModel(), true)[0].raw).toBeDefined();
  });
});

describe("selectKeys", () => {
  const m = objModel();
  it("by id (map key)", () => expect(selectKeys(m, { id: "101" })).toEqual(["101"]));
  it("by index", () => expect(selectKeys(m, { index: 0 })).toEqual(["100"]));
  it("by textContains (case-insensitive)", () =>
    expect(selectKeys(m, { textContains: "заявку" })).toEqual(["101"]));
  it("combines criteria with AND", () =>
    expect(selectKeys(m, { id: "101", textContains: "нет такого" })).toEqual([]));
  it("throws without any criterion", () =>
    expect(() => selectKeys(m, {})).toThrow(/критерий/));
});

describe("patchElements", () => {
  it("deep-merges patch into the selected element (object model)", () => {
    const { model, affected } = patchElements(objModel(), { id: "100" }, { text: "Новый текст", top: 999 });
    expect(affected).toEqual(["100"]);
    expect((model as Record<string, Record<string, unknown>>)["100"]).toMatchObject({
      text: "Новый текст", top: 999, color: "#E8B53D",
    });
  });
  it("works on array model by index", () => {
    const { model } = patchElements(arrModel(), { index: 1 }, { text: "Go!" });
    expect((model as Record<string, unknown>[])[1]).toMatchObject({ text: "Go!", link: "/go" });
  });
  it("does not mutate the source model", () => {
    const src = objModel();
    patchElements(src, { id: "100" }, { text: "x" });
    expect(src["100"].text).toBe("Доходность от 45% годовых");
  });
});

describe("deleteElements", () => {
  it("removes selected key from object model", () => {
    const { model, removed } = deleteElements(objModel(), { id: "102" });
    expect(removed).toEqual(["102"]);
    expect(Object.keys(model as Record<string, unknown>)).toEqual(["100", "101"]);
  });
  it("removes by index from array model", () => {
    const { model } = deleteElements(arrModel(), { index: 0 });
    expect(model).toHaveLength(1);
    expect((model as Record<string, unknown>[])[0]).toMatchObject({ type: "button" });
  });
});

describe("nextKey", () => {
  it("returns max numeric key + 1", () => {
    expect(nextKey({ "100": {}, "205": {} })).toBe("206");
  });
  it("falls back to suffixed key for non-numeric maps", () => {
    expect(nextKey({ a: {}, b: {} }, "a")).toBe("a_copy");
  });
});

describe("addElement", () => {
  it("clones an existing element, applies patch, gets a new numeric key", () => {
    const { model, key } = addElement(objModel(), {
      cloneOf: { id: "101" },
      patch: { text: "Вторая кнопка", link: "https://t.me/+NEW", top: 650 },
    });
    expect(key).toBe("103");
    const m = model as Record<string, Record<string, unknown>>;
    expect(m["103"]).toMatchObject({ type: "button", text: "Вторая кнопка", link: "https://t.me/+NEW", top: 650 });
    // оригинал-источник нетронут
    expect(m["101"].text).toBe("Оставить заявку");
  });
  it("appends a raw element to an array model", () => {
    const { model, key } = addElement(arrModel(), { element: { type: "text", text: "new" } });
    expect(key).toBe("2");
    expect(model).toHaveLength(3);
  });
  it("throws when neither cloneOf nor element is provided", () => {
    expect(() => addElement(objModel(), {})).toThrow();
  });
  it("syncs top-level id field to the new key", () => {
    const m: ZeroModel = { "100": { elid: "100", type: "text", text: "a" } };
    const { model, key } = addElement(m, { cloneOf: { id: "100" } });
    expect((model as Record<string, Record<string, unknown>>)[key].elid).toBe(key);
  });
});

describe("replaceInModel", () => {
  it("regex-replaces serialized strings and reports unique matches", () => {
    const { model, matches } = replaceInModel(objModel(), "https://t\\.me/\\+OLD", "https://t.me/+NEW");
    expect(matches).toEqual(["https://t.me/+OLD"]);
    expect((model as Record<string, Record<string, unknown>>)["101"].link).toBe("https://t.me/+NEW");
  });
  it("returns no matches when nothing is found", () => {
    expect(replaceInModel(objModel(), "zzzz", "x").matches).toEqual([]);
  });
});
