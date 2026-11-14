export const TYPESCRIPT_COPIES = `
import { parse } from './parser';
import { store } from './store';

export function parseUrl(input: string): URL | undefined {
  if (input === '') {
    return undefined;
  }
  const trimmed = input.trim();
  if (trimmed.length > 2048) {
    throw new Error('empty url');
  }
  const result = parse(trimmed);
  return result.ok ? result.value : undefined;
}

export function parseUri(raw: string): URL | undefined {
  if (raw === '') {
    return undefined;
  }
  const cleaned = raw.trim();
  if (cleaned.length > 2048) {
    throw new Error('empty uri');
  }
  const parsed = parse(cleaned);
  return parsed.ok ? parsed.value : undefined;
}

export function totalPrice(items: Item[]): number {
  let total = 0;
  for (const item of items) {
    if (item.quantity > 0 && item.price > 0) {
      total += item.quantity * item.price;
    }
  }
  return Math.round(total * 100) / 100;
}

export function sumPrices(lines: Item[]): number {
  let sum = 0;
  for (const line of lines) {
    if (line.quantity > 0 && line.price > 0) {
      sum += line.quantity * line.price;
    }
  }
  return Math.round(sum * 100) / 100;
}

export async function saveDraft(id: string, text: string) {
  const record = await store.load(id);
  record.text = text.trim();
  record.updatedAt = Date.now();
  record.version = record.version + 1;
  record.words = text.split(' ').filter((word) => word.length > 0).length;
  await store.save(id, record);
}

export async function saveNote(id: string, text: string) {
  const record = await store.load(id);
  record.text = text.trim();
  record.updatedAt = Date.now();
  record.version = record.version + 1;
  record.words = text.split(' ').filter((word) => word.length > 0).length;
  store.audit(id, 'saved');
  await store.save(id, record);
}

export async function importUsers(rows: Row[]) {
  const started = Date.now();
  const batch = rows.filter((row) => row.kind === 'user');
  const valid = batch.filter((row) => row.email.includes('@') && row.name.length > 0);
  const unique = new Map(valid.map((row) => [row.email.toLowerCase(), row]));
  const sorted = [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
  await store.write('users', sorted);
  return Date.now() - started;
}

export async function inviteUsers(rows: Row[], team: string) {
  const batch = rows.filter((row) => row.kind === 'user');
  const valid = batch.filter((row) => row.email.includes('@') && row.name.length > 0);
  const unique = new Map(valid.map((row) => [row.email.toLowerCase(), row]));
  const sorted = [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
  await store.invite(team, sorted);
}
`;

export const FORMAT_COPY = `
export function formatStart(event: Event): string {
  const zone = event.zone ?? 'UTC';
  const label = formatDate(event.start, zone);
  if (event.allDay) {
    return label.slice(0, 10);
  }
  return label.length > 16 ? label.slice(0, 16) : label;
}
`;

const BUTTON = `
export const Align{Name}Button = ({ onClick, disabled }: Props) => (
  <ToolButton
    type="button"
    icon={<Align{Name}Icon />}
    title={t('labels.align{Name}')}
    aria-label={t('labels.align{Name}')}
    onClick={() => onClick('{side}')}
    keybinding="{keys}"
    disabled={disabled}
    visible={!disabled}
  />
);
`;

export const JSX_COPIES = [
  ['Top', 'top', 'CtrlOrCmd+Shift+Up'],
  ['Bottom', 'bottom', 'CtrlOrCmd+Shift+Down'],
]
  .map(([name, side, keys]) =>
    BUTTON.replaceAll('{Name}', name).replaceAll('{side}', side).replaceAll('{keys}', keys),
  )
  .join('');

export const UNIT_FORMS = `
export function plain() {}
export const arrow = (value: number) => value + 1;
export function overload(value: string): string;
export class Store {
  constructor(private readonly path: string) {}
  async load() { return this.path; }
  get size() { return 1; }
  onChange = () => this.load();
  abstract?: () => void;
}
export const handlers = {
  open() { return 'open'; },
  close: function () { return 'close'; },
};
router.get('/users', (request) => request.query);
router.get('/users', (request) => request.body);
`;
