import { chromium } from "playwright-core";
import type { Browser, Page, Frame } from "playwright-core";
import type { ZeroModel } from "./tools/zero-model.js";

/**
 * Слой действий (запись) для Tilda.
 *
 * Официальный Tilda API (api.tildacdn.info) — только чтение. Любые изменения
 * (Метрика, код блоков, ссылки Zero Block, публикация) выполняются через
 * залогиненную сессию браузера: мы подключаемся по CDP к запущенному Chrome.
 *
 * Требуется запустить Chrome с портом отладки на отдельном профиле
 * (Chrome 136+ блокирует порт отладки на профиле по умолчанию):
 *
 *   chrome.exe --remote-debugging-port=9222 \
 *     --user-data-dir="C:\chrome-debug-tilda" --no-first-run https://tilda.cc/projects/
 *
 * и один раз залогиниться в Tilda в этом окне.
 */

export const CDP_URL = process.env.TILDA_CDP_URL || "http://localhost:9222";

export interface CdpSession {
  browser: Browser;
  page: Page;
  /** Закрывает рабочую вкладку и отсоединяется (сам Chrome остаётся открытым). */
  close(): Promise<void>;
}

/** Подключиться по CDP к запущенному Chrome и открыть новую рабочую вкладку. */
export async function connectCdp(): Promise<CdpSession> {
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (e) {
    throw new Error(
      `Не удалось подключиться к Chrome по CDP (${CDP_URL}). Запустите Chrome с ` +
      `--remote-debugging-port=9222 --user-data-dir="C:\\chrome-debug-tilda" и залогиньтесь в Tilda. ` +
      `Детали: ${(e as Error).message}`,
    );
  }
  const ctx = browser.contexts()[0];
  if (!ctx) {
    await browser.close().catch(() => {});
    throw new Error("Нет контекста браузера в CDP-сессии.");
  }
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const close = async () => {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  };
  return { browser, page, close };
}

/** Проверить, залогинен ли пользователь в Tilda. */
export async function checkSession(page: Page): Promise<{ loggedIn: boolean; account: string | null }> {
  await page.goto("https://tilda.cc/projects/", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1000);
  return page.evaluate(() => {
    const hasPwd = !!document.querySelector('input[type="password"]');
    const hasProjects = !!document.querySelector('.td-sites-grid__cell, #projectssortable, #allprojects');
    const txt = document.body ? document.body.innerText : "";
    const m = txt.match(/\(([^)]+)\)\s*Выйти/);
    return { loggedIn: !hasPwd && hasProjects, account: m ? m[1] : null };
  });
}

/** Открыть редактор страницы. */
export async function openPageEditor(page: Page, pageid: string): Promise<void> {
  await page.goto(`https://tilda.cc/page/?pageid=${pageid}`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(4000);
}

/** Найти record-блок на странице, чей HTML соответствует regexp. Возвращает числовой recid. */
export async function findRecordByContent(page: Page, pattern: string): Promise<string | null> {
  return page.evaluate((pat) => {
    const re = new RegExp(pat);
    const b = Array.from(document.querySelectorAll('[id^="record"]')).find((e) => re.test(e.innerHTML || ""));
    const m = b ? (b.id || "").match(/record(\d+)/) : null;
    return m ? m[1] : null;
  }, pattern);
}

/** Навести курсор на блок и нажать кнопку панели по тексту (Контент / Редактировать блок). */
export async function clickRecordButton(page: Page, rec: string, buttonText: string): Promise<void> {
  const blk = await page.$(`#record${rec}`);
  if (!blk) throw new Error(`Блок #record${rec} не найден`);
  await blk.scrollIntoViewIfNeeded().catch(() => {});
  await blk.hover().catch(() => {});
  await page.waitForTimeout(1400);
  await page.evaluate((text) => {
    const b = Array.from(document.querySelectorAll(".tp-record-ui__button_primary, .tp-record-ui__button"))
      .find((e) => (e as HTMLElement).offsetParent !== null && (e as HTMLElement).innerText.trim() === text);
    if (b) (b as HTMLElement).click();
  }, buttonText);
}

/** Дождаться фрейма артборда Zero Block (где доступна функция ab__getDBSaveData). */
export async function findAbFrame(page: Page, timeoutMs = 35000): Promise<Frame | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    for (const f of page.frames()) {
      try {
        const ok = await f.evaluate(
          () => typeof (window as any).ab__getDBSaveData === "function" && !!document.querySelector(".tn-artboard"),
        );
        if (ok) return f;
      } catch {
        /* фрейм мог отсоединиться */
      }
    }
    await page.waitForTimeout(1000);
  }
  return null;
}

/** Опубликовать текущую открытую страницу. Возвращает true, если публикация подтверждена. */
export async function publishCurrentPage(page: Page): Promise<boolean> {
  const clicked = await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>("#page_menu_publishlink");
    if (b) { b.click(); return true; }
    return false;
  });
  if (!clicked) return false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const done = await page.evaluate(() => /опубликован|страница доступна/i.test(document.body?.innerText || ""));
    if (done) {
      await page.evaluate(() => { try { (window as any).tp__pagePublish_closePopup?.(); } catch { /* ignore */ } });
      return true;
    }
  }
  return false;
}

// ── Zero Block: чтение/запись модели элементов через внутренний save-API ──
// Используется детерминированный путь (как в replace_zero_links): берём модель из
// window.ab__getDBSaveData(), правим её в Node, сохраняем POST /zero/submit/.
// Без кликов по холсту.

export interface OpenZeroResult {
  frame: Frame;
  /** Числовой recid открытого Zero Block. */
  rec: string;
}

/** Открыть артборд Zero Block по recId или по содержимому (match — regexp). */
export async function openZeroArtboard(
  page: Page,
  pageid: string,
  sel: { recId?: string; match?: string },
): Promise<OpenZeroResult> {
  await openPageEditor(page, pageid);
  let rec = sel.recId ?? null;
  if (!rec && sel.match) rec = await findRecordByContent(page, sel.match);
  if (!rec) throw new Error("Zero Block не найден: укажите recId или match (regexp по содержимому).");
  await clickRecordButton(page, rec, "Редактировать блок");
  await page.waitForURL("**/zero/**", { timeout: 15000 }).catch(() => {});
  const frame = await findAbFrame(page, 35000);
  if (!frame) throw new Error("Артборд (ab__getDBSaveData) не готов.");
  return { frame, rec };
}

export interface ZeroModelData {
  pageid: string | null;
  recordid: string | null;
  elements: ZeroModel;
  zbGrid: Record<string, unknown> | null;
}

/** Прочитать модель открытого артборда (элементы + сетка + id страницы/записи). */
export async function readZeroModel(frame: Frame): Promise<ZeroModelData> {
  return frame.evaluate(() => {
    const w = window as unknown as { ab__getDBSaveData: () => { cleanElementsData: unknown; zbGrid: unknown } };
    const ab = document.querySelector(".tn-artboard") as HTMLElement | null;
    const d = w.ab__getDBSaveData();
    return {
      pageid: ab ? ab.getAttribute("data-page-id") : null,
      recordid: ab ? ab.getAttribute("data-record-id") : null,
      elements: d.cleanElementsData as ZeroModelData["elements"],
      zbGrid: (d.zbGrid as Record<string, unknown> | null) ?? null,
    };
  });
}

/** Сохранить модель артборда обратно (POST /zero/submit/). Возвращает ответ сервера (обрезанный). */
export async function saveZeroModel(frame: Frame, data: ZeroModelData): Promise<string> {
  return frame.evaluate(async (payload) => {
    const w = window as unknown as { tn__createFormData: (o: unknown) => unknown };
    const y = {
      comm: "savezerocode",
      pageid: payload.pageid,
      recordid: payload.recordid,
      onlythisfield: "code",
      fromzero: "yes",
      code: JSON.stringify(payload.elements),
      zb_grid:
        payload.zbGrid && Object.keys(payload.zbGrid).length ? JSON.stringify(payload.zbGrid) : "reset",
    };
    try {
      const r = await fetch("/zero/submit/", { method: "POST", body: w.tn__createFormData(y) as BodyInit });
      return (await r.text()).slice(0, 80);
    } catch (e) {
      return "ERR:" + (e as Error).message;
    }
  }, data as unknown as { pageid: string | null; recordid: string | null; elements: unknown; zbGrid: Record<string, unknown> | null });
}

/** Получить живой HTML сайта через браузер (с обходом кэша). */
export async function fetchLive(page: Page, url: string): Promise<{ status: number | null; html: string }> {
  await page.setExtraHTTPHeaders({ "Cache-Control": "no-cache", Pragma: "no-cache" });
  const sep = url.includes("?") ? "&" : "?";
  const resp = await page.goto(`${url}${sep}_cb=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  return { status: resp ? resp.status() : null, html: await page.content() };
}
