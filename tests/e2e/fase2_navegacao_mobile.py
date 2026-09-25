import subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
# Pasta do projeto: argumento opcional; padrão = raiz do repositório
ROOT = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[2])
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8785"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5); res = []
def check(n, c, d=""): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + (f" [{d}]" if d and not c else ""), flush=True)
def open_page(b, vp, touch):
    ctx = b.new_context(viewport=vp, has_touch=touch, is_mobile=touch); pg = ctx.new_page()
    pg.goto("http://localhost:8785/index.html"); pg.wait_for_selector(".verse-item")
    pg.evaluate("document.getElementById('landing-page').style.display='none'; state.currentBook='pv'; state.currentChapter=28; state.currentTranslation='nvi'; loadActiveChapter()")
    pg.wait_for_timeout(600); return ctx, pg
active = "document.querySelector('#mobile-tab-bar .tab-btn.active').dataset.tab"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx, pg = open_page(b, {"width": 390, "height": 844}, True)
        check("barra de abas visível; barra antiga e ☰ ocultos",
              pg.is_visible("#mobile-tab-bar") and not pg.is_visible(".bottom-nav-bar") and not pg.is_visible("#btn-mobile-actions"))
        # Seletor em dois passos
        pg.click(".tab-btn[data-tab='livros']"); pg.wait_for_timeout(350)
        check("aba Livros abre seletor em tela cheia (passo 1) e fica ativa",
              pg.evaluate("document.querySelector('.sidebar-pane').getBoundingClientRect().width") == 390 and pg.evaluate(active) == "livros")
        pg.locator(".book-item", has_text="Salmos").click(); pg.wait_for_timeout(300)
        check("tocar no livro mostra os capítulos (sem abrir o capítulo 1)",
              pg.evaluate("document.querySelector('.sidebar-pane').classList.contains('show-chapters')") and pg.evaluate("state.currentBook") == "pv"
              and pg.locator("#chapters-grid .chapter-btn").count() == 150)
        pg.click("#btn-picker-back"); pg.wait_for_timeout(200)
        check("'‹ Livros' volta para a lista", not pg.evaluate("document.querySelector('.sidebar-pane').classList.contains('show-chapters')"))
        pg.locator(".book-item", has_text="Salmos").click(); pg.wait_for_timeout(200)
        pg.locator("#chapters-grid .chapter-btn", has_text="23").first.click(); pg.wait_for_timeout(900)
        check("escolher capítulo abre Salmos 23 e fecha o seletor",
              pg.evaluate("state.currentBook + '-' + state.currentChapter") == "sl-23" and not pg.evaluate("document.querySelector('.sidebar-pane').classList.contains('open')") and pg.evaluate(active) == "ler")
        # ‹ › no título
        pg.click("#btn-title-next"); pg.wait_for_timeout(700)
        check("› no título vai para Salmos 24", pg.evaluate("state.currentChapter") == 24)
        pg.click("#btn-title-prev"); pg.wait_for_timeout(700)
        check("‹ no título volta para Salmos 23", pg.evaluate("state.currentChapter") == 23)
        pg.evaluate("state.currentBook='gn'; state.currentChapter=1; loadActiveChapter()"); pg.wait_for_timeout(700)
        check("‹ desabilitado em Gênesis 1", pg.evaluate("document.getElementById('btn-title-prev').disabled"))
        # Buscar / Notas / Mais
        pg.click(".tab-btn[data-tab='buscar']"); pg.wait_for_timeout(500)
        check("aba Buscar abre a busca com foco no campo",
              pg.evaluate("document.getElementById('search-drawer').classList.contains('open')") and pg.evaluate("document.activeElement.id") == "search-input" and pg.evaluate(active) == "buscar")
        tab_box = pg.locator("#mobile-tab-bar").bounding_box()
        drawer_bottom = pg.evaluate("document.getElementById('search-drawer').getBoundingClientRect().bottom")
        check("gaveta termina acima da barra de abas", drawer_bottom <= tab_box["y"] + 1, f"{drawer_bottom} vs {tab_box['y']}")
        pg.click(".tab-btn[data-tab='notas']"); pg.wait_for_timeout(400)
        check("aba Notas troca direto para Destaques e Notas",
              pg.evaluate("document.getElementById('favorites-drawer').classList.contains('open')") and not pg.evaluate("document.getElementById('search-drawer').classList.contains('open')"))
        pg.click(".tab-btn[data-tab='mais']"); pg.wait_for_timeout(400)
        check("aba Mais abre o painel sem Buscar/Notas repetidos",
              pg.evaluate("document.querySelector('.top-actions').classList.contains('open')") and not pg.is_visible(".top-actions #btn-search") and pg.is_visible(".top-actions #btn-settings"))
        pg.click(".top-actions #btn-settings"); pg.wait_for_timeout(400)
        check("escolher Configurações no Mais abre a gaveta e fecha o painel",
              pg.evaluate("document.getElementById('settings-drawer').classList.contains('open')") and not pg.evaluate("document.querySelector('.top-actions').classList.contains('open')")
              and pg.evaluate("document.getElementById('overlay').classList.contains('active')"))
        pg.click(".tab-btn[data-tab='ler']"); pg.wait_for_timeout(400)
        check("aba Ler fecha tudo", not pg.evaluate("!!document.querySelector('.drawer.open')") and pg.evaluate(active) == "ler")
        # Menu do versículo como painel
        pg.click(".verse-item[data-verse-number='1'] .verse-text"); pg.wait_for_timeout(300)
        mb = pg.locator("#verse-menu").bounding_box()
        check("menu do versículo abre como painel inferior com a referência",
              mb["width"] == 390 and abs(mb["y"] + mb["height"] - tab_box["y"]) < 2 and pg.inner_text(".verse-menu-title") == "Gênesis 1:1", str(mb))
        pg.click(".verse-menu .dot-yellow"); pg.wait_for_timeout(300)
        check("destacar pelo painel funciona", pg.evaluate("state.highlights['gn-1-1']") == "hl-yellow")
        ctx.close()
        # PC não muda
        ctx, pg = open_page(b, {"width": 1440, "height": 900}, False)
        check("PC: barra de abas oculta, barra Anterior/Próximo e ícones do topo visíveis",
              not pg.is_visible("#mobile-tab-bar") and pg.is_visible(".bottom-nav-bar") and pg.is_visible("#btn-search") and not pg.is_visible("#btn-title-prev"))
        pg.locator(".book-item", has_text="Salmos").click(); pg.wait_for_timeout(700)
        check("PC: clicar no livro continua abrindo o capítulo 1", pg.evaluate("state.currentBook + '-' + state.currentChapter") == "sl-1")
        pg.click(".verse-item[data-verse-number='2'] .verse-text"); pg.wait_for_timeout(300)
        check("PC: menu do versículo continua flutuante", pg.locator("#verse-menu").bounding_box()["width"] < 300)
        ctx.close(); b.close()
finally:
    srv.terminate()
print(f"\n{sum(res)}/{len(res)} passaram"); sys.exit(0 if all(res) else 1)
