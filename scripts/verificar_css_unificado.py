#!/usr/bin/env python3
"""Audita enlaces CSS locales en HTML y confirma la hoja única del proyecto."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import sys

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
CSS = PUBLIC / "css" / "styles.css"

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.styles = []
    def handle_starttag(self, tag, attrs):
        if tag.lower() != "link":
            return
        a = dict(attrs)
        if "stylesheet" in a.get("rel", "").lower().split():
            self.styles.append(a.get("href", ""))

def main():
    errors = []
    pages = sorted(PUBLIC.rglob("*.html"))
    if not CSS.is_file() or not CSS.stat().st_size:
        errors.append("Falta public/css/styles.css o está vacío")
    other_css = [p for p in (PUBLIC / "css").rglob("*.css") if p.resolve() != CSS.resolve()]
    if other_css:
        errors.append("Existen CSS adicionales: " + ", ".join(str(p.relative_to(PUBLIC)) for p in other_css))
    for page in pages:
        parser = Links()
        parser.feed(page.read_text(encoding="utf-8"))
        if len(parser.styles) != 1:
            errors.append(f"{page.relative_to(PUBLIC)}: {len(parser.styles)} hojas CSS (se esperaba 1)")
        for href in parser.styles:
            uri = urlsplit(href)
            if uri.scheme or uri.netloc:
                errors.append(f"{page.name}: referencia CSS externa: {href}")
                continue
            dest = (PUBLIC / unquote(uri.path).lstrip("/")) if uri.path.startswith("/") else (page.parent / unquote(uri.path))
            if not dest.is_file():
                errors.append(f"{page.name}: archivo CSS no encontrado: {href}")
            elif dest.resolve() != CSS.resolve():
                errors.append(f"{page.name}: CSS no unificado: {href}")
    print(f"Páginas HTML verificadas: {len(pages)}")
    print(f"CSS principal: {CSS.relative_to(ROOT)}")
    print(f"Errores: {len(errors)}")
    for err in errors:
        print("ERROR:", err)
    return 1 if errors else 0

if __name__ == "__main__":
    sys.exit(main())
