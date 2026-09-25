import subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
# Pasta do projeto: argumento opcional; padrão = raiz do repositório
ROOT = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[2])
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8783"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5); res = []
def check(n, c, d=""): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + (f" [{d}]" if d and not c else ""), flush=True)
def open_page(b, vp, touch):
    ctx = b.new_context(viewport=vp, has_touch=touch, is_mobile=touch); pg = ctx.new_page()
    pg.goto("http://localhost:8783/index.html"); pg.wait_for_selector(".verse-item")
    pg.evaluate("document.getElementById('landing-page').style.display='none'; state.currentTranslation='nvi'; state.currentBook='pv'; state.currentChapter=28; loadActiveChapter()")
    pg.wait_for_timeout(600); return ctx, pg
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # Celular: troca de tradução pelo chip
        ctx, pg = open_page(b, {"width": 390, "height": 844}, True)
        chip = pg.locator("#translation-select + .cs-wrapper .cs-trigger")
        check("celular: chip de tradução visível e compacto ('NVI')", chip.is_visible() and chip.inner_text().strip() == "NVI", chip.inner_text())
        chip.click(); pg.wait_for_timeout(400)
        panel_box = pg.locator("#translation-select + .cs-wrapper .cs-panel").bounding_box()
        check("celular: lista de traduções abre como painel inferior (acima da barra de abas)", panel_box and abs(panel_box["y"] + panel_box["height"] - pg.locator("#mobile-tab-bar").bounding_box()["y"]) < 2, str(panel_box))
        pg.locator("#translation-select + .cs-wrapper .cs-option[data-value='ara']").click(); pg.wait_for_timeout(1500)
        check("celular: escolher ARA troca a tradução", pg.evaluate("state.currentTranslation") == "ara" and chip.inner_text().strip() == "ARA")
        sticky_h = pg.evaluate("document.querySelector('.reader-header-sticky').offsetHeight")
        check("celular: área fixa do topo ≤ 70px (antes ~265px)", sticky_h <= 70, str(sticky_h))
        fam = pg.evaluate("getComputedStyle(document.getElementById('btn-end-next')).fontFamily")
        check("botões usam a fonte da marca (Outfit)", "Outfit" in fam, fam)
        pg.locator("#btn-end-next").click(); pg.wait_for_timeout(800)
        check("cartão de fim: 'Próximo' abre Provérbios 29", pg.evaluate("state.currentChapter") == 29)
        pg.evaluate("state.currentChapter=22; state.currentBook='ap'; loadActiveChapter()"); pg.wait_for_timeout(800)
        check("cartão de fim: 'Próximo' some no último capítulo da Bíblia", pg.evaluate("document.getElementById('btn-end-next').hidden"))
        ctx.close()
        # Celular deitado: layout de celular
        ctx, pg = open_page(b, {"width": 844, "height": 390}, True)
        sidebar_x = pg.evaluate("document.querySelector('.sidebar-pane').getBoundingClientRect().left")
        check("celular deitado: barra lateral vira gaveta (layout de celular)", sidebar_x < 0, str(sidebar_x))
        ctx.close()
        # PC mouse de altura baixa NÃO deve virar layout de celular
        ctx, pg = open_page(b, {"width": 1280, "height": 480}, False)
        check("PC com janela baixa mantém layout de PC", pg.evaluate("document.querySelector('.sidebar-pane').getBoundingClientRect().left") > 0)
        ctx.close()
        # Tablet
        ctx, pg = open_page(b, {"width": 820, "height": 1180}, True)
        logo_h = pg.evaluate("(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.logo-text')); return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; })()")
        check("tablet: nome do logo em uma linha", logo_h == 1, str(logo_h))
        ctx.close(); b.close()
finally:
    srv.terminate()
print(f"\n{sum(res)}/{len(res)} passaram"); sys.exit(0 if all(res) else 1)
