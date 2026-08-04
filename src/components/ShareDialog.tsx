import { useEffect, useRef } from "react";

export function ShareDialog({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    inputRef.current?.select();
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);
  return (
    <dialog
      ref={dialogRef}
      className="dialog share-dialog"
      aria-labelledby="share-dialog-title"
    >
      <div className="dialog-card">
        <header className="dialog-header">
          <div>
            <span className="kicker">SHARE THIS MOMENT</span>
            <h2 id="share-dialog-title">Copy your eclipse view</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close share dialog"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p>
          Your location, selected time, and view mode are included in this link.
        </p>
        <input
          ref={inputRef}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="Share link"
        />
        <div className="dialog-actions">
          <button className="primary-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
