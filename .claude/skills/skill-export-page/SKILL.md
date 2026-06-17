---
name: skill-export-page
description: Экспортируй страницу
argument-hint: <page_id>
allowed-tools:
  - mcp__tilda__get_page_export
  - mcp__tilda__get_pages
  - mcp__tilda__get_projects
---

# /skill-export-page

## Algorithm

1. If page_id not given, call get_projects then get_pages to find it
2. Call get_page_export with the page_id
3. Return HTML, CSS, JS, and image list

## Examples

- /skill-export-page 67890
- Экспортируй страницу 67890
