from __future__ import annotations

import json
import re
import sys
from pathlib import Path

START = "// ICON_OVERRIDES_GENERATED_START"
END = "// ICON_OVERRIDES_GENERATED_END"


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Uso: python3 apply_icon_overrides.py <Icon.tsx> <icon-overrides.json>")

    icon_path = Path(sys.argv[1])
    config_path = Path(sys.argv[2])

    text = icon_path.read_text(encoding="utf-8")
    data = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else {"icons": {}}
    icons = data.get("icons", {}) or {}

    if not isinstance(icons, dict):
        raise SystemExit("icon-overrides.json inválido: 'icons' precisa ser um objeto")

    # Remove bloco gerado anteriormente para manter o processo idempotente.
    text = re.sub(
        rf"\n?\s*{re.escape(START)}.*?{re.escape(END)}\n?",
        "\n",
        text,
        flags=re.S,
    )

    # Mantém apenas SVGs completos e simples. O arquivo é versionado no repositório,
    # então qualquer alteração continua auditável no GitHub.
    clean: dict[str, str] = {}
    for name, svg in icons.items():
        if not isinstance(name, str) or not isinstance(svg, str):
            continue
        stripped = svg.strip()
        if not stripped:
            continue
        if not stripped.lower().startswith("<svg") or "</svg>" not in stripped.lower():
            raise SystemExit(f"SVG inválido para o ícone '{name}'")
        if re.search(r"<\s*(script|iframe|object|embed)\b", stripped, flags=re.I):
            raise SystemExit(f"SVG não permitido para o ícone '{name}'")
        clean[name] = stripped

    payload = json.dumps(clean, ensure_ascii=False, separators=(",", ":"))
    block = f'''\n  {START}\n  const __iconOverrides: Record<string, string> = {payload};\n  const __customSvg = __iconOverrides[name];\n  if (__customSvg) {{\n    const __sizedSvg = __customSvg.replace(/<svg\\b([^>]*)>/i, (_m, attrs) => {{\n      const cleaned = String(attrs)\n        .replace(/\\swidth=(?:\"[^\"]*\"|'[^']*'|[^\\s>]+)/ig, \"\")\n        .replace(/\\sheight=(?:\"[^\"]*\"|'[^']*'|[^\\s>]+)/ig, \"\");\n      return `<svg${{cleaned}} width=\"${{size}}\" height=\"${{size}}\" aria-hidden=\"true\">`;\n    }});\n    return <span className=\"custom-svg-icon\" aria-hidden=\"true\" style={{{{ width: size, height: size, display: \"inline-flex\", lineHeight: 0 }}}} dangerouslySetInnerHTML={{{{ __html: __sizedSvg }}}} />;\n  }}\n  {END}\n'''

    marker = "export function Icon({ name, size = 22, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {"
    if marker not in text:
        raise SystemExit("Não encontrei a função Icon em Icon.tsx")

    text = text.replace(marker, marker + block, 1)
    icon_path.write_text(text, encoding="utf-8")
    print(f"[OK] {len(clean)} substituição(ões) de ícone aplicada(s) em {icon_path}")


if __name__ == "__main__":
    main()
