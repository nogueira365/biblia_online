import subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
# Pasta do projeto: argumento opcional; padrão = raiz do repositório
ROOT = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[2])
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8789"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5); res = []
def check(n, c, d=""): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + (f" [{d}]" if d and not c else ""), flush=True)
SETUP = "state.currentBook='pv'; state.currentChapter=28; state.currentTranslation='nvi'; state.comparisonActive=false; state.lineHeight='normal'; state.columnWidth='md'; state.notes={'pv-28-4':'n'}; state.readStatus={verses:['pv-28-2'],chapters:[],books:[]}; saveStateToLocalStorage()"
def open_page(b, vp, touch=False):
    ctx = b.new_context(viewport=vp, has_touch=touch, is_mobile=touch); pg = ctx.new_page()
    pg.goto("http://localhost:8789/index.html"); pg.wait_for_selector(".verse-item")
    pg.evaluate(SETUP); pg.reload(); pg.wait_for_selector(".verse-item")
    pg.evaluate("document.getElementById('landing-page').style.display='none'"); pg.wait_for_timeout(500); return ctx, pg
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx, pg = open_page(b, {"width": 1440, "height": 900})
        cb = ".verse-item[data-verse-number='5'] .verse-read-checkbox"
        check("PC: caixinha de lido invisível até passar o mouse", pg.evaluate(f"getComputedStyle(document.querySelector(\"{cb}\")).opacity") == "0")
        pg.hover(".verse-item[data-verse-number='5'] .verse-text"); pg.wait_for_timeout(300)
        check("PC: caixinha aparece na margem ao passar o mouse",
              pg.evaluate(f"getComputedStyle(document.querySelector(\"{cb}\")).opacity") == "1"
              and pg.evaluate(f"document.querySelector(\"{cb}\").getBoundingClientRect().right <= document.querySelector('.verse-item[data-verse-number=\"5\"]').getBoundingClientRect().left"))
        pg.click(cb); pg.wait_for_timeout(300)
        check("PC: clicar na caixinha marca o versículo como lido", pg.evaluate("isVerseRead('pv-28-5')"))
        check("versículo lido mostra ✓ junto ao número", pg.evaluate("getComputedStyle(document.querySelector('.verse-item[data-verse-number=\"2\"] .verse-number'), '::after').content") == '"✓"')
        share_ok = pg.evaluate("""(() => { const v = document.querySelector('.verse-item[data-verse-number="6"]');
            const t = v.querySelector('.verse-text').getBoundingClientRect(); const s = v.querySelector('.btn-share-verse-inline').getBoundingClientRect();
            return s.left >= t.right - 1; })()""")
        check("PC: ícone de compartilhar não sobrepõe o texto", share_ok)
        pg.click("#btn-settings"); pg.wait_for_timeout(800)
        check("prévia mostra Salmos 23 na tradução atual", "(NVI)" in pg.inner_text("#settings-preview-ref") and "SENHOR" in pg.inner_text(".settings-preview-text"))
        pg.click(".lh-btn[data-lh='relaxed']"); pg.click(".width-btn[data-width='lg']")
        lh = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.verses-container')).lineHeight) / parseFloat(getComputedStyle(document.querySelector('.verses-container')).fontSize)")
        width = pg.evaluate("getComputedStyle(document.querySelector('.reader-container')).maxWidth")
        prev_lh = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.settings-preview-text')).lineHeight) / parseFloat(getComputedStyle(document.querySelector('.settings-preview-text')).fontSize)")
        check("espaçamento 'Amplo' e largura 'Larga' aplicados no leitor e na prévia", abs(lh - 2.15) < 0.02 and width == "880px" and abs(prev_lh - 2.15) < 0.02, f"lh={lh} w={width} prev={prev_lh}")
        pg.reload(); pg.wait_for_selector(".verse-item")
        check("preferências de espaçamento/largura lembradas após recarregar",
              pg.evaluate("state.lineHeight + '/' + state.columnWidth") == "relaxed/lg" and pg.evaluate("document.getElementById('reader-pane').classList.contains('col-lg')"))
        ctx.close()
        ctx, pg = open_page(b, {"width": 390, "height": 844}, True)
        check("celular: sem caixinhas por versículo", not pg.is_visible(".verse-read-checkbox"))
        check("celular: sem ícone de compartilhar invisível sobre o texto", not pg.is_visible(".btn-share-verse-inline") and pg.evaluate("getComputedStyle(document.querySelector('.btn-share-verse-inline')).display") == "none")
        pg.click(".verse-item[data-verse-number='7'] .verse-text"); pg.click("#menu-btn-read"); pg.wait_for_timeout(300)
        check("celular: marcar como lido pelo menu do versículo", pg.evaluate("isVerseRead('pv-28-7')"))
        pg.click(".tab-btn[data-tab='mais']"); pg.click(".top-actions #btn-settings"); pg.wait_for_timeout(500)
        check("celular: opção de largura oculta (sem efeito em tela estreita)", not pg.is_visible(".settings-group-wide-only") and pg.is_visible(".lh-btn[data-lh='compact']"))
        ctx.close(); b.close()
finally:
    srv.terminate()
print(f"\n{sum(res)}/{len(res)} passaram"); sys.exit(0 if all(res) else 1)
