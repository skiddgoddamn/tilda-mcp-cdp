/**
 * Чистая логика работы с моделью Zero Block (без браузера/CDP).
 *
 * Модель элементов Zero Block (`cleanElementsData` из `window.ab__getDBSaveData()`)
 * — это либо массив элементов, либо объект-словарь, где ключ = id элемента.
 * Точная схема полей у Tilda внутренняя и зависит от разрешения (resolution),
 * поэтому здесь мы НЕ хардкодим имена полей: всё, что делаем — обходим листовые
 * значения, делаем глубокий merge патчей, клонируем существующие элементы и
 * выбираем элементы по id / индексу / тексту. Это надёжно при любой схеме.
 *
 * Все функции иммутабельны: исходная модель не мутируется, возвращается новая копия.
 */

export type ZeroElement = Record<string, unknown>;
export type ZeroModel = ZeroElement[] | Record<string, ZeroElement>;

export interface ElementEntry {
  key: string;
  value: ZeroElement;
}

export interface ElementTarget {
  /** Ключ элемента в модели (id) или значение поля-идентификатора внутри элемента. */
  id?: string;
  /** Позиция элемента в порядке обхода (0-based). */
  index?: number;
  /** Любое строковое листовое значение элемента содержит эту подстроку (без учёта регистра). */
  textContains?: string;
}

const URL_RE = /^(https?:\/\/|\/|mailto:|tel:|#)/i;
const GEOMETRY_KEYS = /(^|[._-])(left|top|right|bottom|width|height|axisx|axisy|x|y|z|zindex)$/i;

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isArrayModel(model: ZeroModel): model is ZeroElement[] {
  return Array.isArray(model);
}

/** Единый обход модели вне зависимости от того, массив это или словарь. */
export function entriesOf(model: ZeroModel): ElementEntry[] {
  if (isArrayModel(model)) {
    return model.map((value, i) => ({ key: String(i), value: (value ?? {}) as ZeroElement }));
  }
  return Object.entries(model).map(([key, value]) => ({ key, value: (value ?? {}) as ZeroElement }));
}

/** Глубокий клон (Node 18+ structuredClone, с JSON-фолбэком). */
export function clone<T>(v: T): T {
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Глубокий merge патча в цель. Возвращает НОВЫЙ объект.
 * - вложенные объекты сливаются рекурсивно;
 * - массивы и примитивы в патче ЗАМЕНЯЮТ значение цели целиком;
 * - значение `null` в патче удаляет ключ.
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...target };
  for (const [k, pv] of Object.entries(patch)) {
    if (pv === null) {
      delete out[k];
      continue;
    }
    const tv = out[k];
    if (isPlainObject(pv) && isPlainObject(tv)) {
      out[k] = deepMerge(tv, pv);
    } else {
      out[k] = isPlainObject(pv) || Array.isArray(pv) ? clone(pv) : pv;
    }
  }
  return out as T;
}

/** Все листовые (примитивные) значения элемента в виде map `путь -> значение`. */
export function flattenLeaves(obj: unknown, prefix = ""): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (isPlainObject(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      Object.assign(out, flattenLeaves(v, prefix ? `${prefix}.${k}` : k));
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => Object.assign(out, flattenLeaves(v, `${prefix}[${i}]`)));
  } else if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean") {
    out[prefix] = obj;
  }
  return out;
}

export interface ElementSummary {
  key: string;
  index: number;
  type: string | null;
  text: string[];
  links: string[];
  geometry: Record<string, number | string>;
  /** Полная карта листовых полей (имена полей реальные, как у Tilda). */
  leaves: Record<string, string | number | boolean>;
  /** Полный сырой объект элемента (только при raw=true). */
  raw?: ZeroElement;
}

/** Человекочитаемая сводка по элементу: тип, тексты, ссылки, геометрия + все листья. */
export function summarizeElement(entry: ElementEntry, index: number, raw = false): ElementSummary {
  const leaves = flattenLeaves(entry.value);
  const type =
    (entry.value.type as string) ??
    (entry.value.elemtype as string) ??
    (entry.value.elementtype as string) ??
    null;

  const text: string[] = [];
  const links: string[] = [];
  const geometry: Record<string, number | string> = {};

  for (const [path, val] of Object.entries(leaves)) {
    if (typeof val === "number") {
      if (GEOMETRY_KEYS.test(path)) geometry[path] = val;
      continue;
    }
    if (typeof val !== "string") continue;
    const s = val.trim();
    if (!s) continue;
    if (URL_RE.test(s)) links.push(s);
    else if (GEOMETRY_KEYS.test(path)) geometry[path] = s;
    else if (s.length <= 300 && /\p{L}|\d/u.test(s)) text.push(s);
  }

  return {
    key: entry.key,
    index,
    type,
    text: dedupe(text),
    links: dedupe(links),
    geometry,
    leaves,
    ...(raw ? { raw: entry.value } : {}),
  };
}

export function summarizeModel(model: ZeroModel, raw = false): ElementSummary[] {
  return entriesOf(model).map((e, i) => summarizeElement(e, i, raw));
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/** Найти ключи элементов, подходящих под target (критерии объединяются по И). */
export function selectKeys(model: ZeroModel, target: ElementTarget): string[] {
  const entries = entriesOf(model);
  const need = target.id !== undefined || target.index !== undefined || target.textContains !== undefined;
  if (!need) throw new Error("Не задан критерий выбора элемента (id, index или textContains)");

  return entries
    .filter((e, i) => {
      if (target.index !== undefined && i !== target.index) return false;
      if (target.id !== undefined && !matchesId(e, target.id)) return false;
      if (target.textContains !== undefined && !matchesText(e, target.textContains)) return false;
      return true;
    })
    .map((e) => e.key);
}

function matchesId(entry: ElementEntry, id: string): boolean {
  if (entry.key === id) return true;
  // запасной путь: поле-идентификатор внутри элемента (elid/id/...) равно id
  const leaves = flattenLeaves(entry.value);
  return Object.entries(leaves).some(
    ([path, val]) => /(^|[._-])(elid|id|guid|uid)$/i.test(path) && String(val) === id,
  );
}

function matchesText(entry: ElementEntry, sub: string): boolean {
  const needle = sub.toLowerCase();
  return Object.values(flattenLeaves(entry.value)).some(
    (v) => typeof v === "string" && v.toLowerCase().includes(needle),
  );
}

/** Применить патч (deepMerge) к выбранным элементам. Возвращает новую модель + затронутые ключи. */
export function patchElements(
  model: ZeroModel,
  target: ElementTarget,
  patch: Record<string, unknown>,
): { model: ZeroModel; affected: string[] } {
  const keys = new Set(selectKeys(model, target));
  if (isArrayModel(model)) {
    const next = model.map((el, i) =>
      keys.has(String(i)) ? deepMerge((el ?? {}) as ZeroElement, patch) : el,
    );
    return { model: next, affected: [...keys] };
  }
  const next: Record<string, ZeroElement> = { ...model };
  for (const k of keys) next[k] = deepMerge((next[k] ?? {}) as ZeroElement, patch);
  return { model: next, affected: [...keys] };
}

/** Удалить выбранные элементы. Возвращает новую модель + удалённые ключи. */
export function deleteElements(model: ZeroModel, target: ElementTarget): { model: ZeroModel; removed: string[] } {
  const keys = new Set(selectKeys(model, target));
  if (isArrayModel(model)) {
    const next = model.filter((_el, i) => !keys.has(String(i)));
    return { model: next, removed: [...keys] };
  }
  const next: Record<string, ZeroElement> = {};
  for (const [k, v] of Object.entries(model)) if (!keys.has(k)) next[k] = v;
  return { model: next, removed: [...keys] };
}

/**
 * Сгенерировать новый уникальный ключ для словарной модели.
 * Если ключи числовые — берём max+1, иначе суффикс к базе.
 */
export function nextKey(model: Record<string, ZeroElement>, base?: string): string {
  const keys = Object.keys(model);
  const nums = keys.map((k) => Number(k)).filter((n) => Number.isFinite(n));
  if (nums.length === keys.length && nums.length > 0) return String(Math.max(...nums) + 1);
  let cand = base ? `${base}_copy` : `el_${keys.length + 1}`;
  let i = 1;
  while (model[cand]) cand = `${base ?? "el"}_copy${++i}`;
  return cand;
}

/**
 * Добавить элемент клонированием существующего (schema-safe) + патч,
 * либо вставить произвольный объект `element`.
 * Возвращает новую модель + ключ нового элемента.
 */
export function addElement(
  model: ZeroModel,
  opts: { cloneOf?: ElementTarget; element?: ZeroElement; patch?: Record<string, unknown>; newId?: string },
): { model: ZeroModel; key: string } {
  let base: ZeroElement;
  if (opts.cloneOf) {
    const keys = selectKeys(model, opts.cloneOf);
    if (keys.length === 0) throw new Error("cloneOf: исходный элемент не найден");
    const src = entriesOf(model).find((e) => e.key === keys[0]);
    base = clone(src!.value);
  } else if (opts.element) {
    base = clone(opts.element);
  } else {
    throw new Error("Нужно указать cloneOf (клонировать существующий) или element (произвольный объект)");
  }
  const value = opts.patch ? deepMerge(base, opts.patch) : base;

  if (isArrayModel(model)) {
    return { model: [...model, value], key: String(model.length) };
  }
  const key = opts.newId ?? nextKey(model, opts.cloneOf?.id);
  // если внутри был id-поле, равное старому ключу/elid — синхронизируем с новым ключом
  syncIdField(value, key);
  return { model: { ...model, [key]: value }, key };
}

/** Best-effort: проставить новый ключ в поля-идентификаторы верхнего уровня (elid/id). */
function syncIdField(el: ZeroElement, key: string): void {
  for (const f of Object.keys(el)) {
    if (/^(elid|id|guid|uid)$/i.test(f)) el[f] = key;
  }
}

/**
 * Regexp-замена по сериализованной модели (для замены текста/ссылок «как строк»).
 * Возвращает новую модель и список уникальных совпадений до замены.
 */
export function replaceInModel(
  model: ZeroModel,
  find: string,
  replace: string,
  flags = "g",
): { model: ZeroModel; matches: string[] } {
  const re = new RegExp(find, flags.includes("g") ? flags : flags + "g");
  const json = JSON.stringify(model);
  const matches = Array.from(new Set(json.match(re) ?? []));
  const next = JSON.parse(json.replace(re, replace)) as ZeroModel;
  return { model: next, matches };
}
