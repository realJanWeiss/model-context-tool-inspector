/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Create a tab in DevTools named "WebMCP Tools".
// panel.html is the UI; the icon is optional (empty string = no icon).
chrome.devtools.panels.create(
  'WebMCP Tools',
  '',
  'panel.html',
);
