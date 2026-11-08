"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Scroll-reveal wrapper. Content is part of the server-rendered HTML and is VISIBLE from the first paint; only blocks that start
// BELOW the visible area are hidden once the page is interactive and faded in when scrolled to (same 20px rise, 0.55s, same
// easing as before).
//
// Why not a framer-motion `initial={{ opacity: 0 }}`: that server-renders every Reveal with `opacity:0`, so the headline, the
// intro text and the first card images stayed invisible until (1) the page's JavaScript loaded, (2) the lazy animation chunk
// loaded (MotionProvider) and (3) hydration finished - measured: the LCP element of /flights and /contact was the hero paragraph
// at ~3.5 s while first paint was ~1.2 s, and /destinations' LCP was ~6 s. Without JavaScript (or if it failed) the content was
// never shown at all. Blocks that are already on screen when observed (or above it, e.g. after a reload mid-page) now simply
// stay as rendered, so there is no entrance animation for the first screenful - below-the-fold behaviour is unchanged.
//
// One shared IntersectionObserver serves every Reveal (a page can have ~180 of them): it reports the initial position of each
// block asynchronously, so mounting does not force a synchronous layout per block. Reduced motion: nothing is hidden or
// animated, as before (the old MotionConfig reducedMotion="user" setting also removed the movement). The element carries no
// inline style until it is armed, and React never re-applies `style`, so the imperative changes below cannot be overwritten.
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const DURATION = "0.55s";
// A block counts as "on screen" once it reaches this far inside the bottom edge of the viewport (the previous whileInView margin).
const MARGIN = 80;

type Tracked = { delay: number; y: number; armed: boolean };
const tracked = new Map<Element, Tracked>();
let observer: IntersectionObserver | null = null;

function forget(el: Element) {
  tracked.delete(el);
  observer?.unobserve(el);
}

function getObserver(): IntersectionObserver {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const state = tracked.get(el);
        if (!state) continue;
        if (!state.armed) {
          // First report for this block. On screen, or above the visible area: leave it exactly as server-rendered.
          const rootBottom = entry.rootBounds ? entry.rootBounds.bottom : window.innerHeight - MARGIN;
          if (entry.isIntersecting || entry.boundingClientRect.top < rootBottom) {
            forget(el);
            continue;
          }
          // Below the fold: hide it now (it is not visible, so nothing flashes) and reveal it when it scrolls in.
          state.armed = true;
          el.style.opacity = "0";
          el.style.transform = `translateY(${state.y}px)`;
          continue;
        }
        if (entry.isIntersecting) {
          el.style.transition = `opacity ${DURATION} ${EASE} ${state.delay}s, transform ${DURATION} ${EASE} ${state.delay}s`;
          el.style.opacity = "1";
          el.style.transform = "none";
          forget(el);
        }
      }
    },
    { rootMargin: `0px 0px -${MARGIN}px 0px` },
  );
  return observer;
}

export function Reveal({
  children,
  delay = 0,
  className,
  y = 20,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    tracked.set(el, { delay, y, armed: false });
    getObserver().observe(el);
    return () => {
      // Never leave content hidden if the block is torn down before it was revealed (navigation, or React Strict Mode in dev).
      forget(el);
      el.style.opacity = "";
      el.style.transform = "";
      el.style.transition = "";
    };
    // `delay` and `y` are static per usage; the effect only needs to run once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
