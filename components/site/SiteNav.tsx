"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
} from "react";

import styles from "./SiteNav.module.css";

/**
 * Main site navigation.
 *
 * This component is deliberately DUMB about the CMS: it receives an already
 * flattened, already allowlisted tree (see buildNavTree in SiteHeader.tsx) and
 * only renders it. That matters for two reasons:
 *
 *  - Every `href` here has already passed lib/url.ts `safeHref` via pickLink, so
 *    nothing but a relative path or an http/https/mailto/tel URL can reach an
 *    anchor. An item whose href did not survive the allowlist arrives with
 *    `href: undefined` and is rendered as a <span>, never as a dead or unsafe
 *    <a>. No URL is ever constructed from CMS text inside this file.
 *  - The props are small, serialisable values rather than raw Graph payloads, so
 *    the client bundle does not drag in the field helpers or the sanitiser, and
 *    the RSC payload does not ship the CMS metadata blobs.
 *
 * One state machine drives both breakpoints: `menuOpen` (mobile panel) and
 * `openId` (which top-level item's panel is expanded). Above 900px the list is
 * always visible and `openId` is a hover/focus dropdown; below it the list is
 * behind the hamburger and `openId` is an accordion row.
 */

export type NavItem = {
  /** Stable, index-derived id. Used for React keys and aria-controls. */
  id: string;
  label: string;
  /** Already allowlisted. Undefined means "render a span, not a link". */
  href?: string;
  openInNewTab?: boolean;
  children: NavItem[];
};

export type SiteNavProps = {
  items: NavItem[];
  /** Accessible name for the <nav> landmark. */
  label?: string;
};

const DESKTOP_QUERY = "(min-width: 900px)";

/** True for absolute http(s) destinations, which need rel hardening. */
function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * Normalises a site-relative path for current-page comparison: lower-cased,
 * exactly one leading and trailing slash, no query or fragment. Absolute URLs
 * and anything non-relative return undefined so they are never marked current.
 */
function normalisePath(input: string | null | undefined): string | undefined {
  if (typeof input !== "string" || !input.startsWith("/")) return undefined;
  const base = input.split("#")[0]?.split("?")[0] ?? "";
  if (base.length === 0) return undefined;
  return `/${base}/`.replace(/\/+/g, "/").toLowerCase();
}

export default function SiteNav({ items, label = "Main" }: SiteNavProps) {
  const pathname = usePathname();
  const currentPath = normalisePath(pathname);

  const [menuOpen, setMenuOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  const rootRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  /** Triggers by item id, so Escape can return focus to the right one. */
  const triggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  /**
   * Set between pointerdown and click on a trigger. Without it, focus-open and
   * click-toggle fight each other: the pointer focuses the button (opening the
   * panel) and the click then immediately closes it again.
   */
  const pointerDownRef = useRef(false);

  const closeAll = useCallback(() => {
    setOpenId(null);
    setMenuOpen(false);
  }, []);

  /* Track the breakpoint. Hover-to-open applies on desktop only; on touch a
     hover-open panel would swallow the first tap. */
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /*
   * Two things invalidate the open state: a client-side navigation (the menu
   * must not stay hanging open over the new page) and crossing the breakpoint
   * (a mobile accordion left "open" behind a desktop bar). Both are handled by
   * adjusting state during render rather than in an effect, which is React's
   * recommended shape for "reset when a prop changes" and avoids a visible
   * frame of the stale menu.
   */
  const resetKey = `${pathname ?? ""}|${isDesktop}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    if (openId !== null) setOpenId(null);
    if (menuOpen) setMenuOpen(false);
  }

  /* Clears the pointer guard once the gesture ends, so a pointerdown that never
     became a click cannot leave focus-to-open disabled. */
  useEffect(() => {
    const clear = () => {
      pointerDownRef.current = false;
    };
    document.addEventListener("pointerup", clear);
    document.addEventListener("pointercancel", clear);
    return () => {
      document.removeEventListener("pointerup", clear);
      document.removeEventListener("pointercancel", clear);
    };
  }, []);

  /* Click (or tap) anywhere outside the nav closes whatever is open. */
  useEffect(() => {
    if (!menuOpen && openId === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const target = event.target;
      if (!root || !(target instanceof Node)) return;
      if (!root.contains(target)) closeAll();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen, openId, closeAll]);

  /**
   * Escape closes the innermost thing that is open and returns focus to the
   * control that opened it: first the dropdown/accordion panel, then the mobile
   * menu itself.
   */
  const onRootKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    if (openId !== null) {
      const trigger = triggerRefs.current.get(openId);
      setOpenId(null);
      trigger?.focus();
      event.stopPropagation();
      return;
    }
    if (menuOpen) {
      setMenuOpen(false);
      toggleRef.current?.focus();
      event.stopPropagation();
    }
  };

  /* Focus leaving the nav entirely closes the open dropdown — the keyboard
     equivalent of the pointer leaving the bar. */
  const onRootBlur = (event: ReactFocusEvent<HTMLElement>) => {
    if (openId === null) return;
    const next = event.relatedTarget;
    const root = rootRef.current;
    if (!root) return;
    if (next instanceof Node && root.contains(next)) return;
    setOpenId(null);
  };

  if (items.length === 0) return null;

  return (
    <nav
      className={styles.nav}
      aria-label={label}
      ref={rootRef}
      onKeyDown={onRootKeyDown}
      onBlur={onRootBlur}
    >
      <button
        type="button"
        className={styles.toggle}
        ref={toggleRef}
        aria-expanded={menuOpen}
        aria-controls="site-nav-menu"
        onClick={() => {
          setOpenId(null);
          setMenuOpen((open) => !open);
        }}
      >
        <span className={styles.toggleIcon} aria-hidden="true">
          {menuOpen ? (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          )}
        </span>
        {menuOpen ? "Close" : "Menu"}
      </button>

      {/*
        `hidden` is the single source of truth for the mobile panel. Above 900px
        the stylesheet overrides [hidden] back to a visible flex row, so the bar
        is always available on desktop without a second copy of the markup.
      */}
      <div className={styles.menu} id="site-nav-menu" hidden={!menuOpen}>
        <ul className={styles.list}>
          {items.map((item) => (
            <TopLevelItem
              key={item.id}
              item={item}
              currentPath={currentPath}
              isDesktop={isDesktop}
              isOpen={openId === item.id}
              setOpen={(open) => setOpenId(open ? item.id : null)}
              pointerDownRef={pointerDownRef}
              registerTrigger={(node) => {
                if (node) triggerRefs.current.set(item.id, node);
                else triggerRefs.current.delete(item.id);
              }}
            />
          ))}
        </ul>
      </div>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Top level                                                                  */
/* -------------------------------------------------------------------------- */

type TopLevelItemProps = {
  item: NavItem;
  currentPath: string | undefined;
  isDesktop: boolean;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  pointerDownRef: RefObject<boolean>;
  registerTrigger: (node: HTMLButtonElement | null) => void;
};

function TopLevelItem({
  item,
  currentPath,
  isDesktop,
  isOpen,
  setOpen,
  pointerDownRef,
  registerTrigger,
}: TopLevelItemProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const hasChildren = item.children.length > 0;
  const panelId = `${item.id}-panel`;
  const current = isCurrent(item, currentPath);
  const withinCurrent = current || containsCurrent(item.children, currentPath);

  if (!hasChildren) {
    return (
      <li className={styles.item}>
        <NavLink item={item} className={styles.topLink} currentPath={currentPath} />
      </li>
    );
  }

  /** ArrowDown is the expected "open and enter the menu" key for a menu bar. */
  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    setOpen(true);
    // The panel may only just have been revealed, so move focus after paint.
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus();
    });
  };

  return (
    <li
      className={styles.item}
      onPointerEnter={isDesktop ? () => setOpen(true) : undefined}
      onPointerLeave={isDesktop ? () => setOpen(false) : undefined}
    >
      <button
        type="button"
        className={styles.topTrigger}
        ref={registerTrigger}
        aria-expanded={isOpen}
        aria-controls={panelId}
        data-current={withinCurrent ? "true" : undefined}
        onPointerDown={() => {
          pointerDownRef.current = true;
        }}
        onFocus={() => {
          // Hover's keyboard twin: focusing a trigger on desktop opens it, but
          // not when the focus came from the pointer that is about to click.
          if (isDesktop && !pointerDownRef.current) setOpen(true);
        }}
        onClick={() => {
          pointerDownRef.current = false;
          setOpen(!isOpen);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        {item.label}
        <svg
          className={styles.chevron}
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div className={styles.panel} id={panelId} ref={panelRef} hidden={!isOpen}>
        <div className={styles.panelInner}>
          {item.href ? (
            <NavLink
              item={{ ...item, label: `${item.label} overview`, children: [] }}
              className={styles.overview}
              currentPath={currentPath}
            />
          ) : null}
          <ul className={styles.groups}>
            {item.children.map((child) => (
              <li className={styles.group} key={child.id}>
                <NavLink item={child} className={styles.groupLink} currentPath={currentPath} />
                {child.children.length > 0 ? (
                  <ul className={styles.sublist}>
                    {child.children.map((grandchild) => (
                      <li key={grandchild.id}>
                        <NavLink
                          item={grandchild}
                          className={styles.subLink}
                          currentPath={currentPath}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Leaf rendering                                                             */
/* -------------------------------------------------------------------------- */

function isCurrent(item: NavItem, currentPath: string | undefined): boolean {
  if (currentPath === undefined || item.href === undefined) return false;
  return normalisePath(item.href) === currentPath;
}

function containsCurrent(items: NavItem[], currentPath: string | undefined): boolean {
  if (currentPath === undefined) return false;
  return items.some((item) => isCurrent(item, currentPath) || containsCurrent(item.children, currentPath));
}

/**
 * Renders a nav destination. An item without a usable href becomes a <span>:
 * pickLink dropped the URL (or the CMS reference carried none), and a dead
 * anchor is worse than plain text for both keyboard and screen-reader users.
 */
function NavLink({
  item,
  className,
  currentPath,
}: {
  item: NavItem;
  /** CSS Module lookups are `string | undefined` under noUncheckedIndexedAccess. */
  className: string | undefined;
  currentPath: string | undefined;
}) {
  if (item.href === undefined) {
    return <span className={`${className} ${styles.inert}`}>{item.label}</span>;
  }

  const newTab = item.openInNewTab === true;
  const current = isCurrent(item, currentPath);

  return (
    <a
      className={className}
      href={item.href}
      aria-current={current ? "page" : undefined}
      data-current={current ? "true" : undefined}
      target={newTab ? "_blank" : undefined}
      // noopener/noreferrer on every new-tab link and every absolute http(s)
      // destination: CMS-authored URLs are untrusted, and a target="_blank"
      // opener handle lets the destination drive window.opener.location.
      rel={newTab || isExternal(item.href) ? "noopener noreferrer" : undefined}
    >
      {item.label}
      {newTab ? <span className="ob-sr-only"> (opens in a new tab)</span> : null}
    </a>
  );
}
