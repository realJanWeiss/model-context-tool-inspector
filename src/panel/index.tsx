/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * DevTools panel entry point: bootstrap and mount.
 */

import { render } from 'solid-js/web';
import { App } from './App.js';
import '../base.css';
import '../styles.css';

// In a DevTools panel the inspected tab ID is always available synchronously.
const tabId = chrome.devtools.inspectedWindow.tabId;

(async () => {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'LIST_TOOLS' });
  } catch {
    // will surface via onMessage error payload
  }
})();

render(() => <App tabId={tabId} />, document.getElementById('app')!);
