/** Fields that change on every save and carry no business meaning for the history. */
export const IGNORED_FIELDS: ReadonlySet<string> = new Set(['version', 'updatedAt']);

export interface FieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function walk(before: unknown, after: unknown, path: string, out: FieldDiff[]): void {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      const child = path === '' ? key : `${path}.${key}`;
      if (IGNORED_FIELDS.has(child)) continue;
      walk(before[key], after[key], child, out);
    }
    return;
  }
  if (!sameValue(before, after)) out.push({ field: path, oldValue: before ?? null, newValue: after ?? null });
}

/** One entry per changed leaf, nested objects flattened to dotted paths, arrays compared whole. */
export function diffFields(before: unknown, after: unknown): FieldDiff[] {
  const out: FieldDiff[] = [];
  walk(before, after, '', out);
  return out;
}

/** Immutable set of a dotted path. Returns a new object. */
export function setPath<T>(target: T, path: string, value: unknown): T {
  const parts = path.split('.');
  const apply = (node: unknown, index: number): unknown => {
    const key = parts[index] as string;
    const base: Record<string, unknown> = isPlainObject(node) ? { ...node } : {};
    base[key] = index === parts.length - 1 ? value : apply(base[key], index + 1);
    return base;
  };
  return apply(target, 0) as T;
}

/** Deep equality that ignores key order (values are plain JSON data). */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => sameData(item, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (a[key] === undefined && b[key] === undefined) continue;
      if (!sameData(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}
