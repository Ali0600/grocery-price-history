/** Port of grocery-helper's `backend/app/dedup.py::_norm_name` — the key that
 * identifies "the same product" across weeks despite per-brochure spelling
 * variants (curly vs straight apostrophes, decorative »quotes«, an extra
 * produce quality-grade token, punctuation differences).
 *
 * PARITY MATTERS: if dedup.py's normalization changes, this must change with
 * it, or products fork into new series mid-history. Python's `\w`/`\b` are
 * unicode-aware; JavaScript's are ASCII-only, hence \p{L}\p{N} classes and
 * explicit lookarounds below.
 */
const GRADE = /(?<![\p{L}\p{N}_])kl(?:asse)?\.?\s*(?:i{1,3}|[123])(?![\p{L}\p{N}_])/gu;

export function nameKey(name: string | null | undefined): string {
  let s = (name ?? '').normalize('NFKC').toLowerCase();
  for (const ch of ['’', '‘', '`', '´', "'"]) s = s.replaceAll(ch, '');
  s = s.replace(GRADE, ' ');
  s = s.replace(/[^\p{L}\p{N}_ ]+/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}
