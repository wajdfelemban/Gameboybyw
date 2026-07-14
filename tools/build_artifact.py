#!/usr/bin/env python3
"""Build an Artifact-ready fragment (no <!doctype>/<html>/<head>/<body>).
Inlines CSS (with the font as a data URI) and the JS, drops the service-worker
registration and PWA <head> tags (not applicable on the artifact host)."""
import base64, re
from pathlib import Path
root = Path(__file__).resolve().parent.parent
css = (root/'css/style.css').read_text(encoding='utf-8')
font = base64.b64encode((root/'assets/fonts/pressstart2p-latin.woff2').read_bytes()).decode()
css = css.replace('url("../assets/fonts/pressstart2p-latin.woff2") format("woff2")',
                  f'url("data:font/woff2;base64,{font}") format("woff2")')
data_js = (root/'js/data.js').read_text(encoding='utf-8')
app_js  = (root/'js/app.js').read_text(encoding='utf-8')
html = (root/'index.html').read_text(encoding='utf-8')
# body inner = between <body> and </body>
body = html[html.index('<body>')+len('<body>'):html.index('</body>')]
# strip the external script tags and the SW-registration inline script
body = body.replace('<script src="js/data.js"></script>', '')
body = body.replace('<script src="js/app.js"></script>', '')
body = body.replace('<script type="module" src="js/firebase-sync.js"></script>', '')  # artifact CSP blocks CDNs
body = re.sub(r'<script>\s*/\* Register the service worker.*?</script>', '', body, flags=re.S)
fragment = (
    '<title>SMLE Smart Study</title>\n'
    f'<style>\n{css}\n</style>\n'
    f'{body}\n'
    f'<script>\n{data_js}\n</script>\n'
    f'<script>\n{app_js}\n</script>\n'
)
out = root/'artifact.html'
out.write_text(fragment, encoding='utf-8')
print(f'wrote {out} ({out.stat().st_size/1024:.0f} KB)')
assert '<!DOCTYPE' not in fragment and '<body>' not in fragment and 'serviceWorker' not in fragment
print('fragment ok: no doctype/body/SW')
