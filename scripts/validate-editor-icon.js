const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const raw = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(raw);

if (!pkg.contributes || !pkg.contributes.commands) {
  console.error('Missing commands contribution');
  process.exit(2);
}

const commandEntry = pkg.contributes.commands.find(c => c.command === 'erdVisualizer.openForEditor');
if (!commandEntry) {
  console.error('Command erdVisualizer.openForEditor not registered');
  process.exit(2);
}

if (!commandEntry.icon || !commandEntry.icon.dark || !commandEntry.icon.light) {
  console.error('Command erdVisualizer.openForEditor is missing light/dark icon definitions');
  process.exit(2);
}

const iconPaths = [commandEntry.icon.dark, commandEntry.icon.light].map(rel => path.join(__dirname, '..', rel));
for (const filePath of iconPaths) {
  if (!fs.existsSync(filePath)) {
    console.error('Icon file missing:', filePath);
    process.exit(2);
  }
}

if (!pkg.contributes.menus || !pkg.contributes.menus['editor/title']) {
  console.error('Missing editor/title menu contribution');
  process.exit(2);
}

const items = pkg.contributes.menus['editor/title'];
const found = items.some(i => i.command === 'erdVisualizer.openForEditor');
if (!found) {
  console.error('erdVisualizer.openForEditor not found in editor/title menu contributions');
  process.exit(2);
}

console.log('OK: editor/title menu contribution found and icon assets verified for erdVisualizer.openForEditor');
process.exit(0);
