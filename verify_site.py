from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import sys

from PIL import Image, ImageChops


ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "_site").resolve()
BRAND = Path("source/public/brand-icons")

CANONICAL_PWA_ICONS = {
    ROOT: BRAND / "icon-finance-20260911.jpg",
    ROOT / "beta": BRAND / "icon-beta-20260911.jpg",
}


REQUIRED_FILES = [
    "index.html",
    "central.html",
    "menu.html",
    "menu/index.html",
    "diagnostico/index.html",
    "launch.html",
    "recover.html",
    "safe.html",
    "environment.json",
    "ambientes.json",
    "apple-touch-icon.png",
    "icons/apple-touch-icon.png",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/menu.svg",
    "icons/diagnostic.svg",
    "icons/launch.svg",
    "icons/recover.svg",
    "icons/safe.svg",
    "beta/index.html",
    "beta/launch.html",
    "beta/recover.html",
    "beta/safe.html",
    "beta/beta-tools.js",
    "beta/environment.json",
    "beta/apple-touch-icon.png",
    "beta/icons/apple-touch-icon.png",
    "beta/icons/icon-192.png",
    "beta/icons/icon-512.png",
]


class References(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.paths: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        attribute = "href" if tag in {"a", "link"} else "src" if tag in {"img", "script"} else None
        if attribute and values.get(attribute):
            self.paths.append(values[attribute] or "")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def check_required_files() -> None:
    for relative in REQUIRED_FILES:
        path = ROOT / relative
        require(path.is_file() and path.stat().st_size > 0, f"Arquivo ausente ou vazio: {relative}")


def check_references() -> None:
    for page in ROOT.rglob("*.html"):
        parser = References()
        parser.feed(page.read_text(encoding="utf-8"))
        for reference in parser.paths:
            if reference.startswith(("http:", "https:", "mailto:", "data:", "#")):
                continue
            clean = urlsplit(reference).path
            if not clean:
                continue
            target = (page.parent / clean).resolve()
            require(target == ROOT or ROOT in target.parents, f"Referência sai do site em {page.relative_to(ROOT)}: {reference}")
            if clean.endswith("/") or target.is_dir():
                target /= "index.html"
            require(target.is_file(), f"Link quebrado em {page.relative_to(ROOT)}: {reference}")


def check_manifests_and_icons() -> None:
    for base in (ROOT, ROOT / "beta"):
        manifest = json.loads((base / "manifest.webmanifest").read_text(encoding="utf-8"))
        name = "." if base == ROOT else str(base.relative_to(ROOT))
        require(manifest.get("start_url") == "./", f"start_url inválida em {name}")
        require(manifest.get("scope") == "./", f"scope inválido em {name}")
        sizes = {item.get("sizes") for item in manifest.get("icons", [])}
        require({"192x192", "512x512"} <= sizes, f"Ícones incompletos no manifesto {name}")
        expected = {
            "apple-touch-icon.png": (512, 512),
            "icons/apple-touch-icon.png": (180, 180),
            "icons/icon-192.png": (192, 192),
            "icons/icon-512.png": (512, 512),
        }
        for relative, dimensions in expected.items():
            require(Image.open(base / relative).size == dimensions, f"Dimensão incorreta: {(base / relative).relative_to(ROOT)}")

        source = CANONICAL_PWA_ICONS[base]
        require(source.is_file(), f"Fonte canônica ausente: {source}")
        with Image.open(source) as image:
            expected_pixels = image.convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
        with Image.open(base / "apple-touch-icon.png") as image:
            actual_pixels = image.convert("RGB")
        require(
            ImageChops.difference(expected_pixels, actual_pixels).getbbox() is None,
            f"Ícone publicado não corresponde à fonte canônica: {(base / 'apple-touch-icon.png').relative_to(ROOT)}",
        )
    require(
        (ROOT / "apple-touch-icon.png").read_bytes() != (ROOT / "beta/apple-touch-icon.png").read_bytes(),
        "Os ícones Oficial e Beta não podem ser idênticos.",
    )


def check_environments() -> None:
    official_index = read("index.html")
    beta_index = read("beta/index.html")
    require('name="app-environment" content="official"' in official_index, "Marcador Oficial ausente")
    require('name="app-environment" content="beta"' in beta_index, "Marcador Beta ausente")
    require('rel="icon" href="./apple-touch-icon.png"' in official_index, "Favicon Oficial não usa o ícone canônico")
    require('rel="apple-touch-icon" href="./icons/apple-touch-icon.png"' in official_index, "Atalho iOS Oficial não usa a variação gerada")
    require('rel="icon" href="./apple-touch-icon.png"' in beta_index, "Favicon Beta não usa o ícone canônico")
    require('rel="apple-touch-icon" href="./icons/apple-touch-icon.png"' in beta_index, "Atalho iOS Beta não usa a variação gerada")

    official_assets = "\n".join(path.read_text(encoding="utf-8") for path in (ROOT / "assets").glob("*.js"))
    beta_assets = "\n".join(path.read_text(encoding="utf-8") for path in (ROOT / "beta/assets").glob("*.js"))
    require("meu-dinheiro-inteligente" in official_assets, "Banco Oficial ausente do bundle")
    require("meu-dinheiro-inteligente-beta" in beta_assets, "Banco Beta ausente do bundle")
    require('"meu-dinheiro-inteligente-state"' not in beta_assets, "Beta referencia o fallback do Oficial")

    menu = read("menu.html")
    require("finance-tools-page" in menu and "Central de Diagnóstico" in menu, "Menu geral incompleto")
    require("<script" not in menu, "Menu geral não deve depender do aplicativo ou de JavaScript")
    require("repeat(2,minmax(0,1fr))" in menu, "Grade principal do menu foi alterada")
    require('./apple-touch-icon.png' in menu, "Menu não usa o ícone PWA Oficial")
    require('./beta/apple-touch-icon.png' in menu, "Menu não usa o ícone PWA Beta")
    require('icon-finance-20260911.jpg' not in menu, "Menu ainda aponta para uma cópia paralela do ícone Oficial")
    require('icon-beta-20260911.jpg' not in menu, "Menu ainda aponta para uma cópia paralela do ícone Beta")

    recovery = read("recover.html") + read("beta/recover.html")
    require("localStorage.clear" not in recovery, "Recuperação pode apagar todo o armazenamento local")
    require("indexedDB.deleteDatabase" not in recovery, "Recuperação pode apagar o banco financeiro")

    generated_text = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in ROOT.rglob("*")
        if path.is_file() and path.suffix.lower() in {".html", ".js", ".json", ".webmanifest", ".css", ".svg"}
    )
    require("8w2jh948cw-sudo" not in generated_text, "O site ainda contém o usuário antigo do GitHub")


check_required_files()
check_references()
check_manifests_and_icons()
check_environments()
print("[OK] Oficial, Beta, menu, ferramentas, dados isolados, links e ícones validados.")
