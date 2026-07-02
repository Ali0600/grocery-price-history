# Learnings — grocery-price-history

## JavaScript `\w` and `\b` are ASCII-only; Python's are unicode-aware

Porting a regex between Python and JavaScript is not copy-paste: Python 3's `\w` matches
umlauts/ß and `\b` respects them as word characters, while JavaScript's `\w`/`\b` only know
ASCII — so a naive port of `re.sub(r"[^\w ]+", " ", s)` would have shredded "Möhren süß"
into "m hren s" and forked every umlaut product into a separate price series.

**Why it came up:** `src/normalize.ts` ports grocery-helper's `_norm_name` (the cross-week
product identity key). The fix: character classes `[^\p{L}\p{N}_ ]` with the `u` flag, and
explicit lookarounds `(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])` instead of `\b`.

**Takeaway:** when porting regexes across languages, treat `\w`, `\b`, and `\s` as
language-specific — and prove parity by diffing both implementations over the *real* corpus
(here: 1262 live product names, 0 mismatches), not just hand-picked test strings.

## Privacy by whitelist: map fields one-by-one, never spread-and-delete

The upstream API serves `store_name` (a branch name that can reveal the scraped
neighbourhood). The collector builds each public snapshot row field-by-field from an
explicit allowlist instead of `{...offer}` + `delete` — so a *future* upstream field
(coordinates, a market code) cannot leak into the published dataset by default; it would
have to be added deliberately.

**Why it came up:** this repo is public and the source repo's postal code was once
history-purged; the snapshots must stay location-free forever.

**Takeaway:** when republishing data derived from a richer source, default-deny: an
allowlist mapper plus a test asserting banned keys are absent turns "we remembered to strip
it" into "it can't happen silently".
