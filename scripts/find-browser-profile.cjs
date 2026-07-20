const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(process.env.APPDATA || '', 'Opera Software', 'Opera GX Stable', 'Default', 'Local Storage', 'leveldb'),
  ...['Default', 'Profile 1', 'Profile 2', 'Profile 3', 'Profile 4', 'Profile 6'].map(name =>
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data', name, 'Local Storage', 'leveldb')),
];
const needles = [Buffer.from('ht_profiles'), Buffer.from('ht_profiles', 'utf16le')];
const matches = [];
for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!/\.(?:ldb|log)$/.test(name)) continue;
    const file = path.join(dir, name);
    const data = fs.readFileSync(file);
    for (const needle of needles) {
      const offset = data.indexOf(needle);
      if (offset >= 0) matches.push({ file, offset, encoding: needle.length === 11 ? 'utf8' : 'utf16le' });
    }
  }
}
console.log(JSON.stringify(matches, null, 2));
