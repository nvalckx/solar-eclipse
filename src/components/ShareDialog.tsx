import { useEffect, useRef } from "react";

type Props = {
  url: string;
  previewUrl: string;
  previewAlt: string;
  isLoading: boolean;
  error: string;
  status: string;
  nativeShareLabel?: string;
  shareDisabled: boolean;
  canCopyImage: boolean;
  onShare: () => Promise<void>;
  onCopyLink: () => Promise<void>;
  onCopyImage: () => Promise<void>;
  onDownload: () => void;
  onClose: () => void;
};

export function ShareDialog({
  url,
  previewUrl,
  previewAlt,
  isLoading,
  error,
  status,
  nativeShareLabel,
  shareDisabled,
  canCopyImage,
  onShare,
  onCopyLink,
  onCopyImage,
  onDownload,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog share-dialog"
      aria-labelledby="share-dialog-title"
      aria-describedby="share-dialog-description"
    >
      <div className="dialog-card">
        <header className="dialog-header">
          <div>
            <span className="kicker">SHARE THIS MOMENT</span>
            <h2 id="share-dialog-title">Share your eclipse view</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close share dialog"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <p id="share-dialog-description" className="share-intro">
          A personalized image and link preserve this place, time, and view.
        </p>

        <div
          className={`share-preview${isLoading ? " is-loading" : ""}`}
          data-testid="share-preview"
          aria-busy={isLoading}
        >
          {previewUrl ? (
            <img src={previewUrl} alt={previewAlt} />
          ) : (
            <div className="share-preview-placeholder">
              {isLoading ? (
                <>
                  <span className="share-spinner" aria-hidden="true" />
                  <strong>Composing your eclipse card…</strong>
                </>
              ) : (
                <>
                  <span aria-hidden="true">◐</span>
                  <strong>Image preview unavailable</strong>
                </>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="share-message share-error" role="alert">
            {error} You can still share the exact link.
          </p>
        )}
        {status && (
          <p className="share-message" role="status">
            {status}
          </p>
        )}

        <label className="share-link-field">
          <span>Exact interactive view</span>
          <input
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Share link"
          />
        </label>

        <div className="share-actions">
          <button
            className="primary-button"
            disabled={shareDisabled}
            onClick={() => void (nativeShareLabel ? onShare() : onCopyLink())}
          >
            {nativeShareLabel ?? "Copy link"}
          </button>
          {nativeShareLabel && (
            <button
              className="secondary-button"
              onClick={() => void onCopyLink()}
            >
              Copy link
            </button>
          )}
          <button
            className="secondary-button"
            disabled={!previewUrl}
            onClick={onDownload}
          >
            Download image
          </button>
          {canCopyImage && (
            <button
              className="secondary-button"
              disabled={!previewUrl}
              onClick={() => void onCopyImage()}
            >
              Copy image
            </button>
          )}
          <button className="text-button share-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
