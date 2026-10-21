import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef, useImperativeHandle } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MessageList } from '../src/components/chat/MessageList';
import { ChatList } from '../src/components/home/ChatList';
import { ImportWizard } from '../src/components/import/ImportWizard';
import { ToastProvider } from '../src/components/ui/Toast';
import { buildRecords, defaultDecisions } from '../src/lib/importer/build';
import { prepareFromText } from '../src/lib/importer/draft';
import { AMBIGUOUS, ANDROID_12H, GROUP } from './fixtures/chats';
import { freshDb, importText } from './helpers';

// jsdom has no layout, so the real virtual list renders nothing. Replace it with
// a plain list that renders every row (alignment logic is what's under test).
vi.mock('react-virtuoso', () => ({
  Virtuoso: forwardRef(function FakeVirtuoso(
    props: { data: unknown[]; itemContent: (i: number, d: unknown) => React.ReactNode },
    ref: React.Ref<unknown>,
  ) {
    useImperativeHandle(ref, () => ({ scrollToIndex: () => undefined }));
    return <div role="log">{props.data.map((d, i) => <div key={i}>{props.itemContent(i, d)}</div>)}</div>;
  }),
}));

function renderChat(text: string, selfName: string | null, type?: 'group' | 'individual') {
  const draft = prepareFromText(text);
  const d = { ...defaultDecisions(draft), selfRaw: selfName };
  if (type) d.type = type;
  const r = buildRecords(draft, d, { conversationId: 'c' });
  const participants = new Map(r.participants.map((p) => [p.id, p]));
  const ui = render(
    <MessageList
      messages={r.messages}
      participants={participants}
      selfId={r.conversation.selfParticipantId}
      type={r.conversation.type}
      hour12={r.conversation.hour12}
    />,
  );
  return { ...ui, records: r };
}

const sideOfText = (text: string) => screen.getByText(text).closest('[data-side]')?.getAttribute('data-side');

describe('message alignment', () => {
  it('puts the selected participant on the right and the other on the left', () => {
    renderChat(ANDROID_12H, 'Lucky');
    expect(sideOfText('Hello')).toBe('out');
    expect(sideOfText('Hi! How are you? 😊')).toBe('in');
  });

  it('flips when the other participant is selected', () => {
    renderChat(ANDROID_12H, 'Mansi Sharma');
    expect(sideOfText('Hello')).toBe('in');
    expect(sideOfText('Hi! How are you? 😊')).toBe('out');
  });

  it('centres system notices and shows date separators', () => {
    renderChat(ANDROID_12H, 'Lucky');
    expect(screen.getByText(/end-to-end encrypted/).closest('[data-side]')?.getAttribute('data-side')).toBe('center');
    expect(screen.getAllByText(/2026/).length).toBeGreaterThanOrEqual(2); // two days
  });

  it('shows sender names for other members in groups, not for me', () => {
    renderChat(GROUP, 'Asha', 'group');
    expect(sideOfText('Hi all!')).toBe('in');
    expect(sideOfText('Welcome everyone')).toBe('out');
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.getByText('Chandra Kumar Rao')).toBeInTheDocument();
    expect(screen.queryByText('Asha', { selector: '.sender-color' })).toBeNull();
  });

  it('marks deleted, edited and missing media honestly', () => {
    renderChat(ANDROID_12H, 'Lucky');
    expect(screen.getByText('This message was deleted')).toBeInTheDocument();
    expect(screen.getByText('Edited')).toBeInTheDocument();
    expect(screen.getByText(/Media not included in the export/)).toBeInTheDocument();
    expect(screen.getByText('IMG-20260513-WA0001.jpg')).toBeInTheDocument();
    expect(screen.getByText('File not included in the export')).toBeInTheDocument();
  });

  it('renders imported markup as inert text (no XSS)', () => {
    const { container } = renderChat('01/01/26, 10:00 - Eve: <img src=x onerror="alert(1)"><script>alert(2)</script>', null);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>alert\(2\)<\/script>/)).toBeInTheDocument();
  });

  it('keeps chronological source order in the DOM', () => {
    const { container } = renderChat(ANDROID_12H, 'Lucky');
    const ids = [...container.querySelectorAll('[data-message-id]')].map((e) => Number(e.getAttribute('data-message-id')!.split(':')[1]));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});

describe('import wizard', () => {
  async function pasteAndRead(text: string) {
    const user = userEvent.setup();
    const onImported = vi.fn();
    render(
      <ToastProvider>
        <ImportWizard open onClose={() => undefined} onImported={onImported} />
      </ToastProvider>,
    );
    await user.click(screen.getByText('Paste chat text instead'));
    await user.click(screen.getByLabelText('Paste the exported chat text'));
    await user.paste(text);
    await user.click(screen.getByText('Use pasted text'));
    return { user, onImported };
  }

  it('requires choosing who you are, previews, then saves to IndexedDB', async () => {
    const db = freshDb();
    const { user, onImported } = await pasteAndRead(ANDROID_12H);
    await screen.findByText('Who are you in this conversation?');
    const preview = screen.getByRole('button', { name: 'Preview' });
    expect(preview).toBeDisabled();

    const who = screen.getByRole('radiogroup', { name: 'Who are you in this conversation?' });
    await user.click(within(who).getByText('Mansi Sharma'));
    expect(preview).toBeEnabled();
    await user.click(preview);

    // Preview uses the real chat UI with the chosen perspective.
    expect(sideOfText('Hello')).toBe('in');
    expect(sideOfText('Hi! How are you? 😊')).toBe('out');
    await user.click(screen.getByRole('button', { name: 'Import chat' }));

    await waitFor(() => expect(onImported).toHaveBeenCalled());
    const conv = await db.conversations.get(onImported.mock.calls[0][0]);
    expect(conv?.status).toBe('complete');
    const me = await db.participants.get(conv!.selfParticipantId!);
    expect(me?.originalName).toBe('Mansi Sharma');
  });

  it('asks how to read ambiguous dates', async () => {
    freshDb();
    const { user } = await pasteAndRead(AMBIGUOUS);
    await screen.findByText('Confirm date format');
    await user.click(screen.getByText('Month / Day / Year'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Who are you in this conversation?');
  });

  it('offers to skip a duplicate import', async () => {
    freshDb();
    await importText(ANDROID_12H);
    const { user } = await pasteAndRead(ANDROID_12H);
    await user.click(within(await screen.findByRole('radiogroup', { name: 'Who are you in this conversation?' })).getByText('Lucky'));
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await user.click(screen.getByRole('button', { name: 'Import chat' }));
    expect(await screen.findByText(/looks identical to a chat you already imported/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import separately' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip, open existing' })).toBeInTheDocument();
  });

  it('shows a clear error for files that are not WhatsApp exports', async () => {
    freshDb();
    await pasteAndRead('this is not a chat');
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not look like a WhatsApp chat export/);
  });
});

describe('conversation list', () => {
  const noop = () => undefined;

  it('shows the empty state with the privacy notice', async () => {
    freshDb();
    render(<ChatList activeId={null} onOpen={noop} onImport={noop} onSettings={noop} onToggleTheme={noop} onChatAction={noop} />);
    expect(await screen.findByText('Welcome to Chatss')).toBeInTheDocument();
    expect(screen.getByText(/Chatss does not upload your messages to a server/)).toBeInTheDocument();
  });

  it('lists imported chats and filters by search', async () => {
    freshDb();
    await importText(ANDROID_12H);
    await importText(GROUP, (d) => ({ ...d, title: 'Trip planning', type: 'group' }));
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<ChatList activeId={null} onOpen={onOpen} onImport={noop} onSettings={noop} onToggleTheme={noop} onChatAction={noop} />);
    const list = await screen.findByRole('list', { name: 'Chats' });
    expect(within(list).getByText('Trip planning')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.type(screen.getByLabelText('Search chats and messages'), 'trip');
    expect(within(screen.getByRole('list', { name: 'Chats' })).queryAllByRole('listitem')).toHaveLength(1);
    await user.click(within(screen.getByRole('list', { name: 'Chats' })).getByText('Trip planning'));
    expect(onOpen).toHaveBeenCalled();
  });
});
