import { useLayoutEffect, useRef } from 'react';

// Native dialogs provide focus containment/restoration and nested-modal Escape
// handling without manually overriding the browser's keyboard behavior.
export function Modal({ children, onClose, label }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
        const dialog = ref.current;
        dialog.showModal();
        // Close before React detaches the dialog so the browser restores opener focus.
        return () => dialog.close();
    }, []);
    return <dialog ref={ref} className="modal-overlay" aria-label={label}
        onCancel={event => { event.stopPropagation(); event.preventDefault(); onClose(); }}
        onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
        {children}
    </dialog>;
}
