import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { stopsFor } from '../../lib/tour';
import './cardKit.css';
import './WorkbenchTour.css';

// The arrival tour of the workbench (lib/tour.js): one stop at a time, a ring around its
// region and a small card beside it that names the region once, then gets out of the way.
// Nothing is hidden or disabled meanwhile; the card is a non-modal dialog, so Tab keeps
// reaching the page. Regions are found by their `data-tour` attribute (Workbench.jsx); a
// missing region is skipped. Below 768 px the card docks to the bottom edge.
// `onEnd(reason)`: 'done' after the last stop, 'skip' for Skip tour or Escape, 'empty' when
// no region is left to show.

const EDGE = 8;
const GAP = 12;
const RING = 4;
const PHONE = '(max-width: 767.98px)';
const regionOf = id => document.querySelector(`[data-tour="${id}"]`);
const matches = query => Boolean(globalThis.matchMedia?.(query).matches);
const subscribePhone = notify => {
  const query = globalThis.matchMedia?.(PHONE);
  query?.addEventListener?.('change', notify);
  return () => query?.removeEventListener?.('change', notify);
};
const isPhone = () => matches(PHONE);
const nextFrame = callback => (globalThis.requestAnimationFrame ? requestAnimationFrame(callback) : setTimeout(callback, 16));
const cancelFrame = frame => (globalThis.cancelAnimationFrame ? cancelAnimationFrame(frame) : clearTimeout(frame));
const clamp = (value, low, high) => Math.max(low, Math.min(value, high));

// The card beside its region: below, above, right or left, whichever fits the viewport whole;
// otherwise over the visible part of the region, still inside the viewport.
function cardPosition(region, width, height, viewW, viewH) {
  const left = clamp(region.left, EDGE, viewW - EDGE - width);
  const top = clamp(region.top, EDGE, viewH - EDGE - height);
  const candidates = [
    { top: region.bottom + GAP, left },
    { top: region.top - GAP - height, left },
    { top, left: region.right + GAP },
    { top, left: region.left - GAP - width }
  ];
  const fits = spot => spot.top >= EDGE && spot.top + height <= viewH - EDGE && spot.left >= EDGE && spot.left + width <= viewW - EDGE;
  return candidates.find(fits) ?? {
    top: clamp(Math.max(region.top, 0) + GAP, EDGE, viewH - EDGE - height),
    left: clamp(region.right - GAP - width, EDGE, viewW - EDGE - width)
  };
}

export function WorkbenchTour({ tone = 'technical', onEnd }) {
  const stops = useMemo(() => stopsFor(tone), [tone]);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [index, setIndex] = useState(0);
  const cardRef = useRef(null);
  const ringRef = useRef(null);
  const end = useRef(onEnd);
  useLayoutEffect(() => { end.current = onEnd; });
  const docked = useSyncExternalStore(subscribePhone, isPhone, () => false);
  // The regions on the page right now, as their ids: the workbench renders them beside the tour.
  const subscribeRegions = useMemo(() => notify => {
    if (typeof MutationObserver !== 'function') return () => {};
    const observer = new MutationObserver(notify);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const present = useSyncExternalStore(subscribeRegions, () => stops.filter(stop => regionOf(stop.id)).map(stop => stop.id).join(' '));
  const visible = stops.filter(stop => present.split(' ').includes(stop.id));
  const shown = stops.findIndex((stop, at) => at >= index && visible.includes(stop));
  const stop = stops[shown];
  const number = visible.indexOf(stop) + 1;
  const last = number === visible.length;

  // Nothing left to show from here on: the tour ends (checked on the page itself, which the
  // first render cannot see yet).
  useEffect(() => {
    if (shown >= 0) return;
    const remaining = stops.some((candidate, at) => at >= index && regionOf(candidate.id));
    if (!remaining) end.current?.(stops.some(candidate => regionOf(candidate.id)) ? 'done' : 'empty');
  }, [shown, index, stops]);

  // Each stop, and only a new stop: its region scrolled into view (smoothly unless motion is
  // reduced; on a phone to the top, above the docked card, unless it already starts in the
  // upper half), focus on the card.
  const stopId = stop?.id;
  useLayoutEffect(() => {
    const region = stopId && regionOf(stopId);
    if (!region) return;
    const phone = isPhone();
    const top = region.getBoundingClientRect().top;
    if (!phone || top < 0 || top > window.innerHeight / 2) {
      region.scrollIntoView?.({ block: phone ? 'start' : 'nearest', inline: 'nearest',
        behavior: matches('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth' });
    }
    cardRef.current?.focus({ preventScroll: true });
  }, [stopId]);

  // Ring and card follow their region through scrolling, resizing and layout changes.
  useLayoutEffect(() => {
    const region = stopId && regionOf(stopId);
    const card = cardRef.current;
    const ring = ringRef.current;
    if (!region || !card || !ring) return undefined;
    let frame = 0;
    const place = () => {
      const rect = region.getBoundingClientRect();
      const viewW = document.documentElement.clientWidth || window.innerWidth;
      const viewH = window.innerHeight;
      const top = Math.max(2, rect.top - RING);
      const left = Math.max(2, rect.left - RING);
      const width = Math.min(viewW - 2, rect.right + RING) - left;
      const height = Math.min(viewH - 2, rect.bottom + RING) - top;
      Object.assign(ring.style, { top: `${Math.round(top)}px`, left: `${Math.round(left)}px`,
        width: `${Math.max(0, Math.round(width))}px`, height: `${Math.max(0, Math.round(height))}px` });
      ring.hidden = width <= 0 || height <= 0;
      if (docked) {
        Object.assign(card.style, { top: '', left: '' });
        return;
      }
      const spot = cardPosition(rect, card.offsetWidth, card.offsetHeight, viewW, viewH);
      Object.assign(card.style, { top: `${Math.round(spot.top)}px`, left: `${Math.round(spot.left)}px` });
    };
    const schedule = () => { cancelFrame(frame); frame = nextFrame(place); };
    place();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(region);
    observer?.observe(card);
    return () => {
      cancelFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [stopId, docked]);

  // Escape skips the tour, unless it belongs to a dialog or the menu above it.
  useEffect(() => {
    const onKeyDown = event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('dialog, [aria-modal="true"], .top-bar-menu')) return;
      end.current?.('skip');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!stop) return null;
  const next = () => (last ? end.current?.('done') : setIndex(shown + 1));
  return (
    <>
      <div ref={ringRef} className="workbench-tour-ring" data-tour-ring={stop.id} aria-hidden="true" />
      <div ref={cardRef} className={`workbench-tour${docked ? ' is-docked' : ''}`} role="dialog" aria-modal="false"
        aria-labelledby={`${id}-title`} aria-describedby={`${id}-count ${id}-text`} tabIndex={-1} data-tour-stop={stop.id}>
        <p className="workbench-tour-count" id={`${id}-count`}>Stop {number} of {visible.length}</p>
        <h2 className="workbench-tour-title" id={`${id}-title`}>{stop.title}</h2>
        <p className="workbench-tour-text" id={`${id}-text`}>{stop.text}</p>
        <div className="workbench-tour-actions">
          <button type="button" className="card-kit-btn is-ghost" onClick={() => end.current?.('skip')}>Skip tour</button>
          <button type="button" className="btn-primary" onClick={next}>{last ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </>
  );
}
