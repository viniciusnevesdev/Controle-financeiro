from pathlib import Path
from PIL import Image

ROOT = Path('_site')
BRAND = Path('source/public/brand-icons')

SOURCES = {
    False: BRAND / 'icon-finance-20260911.jpg',
    True: BRAND / 'icon-beta-20260911.jpg',
}


def write(target: Path, beta: bool):
    source = SOURCES[beta]
    if not source.is_file():
        raise SystemExit(f'Ícone aprovado ausente: {source}')

    target.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as img:
        img = img.convert('RGB').resize((512, 512), Image.Resampling.LANCZOS)
        img.save(target / 'apple-touch-icon.png', format='PNG', optimize=True)


if not ROOT.exists():
    raise SystemExit('_site ainda não foi gerado')

write(ROOT, beta=False)
write(ROOT / 'beta', beta=True)
print('[OK] Ícones aprovados aplicados como fonte dos PWAs Oficial e Beta.')
