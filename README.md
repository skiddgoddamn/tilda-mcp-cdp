# tilda-mcp-cdp

MCP-сервер для **Tilda** с поддержкой массового редактирования. **16 инструментов:**
5 на чтение через официальный API + 11 на запись через залогиненный Chrome по CDP
(Яндекс.Метрика, код-блоки T123, ссылки Zero Block, **полноценный редактор элементов
Zero Block**, публикация, проверка живого кода).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Официальный API Tilda умеет только читать. Этот сервер добавляет слой **действий через CDP**
> (управление залогиненным Chrome), чтобы массово править сайты прямо из MCP.

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

## Инструменты (16)

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

### Редактор Zero Block — через CDP

Полноценное редактирование элементов Zero Block по модели артборда (детерминированно,
без кликов по холсту). Сначала всегда `zero_get_elements`, чтобы увидеть реальные id и
имена полей, потом правишь.

| Инструмент | Аргументы | Описание |
|------------|-----------|----------|
| `zero_get_elements` | `pageid`, `recId?`/`match?`, `raw?` | Список элементов блока: тип, текст, ссылки, геометрия, все поля (`raw` — полный объект) |
| `zero_update_element` | `pageid`, `recId?`/`match?`, `id?`/`index?`/`textContains?`, `patch`, `publish?` | Deep-merge JSON-патча в элемент(ы): текст, цвет, шрифт, размер, позиция, ссылка (`null` удаляет поле) |
| `zero_add_element` | `pageid`, `recId?`/`match?`, `cloneId?`/`cloneIndex?`/`cloneTextContains?`, `element?`, `patch?`, `newId?`, `publish?` | Добавить элемент: клон существующего (schema-safe) + патч, либо произвольный JSON-объект |
| `zero_delete_element` | `pageid`, `recId?`/`match?`, `id?`/`index?`/`textContains?`, `publish?` | Удалить выбранный элемент(ы) |
| `zero_set_text` | `pageid`, `recId?`/`match?`, `find`, `replace`, `publish?` | Regexp-замена текста/строк по всей модели блока |

- `find` — это **регулярное выражение** (флаг `g` применяется автоматически).
- Действия записи (`replace_page_code`, `replace_zero_links`, `zero_*`) по умолчанию публикуют страницу (`publish: true`).
- Изменения видны на сайте только после публикации.
- **Выбор Zero Block:** `recId` (если знаешь) или `match` — regexp по содержимому блока.
- **Выбор элемента:** `id` (ключ из `zero_get_elements`), `index` (0-based) или `textContains`. Критерии объединяются по И.

### Как это работает под капотом

- **Метрика** — поле `#yandexmetrikaid` в настройках проекта (вкладка «Аналитика»).
- **Код-блоки T123** — содержимое редактируется в ACE-редакторе (`window.ace`), сохранение «Сохранить и закрыть».
- **Ссылки Zero Block** — берётся модель блока (`ab__getDBSaveData()`), ссылки заменяются в `cleanElementsData` и сохраняются POST-запросом `/zero/submit/` (детерминированно, без кликов по холсту).
- **Редактор Zero Block** (`zero_*`) — тот же путь, обобщённый: модель `cleanElementsData` читается из артборда наружу, правится в Node (deep-merge патча / клонирование / удаление / regexp) и сохраняется обратно `/zero/submit/`. Схема полей не хардкодится — `zero_get_elements` показывает реальные имена, новые элементы создаются клонированием существующих (всегда валидны).
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

# Редактор Zero Block
Покажи элементы Zero Block на странице 131579756 (match: "Оставить заявку")
В блоке с текстом "45%" поменяй текст элемента с "45" на "от 45% годовых*"
Добавь вторую кнопку: склонируй элемент с textContains "Оставить заявку", патч text="Узнать подробнее", top=650
Удали элемент с index 4 в Zero Block страницы 131579756
```

## Разработка

```bash
npm run dev     # запуск из исходников (tsx)
npm run build   # сборка в dist/
npm test        # тесты (vitest)
```

## Лицензия

MIT
