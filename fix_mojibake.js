const fs = require('fs');
let content = fs.readFileSync('c:/Users/NB/Desktop/pfs/frontend/src/App.tsx', 'utf-8');

// Each entry: [mojibake string (exact chars), correct Unicode char]
// Identified by charCodeAt analysis of the actual file bytes.
const replacements = [
  // em dash U+2014 (original UTF-8: E2 80 94; Win-1252 decoded as â € ")
  ['â€”', '—'],
  // ellipsis U+2026 (original UTF-8: E2 80 A6; Win-1252 decoded as â € ¦)
  ['â€¦', '…'],
  // ✕ U+2715 (original UTF-8: E2 9C 95; Win-1252 decoded as â œ •)
  ['âœ•', '✕'],
  // → U+2192 (original UTF-8: E2 86 92; Win-1252 decoded as â † ')
  ['â†’', '→'],
  // ✓ U+2713 (original UTF-8: E2 9C 93; Win-1252 decoded as â œ ")
  ['âœ“', '✓'],
  // · middle dot U+00B7 (original UTF-8: C2 B7; Latin-1 decoded as Â ·)
  ['Â·', '·'],
  // ≥ U+2265 (original UTF-8: E2 89 A5; Win-1252 decoded as â ‰ ¥)
  ['â‰¥', '≥'],
  // ─ box drawing U+2500 (original UTF-8: E2 94 80; Win-1252 decoded as â " €)
  ['â”€', '─'],
  // ⚠ warning U+26A0 (original UTF-8: E2 9A A0; Win-1252 decoded as â š  )
  ['âš ', '⚠'],
  // – en dash U+2013 (original UTF-8: E2 80 93; Win-1252 decoded as â € ")
  ['â€“', '–'],
];

let total = 0;
for (const [bad, good] of replacements) {
  const count = content.split(bad).length - 1;
  if (count > 0) {
    process.stdout.write(JSON.stringify(bad) + ' -> ' + JSON.stringify(good) + '  (' + count + 'x)\n');
    total += count;
  }
  content = content.split(bad).join(good);
}
process.stdout.write('Total replacements: ' + total + '\n');
fs.writeFileSync('c:/Users/NB/Desktop/pfs/frontend/src/App.tsx', content, 'utf-8');
process.stdout.write('Done.\n');
