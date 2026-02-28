/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Allows users to open the side panel by clicking the action icon.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Inject content script in all tabs first.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  tabs.forEach(({ id: tabId }) => {
    if (tabId === undefined) return;
    chrome.scripting
      .executeScript({
        target: { tabId },
        files: ['dist/content.js'],
      })
      .catch(() => {});
  });
});

// Update badge text with the number of tools per tab.
chrome.tabs.onActivated.addListener(({ tabId }) => updateBadge(tabId));
chrome.tabs.onUpdated.addListener((tabId) => updateBadge(tabId));

async function updateBadge(tabId: number): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id !== tabId) return;
  chrome.action.setBadgeText({ text: '', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  chrome.tabs.sendMessage(tabId, { action: 'LIST_TOOLS' }).catch(({ message }: Error) => {
    chrome.runtime.sendMessage({ message });
  });
}

chrome.runtime.onMessage.addListener(({ tools }: { tools?: unknown[] }, { tab }) => {
  const text = tools?.length ? `${tools.length}` : '';
  if (tab?.id !== undefined) {
    chrome.action.setBadgeText({ text, tabId: tab.id });
  }
});
