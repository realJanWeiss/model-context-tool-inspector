console.debug('[WebMCP] Content script injected');

// navigator.modelContextTesting is an experimental API not in the standard lib.
interface McpToolRaw {
  name: string;
  description: string;
  inputSchema?: string;
}

interface ModelContextTesting {
  listTools(): McpToolRaw[];
  executeTool(name: string, inputArgs: string): Promise<string | null>;
  getCrossDocumentScriptToolResult(): Promise<string>;
  registerToolsChangedCallback(cb: () => void): void;
}

type NavWithMcp = Navigator & { modelContextTesting?: ModelContextTesting };

const nav = navigator as NavWithMcp;

chrome.runtime.onMessage.addListener(
  (
    {
      action,
      name,
      inputArgs,
    }: { action: string; name?: string; inputArgs?: string },
    _sender: chrome.runtime.MessageSender,
    reply: (result?: unknown) => void,
  ) => {
    try {
      if (!nav.modelContextTesting) {
        throw new Error(
          'Error: You must run Chrome with the "WebMCP for testing" flag enabled.',
        );
      }
      const mcp = nav.modelContextTesting;

      if (action === 'LIST_TOOLS') {
        listTools();
        mcp.registerToolsChangedCallback(listTools);
      }

      if (action === 'EXECUTE_TOOL') {
        console.debug(`[WebMCP] Execute tool "${name}" with`, inputArgs);
        let targetFrame: HTMLIFrameElement | null = null;
        let loadPromise: Promise<void> | null = null;

        // Check if this tool is associated with a form target.
        const formEl = document.querySelector<HTMLFormElement>(
          `form[toolname="${name}"]`,
        );
        const formTarget = formEl?.target;
        if (formTarget) {
          targetFrame = document.querySelector<HTMLIFrameElement>(
            `[name=${formTarget}]`,
          );
          if (targetFrame) {
            loadPromise = new Promise((resolve) => {
              targetFrame!.addEventListener('load', () => resolve(), {
                once: true,
              });
            });
          }
        }

        const promise = mcp.executeTool(name ?? '', inputArgs ?? '');
        promise
          .then(async (result: string | null) => {
            if (result === null && targetFrame && loadPromise) {
              console.debug(
                `[WebMCP] Waiting for form target ${String(targetFrame)} to load`,
              );
              await loadPromise;
              console.debug('[WebMCP] Get cross document script tool result');
              const frameMcp = (
                targetFrame.contentWindow!.navigator as NavWithMcp
              ).modelContextTesting;
              result = await frameMcp!.getCrossDocumentScriptToolResult();
            }
            reply(result);
          })
          .catch(({ message }: Error) => reply(JSON.stringify(message)));
        return true;
      }

      if (action === 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT') {
        console.debug('[WebMCP] Get cross document script tool result');
        const promise = mcp.getCrossDocumentScriptToolResult();
        promise
          .then(reply)
          .catch(({ message }: Error) => reply(JSON.stringify(message)));
        return true;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      chrome.runtime.sendMessage({ message });
    }
  },
);

function listTools(): void {
  const tools = (nav.modelContextTesting as ModelContextTesting).listTools();
  console.debug(`[WebMCP] Got ${tools.length} tools`, tools);
  chrome.runtime.sendMessage({ tools, url: location.href });
}

window.addEventListener('toolactivated', (e) => {
  console.debug(
    `[WebMCP] Tool "${(e as CustomEvent<{ toolName: string }>).detail?.toolName}" started execution.`,
  );
});

window.addEventListener('toolcancel', (e) => {
  console.debug(
    `[WebMCP] Tool "${(e as CustomEvent<{ toolName: string }>).detail?.toolName}" execution is cancelled.`,
  );
});
