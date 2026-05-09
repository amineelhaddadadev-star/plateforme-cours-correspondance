const fs = require('fs');
let content = fs.readFileSync('c:/Users/NB/Desktop/pfs/frontend/src/App.tsx', 'utf-8');

// Construct mojibake patterns programmatically using code points
// to avoid any editor/shell encoding issues when writing this script.
//
// UTF-8 bytes misread as Windows-1252:
//   <- U+2190 (E2 86 90): 0xE2->U+00E2(a^), 0x86->U+2020(dagger), 0x90->U+0090(ctrl)
//   checkmark-box U+2705 (E2 9C 85): 0xE2->U+00E2, 0x9C->U+0153(oe), 0x85->U+2026(ellipsis)
//   keyboard U+2398 (E2 8E 98): 0xE2->U+00E2, 0x8E->U+017D(Zcaronup), 0x98->U+02DC(tilde)

const replacements = [
  [String.fromCodePoint(0x00E2, 0x2020, 0x0090), '←'],  // <- leftwards arrow
  [String.fromCodePoint(0x00E2, 0x0153, 0x2026), '✅'],  // checkmark box
  [String.fromCodePoint(0x00E2, 0x017D, 0x02DC), '⎘'],  // keyboard symbol
];

let total = 0;
for (const [bad, good] of replacements) {
  const count = content.split(bad).length - 1;
  process.stdout.write(
    'Pattern [' + [...bad].map(c => 'U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' ') +
    '] found ' + count + 'x -> ' + good + '\n'
  );
  if (count > 0) {
    total += count;
    content = content.split(bad).join(good);
  }
}

process.stdout.write('Total replacements: ' + total + '\n');
fs.writeFileSync('c:/Users/NB/Desktop/pfs/frontend/src/App.tsx', content, 'utf-8');
process.stdout.write('Done.\n');
