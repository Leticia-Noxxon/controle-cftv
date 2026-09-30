"""Gera o close-up do logo OS (claro e escuro) a partir da página v2: python tests/logo_v2.py URL saida.png"""
import sys
from playwright.sync_api import sync_playwright
url, saida = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1920, 'height': 1080}, device_scale_factor=2)
    pg.goto(url, wait_until='networkidle'); pg.wait_for_selector('.lateral .logo-os')
    svg = pg.eval_on_selector('.lateral .logo-os', 'e => e.outerHTML')
    pg.set_content(f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>
      body {{ margin: 0; font-family: Inter, sans-serif; display: grid; grid-template-columns: 1fr 1fr; width: 1200px; height: 520px; }}
      .p {{ display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px; }}
      .claro {{ background: #f3f5f9; color: #0f172a; }} .escuro {{ background: #0b1220; color: #e6edf7; }}
      .big svg {{ width: 200px; height: 200px; }}
      .row {{ display: flex; align-items: center; gap: 14px; }} .row svg {{ width: 44px; height: 44px; }}
      .t b {{ display: block; font-size: 20px; font-weight: 700; letter-spacing: -.3px; line-height: 1.1; }} .t span {{ font-size: 14px; opacity: .7; }}
      .fav {{ display: flex; gap: 16px; align-items: end; }} .fav svg:nth-child(1) {{ width: 16px; height: 16px; }} .fav svg:nth-child(2) {{ width: 32px; height: 32px; }}
    </style></head><body>
      <div class="p claro"><div class="big">{svg}</div><div class="row">{svg}<div class="t"><b>OS</b><span>Controle CFTV</span></div></div><div class="fav">{svg}{svg}</div></div>
      <div class="p escuro"><div class="big">{svg}</div><div class="row">{svg}<div class="t"><b>OS</b><span>Controle CFTV</span></div></div><div class="fav">{svg}{svg}</div></div>
    </body></html>""", wait_until='networkidle')
    pg.wait_for_timeout(500)
    pg.screenshot(path=saida, clip={'x': 0, 'y': 0, 'width': 1200, 'height': 520})
