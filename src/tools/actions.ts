import { z } from "zod";
import {
  connectCdp, checkSession, openPageEditor, findRecordByContent,
  clickRecordButton, findAbFrame, publishCurrentPage, fetchLive, CDP_URL,
} from "../cdp.js";

// ─────────────────────────────────────────────────────────────────────────────
// chrome_status — проверить CDP-подключение и сессию Tilda
// ─────────────────────────────────────────────────────────────────────────────
export const chromeStatusSchema = z.object({});

export async function handleChromeStatus(_p: z.infer<typeof chromeStatusSchema>): Promise<string> {
  const s = await connectCdp();
  try {
    const sess = await checkSession(s.page);
    return JSON.stringify({ cdpUrl: CDP_URL, connected: true, ...sess }, null, 2);
  } finally {
    await s.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// set_metrika — задать ID Яндекс.Метрики в настройках проекта
// ─────────────────────────────────────────────────────────────────────────────
export const setMetrikaSchema = z.object({
  projectid: z.string().describe("ID проекта Tilda"),
  metrikaId: z.string().describe("Номер счётчика Яндекс.Метрики, напр. 109756541"),
});

export async function handleSetMetrika(p: z.infer<typeof setMetrikaSchema>): Promise<string> {
  const s = await connectCdp();
  const { page } = s;
  try {
    const url = `https://tilda.cc/projects/settings/?projectid=${p.projectid}#tab=ss_menu_analytics`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(1200);
    if (!(await page.$("#yandexmetrikaid"))) {
      await page.evaluate(() => {
        const e = Array.from(document.querySelectorAll("span,a,div,li"))
          .find((x) => (x as HTMLElement).innerText.trim() === "Аналитика");
        if (e) ((e.closest("a,li,div") as HTMLElement) || (e as HTMLElement)).click();
      });
      await page.waitForTimeout(1200);
    }
    const inp = await page.$("#yandexmetrikaid");
    if (!inp) throw new Error("Поле #yandexmetrikaid не найдено в настройках Аналитики");
    const before = await inp.inputValue();
    await inp.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await inp.type(p.metrikaId, { delay: 25 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("a,button,div,span"))
        .filter((e) => (e as HTMLElement).offsetParent !== null);
      const b = btns.find((e) => (e as HTMLElement).innerText.trim() === "Сохранить изменения")
        || btns.find((e) => (e as HTMLElement).innerText.trim() === "Сохранить");
      if (b) (b as HTMLElement).click();
    });
    await page.waitForTimeout(3000);
    // верификация перезагрузкой
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(1200);
    if (!(await page.$("#yandexmetrikaid"))) {
      await page.evaluate(() => {
        const e = Array.from(document.querySelectorAll("span,a,div,li"))
          .find((x) => (x as HTMLElement).innerText.trim() === "Аналитика");
        if (e) ((e.closest("a,li,div") as HTMLElement) || (e as HTMLElement)).click();
      });
      await page.waitForTimeout(1200);
    }
    const after = await page.$eval("#yandexmetrikaid", (el) => (el as HTMLInputElement).value).catch(() => null);
    return JSON.stringify({
      projectid: p.projectid, before, after, ok: after === p.metrikaId,
      note: "В настройках сохранено. Для применения на живых страницах вызовите publish_page по каждой странице проекта.",
    }, null, 2);
  } finally {
    await s.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// replace_page_code — заменить текст в HTML-код-блоках (T123) страницы
// (например, трекер api.tgtrack.ru). find — regexp, replace — строка замены.
// ─────────────────────────────────────────────────────────────────────────────
export const replacePageCodeSchema = z.object({
  pageid: z.string().describe("ID страницы Tilda"),
  find: z.string().describe("Регулярное выражение для поиска в коде блока (флаг g применяется автоматически)"),
  replace: z.string().describe("Строка замены"),
  publish: z.boolean().optional().default(true).describe("Опубликовать страницу после изменения (по умолчанию true)"),
});

export async function handleReplacePageCode(p: z.infer<typeof replacePageCodeSchema>): Promise<string> {
  const s = await connectCdp();
  const { page } = s;
  try {
    await openPageEditor(page, p.pageid);
    const edits: Array<Record<string, unknown>> = [];
    // обходим все T123-блоки, содержащие совпадение
    for (let guard = 0; guard < 10; guard++) {
      const rec = await page.evaluate((pat) => {
        const re = new RegExp(pat);
        const b = Array.from(document.querySelectorAll('[id^="record"][data-record-type]'))
          .find((e) => e.getAttribute("data-record-type") === "131" && re.test(e.innerHTML || ""));
        const m = b ? (b.id || "").match(/record(\d+)/) : null;
        return m ? m[1] : null;
      }, p.find);
      if (!rec) break;
      await clickRecordButton(page, rec, "Контент");
      await page.waitForTimeout(2300);
      const res = await page.evaluate(({ rec, find, replace }) => {
        const id = "aceeditor" + rec;
        const w = window as any;
        let oldVal: string | null = null;
        if (w.ace && document.getElementById(id)) oldVal = w.ace.edit(id).getValue();
        else { const ta = document.querySelector('textarea[name="code"]') as HTMLTextAreaElement | null; oldVal = ta ? ta.value : null; }
        if (oldVal == null) return { rec, error: "нет редактора кода" };
        const re = new RegExp(find, "g");
        const newVal = oldVal.replace(re, replace);
        if (newVal === oldVal) return { rec, changed: false };
        if (w.ace && document.getElementById(id)) { const ed = w.ace.edit(id); ed.setValue(newVal, -1); ed.clearSelection(); }
        const ta = document.querySelector('textarea[name="code"]') as HTMLTextAreaElement | null;
        if (ta) { ta.value = newVal; ta.dispatchEvent(new Event("input", { bubbles: true })); ta.dispatchEvent(new Event("change", { bubbles: true })); }
        return { rec, changed: true, oldVal: oldVal.slice(0, 160), newVal: newVal.slice(0, 160) };
      }, { rec, find: p.find, replace: p.replace });
      edits.push(res);
      if ((res as any).changed) {
        await page.evaluate(() => {
          const b = Array.from(document.querySelectorAll("a,button,div,span"))
            .find((e) => (e as HTMLElement).offsetParent !== null && (e as HTMLElement).innerText.trim() === "Сохранить и закрыть");
          if (b) (b as HTMLElement).click();
        });
        await page.waitForTimeout(3200);
      } else {
        // закрыть попап, чтобы не зациклиться на том же блоке
        await page.evaluate(() => {
          const b = Array.from(document.querySelectorAll("a,button,div,span"))
            .find((e) => (e as HTMLElement).offsetParent !== null && /закрыть|отмен/i.test((e as HTMLElement).innerText.trim()) && (e as HTMLElement).innerText.trim().length < 14);
          if (b) (b as HTMLElement).click();
        });
        await page.waitForTimeout(600);
        break;
      }
    }
    const changedCount = edits.filter((e) => (e as any).changed).length;
    let published: boolean | "skipped" = "skipped";
    if (p.publish && changedCount > 0) published = await publishCurrentPage(page);
    return JSON.stringify({ pageid: p.pageid, edits, changedCount, published }, null, 2);
  } finally {
    await s.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// replace_zero_links — заменить ссылки в элементах Zero Block (кнопки и т.п.)
// через внутренний save-API артборда (/zero/submit). find — regexp, replace — строка.
// ─────────────────────────────────────────────────────────────────────────────
export const replaceZeroLinksSchema = z.object({
  pageid: z.string().describe("ID страницы Tilda"),
  find: z.string().describe("Регулярное выражение для поиска ссылки, напр. https://t\\.me/\\+[A-Za-z0-9_-]+"),
  replace: z.string().describe("Новая ссылка"),
  publish: z.boolean().optional().default(true).describe("Опубликовать страницу после изменения (по умолчанию true)"),
});

export async function handleReplaceZeroLinks(p: z.infer<typeof replaceZeroLinksSchema>): Promise<string> {
  const s = await connectCdp();
  const { page } = s;
  try {
    await openPageEditor(page, p.pageid);
    const rec = await findRecordByContent(page, p.find);
    if (!rec) return JSON.stringify({ pageid: p.pageid, error: "Zero Block с совпадением не найден" }, null, 2);
    await clickRecordButton(page, rec, "Редактировать блок");
    await page.waitForURL("**/zero/**", { timeout: 15000 }).catch(() => {});
    const frame = await findAbFrame(page, 35000);
    if (!frame) return JSON.stringify({ pageid: p.pageid, rec, error: "Артборд (ab__getDBSaveData) не готов" }, null, 2);

    const saveRes = await frame.evaluate(async ({ find, replace }): Promise<{
      error?: string; before?: string[]; after?: string[]; resp?: string;
    }> => {
      const w = window as any;
      const ab = document.querySelector(".tn-artboard") as HTMLElement | null;
      if (!ab) return { error: ".tn-artboard не найден" };
      const pageid = ab.getAttribute("data-page-id");
      const recordid = ab.getAttribute("data-record-id");
      const d = w.ab__getDBSaveData();
      const re = new RegExp(find, "g");
      let code = JSON.stringify(d.cleanElementsData);
      const before = Array.from(new Set<string>(code.match(re) || []));
      code = code.replace(re, replace);
      const after = Array.from(new Set<string>(code.match(/https?:\/\/t\.me\/\+[A-Za-z0-9_-]+/g) || []));
      const y = {
        comm: "savezerocode", pageid, recordid, onlythisfield: "code", fromzero: "yes",
        code, zb_grid: Object.keys(d.zbGrid || {}).length ? JSON.stringify(d.zbGrid) : "reset",
      };
      let resp = "";
      try {
        resp = await fetch("/zero/submit/", { method: "POST", body: w.tn__createFormData(y) }).then((r: Response) => r.text());
      } catch (e) {
        resp = "ERR:" + (e as Error).message;
      }
      return { before, after, resp: (resp || "").slice(0, 40) };
    }, { find: p.find, replace: p.replace });

    // покинуть артборд (не пересохраняя старую модель из памяти) и опубликовать
    await openPageEditor(page, p.pageid);
    let published: boolean | "skipped" = "skipped";
    if (p.publish) published = await publishCurrentPage(page);
    return JSON.stringify({ pageid: p.pageid, rec, ...saveRes, published }, null, 2);
  } finally {
    await s.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// publish_page — опубликовать страницу
// ─────────────────────────────────────────────────────────────────────────────
export const publishPageSchema = z.object({
  pageid: z.string().describe("ID страницы Tilda"),
});

export async function handlePublishPage(p: z.infer<typeof publishPageSchema>): Promise<string> {
  const s = await connectCdp();
  const { page } = s;
  try {
    await openPageEditor(page, p.pageid);
    const published = await publishCurrentPage(page);
    return JSON.stringify({ pageid: p.pageid, published }, null, 2);
  } finally {
    await s.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// verify_live — проверить живой HTML сайтов на наличие/отсутствие подстрок
// ─────────────────────────────────────────────────────────────────────────────
export const verifyLiveSchema = z.object({
  urls: z.array(z.string()).describe("Список URL или доменов для проверки"),
  contains: z.array(z.string()).optional().describe("Подстроки, которые ДОЛЖНЫ присутствовать"),
  notContains: z.array(z.string()).optional().describe("Подстроки, которых НЕ должно быть"),
});

export async function handleVerifyLive(p: z.infer<typeof verifyLiveSchema>): Promise<string> {
  const s = await connectCdp();
  const { page } = s;
  try {
    const rows: Array<Record<string, unknown>> = [];
    for (const raw of p.urls) {
      const url = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
      try {
        const { status, html } = await fetchLive(page, url);
        const containsOk = (p.contains || []).map((c) => ({ s: c, found: html.includes(c) }));
        const notContainsOk = (p.notContains || []).map((c) => ({ s: c, found: html.includes(c) }));
        const ok = containsOk.every((x) => x.found) && notContainsOk.every((x) => !x.found);
        rows.push({ url, status, ok, contains: containsOk, notContains: notContainsOk });
      } catch (e) {
        rows.push({ url, error: (e as Error).message.slice(0, 80) });
      }
    }
    return JSON.stringify(rows, null, 2);
  } finally {
    await s.close();
  }
}
