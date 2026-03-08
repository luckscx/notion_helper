# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A personal automation tool (Node.js) for managing Notion databases. It fetches metadata from external sources (Douban, MobyGames, IGDB, RAWG, Steam) and syncs it to Notion databases for books, movies, games, habits, and meals.

## Common Commands

```bash
# Install dependencies
npm install

# Initialize / regenerate config
node init.js

# Run individual scripts
node game_refresh.js
node book_refresh.js
node movie_refresh.js
node daily_job.js
node habit_tracker.js
node meal_add_day.js
node batch_set.js
node db_column_calc.js

# Start HTTP trigger server
node websvr.js

# PM2 process management
pm2 start ecosystem.config.js
pm2 restart notion_helper
```

HTTP endpoints exposed by `websvr.js` (port 8089):
- `POST /book_refresh`, `/daily`, `/book`, `/movie`

## Architecture

### Core Modules

- **`notion_api.js`** — Custom Notion API client wrapping `@notionhq/client`. Adds proxy support (SOCKS5/HTTP), automatic retry with exponential backoff, and file upload for images. All scripts import this instead of using the official client directly.
- **`config.js`** — Single source of truth for all API keys, Notion database IDs, and proxy settings. Copy from `config_example.js` to create. Not committed to git.
- **`image_proxy.js`** — Shortens image URLs to fit Notion's 100-character URL limit using a configurable proxy service. Used by refresh scripts when uploading cover images.
- **`mobygames.js`** — MobyGames API wrapper for game metadata; includes Chinese-to-English title search fallback.
- **`search_game_name.js`** — Multi-source game title lookup (IGDB, Steam, RAWG) to resolve Chinese game names to English for MobyGames queries.

### Script Pattern

All refresh/update scripts follow the same pattern:
1. Query Notion database with cursor-based pagination
2. For each page, fetch external metadata via API
3. Patch the Notion page with updated properties
4. Use `bluebird.map` for concurrency control and `async-await-retry` for resilience

### Configuration

`config.js` exports an object with:
- `NOTION_KEY` — Notion integration token
- Database IDs: `GAME_DATABASE_ID`, `BOOK_DATABASE_ID`, `MOVIE_DATABASE_ID`, `HABIT_DATABASE_ID`, `MEAL_DATABASE_ID`, etc.
- `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` — for IGDB OAuth token (cached in `.igdb_token_cache.json`)
- `RAWG_API_KEY`
- `IMAGE_PROXY_URL` — base URL for the image shortening service
- Proxy settings: `proxyHost`, `proxyPort` (defaults to `127.0.0.1:10808`)

### Linting

ESLint with Google style guide (`eslint-config-google`). Run `npx eslint <file>` to check a file.
