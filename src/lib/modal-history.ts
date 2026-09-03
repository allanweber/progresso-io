"use client";

import * as React from "react";

/**
 * Back closes the modal on top instead of leaving the page.
 *
 * On a phone the system Back gesture is how people dismiss anything that covers
 * the screen — every native app trains that, and our modals are full-bleed
 * there. Without this, backing out of a confirmation dialog threw the page
 * behind it away too, which on `/coach/students/[id]` meant losing the whole
 * aluno screen to close a two-button "tem certeza?".
 *
 * So while a modal is open we park one spare history entry on the stack for
 * Back to consume, and close the modal when it goes.
 *
 * The entry is pushed with NO url argument, which matters: Next's patched
 * `pushState` (`next/dist/client/components/app-router.js`) only pushes the URL
 * into the router when a url is passed, so the address bar, `usePathname` and
 * `useSearchParams` all stay exactly where they were. Spreading the current
 * state forward carries Next's own `__NA` / tree bookkeeping onto the new
 * entry, which is what makes the eventual popstate a no-op restore of the same
 * route rather than a full reload.
 *
 * Every open modal owns exactly one entry, so nesting works: only the innermost
 * one answers a Back press, and any modal closed by other means (Esc, the X,
 * the scrim, a finished form) unwinds its own entry so the stack stays honest.
 */

/** Tags the entries we push, so we can tell whether ours is still on top. */
const MARK = "__modalEntry";

type OpenModal = {
  close: () => void;
  /** False once the browser has already consumed this modal's entry. */
  live: boolean;
};

/** Innermost modal last — a Back press only concerns the top of the pile. */
const openModals: OpenModal[] = [];

/**
 * popstate events we caused ourselves, by unwinding an entry when a modal
 * closed on its own. They must not read as a Back press, or closing an inner
 * modal would close the one that owns it too.
 */
let selfPops = 0;

/**
 * Attached on the first modal and never removed: a listener that returns
 * immediately on an empty stack costs nothing, and removing it would drop the
 * pending self-pop of the last modal to close, leaving `selfPops` armed to
 * swallow a real Back press later.
 */
let listening = false;

/** A navigation waiting for the closing modal to hand its entry back. */
let pendingNavigation: (() => void) | null = null;

function flushPendingNavigation() {
  const navigate = pendingNavigation;
  pendingNavigation = null;
  navigate?.();
}

/**
 * Navigate out of a modal that is closing in the same gesture, without racing
 * its history entry.
 *
 * A modal that closes AND navigates at once — the mobile nav drawer, on every
 * tap — has two things reaching for the history stack: this hook giving the
 * modal's entry back, and the router pushing the new route. In that order the
 * stack comes out right. In the other one the entry we pop is the router's, and
 * the tap reads as "the link did nothing" — which is exactly how the drawer
 * broke when the unwind was left to race.
 *
 * So the caller hands the navigation over instead of running it inline, and it
 * goes out once the entry is back.
 */
export function afterModalCloses(navigate: () => void) {
  pendingNavigation = navigate;
  // If no modal was actually holding an entry there is nothing to sequence and
  // nothing would ever flush this. A late navigation beats a lost one.
  setTimeout(() => {
    if (pendingNavigation === navigate) flushPendingNavigation();
  }, 200);
}

function onPopState() {
  if (selfPops > 0) {
    selfPops -= 1;
    // The entry is back; whatever was waiting on it can go now.
    flushPendingNavigation();
    return;
  }
  const top = openModals.pop();
  if (!top) return;
  // The browser already dropped this modal's entry, so its close must not try
  // to unwind one.
  top.live = false;
  top.close();
}

export function useModalHistory(open: boolean, onClose: () => void) {
  // Held in a ref: `onOpenChange` is an inline closure at nearly every call
  // site, and letting it into the deps would push a fresh entry every render.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    if (!open) return;

    if (!listening) {
      listening = true;
      window.addEventListener("popstate", onPopState);
    }

    const entry: OpenModal = { close: () => onCloseRef.current(), live: true };
    openModals.push(entry);
    window.history.pushState({ ...window.history.state, [MARK]: true }, "");

    return () => {
      const i = openModals.indexOf(entry);
      if (i !== -1) openModals.splice(i, 1);
      // Our entry is only still on top if nothing navigated since. When the
      // modal closed *by* navigating — a delete dialog that redirects to the
      // list, say — the entry is buried, and going back would undo the
      // navigation the user just asked for.
      if (entry.live && window.history.state?.[MARK]) {
        entry.live = false;
        selfPops += 1;
        // Flushes any pending navigation once the popstate lands.
        window.history.back();
        return;
      }
      entry.live = false;
      flushPendingNavigation();
    };
  }, [open]);
}
