"""ZIP of the portable build without userdata (no history, no settings, no smoke profile) + a SHA-256 manifest."""
from pathlib import Path
import hashlib, json, zipfile
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist' / 'HSR Warp Tracker'
version = json.loads((ROOT / 'app' / 'package.json').read_text(encoding='utf8'))['version']
electron = json.loads((ROOT / '.build-tools' / 'electron-version.json').read_text(encoding='utf8'))['version']
files = [p for p in sorted(OUT.rglob('*')) if p.is_file() and 'userdata' not in p.relative_to(OUT).parts and p.name not in ('smoke-test.json', 'release-manifest.json')]
manifest = {'name': 'HSR Warp Tracker', 'version': version, 'platform': 'Windows x64', 'electron': electron,
            'files': [{'path': p.relative_to(OUT).as_posix(), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(OUT / 'release-manifest.json').write_text(json.dumps(manifest, indent=1), encoding='utf8')
files.append(OUT / 'release-manifest.json')
archive = ROOT / 'dist' / f'HSR-Warp-Tracker-{version}-Windows-x64.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for p in files:
        z.write(p, 'HSR Warp Tracker/' + p.relative_to(OUT).as_posix())
with zipfile.ZipFile(archive) as z:
    names = z.namelist()
    assert not any('/userdata/' in n for n in names), 'userdata must not be in the zip'
print(json.dumps({'zip': str(archive), 'files': len(names), 'mb': round(archive.stat().st_size / 1048576, 1), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}))
