// post-build.js - Patches NSIS script to add MUI_UNICON for uninstaller
const fs = require('fs');
const path = require('path');

const nsiPath = path.join(__dirname, 'src-tauri/target/release/nsis/x64/installer.nsi');

if (!fs.existsSync(nsiPath)) {
  console.log('NSIS script not found, skipping patch');
  process.exit(0);
}

// Read as UTF-16LE (NSIS script encoding)
const buf = fs.readFileSync(nsiPath);
let content = buf.toString('utf16le');

// Add MUI_UNICON after MUI_ICON
if (!content.includes('MUI_UNICON')) {
  content = content.replace(
    /(!define MUI_ICON "[^"]*")/g,
    '$1\r\n!define MUI_UNICON "${INSTALLERICON}"'
  );
  fs.writeFileSync(nsiPath, Buffer.from(content, 'utf16le'));
  console.log('Patched NSIS script with MUI_UNICON');
} else {
  console.log('MUI_UNICON already present');
}
