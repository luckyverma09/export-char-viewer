import { DatabaseBackup, HardDrive, Loader2, Palette, ShieldCheck, Smartphone, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createBackup, inspectBackup, restoreBackup, type RestoreChoice, type RestorePlan } from '../../lib/db/backup';
import { clearAllData } from '../../lib/db/repo';
import { getStorageInfo, requestPersistentStorage, type StorageInfo } from '../../lib/db/storage';
import { PRIVACY_NOTICE } from '../../lib/constants';
import { downloadBlob } from '../../lib/exportText';
import { formatBytes } from '../../lib/media';
import { pwaStore } from '../../lib/pwaStore';
import { resetPrefs, type ThemePref } from '../../lib/settings';
import { ConfirmDialog } from '../dialogs/SimpleDialogs';
import { Button, Dialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';

interface Props {
  open: boolean;
  onClose: () => void;
  theme: ThemePref;
  onTheme: (t: ThemePref) => void;
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-4 last:border-0">
      <h3 className="mb-2 flex items-center gap-2 text-[15px] font-medium text-ink">
        <span className="text-brand">{icon}</span>
        {title}
      </h3>
      <div className="space-y-2 text-[13.5px] text-muted">{children}</div>
    </section>
  );
}

export function SettingsPanel({ open, onClose, theme, onTheme }: Props) {
  const toast = useToast();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [choices, setChoices] = useState<Record<string, RestoreChoice>>({});
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const backupBytes = useRef<Uint8Array | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pwa = useSyncExternalStore(pwaStore.subscribe, pwaStore.get);
  const ios = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  const refresh = useCallback(() => {
    void getStorageInfo().then(setStorage);
  }, []);
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const backup = async () => {
    setBusy('backup');
    try {
      const blob = await createBackup();
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `chatss-backup-${date}.zip`);
      toast('Backup created. Keep it somewhere safe - it contains your chats.');
    } catch {
      toast('The backup could not be created.');
    } finally {
      setBusy(null);
    }
  };

  const pickRestore = async (file: File) => {
    setRestoreError(null);
    setBusy('inspect');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const p = await inspectBackup(bytes);
      backupBytes.current = bytes;
      setPlan(p);
      setChoices(Object.fromEntries(p.items.map((i) => [i.id, i.conflict ? 'skip' : 'restore'])));
    } catch (e) {
      setRestoreError((e as Error).message || 'This backup could not be read.');
    } finally {
      setBusy(null);
    }
  };

  const doRestore = async () => {
    if (!backupBytes.current) return;
    setBusy('restore');
    try {
      const r = await restoreBackup(backupBytes.current, choices);
      toast(`Restored ${r.restored} chat${r.restored === 1 ? '' : 's'}${r.skipped ? `, skipped ${r.skipped}` : ''}.`);
      setPlan(null);
      backupBytes.current = null;
      refresh();
    } catch (e) {
      setRestoreError((e as Error).message || 'Restore failed. No chats were changed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} title="Settings" variant="full">
        <Section icon={<Palette size={18} />} title="Appearance">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={theme === t}
                onClick={() => onTheme(t)}
                className={`rounded-full border px-4 py-1.5 text-[14px] capitalize ${theme === t ? 'border-brand bg-brand/10 text-brand' : 'border-line hover:bg-hover'}`}
              >
                {t === 'system' ? 'System default' : t}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={<ShieldCheck size={18} />} title="Privacy">
          <p className="text-ink">{PRIVACY_NOTICE}</p>
          <p>
            Chats are saved in this browser&apos;s private storage (IndexedDB) on this device only. There are no accounts, analytics or trackers, and
            Chatss makes no network requests with your data. After installation it works fully offline.
          </p>
          <p>Anyone who can unlock this device and open Chatss can read the imported chats. Chatss does not encrypt stored chats.</p>
        </Section>

        <Section icon={<HardDrive size={18} />} title="Storage on this device">
          {storage?.supported ? (
            <>
              <p>
                Used: <span className="text-ink">{storage.usage !== null ? formatBytes(storage.usage) : 'unknown'}</span>
                {storage.quota !== null && <> of about {formatBytes(storage.quota)} available to Chatss</>}
              </p>
              <p>
                Persistent storage:{' '}
                <span className="text-ink">{storage.persisted ? 'granted' : storage.persisted === false ? 'not granted' : 'unknown'}</span>
              </p>
              {!storage.persisted && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const r = await requestPersistentStorage();
                    toast(r ? 'Persistent storage granted.' : 'The browser did not grant persistent storage. Installing Chatss can help.');
                    refresh();
                  }}
                >
                  Ask browser to keep my chats
                </Button>
              )}
            </>
          ) : (
            <p>This browser does not report storage usage.</p>
          )}
          <p>
            Persistent storage asks the browser not to delete Chatss data when space runs low. It is not a guarantee: clearing browser data, uninstalling the
            app or the browser itself can still remove your chats. Keep backups of anything important.
          </p>
        </Section>

        <Section icon={<DatabaseBackup size={18} />} title="Backup & restore">
          <p>A backup is a .zip file with all imported chats, participant choices and stored media. It never leaves your device unless you move it.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!!busy} onClick={() => void backup()}>
              {busy === 'backup' ? <Loader2 size={16} className="animate-spin" /> : <DatabaseBackup size={16} />} Create backup
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => fileInput.current?.click()}>
              {busy === 'inspect' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Restore backup
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              aria-label="Backup file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void pickRestore(f);
              }}
            />
          </div>
          {restoreError && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-ink">
              {restoreError}
            </p>
          )}
        </Section>

        <Section icon={<Smartphone size={18} />} title="Install Chatss">
          {pwa.installed ? (
            <p>Chatss is installed on this device.</p>
          ) : pwa.canInstall ? (
            <Button variant="primary" onClick={() => void pwaStore.install()}>
              Install app
            </Button>
          ) : ios ? (
            <p>
              On iPhone/iPad: open Chatss in <b>Safari</b>, tap the <b>Share</b> button, then <b>Add to Home Screen</b>.
            </p>
          ) : (
            <p>
              On Android (Chrome): open the browser menu <b>⋮</b> and tap <b>Install app</b> or <b>Add to Home screen</b>. On desktop, use the install icon in
              the address bar.
            </p>
          )}
          <p>Once installed and opened online one time, Chatss works without an internet connection.</p>
        </Section>

        <Section icon={<Trash2 size={18} />} title="Danger zone">
          <Button variant="danger" onClick={() => setConfirmClear(true)}>
            Delete all chats from this device
          </Button>
        </Section>

        <p className="py-4 text-center text-[12px] text-muted">
          Chatss {__APP_VERSION__} · Not affiliated with WhatsApp or Meta.
        </p>
      </Dialog>

      <Dialog
        open={!!plan}
        onClose={() => setPlan(null)}
        title="Restore backup"
        footer={
          <>
            <Button onClick={() => setPlan(null)}>Cancel</Button>
            <Button variant="primary" disabled={busy === 'restore' || !Object.values(choices).some((c) => c !== 'skip')} onClick={() => void doRestore()}>
              {busy === 'restore' && <Loader2 size={16} className="animate-spin" />} Restore
            </Button>
          </>
        }
      >
        {plan && (
          <div className="space-y-3 text-[14px]">
            <p className="text-muted">Backup from {new Date(plan.createdAt).toLocaleString()}. Existing chats are never overwritten.</p>
            <ul className="space-y-2">
              {plan.items.map((item) => (
                <li key={item.id} className="rounded-xl bg-panel-2 p-3">
                  <div className="font-medium text-ink">{item.title}</div>
                  <div className="text-[12.5px] text-muted">
                    {item.messageCount.toLocaleString()} messages · {item.attachmentCount} attachments
                    {item.conflict && <span className="text-[#b26b00] dark:text-notice-ink"> · already on this device</span>}
                  </div>
                  <select
                    aria-label={`What to do with ${item.title}`}
                    value={choices[item.id]}
                    onChange={(e) => setChoices({ ...choices, [item.id]: e.target.value as RestoreChoice })}
                    className="mt-2 w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-ink"
                  >
                    <option value="skip">Skip</option>
                    {item.conflict ? <option value="copy">Restore as a copy</option> : <option value="restore">Restore</option>}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmClear}
        title="Delete all chats?"
        confirmLabel="Delete everything"
        requireText="DELETE"
        message={
          <>
            <p>Every imported chat, participant choice and stored media file will be permanently removed from this device.</p>
            <p>Your original WhatsApp exports and any backup files are not affected. Consider creating a backup first.</p>
          </>
        }
        onClose={() => setConfirmClear(false)}
        onConfirm={async () => {
          await clearAllData();
          resetPrefs();
          setConfirmClear(false);
          toast('All chats deleted from this device');
          refresh();
        }}
      />
    </>
  );
}
