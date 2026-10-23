"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DotsThreeVerticalIcon, DownloadSimpleIcon, ExportIcon, PlusSquareIcon, WifiSlashIcon, XIcon } from "@phosphor-icons/react";
import { createPortal } from "react-dom";
import { useIposSavedAt } from "@/hooks/use-ipos";

/** Chrome's install event, which the browser types don't include. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    /** Caught by the inline script in app/layout.tsx, which can run before this does. */
    __awInstall?: InstallEvent | null;
  }
}

/**
 * Registers the service worker (public/sw.js) once the page has loaded, then
 * hands it this page and the code files it loaded: the worker did not exist
 * while they were fetched, and without them the first visit would not work
 * offline. Production only — in development it would cache files that change
 * on every save.
 */
export function ServiceWorkerSetup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const ready = await navigator.serviceWorker.ready;
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.includes("/_next/static/"));
        ready.active?.postMessage({ type: "warm", page: location.pathname, urls });
      } catch {
        // No worker means no offline mode; the site itself is unaffected.
      }
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}

// ---------------------------------------------------------------- online

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** "14:05", or "21 Oct, 14:05" when it was not today. */
function savedTime(at: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

/**
 * A strip under the header when there is no connection. Two signals, because
 * either alone misses cases: the browser's online flag catches a dropped
 * connection at once, and the list being the offline worker's saved copy
 * catches Wi-Fi with no internet behind it, which the flag still calls online.
 * It goes away by itself once a refresh gets through.
 */
export function OfflineNotice() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const savedAt = useIposSavedAt();
  if (online && savedAt === null) return null;
  return (
    <div role="status" className="border-b border-border bg-chip">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 text-[12px] text-dim sm:px-6">
        <WifiSlashIcon size={14} weight="bold" className="shrink-0" aria-hidden />
        <span>
          You&rsquo;re offline —{" "}
          {savedAt !== null ? `showing figures saved at ${savedTime(savedAt)}` : "showing the last figures this device saw"}.
          Allotment checks need a connection.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- install
//
// Whether to show "Install Allotwise", and what its button does, comes down
// to three questions, answered in this order:
//
// 1. Is it installed already?
//    - Running as the installed app (display-mode standalone; on iPhone,
//      navigator.standalone): yes, and that is remembered on this device.
//    - The browser said so: Chrome's `appinstalled` event, remembered too.
//    - Chrome on Android can also be asked outright
//      (navigator.getInstalledRelatedApps, against the manifest's
//      related_applications); its answer overrides the remembered one, so an
//      app removed from the home screen gets the button back.
//    Safari has no way at all for a page to learn this, so on iPhone the
//    remembered flag is set only by opening the installed app — whose storage
//    Safari keeps apart from the browser's. There, "Not now" is what stops it.
// 2. Can this browser install at all? Not inside other apps' browsers
//    (WhatsApp, Instagram…), which have no install; those get a pointer to a
//    real browser instead of a button.
// 3. Which device? Android, from the browser's own platform report
//    (navigator.userAgentData) where it has one, else its user-agent; iPhone
//    from the user-agent, and iPad, which reports itself as a Mac, from its
//    touch screen.
//
// Then the button: where Chrome has offered its install dialog
// (beforeinstallprompt, caught in app/layout.tsx), it opens that, one tap.
// Chrome only offers it on HTTPS, and not always at once, so on Android the
// button shows regardless and, without the dialog, opens the steps for
// Chrome's menu. On iPhone, where Safari offers no dialog to any website, it
// opens the Share → Add to Home Screen steps.

const DISMISS_KEY = "aw:install-dismissed";
const INSTALLED_KEY = "aw:installed";
const DISMISS_DAYS = 30;

type Platform = "android" | "ios" | "other";

type InstallState =
  | { kind: "none" }
  | { kind: "in-app" }
  | { kind: "button"; platform: Platform; event: InstallEvent | null; browser: "firefox" | "other" };

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function platform(): Platform {
  const ua = navigator.userAgent;
  const reported = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  if (reported === "Android" || /Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return "other";
}

/**
 * A browser inside another app: social and chat apps by name, an Android
 * WebView by its "; wv)" mark, and on iOS any web view without Safari's own
 * token (Chrome and Firefox for iOS carry it; app web views do not).
 */
function isInApp(p: Platform): boolean {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB|Instagram|WhatsApp|LinkedInApp|Snapchat|MicroMessenger|Line\/|Twitter/i.test(ua)) return true;
  if (p === "android" && /; wv\)/.test(ua)) return true;
  return p === "ios" && !/Safari\//.test(ua);
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

function dismissedRecently(): boolean {
  const at = Number(read(DISMISS_KEY));
  return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
}

function detect(): InstallState {
  if (standalone()) {
    write(INSTALLED_KEY, String(Date.now()));
    return { kind: "none" };
  }
  if (read(INSTALLED_KEY)) return { kind: "none" };
  const p = platform();
  if (isInApp(p)) return { kind: "in-app" };
  const event = window.__awInstall ?? null;
  // Desktop browsers get the button only when they offer a dialog: their own
  // address bar already carries an install icon, and there is no menu path
  // common enough to describe.
  if (p === "other" && !event) return { kind: "none" };
  return { kind: "button", platform: p, event, browser: /Firefox\//.test(navigator.userAgent) ? "firefox" : "other" };
}

/**
 * Chrome on Android can say whether this app is on the home screen. Its
 * answer is only as good as the manifest's related_applications entry, which
 * names the live site's address: on any other address (a new domain before
 * SITE_URL is updated, a local test) it would say "not installed" to people
 * who have it, so there it is not asked.
 */
async function installedPerBrowser(): Promise<boolean | null> {
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
  if (!nav.getInstalledRelatedApps) return null;
  try {
    const manifest = await (await fetch("/manifest.webmanifest")).json();
    const named = (manifest.related_applications ?? []).some(
      (a: { platform?: string; url?: string }) => a.platform === "webapp" && a.url?.startsWith(location.origin + "/")
    );
    if (!named) return null;
    return (await nav.getInstalledRelatedApps()).length > 0;
  } catch {
    return null;
  }
}

function useInstall(): [InstallState, () => void] {
  const [state, setState] = useState<InstallState>({ kind: "none" });

  useEffect(() => {
    let alive = true;
    const sync = () => setState(detect());
    const installed = () => {
      window.__awInstall = null;
      write(INSTALLED_KEY, String(Date.now()));
      setState({ kind: "none" });
    };
    const timer = setTimeout(async () => {
      // The browser's own answer, where it has one, settles it either way.
      const known = await installedPerBrowser();
      if (known === true) write(INSTALLED_KEY, String(Date.now()));
      if (known === false && !standalone()) write(INSTALLED_KEY, null);
      if (alive) sync();
    }, 0);
    window.addEventListener("aw-installable", sync);
    window.addEventListener("appinstalled", installed);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("aw-installable", sync);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  // Chrome's dialog can be shown once; after it, the menu steps remain.
  const spendEvent = () => {
    window.__awInstall = null;
    setState(detect());
  };
  return [state, spendEvent];
}

const buttonStyle = { background: "var(--btn-bg)", color: "var(--btn-text)", borderColor: "var(--btn-border)" };
const pill =
  "inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium";

/** One numbered step of the sheet, with a small picture of what to tap. */
function Step({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="num grid size-6 shrink-0 place-items-center rounded-pill bg-chip text-[12px] font-semibold">{n}</span>
      <div className="min-w-0 flex-1 text-[14px]">{title}</div>
      <div className="shrink-0">{children}</div>
    </li>
  );
}

function IosSteps() {
  return (
    <>
      <Step n={1} title={<>Tap <span className="font-medium">Share</span> in Safari&rsquo;s bar</>}>
        <span className={pill} style={{ color: "var(--accent)" }}>
          <ExportIcon size={16} weight="bold" aria-hidden />
        </span>
      </Step>
      <Step n={2} title={<>Scroll down, tap <span className="font-medium">Add to Home Screen</span></>}>
        <span className={pill}>
          <PlusSquareIcon size={15} weight="bold" aria-hidden />
          Add
        </span>
      </Step>
      <Step n={3} title={<>Tap <span className="font-medium">Add</span> at the top right</>}>
        <span className={pill} style={{ color: "var(--accent)" }}>
          Add
        </span>
      </Step>
    </>
  );
}

function AndroidSteps({ firefox }: { firefox: boolean }) {
  return (
    <>
      <Step n={1} title={<>Tap the <span className="font-medium">menu</span> at the {firefox ? "corner" : "top right"}</>}>
        <span className={pill} style={{ color: "var(--accent)" }}>
          <DotsThreeVerticalIcon size={16} weight="bold" aria-hidden />
        </span>
      </Step>
      <Step
        n={2}
        title={
          <>
            Tap <span className="font-medium">Install app</span>
            {firefox ? null : (
              <>
                {" "}
                or <span className="font-medium">Add to Home screen</span>
              </>
            )}
          </>
        }
      >
        <span className={pill}>
          <DownloadSimpleIcon size={15} weight="bold" aria-hidden />
          Install
        </span>
      </Step>
      <Step n={3} title={<>Confirm with <span className="font-medium">Install</span></>}>
        <span className={pill} style={{ color: "var(--accent)" }}>
          Install
        </span>
      </Step>
    </>
  );
}

/**
 * The steps, for when the browser has no install dialog to open: always on
 * iPhone (Safari gives websites none), and on Android when Chrome has not
 * offered one. Where the buttons sit moves between versions, so it shows the
 * icon to look for rather than pointing at a spot.
 */
function InstallSheet({ platform: p, firefox, onClose }: { platform: Platform; firefox: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const where = p === "ios" ? "Safari" : firefox ? "Firefox" : "Chrome";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="aw-page-fade-in absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aw-install-title"
        className="aw-sheet-up relative w-full max-w-sm rounded-t-[20px] border border-border bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-xl sm:rounded-card"
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192" alt="" width={40} height={40} className="size-10 rounded-control" />
          <div className="min-w-0 flex-1">
            <h2 id="aw-install-title" className="text-[16px] font-semibold">
              Install Allotwise
            </h2>
            <p className="text-[12px] text-dim">Three taps in {where}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-control text-dim hover:bg-row-hover hover:text-text"
          >
            <XIcon size={16} weight="bold" />
          </button>
        </div>

        <ol className="mt-5 space-y-4">{p === "ios" ? <IosSteps /> : <AndroidSteps firefox={firefox} />}</ol>

        <p className="mt-5 rounded-control bg-chip px-3 py-2 text-[12px] leading-relaxed text-dim">
          Allotwise then opens from your home screen like an app.
        </p>
      </div>
    </div>
  );
}

/**
 * "Install Allotwise" above the IPO list, with an Install button wherever the
 * browser can install it (see the notes at the top of this section for when
 * it shows and what the button does). Inside another app's browser it says
 * where to open the page instead. Closed, it stays away for 30 days.
 */
export function InstallCard() {
  const [state, spendEvent] = useInstall();
  const [hidden, setHidden] = useState(true);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHidden(dismissedRecently()), 0);
    return () => clearTimeout(t);
  }, []);
  const closeSheet = useCallback(() => setSheet(false), []);

  if (hidden || state.kind === "none") return null;

  const dismiss = () => {
    write(DISMISS_KEY, String(Date.now()));
    setHidden(true);
  };
  const install = async () => {
    if (state.kind !== "button") return;
    if (!state.event) return setSheet(true);
    await state.event.prompt();
    const { outcome } = await state.event.userChoice;
    spendEvent();
    if (outcome === "accepted") {
      write(INSTALLED_KEY, String(Date.now()));
      setHidden(true);
    }
  };

  return (
    <div
      role="region"
      aria-label="Install Allotwise"
      data-platform={state.kind === "button" ? state.platform : "in-app"}
      data-install={state.kind === "button" ? (state.event ? "dialog" : "steps") : "none"}
      className="aw-page-fade-in mb-4 flex items-center gap-3 rounded-card border border-border p-3"
      style={{ background: "radial-gradient(140% 100% at 100% 0%, var(--accent-soft), var(--surface) 55%)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192" alt="" width={36} height={36} className="size-9 shrink-0 rounded-control" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">Install Allotwise</div>
        <p className="mt-0.5 text-[12px] leading-snug text-dim">
          {state.kind === "button" ? (
            <>Opens from your home screen like an app.</>
          ) : (
            <>
              Open this page in <span className="font-medium text-text">Safari</span> or{" "}
              <span className="font-medium text-text">Chrome</span> to install it.
            </>
          )}
        </p>
      </div>
      {state.kind === "button" && (
        <button
          type="button"
          onClick={install}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border px-3 text-[13px] font-medium sm:h-8 sm:text-[12px]"
          style={buttonStyle}
        >
          <DownloadSimpleIcon size={14} weight="bold" aria-hidden />
          Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="-mr-1 grid size-9 shrink-0 place-items-center rounded-control text-dim hover:bg-row-hover hover:text-text sm:size-8"
      >
        <XIcon size={14} weight="bold" />
      </button>
      {/* On the page body, not inside this card: the card and the page around
          it fade in, which makes each its own layer, and a sheet inside them
          would stay underneath the bottom navigation. */}
      {sheet &&
        state.kind === "button" &&
        createPortal(
          <InstallSheet platform={state.platform} firefox={state.browser === "firefox"} onClose={closeSheet} />,
          document.body
        )}
    </div>
  );
}
