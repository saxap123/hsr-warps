"""Portable build: dist/HSR Warp Tracker/HSR Warp Tracker.exe + Electron runtime + resources/app.
Never touches dist/HSR Warp Tracker/userdata (the user's history, backups and settings live there)."""
from pathlib import Path
import hashlib, json, shutil
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist' / 'HSR Warp Tracker'
ELECTRON = ROOT / '.build-tools' / 'electron'
OUT.mkdir(parents=True, exist_ok=True)
SKIP = {'userdata', 'smoke-test.json'}

def same(a, b):
    return b.exists() and a.stat().st_size == b.stat().st_size and hashlib.sha256(a.read_bytes()).digest() == hashlib.sha256(b.read_bytes()).digest()

def copy(a, b):
    a, b = Path(a), Path(b)
    if not same(a, b):
        b.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(a, b)

for entry in ELECTRON.iterdir():
    if entry.name.lower() in SKIP:
        continue
    if entry.is_dir():
        for f in entry.rglob('*'):
            rel = f.relative_to(ELECTRON)
            if f.is_file() and 'userdata' not in [p.lower() for p in rel.parts] and f.name != 'default_app.asar':
                copy(f, OUT / rel)
    elif entry.name == 'electron.exe':
        copy(entry, OUT / 'HSR Warp Tracker.exe')
    else:
        copy(entry, OUT / entry.name)
stale = OUT / 'resources' / 'default_app.asar'
if stale.exists():
    stale.unlink()
app = OUT / 'resources' / 'app'
if app.exists():
    shutil.rmtree(app)
shutil.copytree(ROOT / 'app', app, ignore=shutil.ignore_patterns('*.log'))
version = json.loads((ROOT / 'app' / 'package.json').read_text(encoding='utf8'))['version']
(OUT / 'START.txt').write_text(f"""HSR Warp Tracker {version} — личный трекер круток Honkai: Star Rail

Запуск: HSR Warp Tracker.exe. Установка не нужна, папку можно переносить целиком (exe отдельно не переносить).

1. Открой в игре: Прыжки -> История прыжков, подожди, пока список загрузится.
2. В программе нажми «Обновить»: ссылка найдётся в кэше игры сама (файлы игры только читаются).
   Если не найдётся — вставь ссылку вручную (подсказка на экране).
3. Ссылка живёт около суток. Ключ из неё хранится только в памяти программы, пока она открыта.

Экраны: Главная (гарант по баннерам, последние 5★), История (фильтры, сортировка, раскрытие строк, график 5★),
Коллекция, Удача, Планировщик, Настройки (экспорт SRGF v1.0 / UIGF v4.2, импорт, скан Reliquary Archiver).

Данные: папка userdata рядом с exe — история (только дописывается), резервные копии перед каждой записью
(backups, последние 30), настройки, арт баннеров из кэша игры, app.log (ключ в нём маскируется).
Импорт истории из HSR Atelier: Настройки -> Импорт -> файл HSR Atelier\\userdata\\warps\\<UID>.json.

Модель: базовые шансы, гарант 90/80 и 50/50, 75/25 — официальные; мягкий гарант — оценка сообщества игроков.
""", encoding='utf8')
exe = OUT / 'HSR Warp Tracker.exe'
print(json.dumps({'exe': str(exe), 'sha256': hashlib.sha256(exe.read_bytes()).hexdigest(), 'version': version}, ensure_ascii=False))
