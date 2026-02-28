# AGENTS.md — model-context-tool-inspector

This file describes the project structure, conventions, and guidelines for agentic coding assistants working in this repository.

---

## Project Overview

This is a **Chrome Extension (Manifest V3)** that acts as a side-panel inspector for the [Model Context Protocol](https://modelcontextprotocol.io/) / WebMCP tool API. It lists available tools exposed by a page, lets the user invoke them, and integrates with a local LM Studio instance to drive an AI agent loop.

The extension is **loaded directly as unpacked source** into Chrome — there is no compile/transpile step. All source files are plain ES2022+ JavaScript.

---

## File Structure

```
manifest.json       # Chrome Extension Manifest v3
background.js       # Service worker (MV3 background script)
content.js          # Content script injected into all pages
sidebar.html        # Extension side panel UI (HTML entry point)
sidebar.js          # Main application logic (~560 lines)
styles.css          # All CSS for the sidebar UI
package.json        # devDependencies only (esbuild; no scripts defined)
```

All source lives at the **root level** — there is no `src/`, `dist/`, `lib/`, or `test/` directory.

---

## Build, Lint, and Test Commands

### Loading the extension
There is no build step. Load the extension in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this directory

### Build
`esbuild` is present as a devDependency (used historically to bundle external deps), but there is no active build script. If a bundling step becomes necessary:
```bash
npm install
npx esbuild <entrypoint> --bundle --outfile=<output>
```

### Lint / Format
No ESLint or Prettier config exists. There are currently **no lint or format commands**.

### Tests
There are **no tests and no test runner**. There is no `jest.config.*`, `vitest.config.*`, or any test file. When adding tests in the future, document the runner and commands here.

---

## Chrome Extension Specifics

- **Manifest V3**: background is a service worker (`background.js`), not a persistent page.
- **Side Panel API**: the UI is rendered in `sidebar.html` using `chrome.sidePanel`.
- **Content script** (`content.js`) bridges the page's `navigator.modelContextTesting` API to the extension via `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`.
- **No `eval`, no remote code**: MV3 CSP prohibits these.
- **Permissions**: declared in `manifest.json`; do not add permissions without updating the manifest.

---

## Key Constraints

- Do not introduce TypeScript, a bundler, or a UI framework without updating this file and the README.
- Do not add runtime `npm` dependencies without a clear bundling strategy (the extension loads files directly from disk).
- Keep the flat file structure unless a major refactor is explicitly planned.
- All changes must be loadable as an unpacked extension without any build step, unless a build pipeline is explicitly added.
