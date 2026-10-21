import { AlertTriangle, Check, EyeOff, Info, Users, User } from 'lucide-react';
import { useMemo } from 'react';
import { findAmbiguousSenders } from '../../lib/importer/ambiguity';
import { resolveMerges, type ImportDecisions, type ParticipantDecision } from '../../lib/importer/build';
import type { ImportDraft } from '../../lib/importer/draft';
import { formatFullDate } from '../../lib/format';
import { colorIndexFor } from '../../lib/avatar';
import { Avatar } from '../ui/Avatar';

interface Props {
  draft: ImportDraft;
  decisions: ImportDecisions;
  selfChosen: boolean;
  onChange: (d: ImportDecisions) => void;
  onSelfChosen: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-panel-2 px-3 py-2">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="truncate text-[15px] font-medium text-ink">{value}</div>
    </div>
  );
}

export function DetailsStep({ draft, decisions, selfChosen, onChange, onSelfChosen }: Props) {
  const { parse } = draft;
  const counts = useMemo(() => new Map(parse.senders.map((s) => [s.name, s.count])), [parse.senders]);
  const roots = useMemo(() => {
    const canon = resolveMerges(decisions.participants);
    return decisions.participants.filter((d) => canon.get(d.raw) === d.raw);
  }, [decisions.participants]);
  const rootCount = (raw: string) => {
    const canon = resolveMerges(decisions.participants);
    return decisions.participants.filter((d) => canon.get(d.raw) === raw).reduce((n, d) => n + (counts.get(d.raw) ?? 0), 0);
  };
  const ambiguous = useMemo(() => findAmbiguousSenders(parse.senders.map((s) => s.name)), [parse.senders]);
  const hasSenderWarnings = parse.warnings.some((w) => w.code === 'missing_sender');

  const real = parse.messages.filter((m) => m.type !== 'unparsed');
  const first = real[0]?.ts;
  const last = real[real.length - 1]?.ts;
  const mediaRefs = parse.messages.filter((m) => m.type === 'media').length;
  const matched = Object.keys(draft.matchedFiles).length;

  const update = (raw: string, patch: Partial<ParticipantDecision>) =>
    onChange({ ...decisions, participants: decisions.participants.map((d) => (d.raw === raw ? { ...d, ...patch } : d)) });

  return (
    <div className="space-y-5 pb-2">
      <section aria-label="Summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Messages" value={parse.messages.length.toLocaleString()} />
        <Stat label="Participants" value={String(roots.length)} />
        <Stat label="Format" value={parse.format === 'ios' ? 'iPhone' : parse.format === 'android' ? 'Android' : 'Mixed'} />
        <Stat label="First message" value={first !== undefined ? formatFullDate(first) : '—'} />
        <Stat label="Last message" value={last !== undefined ? formatFullDate(last) : '—'} />
        <Stat
          label="Media"
          value={mediaRefs === 0 ? 'None' : draft.source.kind === 'zip' ? `${matched} of ${mediaRefs} files` : `${mediaRefs} (not included)`}
        />
      </section>

      <section className="space-y-3">
        <label className="block text-[13px] text-muted">
          Chat name
          <input
            value={decisions.title}
            maxLength={200}
            onChange={(e) => onChange({ ...decisions, title: e.target.value })}
            className="mt-1 w-full border-b-2 border-line bg-transparent py-1.5 text-[16px] text-ink focus:border-brand focus:outline-none"
          />
        </label>
        <div className="flex gap-2" role="radiogroup" aria-label="Chat type">
          {(['individual', 'group'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={decisions.type === t}
              onClick={() => onChange({ ...decisions, type: t })}
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-[14px] ${
                decisions.type === t ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:bg-hover'
              }`}
            >
              {t === 'group' ? <Users size={16} /> : <User size={16} />}
              {t === 'group' ? 'Group chat' : 'Individual chat'}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="who-heading" className="rounded-2xl border-2 border-brand/40 p-4">
        <h3 id="who-heading" className="text-[17px] font-medium text-ink">
          Who are you in this conversation?
        </h3>
        <p className="mb-3 mt-1 text-[13px] text-muted">Your messages will appear on the right. You can change this later.</p>
        <div role="radiogroup" aria-labelledby="who-heading" className="space-y-1">
          {roots.map((d) => {
            const selected = selfChosen && decisions.selfRaw === d.raw;
            return (
              <button
                key={d.raw}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  onChange({ ...decisions, selfRaw: d.raw });
                  onSelfChosen();
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${selected ? 'bg-brand/10' : 'hover:bg-hover'}`}
              >
                <Avatar name={d.displayName || d.raw} color={colorIndexFor(d.raw)} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{d.displayName || d.raw}</span>
                  <span className="block text-[12.5px] text-muted">{rootCount(d.raw).toLocaleString()} messages</span>
                </span>
                {selected && <Check size={20} className="text-brand" />}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={selfChosen && decisions.selfRaw === null}
            onClick={() => {
              onChange({ ...decisions, selfRaw: null });
              onSelfChosen();
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${
              selfChosen && decisions.selfRaw === null ? 'bg-brand/10' : 'hover:bg-hover'
            }`}
          >
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-ink/10 text-muted">
              <EyeOff size={17} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] text-ink">None of these</span>
              <span className="block text-[12.5px] text-muted">Show all messages on the left</span>
            </span>
            {selfChosen && decisions.selfRaw === null && <Check size={20} className="text-brand" />}
          </button>
        </div>
      </section>

      <details open={ambiguous.size > 0 || hasSenderWarnings} className="rounded-2xl bg-panel-2 p-4">
        <summary className="cursor-pointer text-[15px] font-medium text-ink">
          Review participant names
          {ambiguous.size > 0 && <span className="ml-2 text-[12.5px] font-normal text-[#b26b00] dark:text-notice-ink">· please check</span>}
        </summary>
        <p className="mb-3 mt-2 text-[13px] text-muted">
          Rename how people are shown, or mark two sender names as the same person (e.g. a phone number and a saved name).
        </p>
        <ul className="space-y-3">
          {decisions.participants.map((d) => (
            <li key={d.raw} className="rounded-xl bg-panel p-3">
              <div className="mb-2 flex items-center gap-2 text-[12.5px] text-muted">
                {ambiguous.has(d.raw) && <AlertTriangle size={14} className="text-[#b26b00] dark:text-notice-ink" aria-label="Possibly ambiguous" />}
                <span className="truncate">
                  In export: <span className="font-mono text-ink">{d.raw}</span> · {(counts.get(d.raw) ?? 0).toLocaleString()} messages
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[12.5px] text-muted">
                  Display name
                  <input
                    value={d.displayName}
                    maxLength={120}
                    disabled={!!d.mergeInto}
                    onChange={(e) => update(d.raw, { displayName: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[14.5px] text-ink focus:border-brand focus:outline-none disabled:opacity-50"
                  />
                </label>
                <label className="text-[12.5px] text-muted">
                  Same person as
                  <select
                    value={d.mergeInto ?? ''}
                    onChange={(e) => {
                      const mergeInto = e.target.value || null;
                      const next = { ...decisions, participants: decisions.participants.map((x) => (x.raw === d.raw ? { ...x, mergeInto } : x)) };
                      if (mergeInto && decisions.selfRaw === d.raw) next.selfRaw = mergeInto;
                      onChange(next);
                    }}
                    className="mt-0.5 w-full rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-[14.5px] text-ink focus:border-brand focus:outline-none"
                  >
                    <option value="">— (separate person)</option>
                    {decisions.participants
                      .filter((o) => o.raw !== d.raw && o.mergeInto !== d.raw)
                      .map((o) => (
                        <option key={o.raw} value={o.raw}>
                          {o.displayName || o.raw}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </li>
          ))}
        </ul>
      </details>

      {(parse.warnings.length > 0 || draft.notices.length > 0) && (
        <details className="rounded-2xl bg-notice p-4 text-notice-ink" open={parse.warnings.some((w) => w.code !== 'date_order')}>
          <summary className="flex cursor-pointer items-center gap-2 text-[14.5px] font-medium">
            <Info size={17} /> {parse.warnings.length + draft.notices.length} import note{parse.warnings.length + draft.notices.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-[13px]">
            {draft.notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
            {parse.warnings.slice(0, 200).map((w, i) => (
              <li key={i}>
                {w.line > 0 && <span className="font-medium">Line {w.line}: </span>}
                {w.message}
                {w.excerpt && <span className="mt-0.5 block truncate font-mono text-[12px] opacity-80">{w.excerpt}</span>}
              </li>
            ))}
            {parse.warnings.length > 200 && <li>…and {parse.warnings.length - 200} more.</li>}
          </ul>
        </details>
      )}
    </div>
  );
}
