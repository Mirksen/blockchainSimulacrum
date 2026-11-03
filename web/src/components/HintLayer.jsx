import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import './HintLayer.css';

// One explaining bubble for the whole app (web/DESIGN.md, "Hints"). Any element with a
// `data-hint` (and optionally `data-hint-title`) gets it on mouse hover and on keyboard
// focus; the texts live in src/lib/hints/ and reach the elements through `hint(key)`.
// Touch taps never open it, so a tap stays a plain click. Escape, a click, scrolling and
// resizing close it. While it shows, the element is described by it for screen readers.
//
// The bubble sits in the top layer (popover="manual") where the browser supports it, so it
// also shows above open modal dialogs.

const SHOW_DELAY = 350;
// After one bubble closed, the next one opens without delay for a short while.
const WARM_MS = 500;
const GAP = 10;
const EDGE = 8;

const targetOf = node => (node instanceof Element ? node.closest('[data-hint]') : null);
const supportsPopover = () => typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';
function focusVisible(node) {
  try { return node.matches(':focus-visible'); } catch { return true; }
}
function addToken(node, attr, token) {
  const tokens = (node.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean);
  if (!tokens.includes(token)) node.setAttribute(attr, [...tokens, token].join(' '));
}
function removeToken(node, attr, token) {
  const tokens = (node.getAttribute(attr) ?? '').split(/\s+/).filter(t => t && t !== token);
  if (tokens.length) node.setAttribute(attr, tokens.join(' '));
  else node.removeAttribute(attr);
}

export function HintLayer() {
  const id = `hint-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [shown, setShown] = useState(null);
  const bubbleRef = useRef(null);
  const state = useRef({ target: null, timer: null, warmUntil: 0, suppressed: null });

  const hide = useCallback(() => {
    const s = state.current;
    clearTimeout(s.timer);
    s.timer = null;
    if (s.target) {
      removeToken(s.target, 'aria-describedby', id);
      s.target = null;
      s.warmUntil = Date.now() + WARM_MS;
    }
    setShown(null);
  }, [id]);

  const show = useCallback(target => {
    const s = state.current;
    clearTimeout(s.timer);
    s.timer = null;
    const text = target.getAttribute('data-hint');
    if (!text || !target.isConnected) return;
    if (s.target && s.target !== target) removeToken(s.target, 'aria-describedby', id);
    s.target = target;
    addToken(target, 'aria-describedby', id);
    setShown({ target, title: target.getAttribute('data-hint-title') || '', text });
  }, [id]);

  useEffect(() => {
    const s = state.current;
    const schedule = target => {
      clearTimeout(s.timer);
      if (Date.now() < s.warmUntil) { show(target); return; }
      s.timer = setTimeout(() => show(target), SHOW_DELAY);
    };
    const onPointerOver = event => {
      if (event.pointerType === 'touch') return;
      const target = targetOf(event.target);
      if (!target || target === s.target || target === s.suppressed) return;
      schedule(target);
    };
    const onPointerOut = event => {
      if (event.pointerType === 'touch') return;
      const from = targetOf(event.target);
      if (!from || from.contains(event.relatedTarget)) return;
      if (from === s.suppressed) s.suppressed = null;
      if (from === s.target || !s.target) hide();
    };
    const onFocusIn = event => {
      const target = targetOf(event.target);
      if (target && target !== s.target && focusVisible(event.target)) show(target);
    };
    const onFocusOut = event => {
      const from = targetOf(event.target);
      if (from && from === s.target && !from.contains(event.relatedTarget)) hide();
    };
    const onPointerDown = event => {
      const target = targetOf(event.target);
      if (target) s.suppressed = target;
      if (s.target || s.timer) hide();
    };
    const onKeyDown = event => { if (event.key === 'Escape' && (s.target || s.timer)) hide(); };
    const onMove = () => { if (s.target || s.timer) hide(); };
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      clearTimeout(s.timer);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [show, hide]);

  // The element can leave the page (a re-render, a closed dialog) while its bubble shows.
  useEffect(() => {
    if (!shown || typeof MutationObserver !== 'function') return undefined;
    const observer = new MutationObserver(() => { if (!shown.target.isConnected) hide(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [shown, hide]);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!shown || !bubble) return;
    if (supportsPopover() && !bubble.matches(':popover-open')) {
      try { bubble.showPopover(); } catch { /* not connected or already shown */ }
    }
    const rect = shown.target.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const viewW = document.documentElement.clientWidth || window.innerWidth;
    const viewH = window.innerHeight;
    const below = rect.bottom + GAP + height <= viewH - EDGE || rect.top - GAP - height < EDGE;
    const top = below ? rect.bottom + GAP : rect.top - GAP - height;
    const center = rect.left + rect.width / 2;
    const left = Math.max(EDGE, Math.min(center - width / 2, viewW - EDGE - width));
    bubble.style.top = `${Math.round(top)}px`;
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.setProperty('--hint-arrow', `${Math.round(Math.max(12, Math.min(center - left, width - 12)))}px`);
    bubble.dataset.side = below ? 'below' : 'above';
  }, [shown]);

  if (!shown) return null;
  return (
    <div ref={bubbleRef} id={id} className="hint-layer" role="tooltip" popover={supportsPopover() ? 'manual' : undefined}>
      {shown.title && <b className="hint-layer-title">{shown.title}</b>}
      <span className="hint-layer-text">{shown.text}</span>
    </div>
  );
}

export default HintLayer;
