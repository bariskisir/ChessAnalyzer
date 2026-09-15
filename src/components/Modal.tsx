// Provides native accessible popup dialogs with focus restoration and Escape support.
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Opens a native modal that keeps keyboard focus within the active popup. */
export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(
    /** Opens the dialog after mounting and restores native state on cleanup. */
    () => {
      const dialog = ref.current!; dialog.showModal();
      return /** Closes the native dialog when its React owner unmounts. */ () => dialog.close();
    }, [],
  );
  /** Closes only when the pointer is outside the popup bounds. */
  function backdrop(event: React.MouseEvent<HTMLDialogElement>): void {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }
  return <dialog ref={ref} className="modal" aria-label={title} onCancel={onClose} onClick={backdrop}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label={`Close ${title}`} onClick={onClose}><X size={18} /></button></div>
    {children}
  </dialog>;
}
