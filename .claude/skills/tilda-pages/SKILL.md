---
name: tilda-pages
description: Получение проектов и страниц из Tilda
argument-hint: <действие> [id]
allowed-tools:
  - Bash
  - Read
---

# /tilda-pages — Работа с проектами и страницами Tilda

## Алгоритм

1. Вызови `get_projects` для получения списка проектов
2. Вызови `get_pages` для получения страниц проекта
3. Вызови `get_page` для получения полной страницы (HTML, CSS, JS)

## Формат ответа

```
## Проекты Tilda

1. Мой сайт (ID: 12345) — mysite.com
2. ...

### Страницы проекта 12345
1. Главная — /index
2. О нас — /about
```

## Примеры

```
/tilda-pages проекты
/tilda-pages страницы проекта 12345
/tilda-pages страница 67890
```
