/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chat sidebar entry point: bootstrap and mount.
 */

import { render } from 'solid-js/web';
import { initLMStudio } from '../lmstudio.js';
import { App } from './App.js';

void initLMStudio();

(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      await chrome.tabs.sendMessage(tab.id, { action: 'LIST_TOOLS' });
    }
  } catch {
    // content script not ready yet — tools will arrive once page loads
  }
})();

render(() => <App />, document.getElementById('app')!);
