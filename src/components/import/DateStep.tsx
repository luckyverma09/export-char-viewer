import { CalendarClock } from 'lucide-react';
import { formatFullDate } from '../../lib/format';
import { toYMD } from '../../lib/parser/dates';
import type { DateOrder } from '../../lib/types';

interface Props {
  samples: string[];
  candidates: DateOrder[];
  value: DateOrder;
  onChange: (o: DateOrder) => void;
}

const LABEL: Record<DateOrder, string> = {
  DMY: 'Day / Month / Year',
  MDY: 'Month / Day / Year',
  YMD: 'Year / Month / Day',
};

function interpret(sample: string, order: DateOrder): string {
  const m = /(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/.exec(sample);
  if (!m) return '—';
  const ymd = toYMD([Number(m[1]), Number(m[2]), Number(m[3])], order, m[1].length, m[3].length);
  return ymd ? formatFullDate(Date.UTC(ymd.y, ymd.m - 1, ymd.d)) : 'invalid';
}

/** Lets the user resolve an ambiguous day/month order. */
export function DateStep({ samples, candidates, value, onChange }: Props) {
  const options: DateOrder[] = candidates.length >= 2 ? candidates : ['DMY', 'MDY'];
  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-start gap-3 rounded-xl bg-notice px-4 py-3 text-[14px] text-notice-ink">
        <CalendarClock size={20} className="mt-0.5 shrink-0" />
        <p>
          The dates in this export could be read two ways. Choose the format your phone uses so every message gets the right date.
        </p>
      </div>
      <div role="radiogroup" aria-label="Date format" className="space-y-2">
        {options.map((o) => (
          <label
            key={o}
            className={`block cursor-pointer rounded-xl border-2 p-4 ${value === o ? 'border-brand bg-brand/5' : 'border-line hover:bg-hover'}`}
          >
            <span className="flex items-center gap-3">
              <input type="radio" name="date-order" checked={value === o} onChange={() => onChange(o)} className="h-4 w-4 accent-[rgb(var(--c-brand))]" />
              <span className="text-[15.5px] font-medium text-ink">{LABEL[o]}</span>
            </span>
            <ul className="mt-2 space-y-0.5 pl-7 text-[13px] text-muted">
              {samples.slice(0, 4).map((s) => (
                <li key={s}>
                  <span className="font-mono">{s}</span> → <span className="text-ink">{interpret(s, o)}</span>
                </li>
              ))}
            </ul>
          </label>
        ))}
      </div>
    </div>
  );
}
