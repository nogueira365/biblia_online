"""Capturas de tela para auditoria de design (desktop e smartphone)."""
import subprocess, sys, time, os
from pathlib import Path
from playwright.sync_api import sync_playwright

# Uso: python tests/capturas.py [pasta_do_projeto] [pasta_de_saida]
ROOT = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[1])
OUT = sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).resolve().parent / "capturas-saida")
os.makedirs(OUT, exist_ok=True)
PORT = 8780
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)

SETUP = """() => {
  state.highlights = {'pv-28-1':'hl-yellow','pv-28-5':'hl-green'};
  state.notes = {'pv-28-1':'Confiar em Deus traz coragem.'};
  state.favorites = ['pv-28-13','jo-3-16'];
  state.readStatus = {verses:['pv-28-2','pv-28-3'], chapters:['pv-1','pv-2'], books:['gn']};
  state.readingPlans = {activePlanId:'gospels', progress:{'gospels-1':true,'gospels-2':true}};
  saveStateToLocalStorage();
}"""

def shoot(page, name):
    page.wait_for_timeout(600)
    page.screenshot(path=os.path.join(OUT, name + ".png"))

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for label, vp in [("pc", {"width": 1440, "height": 900}), ("mobile", {"width": 390, "height": 844})]:
            ctx = b.new_context(viewport=vp, device_scale_factor=1)
            pg = ctx.new_page()
            pg.goto(f"http://localhost:{PORT}/index.html"); pg.wait_for_selector(".verse-item")
            pg.evaluate(SETUP); pg.reload(); pg.wait_for_selector(".verse-item")
            shoot(pg, f"{label}-01-landing")
            pg.evaluate("document.getElementById('landing-page').style.display='none'")
            shoot(pg, f"{label}-02-leitor")
            pg.evaluate("document.getElementById('reader-pane').scrollTop = 600"); shoot(pg, f"{label}-03-leitor-rolado")
            pg.evaluate("document.getElementById('reader-pane').scrollTop = 0")
            pg.click(".verse-item[data-verse-number='3'] .verse-text"); shoot(pg, f"{label}-04-menu-versiculo")
            pg.evaluate("document.getElementById('verse-menu').style.display='none'")
            for drawer in ["search-drawer", "favorites-drawer", "reading-plan-drawer", "settings-drawer"]:
                pg.evaluate(f"openDrawer('{drawer}'); if('{drawer}'==='favorites-drawer') renderFavoritesAndNotes(); if('{drawer}'==='reading-plan-drawer') renderReadingPlan();")
                shoot(pg, f"{label}-05-{drawer}")
                pg.evaluate("closeAllDrawers()")
            pg.evaluate("document.getElementById('btn-auth').click()"); shoot(pg, f"{label}-06-login")
            pg.evaluate("document.getElementById('btn-close-auth-modal').click()")
            pg.evaluate("state.comparisonActive=true; loadActiveChapter()"); pg.wait_for_timeout(1500); shoot(pg, f"{label}-07-comparacao")
            pg.evaluate("state.comparisonActive=false; loadActiveChapter()")
            pg.evaluate("renderVerseOfTheDay()"); pg.wait_for_timeout(800); shoot(pg, f"{label}-08-versiculo-do-dia")
            if label == "mobile":
                pg.click("#btn-bottom-sidebar"); shoot(pg, f"{label}-09-sidebar-livros")
                pg.evaluate("document.querySelector('.sidebar-pane').classList.remove('open'); document.getElementById('overlay').classList.remove('active')")
                pg.evaluate("document.getElementById('btn-mobile-actions').click()"); shoot(pg, f"{label}-10-menu-acoes")
            for theme in ["claro", "sepia", "noturno"]:
                pg.evaluate(f"state.theme='{theme}'; applyPreferences()"); shoot(pg, f"{label}-11-tema-{theme}")
            ctx.close()
        b.close()
finally:
    srv.terminate()
print("ok", sorted(os.listdir(OUT)))
