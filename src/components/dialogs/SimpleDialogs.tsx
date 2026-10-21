import { useEffect, useState } from 'react';
import { dateInputToTs, tsToDateInput } from '../../lib/format';
import { Button, Dialog } from '../ui/Dialog';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  danger = true,
  requireText,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  danger?: boolean;
  /** Extra safety for destructive actions: user must type this text. */
  requireText?: string;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const blocked = !!requireText && typed.trim().toUpperCase() !== requireText.toUpperCase();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={blocked || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[14.5px] text-muted">{message}</div>
      {requireText && (
        <label className="mt-4 block text-sm text-muted">
          Type <strong className="text-ink">{requireText}</strong> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-ink focus:border-brand focus:outline-none"
            autoComplete="off"
          />
        </label>
      )}
    </Dialog>
  );
}

export function TextPromptDialog({
  open,
  title,
  label,
  initial,
  confirmLabel = 'Save',
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  initial: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);
  const submit = async () => {
    if (!value.trim()) return;
    await onSubmit(value.trim());
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!value.trim()} onClick={() => void submit()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block text-sm text-muted">
          {label}
          <input
            data-autofocus
            value={value}
            maxLength={200}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full border-b-2 border-brand bg-transparent py-2 text-[16px] text-ink focus:outline-none"
          />
        </label>
      </form>
    </Dialog>
  );
}

export function JumpToDateDialog({
  open,
  min,
  max,
  onJump,
  onClose,
}: {
  open: boolean;
  min: number | null;
  max: number | null;
  onJump: (ts: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  useEffect(() => {
    if (open && min !== null) setValue(tsToDateInput(min));
  }, [open, min]);
  const ts = dateInputToTs(value);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Jump to date"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={ts === null}
            onClick={() => {
              if (ts !== null) onJump(ts);
              onClose();
            }}
          >
            Go
          </Button>
        </>
      }
    >
      <label className="block text-sm text-muted">
        Show messages from
        <input
          data-autofocus
          type="date"
          value={value}
          min={min !== null ? tsToDateInput(min) : undefined}
          max={max !== null ? tsToDateInput(max) : undefined}
          onChange={(e) => setValue(e.target.value)}
          className="mt-2 w-full rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-[16px] text-ink focus:border-brand focus:outline-none"
        />
      </label>
    </Dialog>
  );
}
