import subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
# Pasta do projeto: argumento opcional; padrão = raiz do repositório
ROOT = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[2])
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8787"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5); res = []
def check(n, c, d=""): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + (f" [{d}]" if d and not c else ""), flush=True)
def open_page(ctx):
    pg = ctx.new_page(); pg.goto("http://localhost:8787/index.html"); pg.wait_for_selector(".verse-item")
    pg.evaluate("document.getElementById('landing-page').style.display='none'"); pg.wait_for_timeout(500); return pg
sidebar_visible = "getComputedStyle(document.querySelector('.sidebar-pane')).display !== 'none'"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # ---------- PC ----------
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        pg = open_page(ctx)
        pg.evaluate("localStorage.removeItem('sidebar_collapsed'); state.comparisonActive=false; state.highlights={'pv-28-1':'hl-yellow'}; state.currentBook='pv'; state.currentChapter=28; saveStateToLocalStorage()")
        pg.reload(); pg.wait_for_selector(".verse-item"); pg.evaluate("document.getElementById('landing-page').style.display='none'")
        check("PC: barra lateral aberta por padrão", pg.evaluate(sidebar_visible))
        check("PC: seletor mostra 'Provérbios 28'", pg.inner_text("#btn-location").replace("\n", " ").split() == ["Provérbios", "28"])
        pg.click("#btn-location"); pg.wait_for_timeout(200)
        check("PC: seletor recolhe a barra lateral", not pg.evaluate(sidebar_visible) and pg.get_attribute("#btn-location", "aria-expanded") == "false")
        pg.reload(); pg.wait_for_selector(".verse-item"); pg.evaluate("document.getElementById('landing-page').style.display='none'")
        check("PC: preferência 'recolhida' lembrada após recarregar", not pg.evaluate(sidebar_visible))
        pg.click("#btn-location"); pg.wait_for_timeout(200)
        check("PC: seletor reabre a barra lateral", pg.evaluate(sidebar_visible))
        pg.click("#btn-sidebar-collapse"); pg.wait_for_timeout(200)
        check("PC: botão › da barra lateral a recolhe", not pg.evaluate(sidebar_visible))
        pg.click("#btn-location")
        # Tooltip
        pg.hover("#btn-reading-plan"); pg.wait_for_timeout(300)
        tip = pg.evaluate("(() => { const s = getComputedStyle(document.getElementById('btn-reading-plan'), '::after'); return [s.content, s.opacity]; })()")
        check("PC: tooltip mostra 'Plano de leitura' ao passar o mouse", tip[0] == '"Plano de leitura"' and float(tip[1]) > 0.9, str(tip))
        check("PC (≥1280): rótulos 'Buscar' e 'Notas' visíveis", pg.is_visible("#btn-search .desktop-label") and pg.is_visible("#btn-favorites .desktop-label"))
        # Comparação
        pg.mouse.move(700, 500)
        pg.click("#btn-compare"); pg.wait_for_timeout(1500)
        check("comparação: esconde a barra lateral", not pg.evaluate(sidebar_visible))
        check("comparação: cabeçalho fica na área fixa do título", pg.evaluate("!!document.querySelector('.reader-header-sticky .comparison-header')"))
        check("comparação: destaque só na coluna principal",
              pg.evaluate("document.querySelector('.primary-col[data-verse-key=\"pv-28-1\"]').classList.contains('hl-yellow') && !document.querySelector('.secondary-col[data-verse-key=\"pv-28-1\"]').classList.contains('hl-yellow')"))
        pg.click("#comparison-translation-select + .cs-wrapper .cs-trigger"); pg.wait_for_timeout(200)
        pg.locator("#comparison-translation-select + .cs-wrapper .cs-option[data-value='ara']").click(); pg.wait_for_timeout(1500)
        check("comparação: dropdown customizado troca para ARA", pg.evaluate("state.comparisonTranslation") == "ara"
              and pg.inner_text("#comparison-translation-select + .cs-wrapper .cs-trigger").strip().startswith("ARA"))
        pg.click("#btn-compare"); pg.wait_for_timeout(800)
        check("sair da comparação restaura a barra lateral", pg.evaluate(sidebar_visible))
        ctx.close()
        # ---------- Tablet ----------
        ctx = b.new_context(viewport={"width": 820, "height": 1180}, has_touch=True, is_mobile=True)
        pg = open_page(ctx)
        pg.evaluate("localStorage.removeItem('sidebar_collapsed')"); pg.reload(); pg.wait_for_selector(".verse-item")
        check("tablet: barra lateral recolhida por padrão", not pg.evaluate(sidebar_visible))
        pg.evaluate("document.getElementById('landing-page').style.display='none'")
        pg.click("#btn-location"); pg.wait_for_timeout(200)
        check("tablet: seletor abre a barra lateral", pg.evaluate(sidebar_visible))
        ctx.close()
        # ---------- Celular ----------
        ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        pg = open_page(ctx)
        pg.evaluate("localStorage.setItem('sidebar_collapsed','1')"); pg.reload(); pg.wait_for_selector(".verse-item")
        pg.evaluate("document.getElementById('landing-page').style.display='none'")
        check("celular: seletor do topo oculto (usa a aba Livros)", not pg.is_visible("#btn-location"))
        pg.click(".tab-btn[data-tab='livros']"); pg.wait_for_timeout(300)
        check("celular: preferência 'recolhida' do PC não bloqueia a aba Livros", pg.evaluate("document.querySelector('.sidebar-pane').getBoundingClientRect().left") == 0)
        pg.click(".tab-btn[data-tab='ler']")
        pg.evaluate("state.comparisonActive=true; loadActiveChapter()"); pg.wait_for_timeout(1500)
        chips = pg.evaluate("(() => [...document.querySelectorAll('.comparison-row')][0] && [...document.querySelectorAll('.comparison-row')][0].querySelectorAll('.verse-item').length && [...document.querySelectorAll('.comparison-row .verse-item')].slice(0,2).map(el => getComputedStyle(el, '::before').content))()")
        check("celular: blocos da comparação identificam a tradução", chips == ['"NVI"', '"ACF"'] or (len(chips) == 2 and all(c.strip('"').isupper() for c in chips)), str(chips))
        ctx.close(); b.close()
finally:
    srv.terminate()
print(f"\n{sum(res)}/{len(res)} passaram"); sys.exit(0 if all(res) else 1)
