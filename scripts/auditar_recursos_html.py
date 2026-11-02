#!/usr/bin/env python3
"""Audita referencias locales de recursos de las páginas HTML sin modificar archivos."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json, sys

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
ATTRS = {'script': 'src', 'link': 'href', 'img': 'src', 'source': 'src'}
class References(HTMLParser):
    def __init__(self):
        super().__init__(); self.refs=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag in ATTRS and a.get(ATTRS[tag]): self.refs.append((tag, a[ATTRS[tag]]))

def audit():
    errors=[]; examined=0; local=0; skipped=0
    for page in sorted(PUBLIC.glob('*.html')):
        examined+=1
        parser=References(); parser.feed(page.read_text(encoding='utf-8-sig'))
        for tag, raw in parser.refs:
            parsed=urlsplit(raw.strip())
            if parsed.scheme or parsed.netloc or raw.startswith(('data:', '#', '//')):
                skipped+=1; continue
            path=unquote(parsed.path)
            if not path: continue
            # Root-relative resources are relative to public/; others to the HTML file.
            dest=(PUBLIC / path.lstrip('/')) if path.startswith('/') else (page.parent / path)
            dest=dest.resolve(); local+=1
            if not dest.is_relative_to(PUBLIC.resolve()):
                errors.append(f'{page.name}: ruta fuera de public: {raw}')
            elif not dest.is_file():
                errors.append(f'{page.name}: recurso no encontrado: {raw}')
    return {'paginas':examined,'referencias_locales':local,'referencias_externas_o_embebidas':skipped,'errores':errors}

if __name__ == '__main__':
    result=audit();print(json.dumps(result,indent=2,ensure_ascii=False))
    sys.exit(1 if result['errores'] else 0)
