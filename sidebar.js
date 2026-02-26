/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const LM_STUDIO_BASE_URL = "http://localhost:1234";
const LM_STUDIO_MODELS_URL = `${LM_STUDIO_BASE_URL}/v1/models`;
const LM_STUDIO_CHAT_COMPLETIONS_URL = `${LM_STUDIO_BASE_URL}/v1/chat/completions`;

const statusDiv = document.getElementById("status");
const tbody = document.getElementById("tableBody");
const thead = document.getElementById("tableHeaderRow");
const copyToClipboard = document.getElementById("copyToClipboard");
const copyAsScriptToolConfig = document.getElementById(
	"copyAsScriptToolConfig",
);
const copyAsJSON = document.getElementById("copyAsJSON");
const toolNames = document.getElementById("toolNames");
const inputArgsText = document.getElementById("inputArgsText");
const executeBtn = document.getElementById("executeBtn");
const toolResults = document.getElementById("toolResults");
const userPromptText = document.getElementById("userPromptText");
const promptBtn = document.getElementById("promptBtn");
const traceBtn = document.getElementById("traceBtn");
const resetBtn = document.getElementById("resetBtn");
const promptResults = document.getElementById("promptResults");

// Inject content script first.
(async () => {
	try {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		await chrome.tabs.sendMessage(tab.id, { action: "LIST_TOOLS" });
	} catch (error) {
		const statusDiv = document.getElementById("status");
		statusDiv.textContent = error;
		statusDiv.hidden = false;
		copyToClipboard.hidden = true;
	}
})();

let currentTools;

let userPromptPendingId = 0;
let lastSuggestedUserPrompt = "";

// Listen for the results coming back from content.js
chrome.runtime.onMessage.addListener(
	async ({ message, tools, url }, sender) => {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (sender.tab && sender.tab.id !== tab.id) return;

		tbody.innerHTML = "";
		thead.innerHTML = "";
		toolNames.innerHTML = "";

		statusDiv.textContent = message;
		statusDiv.hidden = !message;

		const haveNewTools = JSON.stringify(currentTools) !== JSON.stringify(tools);

		currentTools = tools;

		if (!tools || tools.length === 0) {
			const row = document.createElement("tr");
			row.innerHTML = `<td colspan="100%"><i>No tools registered yet in ${url || tab.url}</i></td>`;
			tbody.appendChild(row);
			inputArgsText.value = "";
			inputArgsText.disabled = true;
			toolNames.disabled = true;
			executeBtn.disabled = true;
			copyToClipboard.hidden = true;
			return;
		}

		inputArgsText.disabled = false;
		toolNames.disabled = false;
		executeBtn.disabled = false;
		copyToClipboard.hidden = false;

		const keys = Object.keys(tools[0]);
		keys.forEach((key) => {
			const th = document.createElement("th");
			th.textContent = key;
			thead.appendChild(th);
		});

		tools.forEach((item) => {
			const row = document.createElement("tr");
			keys.forEach((key) => {
				const td = document.createElement("td");
				try {
					td.innerHTML = `<pre>${JSON.stringify(JSON.parse(item[key]), "", "  ")}</pre>`;
				} catch (error) {
					td.textContent = item[key];
				}
				row.appendChild(td);
			});
			tbody.appendChild(row);

			const option = document.createElement("option");
			option.textContent = `"${item.name}"`;
			option.value = item.name;
			option.dataset.inputSchema = item.inputSchema;
			toolNames.appendChild(option);
		});
		updateDefaultValueForInputArgs();

		if (haveNewTools) suggestUserPrompt();
	},
);

tbody.ondblclick = () => {
	tbody.classList.toggle("prettify");
};

copyAsScriptToolConfig.onclick = async () => {
	const text = currentTools
		.map((tool) => {
			return `\
script_tools {
  name: "${tool.name}"
  description: "${tool.description}"
  input_schema: ${JSON.stringify(tool.inputSchema || { type: "object", properties: {} })}
}`;
		})
		.join("\r\n");
	await navigator.clipboard.writeText(text);
};

copyAsJSON.onclick = async () => {
	const tools = currentTools.map((tool) => {
		return {
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema
				? JSON.parse(tool.inputSchema)
				: { type: "object", properties: {} },
		};
	});
	await navigator.clipboard.writeText(JSON.stringify(tools, "", "  "));
};

// Interact with the page

let selectedModel;

initLMStudio();

async function initLMStudio() {
	promptBtn.disabled = false;
	resetBtn.disabled = false;

	try {
		const models = await getAvailableModels();
		if (models.length > 0) {
			const storedModel = localStorage.model;
			selectedModel = models.some((model) => model.id === storedModel)
				? storedModel
				: models[0].id;
			localStorage.model = selectedModel;
		} else {
			selectedModel = localStorage.model || "local-model";
			localStorage.model = selectedModel;
		}
	} catch {
		selectedModel = localStorage.model || "local-model";
		localStorage.model = selectedModel;
	}
}

async function suggestUserPrompt() {
	if (
		currentTools.length == 0 ||
		userPromptText.value !== lastSuggestedUserPrompt
	)
		return;
	const userPromptId = ++userPromptPendingId;
	const response = await createChatCompletion([
		{
			role: "system",
			content: [
				`Today's date is: ${getFormattedDate()}`,
				"Generate one natural user query for the available tools.",
				"Keep it concise and output query text only.",
			].join("\n"),
		},
		{
			role: "user",
			content: `Available tools:\n${JSON.stringify(currentTools)}`,
		},
	]);
	if (
		userPromptId !== userPromptPendingId ||
		userPromptText.value !== lastSuggestedUserPrompt
	)
		return;
	const suggestion = response?.choices?.[0]?.message?.content?.trim();
	if (!suggestion) return;

	lastSuggestedUserPrompt = suggestion;
	userPromptText.value = "";
	for (const chunk of suggestion) {
		await new Promise((r) => requestAnimationFrame(r));
		userPromptText.value += chunk;
	}
}

userPromptText.onkeydown = (event) => {
	if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
		event.preventDefault();
		promptBtn.click();
	}
};

promptBtn.onclick = async () => {
	try {
		await promptAI();
	} catch (error) {
		trace.push({ error });
		logPrompt(`⚠️ Error: "${error}"`);
	}
};

let trace = [];

async function promptAI() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

	const message = userPromptText.value.trim();
	if (!message) return;

	userPromptText.value = "";
	lastSuggestedUserPrompt = "";
	promptResults.textContent += `User prompt: "${message}"\n`;
	const messages = [
		{ role: "system", content: getSystemInstruction() },
		{ role: "user", content: message },
	];
	trace.push({ userPrompt: { message, tools: getOpenAITools() } });

	let finalResponseGiven = false;

	while (!finalResponseGiven) {
		const response = await createChatCompletion(messages, getOpenAITools());
		trace.push({ response });
		const assistantMessage = response?.choices?.[0]?.message;
		if (!assistantMessage) {
			logPrompt(
				`⚠️ AI response is missing a message: ${JSON.stringify(response)}`,
			);
			return;
		}

		const functionCalls = assistantMessage.tool_calls || [];

		messages.push({
			role: "assistant",
			content: assistantMessage.content || "",
			tool_calls: functionCalls,
		});

		if (functionCalls.length === 0) {
			if (!assistantMessage.content) {
				logPrompt(`⚠️ AI response has no text: ${JSON.stringify(response)}\n`);
			} else {
				logPrompt(`AI result: ${assistantMessage.content.trim()}\n`);
			}
			finalResponseGiven = true;
		} else {
			for (const functionCall of functionCalls) {
				const name = functionCall?.function?.name;
				const rawArgs = functionCall?.function?.arguments || "{}";

				if (!name) {
					logPrompt(
						`⚠️ Malformed tool call from AI: ${JSON.stringify(functionCall)}`,
					);
					continue;
				}

				const inputArgs = normalizeInputArgs(rawArgs);
				logPrompt(`AI calling tool "${name}" with ${inputArgs}`);
				try {
					const result = await executeTool(tab.id, name, inputArgs);
					logPrompt(`Tool "${name}" result: ${result}`);
					messages.push({
						role: "tool",
						tool_call_id: functionCall.id,
						content: stringifyToolContent({ result }),
					});
				} catch (e) {
					logPrompt(`⚠️ Error executing tool "${name}": ${e.message}`);
					messages.push({
						role: "tool",
						tool_call_id: functionCall.id,
						content: stringifyToolContent({ error: e.message }),
					});
				}
			}

			// FIXME: New WebMCP tools may not be discovered if there's a navigation.
			// An articial timeout is introduced for mitigation but it's not robust enough.
			await new Promise((r) => setTimeout(r, 500));

			const sendMessageParams = { message: toolResponses, config: getConfig() };
			trace.push({ userPrompt: sendMessageParams });
			currentResult = await chat.sendMessage(sendMessageParams);
		}
	}
}

resetBtn.onclick = () => {
	trace = [];
	userPromptText.value = "";
	lastSuggestedUserPrompt = "";
	promptResults.textContent = "";
	suggestUserPrompt();
};

traceBtn.onclick = async () => {
	const text = JSON.stringify(trace, "", " ");
	await navigator.clipboard.writeText(text);
};

executeBtn.onclick = async () => {
	toolResults.textContent = "";
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	const name = toolNames.selectedOptions[0].value;
	const inputArgs = inputArgsText.value;
	toolResults.textContent = await executeTool(tab.id, name, inputArgs).catch(
		(error) => `⚠️ Error: "${error}"`,
	);
};

async function executeTool(tabId, name, inputArgs) {
	try {
		const result = await chrome.tabs.sendMessage(tabId, {
			action: "EXECUTE_TOOL",
			name,
			inputArgs,
		});
		if (result !== null) return result;
	} catch (error) {
		if (!error.message.includes("message channel is closed")) throw error;
	}
	// A navigation was triggered. The result will be on the next document.
	// TODO: Handle case where a new tab is opened.
	await waitForPageLoad(tabId);
	return await chrome.tabs.sendMessage(tabId, {
		action: "GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT",
	});
}

toolNames.onchange = updateDefaultValueForInputArgs;

function updateDefaultValueForInputArgs() {
	const inputSchema = toolNames.selectedOptions[0].dataset.inputSchema || "{}";
	const template = generateTemplateFromSchema(JSON.parse(inputSchema));
	inputArgsText.value = JSON.stringify(template, "", " ");
}

// Utils

function logPrompt(text) {
	promptResults.textContent += `${text}\n`;
	promptResults.scrollTop = promptResults.scrollHeight;
}

function getFormattedDate() {
	const today = new Date();
	return today.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function getSystemInstruction() {
	return [
		"You are an assistant embedded in a browser tab.",
		"User prompts typically refer to the current tab unless stated otherwise.",
		"Use your tools to query page content when you need it.",
		`Today's date is: ${getFormattedDate()}`,
		'CRITICAL RULE: Whenever the user provides a relative date (e.g., "next Monday", "tomorrow", "in 3 days"),  you must calculate the exact calendar date based on today\'s date.',
	].join("\n");
}

function getOpenAITools() {
	return currentTools.map((tool) => {
		return {
			type: "function",
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.inputSchema
					? JSON.parse(tool.inputSchema)
					: { type: "object", properties: {} },
			},
		};
	});
}

async function getAvailableModels() {
	const response = await fetch(LM_STUDIO_MODELS_URL);
	if (!response.ok) {
		throw new Error(
			`Failed to list LM Studio models: ${response.status} ${response.statusText}`,
		);
	}
	const json = await response.json();
	return json.data || [];
}

async function createChatCompletion(messages, tools = []) {
	const payload = {
		model: selectedModel || localStorage.model || "local-model",
		messages,
		temperature: 0.2,
	};

	if (tools.length > 0) {
		payload.tools = tools;
		payload.tool_choice = "auto";
	}

	const response = await fetch(LM_STUDIO_CHAT_COMPLETIONS_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`LM Studio request failed (${response.status}): ${errorText || response.statusText}`,
		);
	}

	return response.json();
}

function normalizeInputArgs(rawArgs) {
	if (!rawArgs) return "{}";
	if (typeof rawArgs === "string") {
		try {
			return JSON.stringify(JSON.parse(rawArgs));
		} catch {
			return "{}";
		}
	}
	return JSON.stringify(rawArgs);
}

function stringifyToolContent(content) {
	if (typeof content === "string") return content;
	try {
		return JSON.stringify(content);
	} catch {
		return String(content);
	}
}

function generateTemplateFromSchema(schema) {
	if (!schema || typeof schema !== "object") {
		return null;
	}

	if (Object.hasOwn(schema, "const")) {
		return schema.const;
	}

	if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
		return generateTemplateFromSchema(schema.oneOf[0]);
	}

	if (Object.hasOwn(schema, "default")) {
		return schema.default;
	}

	if (Array.isArray(schema.examples) && schema.examples.length > 0) {
		return schema.examples[0];
	}

	switch (schema.type) {
		case "object": {
			const obj = {};
			if (schema.properties) {
				Object.keys(schema.properties).forEach((key) => {
					obj[key] = generateTemplateFromSchema(schema.properties[key]);
				});
			}
			return obj;
		}

		case "array":
			if (schema.items) {
				return [generateTemplateFromSchema(schema.items)];
			}
			return [];

		case "string":
			if (schema.enum && schema.enum.length > 0) {
				return schema.enum[0];
			}
			if (schema.format === "date") {
				return new Date().toISOString().substring(0, 10);
			}
			// yyyy-MM-ddThh:mm:ss.SSS
			if (
				schema.format ===
				"^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\\.[0-9]{1,3})?)?$"
			) {
				return new Date().toISOString().substring(0, 23);
			}
			// yyyy-MM-ddThh:mm:ss
			if (
				schema.format ===
				"^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$"
			) {
				return new Date().toISOString().substring(0, 19);
			}
			// yyyy-MM-ddThh:mm
			if (
				schema.format ===
				"^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]$"
			) {
				return new Date().toISOString().substring(0, 16);
			}
			// yyyy-MM
			if (schema.format === "^[0-9]{4}-(0[1-9]|1[0-2])$") {
				return new Date().toISOString().substring(0, 7);
			}
			// yyyy-Www
			if (schema.format === "^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$") {
				return `${new Date().toISOString().substring(0, 4)}-W01`;
			}
			// HH:mm:ss.SSS
			if (
				schema.format ===
				"^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\\.[0-9]{1,3})?)?$"
			) {
				return new Date().toISOString().substring(11, 23);
			}
			// HH:mm:ss
			if (schema.format === "^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$") {
				return new Date().toISOString().substring(11, 19);
			}
			// HH:mm
			if (schema.format === "^([01][0-9]|2[0-3]):[0-5][0-9]$") {
				return new Date().toISOString().substring(11, 16);
			}
			if (schema.format === "^#[0-9a-zA-Z]{6}$") {
				return "#ff00ff";
			}
			if (schema.format === "tel") {
				return "123-456-7890";
			}
			if (schema.format === "email") {
				return "user@example.com";
			}
			return "example_string";

		case "number":
		case "integer":
			if (schema.minimum !== undefined) return schema.minimum;
			return 0;

		case "boolean":
			return false;

		case "null":
			return null;

		default:
			return {};
	}
}

function waitForPageLoad(tabId) {
	return new Promise((resolve) => {
		const listener = (updatedTabId, changeInfo) => {
			if (updatedTabId === tabId && changeInfo.status === "complete") {
				chrome.tabs.onUpdated.removeListener(listener);
				resolve();
			}
		};
		chrome.tabs.onUpdated.addListener(listener);
	});
}

document.querySelectorAll(".collapsible-header").forEach((header) => {
	header.addEventListener("click", () => {
		header.classList.toggle("collapsed");
		const content = header.nextElementSibling;
		if (content?.classList.contains("section-content")) {
			content.classList.toggle("is-hidden");
		}
	});
});
