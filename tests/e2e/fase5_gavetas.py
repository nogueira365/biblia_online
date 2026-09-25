"""Testes da Fase 5: notas, busca, plano e landing."""
import subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

# Pasta do projeto: argumento opcional; padrão = raiz do repositório
ROOT = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[2])
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8791"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
res = []

def check(n, c, d=""):
    res.append(bool(c))
    print(("PASS " if c else "FAIL ") + n + (f" [{d}]" if d and not c else ""), flush=True)

SETUP = """state.currentBook='pv'; state.currentChapter=28; state.currentTranslation='nvi'; state.comparisonActive=false;
state.highlights={'pv-28-1':'hl-yellow','jo-3-16':'hl-green'}; state.notes={'pv-28-1':'Coragem vem de Deus.'}; state.favorites=['sl-23-1','jo-3-16'];
state.readStatus={verses:[],chapters:['gn-1','gn-2'],books:[]}; state.readingPlans={activePlanId:'biblia-em-1-ano', progress:{}};
localStorage.removeItem('recent_searches'); localStorage.removeItem('landing_seen'); saveStateToLocalStorage()"""

HIDE = "document.getElementById('landing-page').style.display='none'"
VISIBLE_CARDS = r"[...document.querySelectorAll('#annotations-container .annotation-verse-ref')].map(e => e.textContent.replace(/[^\p{L}\p{N}: ]/gu, '').trim())"

def open_page(ctx, hide=True):
    pg = ctx.new_page()
    pg.goto("http://localhost:8791/index.html"); pg.wait_for_selector(".verse-item")
    if hide: pg.evaluate(HIDE)
    pg.wait_for_timeout(500)
    return pg

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        pg = open_page(ctx); pg.evaluate(SETUP); pg.reload(); pg.wait_for_selector(".verse-item"); pg.evaluate(HIDE)

        # ---------- Notas ----------
        pg.click("#btn-favorites"); pg.wait_for_timeout(600)
        chips = [c.strip() for c in pg.eval_on_selector_all("#notes-filter-chips .filter-chip", r"els => els.map(e => e.textContent.replace(/\s+/g, ' '))")]
        check("notas: chips com contagem", chips == ["Todos (3)", "Notas (1)", "Favoritos (2)", "Destaques (2)"], str(chips))
        pg.click("#notes-filter-chips .filter-chip[data-filter='notes']"); pg.wait_for_timeout(500)
        check("notas: filtro 'Notas' mostra só o versículo com nota", pg.evaluate(VISIBLE_CARDS) == ["Provérbios 28:1"], str(pg.evaluate(VISIBLE_CARDS)))
        pg.click("#notes-filter-chips .filter-chip[data-filter='favorites']"); pg.wait_for_timeout(500)
        check("notas: filtro 'Favoritos'", pg.evaluate(VISIBLE_CARDS) == ["Salmos 23:1", "João 3:16"], str(pg.evaluate(VISIBLE_CARDS)))
        pg.fill("#search-notes-input", "xyz"); pg.wait_for_timeout(500)
        check("notas: texto + tipo sem resultado mostra mensagem", "Nenhum resultado" in pg.inner_text("#annotations-container"))
        pg.evaluate("closeAllDrawers()")

        # ---------- Busca ----------
        pg.click("#btn-search"); pg.wait_for_timeout(500)
        check("busca: foco automático e chip 'Só Provérbios'",
              pg.evaluate("document.activeElement.id") == "search-input" and pg.inner_text("#search-scope-book") == "Só Provérbios")
        pg.fill("#search-input", "amor"); pg.click("#search-form button[type=submit]"); pg.wait_for_timeout(1500)
        total = int(pg.inner_text(".search-count strong"))
        pg.click("#search-scope-chips .filter-chip[data-scope='NT']"); pg.wait_for_timeout(1500)
        nt_books = pg.evaluate(r"[...document.querySelectorAll('.result-ref')].map(e => e.textContent.replace(/ \d+:\d+$/, ''))")
        nt_names = pg.evaluate("BIBLE_BOOKS.filter(b => b.testament === 'NT').map(b => b.name)")
        nt_total = int(pg.inner_text(".search-count strong"))
        check("busca: escopo 'Novo Test.' só traz livros do NT", nt_total < total and all(n in nt_names for n in nt_books), f"{nt_total}/{total}")
        pg.click("#search-scope-chips .filter-chip[data-scope='book']"); pg.wait_for_timeout(1500)
        refs = pg.evaluate("[...document.querySelectorAll('.result-ref')].map(e => e.textContent)")
        check("busca: escopo 'Só Provérbios'", len(refs) > 0 and all(r.startswith("Provérbios") for r in refs), str(refs[:3]))
        pg.evaluate("closeAllDrawers()")
        check("busca: termo salvo nas buscas recentes", pg.evaluate("document.querySelector('.recent-chip[data-query=\"amor\"]') !== null"))
        pg.click("#btn-search"); pg.wait_for_timeout(400)
        pg.click(".recent-chip[data-query='amor']"); pg.wait_for_timeout(1500)
        check("busca: tocar numa busca recente repete a busca", pg.input_value("#search-input") == "amor" and pg.locator(".search-result-item").count() > 0)
        pg.evaluate("closeAllDrawers()")

        # ---------- Plano ----------
        pg.click("#btn-reading-plan"); pg.wait_for_timeout(500)
        check("plano: dropdown mostra o plano ativo", "Bíblia Completa em 1 Ano" in pg.inner_text("#plan-select + .cs-wrapper .cs-trigger"))
        check("plano: 'Continuar: Dia 1 · Gênesis 1-4'", pg.inner_text("#btn-plan-continue-text") == "Continuar: Dia 1 · Gênesis 1-4")
        read_flags = pg.evaluate("[...document.querySelectorAll('.reading-day-card')[0].querySelectorAll('.plan-chapter-chip')].map(e => e.classList.contains('is-read'))")
        check("plano: dia 1 lista os 4 capítulos (1 e 2 já lidos)", read_flags == [True, True, False, False], str(read_flags))
        pg.click("#btn-plan-continue"); pg.wait_for_timeout(800)
        check("plano: 'Continuar' abre o primeiro capítulo não lido (Gênesis 3)", pg.evaluate("state.currentBook + '-' + state.currentChapter") == "gn-3")
        pg.evaluate("document.getElementById('reader-pane').style.scrollBehavior='auto'")
        pg.click("#btn-mark-book-read"); pg.wait_for_timeout(300)
        check("plano: dia continua aberto enquanto Gênesis 4 não foi lido", not pg.evaluate("state.readingPlans.progress['biblia-em-1-ano-1']"))
        pg.evaluate("state.currentChapter=4; loadActiveChapter()"); pg.wait_for_timeout(700)
        pg.click("#btn-mark-book-read"); pg.wait_for_timeout(400)
        check("plano: ao ler o último capítulo, o Dia 1 é concluído sozinho",
              pg.evaluate("state.readingPlans.progress['biblia-em-1-ano-1']") is True and "Dia 1" in pg.inner_text("#toast"))
        ctx.close()

        # ---------- Landing só na primeira visita ----------
        # Service worker desligado: o bloqueio de rede do teste não alcança o cache dele
        ctx = b.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
        pg = open_page(ctx, hide=False)
        check("landing: aparece na primeira visita", pg.is_visible("#landing-page"))
        pg.evaluate("window.supabase = null")  # modo local: entra sem login
        pg.click("#btn-enter-app"); pg.wait_for_timeout(1200)
        check("landing: marcada como vista ao entrar", pg.evaluate("localStorage.getItem('landing_seen')") == "1")
        # Segunda visita em modo local (SDK do Supabase bloqueado): abre direto na leitura
        pg.route("**/supabase-js@*/**", lambda route: route.abort())
        pg.reload(); pg.wait_for_selector(".verse-item"); pg.wait_for_timeout(3500)
        check("landing: segunda visita abre direto na leitura (modo local)",
              pg.evaluate("document.documentElement.classList.contains('skip-landing')") and not pg.is_visible("#landing-page"))
        pg.unroute("**/supabase-js@*/**")
        # Sem sessão e com login disponível, a landing volta para pedir o login
        pg.reload(); pg.wait_for_selector(".verse-item")
        pg.wait_for_function("getComputedStyle(document.getElementById('landing-page')).display !== 'none'", timeout=6000)
        check("landing: sem sessão e com login disponível, volta a pedir login", pg.is_visible("#landing-page"))
        ctx.close()
        b.close()
finally:
    srv.terminate()

print(f"\n{sum(res)}/{len(res)} passaram")
sys.exit(0 if all(res) else 1)
