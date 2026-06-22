#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  getProjectsSchema, handleGetProjects,
  getProjectInfoSchema, handleGetProjectInfo,
  getPagesSchema, handleGetPages,
  getPageSchema, handleGetPage,
  getPageExportSchema, handleGetPageExport,
} from "./tools/pages.js";
import {
  chromeStatusSchema, handleChromeStatus,
  setMetrikaSchema, handleSetMetrika,
  replacePageCodeSchema, handleReplacePageCode,
  replaceZeroLinksSchema, handleReplaceZeroLinks,
  publishPageSchema, handlePublishPage,
  verifyLiveSchema, handleVerifyLive,
} from "./tools/actions.js";
import {
  zeroGetElementsSchema, handleZeroGetElements,
  zeroUpdateElementSchema, handleZeroUpdateElement,
  zeroAddElementSchema, handleZeroAddElement,
  zeroDeleteElementSchema, handleZeroDeleteElement,
  zeroSetTextSchema, handleZeroSetText,
} from "./tools/zero.js";

const TOOL_COUNT = 16;

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "tilda-mcp-cdp",
    version: "1.3.0",
  });

  server.tool(
    "get_projects",
    "Получить список проектов Tilda.",
    getProjectsSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleGetProjects(params) }] }),
  );

  server.tool(
    "get_project_info",
    "Получить подробную информацию о проекте Tilda (домен, настройки, CSS/JS).",
    getProjectInfoSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleGetProjectInfo(params) }] }),
  );

  server.tool(
    "get_pages",
    "Получить список страниц проекта Tilda.",
    getPagesSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleGetPages(params) }] }),
  );

  server.tool(
    "get_page",
    "Получить полную информацию о странице Tilda (HTML, CSS, JS).",
    getPageSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleGetPage(params) }] }),
  );

  server.tool(
    "get_page_export",
    "Экспортировать страницу Tilda — HTML, CSS, JS, изображения для самостоятельного хостинга.",
    getPageExportSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleGetPageExport(params) }] }),
  );

  // ── Действия (запись) через залогиненный Chrome по CDP ──
  // Требуется Chrome с --remote-debugging-port=9222 (отдельный профиль) + вход в Tilda.

  server.tool(
    "chrome_status",
    "Проверить подключение к Chrome по CDP и сессию Tilda (залогинен ли пользователь).",
    chromeStatusSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleChromeStatus(params) }] }),
  );

  server.tool(
    "set_metrika",
    "Задать ID Яндекс.Метрики в настройках проекта Tilda. Затем нужна перепубликация страниц.",
    setMetrikaSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleSetMetrika(params) }] }),
  );

  server.tool(
    "replace_page_code",
    "Заменить текст (regexp) в HTML-код-блоках T123 страницы — напр. сторонние скрипты/трекеры. По умолчанию публикует страницу.",
    replacePageCodeSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleReplacePageCode(params) }] }),
  );

  server.tool(
    "replace_zero_links",
    "Заменить ссылки (regexp) в элементах Zero Block страницы — напр. ссылки кнопок. По умолчанию публикует страницу.",
    replaceZeroLinksSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleReplaceZeroLinks(params) }] }),
  );

  server.tool(
    "publish_page",
    "Опубликовать страницу Tilda (изменения становятся видны на живом сайте).",
    publishPageSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handlePublishPage(params) }] }),
  );

  server.tool(
    "verify_live",
    "Проверить живой HTML сайтов: какие подстроки присутствуют/отсутствуют (с обходом кэша).",
    verifyLiveSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleVerifyLive(params) }] }),
  );

  // ── Редактор Zero Block (через тот же save-API артборда) ──
  // Читать модель → патчить/добавлять/удалять элементы → сохранять → публиковать.

  server.tool(
    "zero_get_elements",
    "Прочитать модель Zero Block: список элементов (тип, текст, ссылки, геометрия, все поля). Вызывайте перед правками.",
    zeroGetElementsSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleZeroGetElements(params) }] }),
  );

  server.tool(
    "zero_update_element",
    "Изменить элемент(ы) Zero Block: deep-merge JSON-патча по id/index/тексту — текст, цвет, шрифт, размер, позиция, ссылка. По умолчанию публикует.",
    zeroUpdateElementSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleZeroUpdateElement(params) }] }),
  );

  server.tool(
    "zero_add_element",
    "Добавить элемент в Zero Block: клонировать существующий (schema-safe) с патчем или вставить произвольный объект. По умолчанию публикует.",
    zeroAddElementSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleZeroAddElement(params) }] }),
  );

  server.tool(
    "zero_delete_element",
    "Удалить элемент(ы) Zero Block по id/index/тексту. По умолчанию публикует.",
    zeroDeleteElementSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleZeroDeleteElement(params) }] }),
  );

  server.tool(
    "zero_set_text",
    "Заменить текст/строки (regexp) по всей модели Zero Block. По умолчанию публикует.",
    zeroSetTextSchema.shape,
    async (params) => ({ content: [{ type: "text", text: await handleZeroSetText(params) }] }),
  );

  return server;
}

async function startHttpMode(port: number) {
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const { createServer } = await import("node:http");

  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", tools: TOOL_COUNT }));
      return;
    }

    if (url.pathname === "/mcp") {
      // Parse body for POST requests
      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        await transport.handleRequest(req, res, body);
      } else {
        await transport.handleRequest(req, res);
      }
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  httpServer.listen(port, () => {
    console.error(`[tilda-mcp-cdp] HTTP mode on :${port}/mcp — ${TOOL_COUNT} tools`);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const httpMode = args.includes("--http");
  const portIdx = args.indexOf("--port");
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3001;

  if (httpMode) {
    await startHttpMode(port);
  } else {
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[tilda-mcp-cdp] Сервер запущен (stdio). ${TOOL_COUNT} инструментов. Требуется TILDA_PUBLIC_KEY + TILDA_SECRET_KEY.`);
  }
}

main().catch((error) => {
  console.error("[tilda-mcp-cdp] Ошибка:", error);
  process.exit(1);
});

export { createMcpServer };
