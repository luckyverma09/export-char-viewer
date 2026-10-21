import { ClipboardPaste, FileArchive, FileText, ShieldCheck, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '../ui/Dialog';

interface Props {
  onFile: (file: File) => void;
  onText: (text: string) => void;
  error: string | null;
}

import { PRIVACY_NOTICE } from '../../lib/constants';

export function SourceStep({ onFile, onText, error }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');

  return (
    <div className="space-y-4 pb-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          drag ? 'border-brand bg-brand/10' : 'border-line bg-panel-2'
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Upload size={26} />
        </span>
        <div>
          <div className="text-[16px] font-medium text-ink">Choose a WhatsApp export</div>
          <div className="mt-1 text-[13.5px] text-muted">
            A <FileText size={13} className="inline" /> .txt file or a <FileArchive size={13} className="inline" /> .zip archive (with media)
            <span className="hidden sm:inline"> — or drop it here</span>
          </div>
        </div>
        <Button variant="primary" onClick={() => input.current?.click()} data-autofocus>
          Select file
        </Button>
        <input
          ref={input}
          type="file"
          accept=".txt,.zip,text/plain,application/zip,application/x-zip-compressed"
          className="sr-only"
          aria-label="WhatsApp export file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onFile(f);
          }}
        />
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[14px] text-ink">
          {error}
        </div>
      )}

      {pasting ? (
        <div className="space-y-2">
          <label className="block text-[13.5px] text-muted" htmlFor="paste-area">
            Paste the exported chat text
          </label>
          <textarea
            id="paste-area"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            spellCheck={false}
            placeholder="12/05/26, 10:30 pm - Name: Hello"
            className="w-full rounded-xl border border-line bg-panel-2 p-3 font-mono text-[13px] text-ink focus:border-brand focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setPasting(false)}>Cancel</Button>
            <Button variant="primary" disabled={!text.trim()} onClick={() => onText(text)}>
              Use pasted text
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPasting(true)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14.5px] text-ink hover:bg-hover"
        >
          <ClipboardPaste size={20} className="text-muted" /> Paste chat text instead
        </button>
      )}

      <details className="rounded-xl bg-panel-2 px-4 py-3 text-[13.5px] text-muted">
        <summary className="cursor-pointer font-medium text-ink">How do I export a chat from WhatsApp?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Open the chat in WhatsApp.</li>
          <li>
            Android: tap <b>⋮ → More → Export chat</b>. iPhone: tap the contact or group name → <b>Export Chat</b>.
          </li>
          <li>Choose <b>Include media</b> (ZIP) or <b>Without media</b> (TXT).</li>
          <li>Save the file to your device (e.g. Files / Downloads), then select it here.</li>
        </ol>
      </details>

      <p className="flex items-start gap-2 text-[13px] text-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" />
        {PRIVACY_NOTICE}
      </p>
    </div>
  );
}
