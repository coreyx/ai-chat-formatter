/**
 * Regression checks for spec/conversation-copy: the Conversation button and
 * its turn-by-turn copy on Duck.ai and Copilot, against synthetic fixtures
 * modeled on duck.ai's and copilot.com's markup. Run with `pnpm test`, which
 * runs every scratch/test_*.ts script. Each check prints PASS or FAIL, and
 * the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { ContentController } from "../src/content/controller";
import { buildDefaultSettings, type Settings } from "../src/core/settings";
import type { SiteAdapter } from "../src/core/types";
import { COPILOT_REPLY_SELECTOR, copilotAdapter, readCopilotTurns } from "../src/sites/copilot";
import { DUCK_AI_REPLY_SELECTOR, duckAiAdapter, readDuckAiTurns } from "../src/sites/duckai";

const results: { name: string; error?: unknown }[] = [];

/** Runs `fn` as one named check and records whether it threw. */
function check(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name });
  } catch (error) {
    results.push({ name, error });
  }
}

// ---------------------------------------------------------------------------
// Duck.ai: the conversation as a message
// ---------------------------------------------------------------------------

check("duck.ai: the older, flat layout's conversation is found and split into its two turns, each with its prompt", () => {
  const page = new JSDOM(readFileSync("scratch/fixtures/duckai-message.html", "utf8")).window.document;
  const conversations = Array.from(page.querySelectorAll(duckAiAdapter.messageSelector)).filter((message) => !message.matches(DUCK_AI_REPLY_SELECTOR));
  assert.equal(conversations.length, 1);
  const turns = readDuckAiTurns(conversations[0])!;
  assert.deepEqual(turns.map((turn) => turn.prompt), ["What is new in Widget 5?", "Any other reading?\n\nList two."]);
  assert.deepEqual(turns.map((turn) => turn.reply.id.slice(-5)), ["e-0-1", "e-1-1"]);
  assert.equal(readDuckAiTurns(turns[0].reply), null, "a reply isn't split into turns");
  assert.equal(duckAiAdapter.buttonLabel?.(turns[0].reply), null);
  assert.equal(duckAiAdapter.buttonLabel?.(conversations[0])?.text, "Conversation");
});

/** `adapter` running on `document` with its settings changed by `edit`, recording what's copied. */
function start(adapter: SiteAdapter, document: Document, edit: (settings: Settings) => void = () => {}) {
  const settings = buildDefaultSettings([adapter]);
  edit(settings);
  const copied: string[] = [];
  const controller = new ContentController(adapter, settings, { document, writeClipboard: async (text) => void copied.push(text), requestFrame: (callback) => callback() });
  controller.start();
  const conversationButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[title="Copy conversation as Markdown"]'));
  return { controller, settings, copied, conversationButtons };
}

/** A minimal Duck.ai chat in the 2026-10-28 layout: the header in the first turn wrapper, and two turns. */
function duckAiChat(withHeader = true): Document {
  const header = withHeader ? '<div class="hd"><h1>A chat</h1><div><div><button type="button" aria-label="menu" aria-haspopup="menu" aria-expanded="false"></button></div></div><div>Privacy line</div></div>' : "";
  const turn = (n: number, header = "") =>
    `<div class="turn">${header}<div data-testid="user-message"><div><div style="white-space: pre-wrap"><p>Question ${n}?</p></div></div></div><div id="00000000-0000-4000-8000-000000000000-assistant-message-${n - 1}-1" data-activeresponse="true"><div><div data-dark-theme=""><h1>Answer heading</h1><p>Answer ${n}.</p></div></div><div data-message-actions="true"><div><button type="button" aria-label="Copy to clipboard" data-copyairesponse="true"></button></div></div></div></div>`;
  return new JSDOM(`<!doctype html><body><main><section><div class="turns">${turn(1, header)}${turn(2)}</div></section></main></body>`).window.document;
}

check("duck.ai: the Conversation button goes right before the header's ⋮, once over many passes, and replies keep theirs", () => {
  const document = duckAiChat();
  const page = start(duckAiAdapter, document);
  page.controller.sync();
  page.controller.sync();
  assert.equal(page.conversationButtons().length, 1);
  const [button] = page.conversationButtons();
  assert.equal(button.parentElement, document.querySelector(".hd"));
  assert.ok(button.nextElementSibling?.querySelector('button[aria-label="menu"]'));
  assert.equal(button.textContent, "Conversation");
  assert.equal(document.querySelectorAll(`${DUCK_AI_REPLY_SELECTOR} [data-acf-injected]`).length, 2);
});

check("duck.ai: no header, no Conversation button; a reply's heading isn't taken for the title; the setting off removes it", () => {
  assert.equal(start(duckAiAdapter, duckAiChat(false)).conversationButtons().length, 0);
  const page = start(duckAiAdapter, duckAiChat());
  const off = buildDefaultSettings([duckAiAdapter]);
  off.sites.duckai.options["conversation-button"] = false;
  page.controller.applySettings(off);
  assert.equal(page.conversationButtons().length, 0);
});

/** The Duck.ai conversation fixture in the 2026-10-28 layout. */
function duckAiConversationPage(): Document {
  return new JSDOM(readFileSync("scratch/fixtures/duckai-conversation.html", "utf8")).window.document;
}

check("duck.ai fixture: the conversation is the turns' parent, not the sidebar; three turns, the inactive version left out", () => {
  const page = duckAiConversationPage();
  const conversations = Array.from(page.querySelectorAll(duckAiAdapter.messageSelector)).filter((message) => !message.matches(DUCK_AI_REPLY_SELECTOR));
  assert.equal(conversations.length, 1);
  const turns = readDuckAiTurns(conversations[0])!;
  assert.deepEqual(turns.map((turn) => turn.prompt), ["What is new in Widget 5?", "And the old engine?\n\nKeep it short.", "Thanks!"]);
  assert.deepEqual(turns.map((turn) => turn.reply.id.slice(-3)), ["0-1", "1-1", "2-2"]);
});

// ---------------------------------------------------------------------------
// Copilot: the conversation as a message
// ---------------------------------------------------------------------------

check("copilot: the conversation feed is a message, split into one turn per reply with its prompt; a reply isn't split", () => {
  const articles = readFileSync("scratch/fixtures/copilot-message.html", "utf8").replace(/<!--[\s\S]*?-->/, "").replace(/<\/?main>/g, "");
  const page = new JSDOM(`<!doctype html><body><main><div data-testid="MessageListContainer"><div role="group"><div role="feed" aria-label="Chat conversation">${articles}</div></div></div></main></body>`).window.document;
  const conversations = Array.from(page.querySelectorAll(copilotAdapter.messageSelector)).filter((message) => !message.matches(COPILOT_REPLY_SELECTOR));
  assert.equal(conversations.length, 1);
  const turns = readCopilotTurns(conversations[0])!;
  assert.equal(turns.length, 1);
  assert.equal(turns[0].prompt, "Search the web: what is new in Widget 5?\n\nKeep it short.");
  assert.ok(turns[0].reply.matches(COPILOT_REPLY_SELECTOR));
  assert.equal(readCopilotTurns(turns[0].reply), null);
  assert.equal(copilotAdapter.buttonLabel?.(turns[0].reply), null);
  assert.equal(copilotAdapter.buttonLabel?.(conversations[0])?.text, "Conversation");
});

/** A Copilot page: the top bar with Share, and the conversation feed holding the fixture's prompt and reply; `withShare` false leaves Share out. */
function copilotChat(withShare = true): Document {
  const articles = readFileSync("scratch/fixtures/copilot-message.html", "utf8").replace(/<!--[\s\S]*?-->/, "").replace(/<\/?main>/g, "");
  const share = withShare ? '<div><span aria-label="Share"><button type="button" aria-label="Share chat" data-testid="share-button"></button></span></div>' : "";
  return new JSDOM(
    `<!doctype html><body><header role="none"><div><button id="gptModeSwitcher" type="button" aria-haspopup="menu">Auto</button></div><div><div class="row">${share}<button id="moreButton" type="button" aria-label="Settings and more" aria-haspopup="menu"></button><span></span></div></div></header><main><div data-testid="MessageListContainer"><div role="group"><div role="feed" aria-label="Chat conversation">${articles}</div></div></div></main></body>`,
  ).window.document;
}

check("copilot: the Conversation button goes right before Share in the top bar's row; none without Share; the setting off removes it", () => {
  const document = copilotChat();
  const page = start(copilotAdapter, document);
  page.controller.sync();
  assert.equal(page.conversationButtons().length, 1);
  const [button] = page.conversationButtons();
  assert.equal(button.parentElement, document.querySelector(".row"));
  assert.ok(button.nextElementSibling?.querySelector('[data-testid="share-button"]'));
  assert.equal(document.querySelectorAll(`${COPILOT_REPLY_SELECTOR} [data-acf-injected]`).length, 1, "the reply keeps its own button");
  const off = buildDefaultSettings([copilotAdapter]);
  off.sites.copilot.options["conversation-button"] = false;
  page.controller.applySettings(off);
  assert.equal(page.conversationButtons().length, 0);
  assert.equal(start(copilotAdapter, copilotChat(false)).conversationButtons().length, 0);
});

/** Runs an async check, recording its result like {@link check}. */
async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name });
  } catch (error) {
    results.push({ name, error });
  }
}

await checkAsync("controller: a conversation copy never runs the slower source reader, which opens Copilot's Sources panel; a reply's copy still may", async () => {
  let slowReads = 0;
  const adapter: SiteAdapter = {
    ...copilotAdapter,
    readReferences: () => null,
    readReferencesSlowly: async () => {
      slowReads++;
      return null;
    },
  };
  const document = copilotChat();
  const page = start(adapter, document, (settings) => (settings.sites.copilot.includeMoreSources = true));
  page.conversationButtons()[0].click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(slowReads, 0);
  assert.match(page.copied[0], /^## Search the web: what is new in Widget 5\?\n\n> Keep it short\.\n\n\*\*Widget 5\*\* was released/);
  document.querySelector<HTMLButtonElement>(`${COPILOT_REPLY_SELECTOR} [data-acf-injected]`)!.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(slowReads, 1, "the reply's own copy keeps its fallback");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

for (const result of results) {
  console.log(`${result.error ? "FAIL" : "PASS"}  ${result.name}`);
  if (result.error) console.log(`      ${String((result.error as Error).message ?? result.error).split("\n").join("\n      ")}`);
}
const failed = results.filter((result) => result.error).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
