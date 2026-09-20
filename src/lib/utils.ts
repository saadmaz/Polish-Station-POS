import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { KeyboardEvent } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** For a non-native clickable element (a `<div>`/`<tr>`/`<span>` standing in
 *  for a button, with `role="button"` and `tabIndex={0}`) — Enter and Space
 *  are supposed to activate it the way they would a real `<button>`, but
 *  that isn't native behavior on those elements, so it has to be wired up
 *  by hand. Space also needs `preventDefault()` or the page scrolls.
 *
 *  Several of these containers have real, separately-focusable controls
 *  nested inside them (an Edit/Delete button in a table row, the action
 *  buttons in an expanded booking card). Pressing Enter on one of those
 *  fires its own click *and* lets the keydown bubble up to this handler —
 *  `e.target !== e.currentTarget` means the key landed on a descendant,
 *  not the container itself, so skip activating the container in that
 *  case (the nested control's own handler already ran). */
export function onActivateKey(handler: () => void) {
  return (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  };
}
