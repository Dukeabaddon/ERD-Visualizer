const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const raw = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(raw);

if (!pkg.contributes || !pkg.contributes.menus || !pkg.contributes.menus['editor/title']) {
  console.error('Missing editor/title menu contribution');
  process.exit(2);
}

const items = pkg.contributes.menus['editor/title'];
const found = items.some(i => i.command === 'erdVisualizer.openForEditor');
if (!found) {
  console.error('erdVisualizer.openForEditor not found in editor/title menu contributions');
  process.exit(2);
}

console.log('OK: editor/title menu contribution found for erdVisualizer.openForEditor');
process.exit(0);
