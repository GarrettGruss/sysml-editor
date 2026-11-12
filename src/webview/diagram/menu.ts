/** A small keyboard-accessible context menu. */
export interface MenuItem<A extends string> { label: string; action: A }

export function showMenu<A extends string>(host: HTMLElement, x: number, y: number, items: MenuItem<A>[], onPick: (a: A) => void, onClose: () => void): void {
  host.querySelector(".ctx-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.setAttribute("role", "menu");
  menu.style.left = `${Math.max(0, x)}px`;
  menu.style.top = `${Math.max(0, y)}px`;
  const buttons: HTMLButtonElement[] = [];
  const close = (refocus = true) => {
    menu.remove();
    document.removeEventListener("pointerdown", outside, true);
    if (refocus) onClose();
  };
  const outside = (e: Event) => { if (!menu.contains(e.target as Node)) close(false); };
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.textContent = it.label;
    b.addEventListener("click", () => { close(); onPick(it.action); });
    menu.append(b);
    buttons.push(b);
  }
  menu.addEventListener("keydown", (e) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") buttons[(i + 1) % buttons.length]!.focus();
    else if (e.key === "ArrowUp") buttons[(i - 1 + buttons.length) % buttons.length]!.focus();
    else if (e.key === "Escape") close();
    else if (e.key === "Tab") close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  host.append(menu);
  document.addEventListener("pointerdown", outside, true);
  buttons[0]?.focus();
}
