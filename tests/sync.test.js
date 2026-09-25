// Testa a camada de sincronização de auth_v2.js com um Supabase simulado em memória.
const fs = require("fs"), vm = require("vm"), assert = require("assert");
// Pasta do projeto: argumento opcional; padrão = raiz do repositório
const ROOT = process.argv[2] || require("path").resolve(__dirname, "..");

function makeEnv() {
  const db = {}; // table -> rows
  const net = { offline: false, failCode: null, calls: 0 };
  const t = n => (db[n] = db[n] || []);
  const conflictKey = (row, cols) => cols.split(",").map(c => row[c]).join("|");

  function builder(table) {
    const q = { table, op: null, filters: [], likeF: null, rows: null, onConflict: null, range: null, limit: null, order: null, single: false };
    const b = {
      select() { q.op = q.op || "select"; return b; },
      upsert(rows, o) { q.op = "upsert"; q.rows = [].concat(rows); q.onConflict = o && o.onConflict; return b; },
      insert(row) { q.op = "insert"; q.rows = [].concat(row); return b; },
      delete() { q.op = "delete"; return b; },
      eq(c, v) { q.filters.push([c, v]); return b; },
      like(c, p) { q.likeF = [c, new RegExp("^" + p.replace(/%/g, ".*") + "$")]; return b; },
      order(c, o) { q.order = [c, !o || o.ascending !== false]; return b; },
      range(a, z) { q.range = [a, z]; return b; },
      limit(n) { q.limit = n; return b; },
      maybeSingle() { q.single = true; return b; },
      then(res, rej) { return exec(q).then(res, rej); }
    };
    return b;
  }
  const match = (r, q) => q.filters.every(([c, v]) => r[c] === v) && (!q.likeF || q.likeF[1].test(r[q.likeF[0]]));
  async function exec(q) {
    net.calls++;
    await null;
    if (net.offline) return { data: null, error: { message: "TypeError: Failed to fetch", code: "" } };
    if (net.failCode && q.op !== "select") { const c = net.failCode; return { data: null, error: { message: "rejected", code: c } }; }
    const rows = t(q.table);
    if (q.op === "upsert") {
      q.rows.forEach(r => {
        const i = q.onConflict ? rows.findIndex(x => conflictKey(x, q.onConflict) === conflictKey(r, q.onConflict)) : -1;
        if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push({ id: String(rows.length + 1).padStart(6, "0"), ...r });
      });
      return { data: null, error: null };
    }
    if (q.op === "insert") { q.rows.forEach(r => rows.push({ id: String(rows.length + 1).padStart(6, "0"), ...r })); return { data: null, error: null }; }
    if (q.op === "delete") { db[q.table] = rows.filter(r => !match(r, q)); return { data: null, error: null }; }
    let out = rows.filter(r => match(r, q));
    if (q.order) out.sort((a, b) => (a[q.order[0]] > b[q.order[0]] ? 1 : -1) * (q.order[1] ? 1 : -1));
    const maxRows = 1000; // limite do PostgREST
    if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
    if (q.limit) out = out.slice(0, q.limit);
    out = out.slice(0, maxRows);
    if (q.single) return { data: out[0] || null, error: null };
    return { data: out, error: null };
  }

  let authCb = null;
  const store = {};
  const toasts = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (f) => setTimeout(f, 0),
    confirm: () => true,
    alert() {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: { addEventListener() {}, getElementById: () => null, querySelector: () => null },
    showToast: (m, ty) => toasts.push([ty, m]),
    reloaded: 0
  };
  ctx.window = ctx;
  ctx.window.addEventListener = () => {};
  ctx.window.location = { reload() { ctx.reloaded++; }, hash: "", search: "", pathname: "/" };
  ctx.supabase = {
    from: builder,
    auth: { onAuthStateChange(cb) { authCb = cb; } }
  };
  vm.createContext(ctx);
  vm.runInContext(`var state = { theme:"azul", fontFamily:"serif", fontSize:"md", currentTranslation:"nvi",
    highlights:{}, notes:{}, favorites:[], history:[], readingPlans:{activePlanId:"",progress:{}},
    readStatus:{verses:[],chapters:[],books:[]} };
    function saveStateToLocalStorage(){ localStorage.setItem("bible_reader_state", JSON.stringify(state)); }`, ctx);
  vm.runInContext(fs.readFileSync(ROOT + "/auth_v2.js", "utf8"), ctx);
  ctx.listenToAuthChanges();
  const emit = async (event, user) => { authCb(event, user ? { user } : null); await new Promise(r => setTimeout(r, 5)); await settle(); };
  const settle = () => new Promise(r => setTimeout(r, 20));
  return { ctx, db, net, store, toasts, emit, settle, run: s => vm.runInContext(s, ctx) };
}

const U1 = { id: "u1", email: "a@x.com" }, U2 = { id: "u2", email: "b@x.com" };

(async () => {
  // 1. Primeiro login mescla dados anônimos e define o dono
  {
    const e = makeEnv();
    e.run(`state.highlights = {"gn-1-1":"hl-yellow"}; state.favorites=["jo-3-16"];`);
    e.db.notes = [{ id: "000001", user_id: "u1", verse_key: "sl-23-1", content: "nuvem" }];
    await e.emit("INITIAL_SESSION", U1);
    assert.strictEqual(e.store.bible_sync_owner, "u1");
    assert.deepStrictEqual(e.db.highlights.map(r => r.verse_key), ["gn-1-1"]);
    assert.strictEqual(e.run(`state.notes["sl-23-1"]`), "nuvem");
    assert.strictEqual(e.run(`state.highlights["gn-1-1"]`), "hl-yellow");
    console.log("✓ 1. primeiro login mescla dados locais anônimos com a nuvem");
  }

  // 2. Escrita offline fica na fila, sobrevive ao pull e é enviada em ordem ao reconectar
  {
    const e = makeEnv();
    await e.emit("INITIAL_SESSION", U1);
    e.net.offline = true;
    e.run(`state.highlights["gn-1-1"]="hl-green"; cloudSaveHighlight("gn-1-1","hl-green");`);
    e.run(`cloudSaveHighlight("gn-1-1","hl-blue"); cloudSaveHighlight("gn-1-2","hl-pink"); cloudSaveHighlight("gn-1-2","");`);
    await e.settle();
    assert.strictEqual(JSON.parse(e.store.bible_sync_outbox).length, 4);
    // Um "Sincronizar Agora" offline não pode apagar o estado local
    await e.run(`syncCloudData().catch(()=>"falhou")`);
    assert.strictEqual(e.run(`state.highlights["gn-1-1"]`), "hl-green");
    e.net.offline = false;
    await e.run(`flushOutbox()`);
    assert.strictEqual(JSON.parse(e.store.bible_sync_outbox).length, 0);
    assert.deepStrictEqual(e.db.highlights.map(r => [r.verse_key, r.color_class]), [["gn-1-1", "hl-blue"]]);
    console.log("✓ 2. escritas offline ficam na fila e são enviadas em ordem (upsert/delete)");
  }

  // 3. Paginação além de 1000 linhas
  {
    const e = makeEnv();
    e.store.bible_sync_owner = "u1";
    e.db.read_verses = Array.from({ length: 2500 }, (_, i) => ({ id: String(i + 1).padStart(6, "0"), user_id: "u1", verse_key: `sl-1-${i}` }));
    await e.emit("INITIAL_SESSION", U1);
    assert.strictEqual(e.run(`state.readStatus.verses.length`), 2500);
    console.log("✓ 3. pull traz 2500 linhas (acima do limite de 1000)");
  }

  // 4. Erro no pull não altera o estado local
  {
    const e = makeEnv();
    e.store.bible_sync_owner = "u1";
    e.run(`state.notes={"jo-1-1":"minha nota"}`);
    e.net.offline = true;
    await e.emit("INITIAL_SESSION", U1);
    assert.strictEqual(e.run(`state.notes["jo-1-1"]`), "minha nota");
    console.log("✓ 4. falha de rede no pull mantém o estado local intacto");
  }

  // 5. Eventos repetidos do mesmo usuário não disparam nova sincronização completa
  {
    const e = makeEnv();
    await e.emit("INITIAL_SESSION", U1);
    const before = e.net.calls;
    await e.emit("TOKEN_REFRESHED", U1);
    await e.emit("SIGNED_IN", U1);
    assert.strictEqual(e.net.calls, before);
    console.log("✓ 5. TOKEN_REFRESHED / SIGNED_IN repetido não refazem o pull");
  }

  // 6. Erro permanente (ex.: RLS 42501) é descartado e não trava a fila
  {
    const e = makeEnv();
    await e.emit("INITIAL_SESSION", U1);
    e.net.failCode = "42501";
    await e.run(`cloudSaveFavorite("jo-3-16", true)`);
    e.net.failCode = null;
    await e.run(`cloudSaveFavorite("rm-8-28", true)`);
    assert.strictEqual(JSON.parse(e.store.bible_sync_outbox).length, 0);
    assert.deepStrictEqual(e.db.favorites.map(r => r.verse_key), ["rm-8-28"]);
    assert.ok(e.toasts.some(([ty]) => ty === "error"));
    console.log("✓ 6. erro permanente é descartado com aviso, fila continua");
  }

  // 7. Desmarcar livro remove livro e capítulos (like) só daquele livro
  {
    const e = makeEnv();
    await e.emit("INITIAL_SESSION", U1);
    await e.run(`cloudSaveReadBook("jo", true); cloudSaveReadChapter("jo-1", true); cloudSaveReadChapter("1jo-1", true)`);
    await e.run(`cloudSaveReadBook("jo", false)`);
    assert.deepStrictEqual(e.db.read_books || [], []);
    assert.deepStrictEqual(e.db.read_chapters.map(r => r.chapter_key), ["1jo-1"]);
    await e.run(`cloudSaveReadVerses(["gn-1-1","gn-1-2"])`);
    assert.strictEqual(e.db.read_verses.length, 2);
    console.log("✓ 7. livro/capítulos/versículos em lote sincronizam corretamente");
  }

  // 8. Logout (SIGNED_OUT) limpa estado, fila e dono e recarrega
  {
    const e = makeEnv();
    await e.emit("INITIAL_SESSION", U1);
    e.store.bible_sync_outbox = "[1]";
    await e.emit("SIGNED_OUT", null);
    assert.ok(!("bible_reader_state" in e.store) && !("bible_sync_outbox" in e.store) && !("bible_sync_owner" in e.store));
    assert.strictEqual(e.ctx.reloaded, 1);
    console.log("✓ 8. SIGNED_OUT limpa dados locais e recarrega");
  }

  // 9. Dados locais de outra conta: fila descartada, não vaza para a nova conta
  {
    const e = makeEnv();
    e.store.bible_sync_owner = "u2";
    e.store.bible_sync_outbox = JSON.stringify([{ table: "notes", action: "upsert", onConflict: "user_id,verse_key", row: { verse_key: "x-1-1", content: "de u2" } }]);
    await e.emit("INITIAL_SESSION", U1);
    assert.ok(!(e.db.notes || []).length);
    assert.strictEqual(e.store.bible_sync_owner, "u1");
    console.log("✓ 9. fila de outra conta não é enviada para a conta atual");
  }

  // 10. Escritas antes da sessão ser restaurada (dono conhecido) entram na fila e vão no login
  {
    const e = makeEnv();
    e.store.bible_sync_owner = "u1";
    e.run(`state.highlights["ap-1-1"]="hl-orange"; cloudSaveHighlight("ap-1-1","hl-orange")`);
    await e.emit("INITIAL_SESSION", U1);
    assert.strictEqual(e.run(`state.highlights["ap-1-1"]`), "hl-orange");
    assert.strictEqual(e.db.highlights.length, 1);
    console.log("✓ 10. alteração feita antes da sessão carregar não é perdida");
  }

  // 11. Tabela inexistente (PGRST205): alteração NÃO é descartada, aviso explica o problema,
  //     e ao criar a tabela a fila é enviada normalmente
  {
    const e = makeEnv();
    await e.emit("INITIAL_SESSION", U1);
    e.net.failCode = "PGRST205";
    await e.run(`cloudSaveReadChapter("gn-1", true)`);
    await e.run(`cloudSaveHighlight("gn-1-1", "hl-blue")`);
    assert.strictEqual(JSON.parse(e.store.bible_sync_outbox).length, 2);
    assert.ok(e.toasts.some(([ty, m]) => ty === "error" && m.includes("supabase/")), "aviso de banco desatualizado");
    assert.strictEqual(e.toasts.filter(([, m]) => m.includes("supabase/")).length, 1, "aviso aparece uma vez só");
    const err = await e.run(`syncCloudData().catch(err => describeCloudError(err))`);
    assert.ok(String(err).includes("desatualizado"), err);
    e.net.failCode = null; // tabela criada
    await e.run(`flushOutbox()`);
    assert.strictEqual(JSON.parse(e.store.bible_sync_outbox).length, 0);
    assert.deepStrictEqual(e.db.read_chapters.map(r => r.chapter_key), ["gn-1"]);
    console.log("✓ 11. tabela inexistente segura a fila com aviso claro; após criar a tabela tudo é enviado");
  }

  console.log("\nTodos os testes passaram.");
})().catch(err => { console.error("FALHOU:", err); process.exit(1); });
