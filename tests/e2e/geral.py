"""Teste de ponta a ponta completo do Bíblia Live (todas as rodadas de correção)."""
import subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

# Pasta do projeto: argumento opcional; padrão = raiz do repositório
ROOT = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[2])
PORT = 8770
BASE = f"http://localhost:{PORT}"
server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""), flush=True)

def reader_ready(page):
    page.wait_for_selector(".verse-item", timeout=30000)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        errors = []

        def new_page(context, viewport=None, path="/index.html", hide_landing=True):
            page = context.new_page()
            if viewport: page.set_viewport_size(viewport)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(BASE + path)
            reader_ready(page)
            if hide_landing:
                page.evaluate("document.getElementById('landing-page').style.display='none'")
            return page

        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = new_page(ctx)

        # ---------- CDN com versão fixa + SRI ----------
        check("SDK do Supabase carregou (hash SRI válido)", page.evaluate("!!(window.supabase && window.supabase.auth)"))
        check("Flatpickr carregou (hash SRI válido)", page.evaluate("typeof flatpickr === 'function' && !!flatpickr.l10ns.pt"))

        # ---------- XSS ----------
        page.evaluate("""() => { window.__xss = 0;
            state.notes['pv-28-1'] = '</textarea><img src=x onerror="window.__xss=1">';
            state.favorites.push('pv-28-2'); saveStateToLocalStorage(); }""")
        page.evaluate("openNoteEditor('pv-28-1')")
        page.wait_for_selector("#note-textarea-input"); page.wait_for_timeout(300)
        check("nota com HTML não executa script", page.evaluate("window.__xss") == 0)
        check("nota aparece intacta no editor", page.evaluate("document.getElementById('note-textarea-input').value").startswith("</textarea>"))
        page.locator("#annotations-container .annotation-card .btn-go-ref").last.click(); page.wait_for_timeout(500)
        check("'Ler' de card abaixo do editor funciona", not page.evaluate("document.getElementById('favorites-drawer').classList.contains('open')"))
        page.evaluate("showToast('<img src=x onerror=\"window.__xss=2\">', 'error')")
        page.evaluate("state.socialName = '<img src=x onerror=\"window.__xss=3\">'; syncState.currentUser={email:'a@b.c'}; updateGreeting(); syncState.currentUser=null;")
        page.wait_for_timeout(200)
        check("toast e saudação não interpretam HTML", page.evaluate("window.__xss") == 0)

        # ---------- Corridas ----------
        page.evaluate("for (let i = 1; i <= 30; i++) state.favorites.push('jo-3-' + i);")
        page.click("#btn-favorites"); page.type("#search-notes-input", "jo", delay=5); page.wait_for_timeout(800)
        refs = page.evaluate("[...document.querySelectorAll('#annotations-container .annotation-verse-ref')].map(e=>e.textContent.trim())")
        check("filtro rápido não duplica cards", len(refs) == len(set(refs)) and len(refs) > 0, f"{len(refs)}/{len(set(refs))}")
        page.evaluate("closeAllDrawers()")
        page.evaluate("state.comparisonActive = true; state.comparisonTranslation = 'ara'; state.currentBook='gn'; state.currentChapter=1; loadActiveChapter(); state.currentChapter=2; loadActiveChapter(); state.currentChapter=3; loadActiveChapter();")
        page.wait_for_timeout(3000)
        rows = page.evaluate("document.querySelectorAll('.comparison-row').length")
        expected = page.evaluate("Math.max(BIBLE_DATA_NVI[0].chapters[2].length, BIBLE_DATA_ARA[0].chapters[2].length)")
        check("navegação rápida (comparação) mostra só o último capítulo", rows == expected and page.evaluate("document.getElementById('bc-chapter').textContent") == "Capítulo 3")
        check("tradução baixada uma única vez", page.evaluate("[...document.querySelectorAll('script')].filter(s=>s.src.includes('/data/ARA.js')).length") == 1)
        page.evaluate("state.comparisonActive = false;")

        # ---------- Histórico / desmarcar capítulo ----------
        page.evaluate("state.currentBook='pv'; state.currentChapter=3; loadActiveChapter()"); page.wait_for_timeout(400)
        before = page.evaluate("state.history.length")
        page.evaluate("loadActiveChapter()"); page.wait_for_timeout(300); page.evaluate("loadActiveChapter()"); page.wait_for_timeout(300)
        check("re-renderizar não duplica histórico", page.evaluate("state.history.length") == before)
        page.evaluate("state.readStatus.books=['rt']; state.readStatus.chapters=[]; state.currentBook='rt'; state.currentChapter=2; loadActiveChapter();"); page.wait_for_timeout(400)
        page.click("#btn-mark-book-read"); page.wait_for_timeout(400)
        st = page.evaluate("({b: state.readStatus.books, c: state.readStatus.chapters.slice().sort()})")
        check("desmarcar capítulo de livro lido funciona", st["b"] == [] and st["c"] == ["rt-1", "rt-3", "rt-4"], str(st))

        # ---------- Busca ----------
        page.click("#btn-search"); page.fill("#search-input", "fe"); page.click("#search-form button[type=submit]")
        page.wait_for_selector(".search-result-item", timeout=15000)
        check("busca limitada a 300 resultados", page.evaluate("document.querySelectorAll('.search-result-item').length") <= 300)
        check("realce ignora acentos", page.evaluate("[...document.querySelectorAll('.search-result-item mark')].some(m=>m.textContent.toLowerCase()==='fé')"))
        page.evaluate("closeAllDrawers()")

        # ---------- NTLH ----------
        page.evaluate("state.currentTranslation='ntlh'; state.currentBook='gn'; state.currentChapter=6; loadActiveChapter()")
        page.wait_for_timeout(2500)
        ntlh = page.evaluate("""() => {
            const items = [...document.querySelectorAll('#verses-container .verse-item')];
            const texts = items.map(el => el.querySelector('.verse-text').textContent);
            return { labels: items.map(el => el.querySelector('.verse-number').textContent),
                     dupTexts: texts.length - new Set(texts).size,
                     hasPrefix: texts.some(t => /^\\[\\d+-\\d+\\]/.test(t)),
                     has10: !!document.querySelector('.verse-item[data-verse-number="10"]') };
        }""")
        check("NTLH: versículos agrupados aparecem uma vez com rótulo '9-10'", "9-10" in ntlh["labels"] and ntlh["dupTexts"] == 0 and not ntlh["hasPrefix"] and not ntlh["has10"], str(ntlh)[:200])
        check("NTLH: 2 Samuel tem 24 capítulos", page.evaluate("BIBLE_DATA_NTLH[9].chapters.length") == 24)
        check("NTLH: 2Sm 24:25 restaurado", page.evaluate("BIBLE_DATA_NTLH[9].chapters[23][24]").startswith("Ele construiu ali um altar"))
        page.evaluate("[...document.querySelectorAll('.verse-read-checkbox')].forEach(cb => { if (!cb.checked) cb.click(); })")
        page.wait_for_timeout(300)
        check("NTLH: marcar todos os versículos visíveis marca o capítulo", page.evaluate("isChapterRead('gn', 6)"))
        check("NTLH: texto de versículo agrupado (Gn 6:10) resolve para o grupo", page.evaluate("getVerseTextLocal('gn-6-10').then(t => t.startsWith('[9-10]'))"))
        page.evaluate("state.currentTranslation='nvi'; loadActiveChapter()"); page.wait_for_timeout(500)

        # ---------- Planos ----------
        plans = page.evaluate("({ n: Object.keys(READING_PLANS).length, year: READING_PLANS['biblia-em-1-ano'].days.length, d1: READING_PLANS['biblia-em-1-ano'].days[0].label, gospels: READING_PLANS.gospels.days.length, opts: document.querySelectorAll('#plan-select option').length })")
        check("planos: 7 planos, 1 ano com 365 dias começando em 'Gênesis 1-4'", plans["n"] == 7 and plans["year"] == 365 and plans["d1"] == "Gênesis 1-4" and plans["gospels"] == 30 and plans["opts"] == 8, str(plans))

        # ---------- Links diretos ----------
        check("link de compartilhamento aponta para o versículo", page.evaluate("buildShareUrl('jo', 3, 16)").endswith("/index.html?livro=jo&cap=3&v=16"))
        page2 = new_page(ctx, path="/index.html?livro=jo&cap=3&v=16")
        page2.wait_for_timeout(1200)
        dl = page2.evaluate("({ book: document.getElementById('bc-book').textContent, ch: document.getElementById('bc-chapter').textContent, url: location.search })")
        check("link direto abre João 3 e limpa a URL", dl == {"book": "João", "ch": "Capítulo 3", "url": ""}, str(dl))
        page2.close()

        # ---------- Acessibilidade ----------
        page.focus("#translation-select + .cs-wrapper .cs-trigger")
        page.keyboard.press("ArrowDown"); page.wait_for_timeout(100)
        opened = page.evaluate("document.querySelector('#translation-select + .cs-wrapper').classList.contains('cs-open')")
        page.keyboard.press("Home"); page.keyboard.press("Enter"); page.wait_for_timeout(800)
        check("dropdown funciona pelo teclado (setas + Enter)", opened and page.evaluate("state.currentTranslation") == "acf")
        check("bolinhas de cor e livros acessíveis por Tab", page.evaluate("document.querySelectorAll('.color-dot[tabindex=\"0\"]').length === 6 && document.querySelector('.book-item').getAttribute('tabindex') === '0'"))
        page.focus(".book-item:nth-child(3)"); page.keyboard.press("Enter"); page.wait_for_timeout(600)
        check("Enter em um livro da lista abre o livro", page.evaluate("state.currentBook") == "ex")

        # ---------- Landing ----------
        page3 = new_page(ctx, hide_landing=False)
        page3.click("#btn-enter-app"); page3.wait_for_timeout(1000)
        check("landing: sem login pede autenticação", page3.evaluate("document.getElementById('auth-modal').style.display") == "flex")
        page3.evaluate("document.getElementById('btn-close-auth-modal').click(); window.supabase = null;")
        page3.click("#btn-enter-app"); page3.wait_for_timeout(1000)
        check("landing: sem Supabase entra no modo local", page3.evaluate("getComputedStyle(document.getElementById('landing-page')).display") == "none")
        page3.close()
        page.close()

        # ---------- Mobile: overlay ----------
        mctx = browser.new_context(viewport={"width": 390, "height": 844})
        mp = new_page(mctx)
        mp.evaluate("openDrawer('settings-drawer'); closeAllDrawers();")
        mp.click(".tab-btn[data-tab='livros']"); mp.wait_for_timeout(400)
        opened = mp.evaluate("document.querySelector('.sidebar-pane').classList.contains('open')")
        mp.click(".tab-btn[data-tab='ler']"); mp.wait_for_timeout(400)
        check("mobile: aba Livros abre o seletor e aba Ler fecha", opened and not mp.evaluate("document.querySelector('.sidebar-pane').classList.contains('open')"))
        mctx.close()

        # ---------- Offline (Service Worker) ----------
        octx = browser.new_context(viewport={"width": 1280, "height": 900})
        op = new_page(octx)
        op.evaluate("navigator.serviceWorker.ready")
        op.reload(); reader_ready(op)                      # agora a página é controlada pelo SW
        op.evaluate("document.getElementById('landing-page').style.display='none'")
        op.evaluate("state.currentTranslation='ntlh'; saveStateToLocalStorage(); loadActiveChapter()")
        op.wait_for_timeout(2500)                          # NTLH baixada e guardada no cache
        controlled = op.evaluate("!!navigator.serviceWorker.controller")
        octx.set_offline(True)
        op.reload();
        try:
            reader_ready(op)
            offline_ok = op.evaluate("document.querySelectorAll('.verse-item').length > 0 && state.currentTranslation === 'ntlh'")
        except Exception as e:
            offline_ok = False
        check("offline: app abre e mostra a tradução já baixada sem internet", controlled and offline_ok, f"controlado={controlled}")
        octx.set_offline(False)
        octx.close()

        relevant = [e for e in errors if "supabase" not in e.lower() and "fetch" not in e.lower()]
        check("sem erros de JavaScript nas páginas", not relevant, "; ".join(relevant[:3]))
        browser.close()
finally:
    server.terminate()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passaram", flush=True)
sys.exit(1 if failed else 0)
