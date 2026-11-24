"""Download the pinned official Electron build for Windows x64 into .build-tools/electron (needed to run, test and
package the app from source). The archive is checked against a pinned SHA-256 before it is extracted; nothing is run."""
from pathlib import Path
import hashlib, io, json, sys, urllib.request, zipfile

VERSION = '44.5.1'
FILENAME = f'electron-v{VERSION}-win32-x64.zip'
SHA256 = '9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db'
URL = f'https://github.com/electron/electron/releases/download/v{VERSION}/{FILENAME}'
ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / '.build-tools'
TARGET = TOOLS / 'electron'

if (TARGET / 'electron.exe').exists():
    print('Electron is already in', TARGET)
    sys.exit(0)
print('Downloading', URL, flush=True)
with urllib.request.urlopen(URL, timeout=120) as r:
    data = r.read()
digest = hashlib.sha256(data).hexdigest()
if digest != SHA256:
    raise SystemExit(f'Checksum mismatch: {digest} != {SHA256}')
TARGET.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    for name in archive.namelist():
        if not (TARGET / name).resolve().is_relative_to(TARGET.resolve()):
            raise SystemExit('Invalid path in the archive: ' + name)
    archive.extractall(TARGET)
(TOOLS / 'electron-version.json').write_text(json.dumps({'version': VERSION, 'sha256': SHA256}), encoding='utf8')
print('Electron', VERSION, 'verified and extracted to', TARGET)
