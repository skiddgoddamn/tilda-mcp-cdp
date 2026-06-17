# tilda-mcp-cdp

MCP-сервер для **Tilda** с поддержкой массового редактирования. **11 инструментов:**
5 на чтение через официальный API + 6 на запись через залогиненный Chrome по CDP
(Яндекс.Метрика, код-блоки T123, ссылки Zero Block, публикация, проверка живого кода).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Расширение проекта [theYahia/tilda-mcp](https://github.com/theYahia/tilda-mcp) (read-only API).
> Здесь добавлен слой **действий через CDP**, потому что официальный API Tilda не умеет писать.

## Зачем

Официальный Tilda API (`api.tildacdn.info`) — **только чтение**. Любые изменения сайта
(счётчик Метрики, сторонние скрипты в блоках, ссылки кнопок, публикация) делаются только
в интерфейсе. Этот сервер автоматизирует их, управляя твоим **залогиненным Chrome** по
протоколу отладки (CDP) — так можно массово править десятки одинаковых лендингов одной командой.

## Требования

- Node.js ≥ 18
- Для **чтения**: `TILDA_PUBLIC_KEY` + `TILDA_SECRET_KEY` ([настройки аккаунта Tilda](https://tilda.cc/identity/apikeys/))
- Для **действий**: запущенный Chrome с портом отладки и входом в Tilda (см. ниже)

## Установка

```bash
git clone https://github.com/skiddgoddamn/tilda-mcp-cdp.git
cd tilda-mcp-cdp
npm install
npm run build
```

### Подключение к Claude Code / Desktop / Cursor

```json
{
  "mcpServers": {
    "tilda": {
      "command": "node",
      "args": ["/абсолютный/путь/tilda-mcp-cdp/dist/index.js"],
      "env": {
        "TILDA_PUBLIC_KEY": "your-public-key",
        "TILDA_SECRET_KEY": "your-secret-key",
        "TILDA_CDP_URL": "http://localhost:9222"
      }
    }
  }
}
```

### Запуск debug-Chrome (для инструментов записи)

Chrome 136+ блокирует порт отладки на профиле по умолчанию (защита cookies), поэтому
запускаем на **отдельном профиле** и один раз логинимся в Tilda:

```bat
chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug-tilda" --no-first-run https://tilda.cc/projects/
```

Проверить, что всё подключилось: вызови инструмент `chrome_status` — он покажет
`connected`, `loggedIn` и аккаунт. Адрес CDP меняется переменной `TILDA_CDP_URL`.

### Streamable HTTP

```bash
TILDA_PUBLIC_KEY=xxx TILDA_SECRET_KEY=yyy node dist/index.js --http --port 3001
# Endpoint: http://localhost:3001/mcp   Health: http://localhost:3001/health
```

## Инструменты (11)

### Чтение — официальный API

| Инструмент | Описание |
|------------|----------|
| `get_projects` | Список проектов |
| `get_project_info` | Подробная информация о проекте (домен, настройки, CSS/JS) |
| `get_pages` | Список страниц проекта |
| `get_page` | Полная информация о странице (HTML, CSS, JS) |
| `get_page_export` | Экспорт страницы для самостоятельного хостинга |

### Действия — через Chrome по CDP

| Инструмент | Аргументы | Описание |
|------------|-----------|----------|
| `chrome_status` | — | Проверка CDP-подключения и сессии Tilda |
| `set_metrika` | `projectid`, `metrikaId` | ID Яндекс.Метрики в настройках проекта |
| `replace_page_code` | `pageid`, `find`, `replace`, `publish?` | Замена (regexp) в HTML-код-блоках T123 — напр. трекеры |
| `replace_zero_links` | `pageid`, `find`, `replace`, `publish?` | Замена ссылок (regexp) в элементах Zero Block — напр. кнопки |
| `publish_page` | `pageid` | Опубликовать страницу |
| `verify_live` | `urls`, `contains?`, `notContains?` | Проверка живого HTML на наличие/отсутствие подстрок |

- `find` — это **регулярное выражение** (флаг `g` применяется автоматически).
- `replace_page_code` и `replace_zero_links` по умолчанию публикуют страницу (`publish: true`).
- Изменения видны на сайте только после публикации.

### Как это работает под капотом

- **Метрика** — поле `#yandexmetrikaid` в настройках проекта (вкладка «Аналитика»).
- **Код-блоки T123** — содержимое редактируется в ACE-редакторе (`window.ace`), сохранение «Сохранить и закрыть».
- **Ссылки Zero Block** — берётся модель блока (`ab__getDBSaveData()`), ссылки заменяются в `cleanElementsData` и сохраняются POST-запросом `/zero/submit/` (детерминированно, без кликов по холсту).
- **Публикация** — кнопка `#page_menu_publishlink`.
- **Проверка** — живой HTML грузится через сам браузер с обходом кэша (`tilda.ws` отдаёт 403 на прямые запросы).

## Примеры запросов

```
# Чтение
Покажи мои проекты в Tilda
Список страниц проекта 12345
Экспортируй страницу 67890

# Действия (нужен запущенный debug-Chrome)
Проверь статус Chrome
Поставь Метрику 109756541 в проект 23943806, потом опубликуй её страницы
На странице 131579756 замени в коде counterID=108377870 на counterID=109756541
На странице 131579756 замени ссылку https://t\.me/\+\w+ на https://t.me/+NEW и опубликуй
Проверь, что на dubaiphonemart.com есть +NEW и нет +OLD
```

## Разработка

```bash
npm run dev     # запуск из исходников (tsx)
npm run build   # сборка в dist/
npm test        # тесты (vitest)
```

## Лицензия

MIT. Основано на [theYahia/tilda-mcp](https://github.com/theYahia/tilda-mcp).
