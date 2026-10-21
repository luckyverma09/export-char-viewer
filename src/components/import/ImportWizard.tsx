import { ArrowLeft, CheckCircle2, Copy, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findByFingerprint, saveImport, StorageError, type ImportProgress } from '../../lib/db/repo';
import { requestPersistentStorage } from '../../lib/db/storage';
import { buildRecords, defaultDecisions, type ImportDecisions } from '../../lib/importer/build';
import { ImportClient } from '../../lib/importer/client';
import { ImportError, type ImportDraft } from '../../lib/importer/draft';
import { getPref, setPref } from '../../lib/settings';
import type { Conversation, DateOrder } from '../../lib/types';
import { MessageList } from '../chat/MessageList';
import { Button, Dialog } from '../ui/Dialog';
import { DateStep } from './DateStep';
import { DetailsStep } from './DetailsStep';
import { SourceStep } from './SourceStep';

type Step = 'source' | 'reading' | 'date' | 'details' | 'preview' | 'duplicate' | 'saving' | 'error';

interface Props {
  open: boolean;
  initialFile?: File | null;
  onClose: () => void;
  onImported: (conversationId: string) => void;
}

const STEP_TITLE: Record<Step, string> = {
  source: 'Import WhatsApp chat',
  reading: 'Reading chat…',
  date: 'Confirm date format',
  details: 'Check chat details',
  preview: 'Preview',
  duplicate: 'Already imported?',
  saving: 'Importing…',
  error: 'Import failed',
};

export function ImportWizard({ open, initialFile, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('source');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [decisions, setDecisions] = useState<ImportDecisions | null>(null);
  const [selfChosen, setSelfChosen] = useState(false);
  const [dateOrder, setDateOrder] = useState<DateOrder>('DMY');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [duplicates, setDuplicates] = useState<Conversation[]>([]);
  const client = useRef<ImportClient | null>(null);
  const source = useRef<{ file?: File; text?: string; name: string } | null>(null);

  const reset = useCallback(() => {
    client.current?.dispose();
    client.current = null;
    source.current = null;
    setStep('source');
    setError(null);
    setDraft(null);
    setDecisions(null);
    setSelfChosen(false);
    setProgress(null);
    setDuplicates([]);
  }, []);

  const close = useCallback(() => {
    if (step === 'saving') return; // cannot abandon a write midway
    reset();
    onClose();
  }, [step, reset, onClose]);

  useEffect(() => () => client.current?.dispose(), []);

  const prepare = useCallback(async (order?: DateOrder) => {
    const src = source.current;
    if (!src) return;
    client.current ??= new ImportClient();
    setStep('reading');
    setError(null);
    try {
      const d = await client.current.prepare({ file: src.file, text: src.text, name: src.name, dateOrder: order });
      setDraft(d);
      setDateOrder(d.parse.dateOrder);
      setDecisions((prev) => {
        const fresh = defaultDecisions(d);
        // Keep the user's edits when only the date order changed.
        if (prev && prev.participants.length === fresh.participants.length) return { ...prev };
        return fresh;
      });
      setStep(!order && !d.parse.dateOrderConfident ? 'date' : 'details');
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'The file could not be read.');
      setStep('source');
    }
  }, []);

  const start = useCallback(
    (s: { file?: File; text?: string; name: string }) => {
      reset();
      source.current = s;
      void prepare();
    },
    [reset, prepare],
  );

  useEffect(() => {
    if (open && initialFile) start({ file: initialFile, name: initialFile.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  const records = useMemo(
    () => (draft && decisions && step === 'preview' ? buildRecords(draft, decisions, { conversationId: 'preview' }) : null),
    [draft, decisions, step],
  );
  const previewParticipants = useMemo(() => new Map(records?.participants.map((p) => [p.id, p]) ?? []), [records]);
  const availableFiles = useMemo(() => new Set(Object.keys(draft?.matchedFiles ?? {})), [draft]);

  const doSave = async () => {
    if (!draft || !decisions) return;
    setStep('saving');
    setProgress({ phase: 'messages', done: 0, total: draft.parse.messages.length });
    try {
      const recs = buildRecords(draft, decisions);
      const file = source.current?.file;
      const reader = file && client.current ? (paths: string[]) => client.current!.extract(file, paths) : null;
      const id = await saveImport(recs, reader, setProgress);
      if (!getPref('persistAsked')) {
        setPref('persistAsked', true);
        void requestPersistentStorage();
      }
      reset();
      onImported(id);
    } catch (e) {
      setError(e instanceof StorageError ? e.message : 'The chat could not be saved. Nothing was imported.');
      setStep('error');
    }
  };

  const confirmImport = async () => {
    if (!draft) return;
    const dups = await findByFingerprint(draft.fingerprint).catch(() => []);
    if (dups.length) {
      setDuplicates(dups);
      setStep('duplicate');
    } else void doSave();
  };

  const back = () => {
    if (step === 'details') setStep(draft && !draft.parse.dateOrderConfident ? 'date' : 'source');
    else if (step === 'date') setStep('source');
    else if (step === 'preview' || step === 'duplicate') setStep('details');
    else if (step === 'error') setStep('preview');
  };

  const footer = (() => {
    switch (step) {
      case 'date':
        return (
          <Button variant="primary" onClick={() => void prepare(dateOrder)}>
            Continue
          </Button>
        );
      case 'details':
        return (
          <>
            {!selfChosen && <span className="mr-auto self-center text-[13px] text-muted">Choose who you are to continue</span>}
            <Button variant="primary" disabled={!selfChosen} onClick={() => setStep('preview')}>
              Preview
            </Button>
          </>
        );
      case 'preview':
        return (
          <Button variant="primary" onClick={() => void confirmImport()}>
            Import chat
          </Button>
        );
      case 'duplicate':
        return (
          <>
            <Button
              onClick={() => {
                const id = duplicates[0].id;
                reset();
                onImported(id);
              }}
            >
              Skip, open existing
            </Button>
            <Button variant="primary" onClick={() => void doSave()}>
              Import separately
            </Button>
          </>
        );
      case 'error':
        return (
          <>
            <Button onClick={close}>Close</Button>
            <Button variant="primary" onClick={() => void doSave()}>
              Try again
            </Button>
          </>
        );
      default:
        return undefined;
    }
  })();

  const canGoBack = step === 'date' || step === 'details' || step === 'preview' || step === 'duplicate';

  return (
    <Dialog open={open} onClose={close} title={STEP_TITLE[step]} variant="full" footer={footer} dismissible={step !== 'saving'}>
      {canGoBack && (
        <button type="button" onClick={back} className="-mt-1 mb-3 flex items-center gap-1 text-[13.5px] font-medium text-brand">
          <ArrowLeft size={16} /> Back
        </button>
      )}

      {step === 'source' && (
        <SourceStep
          error={error}
          onFile={(file) => start({ file, name: file.name })}
          onText={(text) => start({ text, name: 'Pasted chat' })}
        />
      )}

      {step === 'reading' && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted" role="status">
          <Loader2 size={32} className="animate-spin text-brand" />
          Reading and checking the export on this device…
        </div>
      )}

      {step === 'date' && draft && (
        <DateStep samples={draft.parse.dateSamples} candidates={draft.parse.dateOrderCandidates} value={dateOrder} onChange={setDateOrder} />
      )}

      {step === 'details' && draft && decisions && (
        <DetailsStep draft={draft} decisions={decisions} selfChosen={selfChosen} onChange={setDecisions} onSelfChosen={() => setSelfChosen(true)} />
      )}

      {step === 'preview' && draft && decisions && records && (
        <div className="flex h-full min-h-[60dvh] flex-col">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span>Viewing as:</span>
            {records.participants.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={records.conversation.selfParticipantId === p.id}
                onClick={() => setDecisions({ ...decisions, selfRaw: p.originalName })}
                className={`rounded-full border px-3 py-1 ${
                  records.conversation.selfParticipantId === p.id ? 'border-brand bg-brand/10 text-brand' : 'border-line hover:bg-hover'
                }`}
              >
                {p.displayName}
              </button>
            ))}
          </div>
          <p className="mb-2 text-[13px] text-muted">
            This is exactly how the chat will look. Check that message order, dates and sides are right. Nothing is saved until you tap <b>Import chat</b>.
          </p>
          <div className="chat-wallpaper flex min-h-[50dvh] flex-1 flex-col overflow-hidden rounded-xl border border-line">
            <MessageList
              messages={records.messages}
              participants={previewParticipants}
              selfId={records.conversation.selfParticipantId}
              type={records.conversation.type}
              hour12={records.conversation.hour12}
              preview
              previewAvailableFiles={availableFiles}
            />
          </div>
        </div>
      )}

      {step === 'duplicate' && (
        <div className="space-y-3 text-[14.5px] text-muted">
          <div className="flex items-start gap-3 rounded-xl bg-panel-2 p-4">
            <Copy size={20} className="mt-0.5 shrink-0 text-brand" />
            <div>
              <p className="text-ink">This export looks identical to a chat you already imported:</p>
              <ul className="mt-2 space-y-1">
                {duplicates.map((d) => (
                  <li key={d.id} className="font-medium text-ink">
                    “{d.title}” · {d.messageCount.toLocaleString()} messages · imported {new Date(d.importedAt).toLocaleDateString()}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p>You can open the existing chat, or import this file again as a separate chat. Chats are never merged automatically.</p>
        </div>
      )}

      {step === 'saving' && progress && (
        <div className="flex flex-col items-center gap-4 py-16" role="status" aria-live="polite">
          {progress.phase === 'finishing' ? <CheckCircle2 size={36} className="text-brand" /> : <Loader2 size={36} className="animate-spin text-brand" />}
          <div className="text-ink">
            {progress.phase === 'messages'
              ? `Saving messages… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
              : progress.phase === 'attachments'
                ? `Saving media… ${progress.done} / ${progress.total}`
                : 'Finishing…'}
          </div>
          <div className="h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full bg-brand transition-[width]"
              style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 100}%` }}
            />
          </div>
          <p className="text-[13px] text-muted">Keep Chatss open until the import finishes.</p>
        </div>
      )}

      {step === 'error' && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-[14.5px] text-ink">
          {error}
        </div>
      )}
    </Dialog>
  );
}
