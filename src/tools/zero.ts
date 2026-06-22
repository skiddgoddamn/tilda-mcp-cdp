import { z } from "zod";
import {
  connectCdp, openPageEditor, openZeroArtboard, readZeroModel, saveZeroModel,
  publishCurrentPage,
} from "../cdp.js";
import {
  summarizeModel, patchElements, deleteElements, addElement, replaceInModel,
  type ElementTarget, type ZeroElement,
} from "./zero-model.js";

// ─────────────────────────────────────────────────────────────────────────────
// Общие куски схемы: как найти Zero Block на странице и как выбрать элемент в нём.
// ─────────────────────────────────────────────────────────────────────────────
const blockSel = {
  pageid: z.string().describe("ID страницы Tilda"),
  recId: z.string().optional().describe("Числовой recid Zero Block (если известен)"),
  match: z.string().optional().describe("Regexp по содержимому блока — найти Zero Block, если recId неизвестен"),
};

const elemSel = {
  id: z.string().optional().describe("Ключ/id элемента в модели (см. zero_get_elements)"),
  index: z.number().int().optional().describe("Позиция элемента в порядке обхода (0-based)"),
  textContains: z.string().optional().describe("Элемент, у которого любое текстовое поле содержит эту подстроку"),
};

const publishField = {
  publish: z.boolean().optional().default(true).describe("Опубликовать страницу после изменения (по умолчанию true)"),
};

function buildTarget(p: { id?: string; index?: number; textContains?: string }): ElementTarget {
  const t: ElementTarget = {};
  if (p.id !== undefined) t.id = p.id;
  if (p.index !== undefined) t.index = p.index;
  if (p.textContains !== undefined) t.textContains = p.textContains;
  return t;
}

function requireTarget(t: ElementTarget): void {
  if (t.id === undefined && t.index === undefined && t.textContains === undefined) {
    throw new Error("Укажите элемент: id, index или textContains.");
  }
}

/** Покинуть артборд (без пересохранения старой модели из памяти) и при необходимости опубликовать. */
async function leaveAndPublish(
  page: import("playwright-core").Page,
  pageid: string,
  publish: boolean,
): Promise<boolean | "skipped"> {
  await openPageEditor(page, pageid);
  if (!publish) return "skipped";
  return publishCurrentPage(page);
}

// ─────────────────────────────────────────────────────────────────────────────
// zero_get_elements — прочитать модель Zero Block (введение перед любыми правками)
// ─────────────────────────────────────────────────────────────────────────────
export const zeroGetElementsSchema = z.object({
  ...blockSel,
  raw: z.boolean().optional().default(false).describe("Включить полный сырой объект каждого элемента"),
});

export async function handleZeroGetElements(p: z.infer<typeof zeroGetElementsSchema>): Promise<string> {
  const s = await connectCdp();
  try {
    const { frame, rec } = await openZeroArtboard(s.page, p.pageid, { recId: p.recId, match: p.match });
    const data = await readZeroModel(frame);
    const elements = summarizeModel(data.elements, p.raw);
    return JSON.stringify(
      { pageid: data.pageid, rec, recordid: data.recordid, count: elements.length, elements },
      null,
      2,
    );
  } finally {
    await s.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// zero_update_element — глубокий merge JSON-патча в выбранный элемент(ы)
// ─────────────────────────────────────────────────────────────────────────────
export const zeroUpdateElementSchema = z.object({
  ...blockSel,
  ...elemSel,
  patch: z.record(z.any()).describe("JSON-патч (deep merge). Имена полей — как в zero_get_elements. null удаляет поле."),
  ...publishField,
});

export async function handleZeroUpdateElement(p: z.infer<typeof zeroUpdateElementSchema>): Promise<string> {
  const target = buildTarget(p);
  requireTarget(target);
  const s = await connectCdp();
  try {
    const { frame, rec } = await openZeroArtboard(s.page, p.pageid, { recId: p.recId, match: p.match });
    const data = await readZeroModel(frame);
    const { model, affected } = patchElements(data.elements, target, p.patch as Record<string, unknown>);
    if (affected.length === 0) {
      return JSON.stringify({ pageid: p.pageid, rec, error: "Элемент не найден по заданному критерию" }, null, 2);
    }
    const resp = await saveZeroModel(frame, { ...data, elements: model });
    const published = await leaveAndPublish(s.page, p.pageid, p.publish);
    return JSON.stringify({ pageid: p.pageid, rec, affected, saved: resp, published }, null, 2);
  } finally {
    await s.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// zero_add_element — добавить элемент клонированием существующего (+патч) или произвольный JSON
// ─────────────────────────────────────────────────────────────────────────────
export const zeroAddElementSchema = z.object({
  ...blockSel,
  cloneId: z.string().optional().describe("Клонировать элемент с этим id"),
  cloneIndex: z.number().int().optional().describe("Клонировать элемент по позиции (0-based)"),
  cloneTextContains: z.string().optional().describe("Клонировать элемент, чьё текстовое поле содержит подстроку"),
  element: z.record(z.any()).optional().describe("Произвольный объект элемента (если не клонируем)"),
  patch: z.record(z.any()).optional().describe("Патч к клону/элементу (deep merge), напр. новый текст/позиция"),
  newId: z.string().optional().describe("Желаемый id нового элемента (иначе сгенерируется)"),
  ...publishField,
});

export async function handleZeroAddElement(p: z.infer<typeof zeroAddElementSchema>): Promise<string> {
  const cloneOf = buildTarget({ id: p.cloneId, index: p.cloneIndex, textContains: p.cloneTextContains });
  const hasClone = cloneOf.id !== undefined || cloneOf.index !== undefined || cloneOf.textContains !== undefined;
  if (!hasClone && !p.element) {
    throw new Error("Укажите cloneId/cloneIndex/cloneTextContains (клонировать) или element (произвольный объект).");
  }
  const s = await connectCdp();
  try {
    const { frame, rec } = await openZeroArtboard(s.page, p.pageid, { recId: p.recId, match: p.match });
    const data = await readZeroModel(frame);
    const { model, key } = addElement(data.elements, {
      cloneOf: hasClone ? cloneOf : undefined,
      element: p.element as ZeroElement | undefined,
      patch: p.patch as Record<string, unknown> | undefined,
      newId: p.newId,
    });
    const resp = await saveZeroModel(frame, { ...data, elements: model });
    const published = await leaveAndPublish(s.page, p.pageid, p.publish);
    return JSON.stringify({ pageid: p.pageid, rec, newKey: key, saved: resp, published }, null, 2);
  } finally {
    await s.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// zero_delete_element — удалить выбранный элемент(ы)
// ─────────────────────────────────────────────────────────────────────────────
export const zeroDeleteElementSchema = z.object({
  ...blockSel,
  ...elemSel,
  ...publishField,
});

export async function handleZeroDeleteElement(p: z.infer<typeof zeroDeleteElementSchema>): Promise<string> {
  const target = buildTarget(p);
  requireTarget(target);
  const s = await connectCdp();
  try {
    const { frame, rec } = await openZeroArtboard(s.page, p.pageid, { recId: p.recId, match: p.match });
    const data = await readZeroModel(frame);
    const { model, removed } = deleteElements(data.elements, target);
    if (removed.length === 0) {
      return JSON.stringify({ pageid: p.pageid, rec, error: "Элемент не найден по заданному критерию" }, null, 2);
    }
    const resp = await saveZeroModel(frame, { ...data, elements: model });
    const published = await leaveAndPublish(s.page, p.pageid, p.publish);
    return JSON.stringify({ pageid: p.pageid, rec, removed, saved: resp, published }, null, 2);
  } finally {
    await s.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// zero_set_text — regexp-замена текста/строк по всей модели Zero Block
// ─────────────────────────────────────────────────────────────────────────────
export const zeroSetTextSchema = z.object({
  ...blockSel,
  find: z.string().describe("Регулярное выражение для поиска (флаг g применяется автоматически)"),
  replace: z.string().describe("Строка замены"),
  ...publishField,
});

export async function handleZeroSetText(p: z.infer<typeof zeroSetTextSchema>): Promise<string> {
  const s = await connectCdp();
  try {
    const { frame, rec } = await openZeroArtboard(s.page, p.pageid, { recId: p.recId, match: p.match });
    const data = await readZeroModel(frame);
    const { model, matches } = replaceInModel(data.elements, p.find, p.replace);
    if (matches.length === 0) {
      return JSON.stringify({ pageid: p.pageid, rec, changed: false, note: "Совпадений не найдено" }, null, 2);
    }
    const resp = await saveZeroModel(frame, { ...data, elements: model });
    const published = await leaveAndPublish(s.page, p.pageid, p.publish);
    return JSON.stringify({ pageid: p.pageid, rec, changed: true, matches, saved: resp, published }, null, 2);
  } finally {
    await s.close();
  }
}
