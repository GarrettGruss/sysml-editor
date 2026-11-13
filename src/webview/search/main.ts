/** The search box above the tree: one input with a clear button. It only posts its text to the extension host. */
interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const input = document.getElementById("q") as HTMLInputElement;
const clear = document.getElementById("clear") as HTMLButtonElement;
let timer: number | undefined;

function post(): void {
  window.clearTimeout(timer);
  vscode.postMessage({ type: "query", text: input.value });
}

function sync(): void {
  clear.hidden = input.value.length === 0;
}

function reset(): void {
  input.value = "";
  sync();
  post();
}

input.addEventListener("input", () => {
  sync();
  window.clearTimeout(timer);
  timer = window.setTimeout(post, 150);
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    reset();
  }
});
clear.addEventListener("click", () => {
  reset();
  input.focus();
});
window.addEventListener("message", (e: MessageEvent) => {
  const m = e.data as { type?: string; text?: unknown };
  if (m && m.type === "set" && typeof m.text === "string" && m.text !== input.value) {
    input.value = m.text;
    sync();
  }
});
sync();
vscode.postMessage({ type: "ready" });
