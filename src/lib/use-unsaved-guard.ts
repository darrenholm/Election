"use client";

import { useEffect } from "react";

/**
 * Warn before a half-filled form is thrown away.
 *
 * A canvasser types a name and a mobile number standing on a step, then taps
 * something in the nav. Everything typed goes, silently. This does not make
 * that impossible — it makes it deliberate.
 *
 * Two paths are covered, which are the two that actually happen:
 *
 *   Leaving the site — reload, closing the tab, typing another address. The
 *   browser's own dialog handles it via beforeunload.
 *
 *   Moving inside the app — tapping Map, Voters, a turf. There is no route
 *   change event to hook in the App Router, so link clicks are caught in the
 *   capture phase before the router sees them.
 *
 * Collapsing the panel a form sits in is deliberately NOT guarded: a closed
 * <details> keeps its contents in the DOM, so nothing is lost and a warning
 * there would be a lie.
 *
 * The phone's own back gesture is not covered. Browsers do not fire
 * beforeunload for history moves inside a single page, and the trick of
 * pushing a sentinel entry to intercept it can leave someone unable to go
 * back at all — worse than the problem.
 */
export function useUnsavedGuard(dirty: boolean, message: string): void {
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      // The wording is the browser's; assigning returnValue is what asks it.
      event.preventDefault();
      event.returnValue = "";
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      // A modified click opens a new tab, so this one stays put and nothing is
      // at risk.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;

      // Same-page jumps, new tabs and downloads never discard the form.
      if (link.target === "_blank" || link.hasAttribute("download")) return;
      const href = link.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      if (link.pathname === window.location.pathname && link.search === window.location.search) {
        return;
      }

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
