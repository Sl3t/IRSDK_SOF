const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', 'node-irsdk', 'binding.gyp');

if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed: removed BOM from node-irsdk/binding.gyp');
  } else {
    console.log('OK: no BOM found in node-irsdk/binding.gyp');
  }
} else {
  console.log('Skip: node-irsdk/binding.gyp not found');
}
