// reading_plans.js
// Fonte única dos planos de leitura. É usada pelo app e pelo gerador do SQL do catálogo
// (scripts/generate_plans_sql.js). Depende de BIBLE_BOOKS (offline_data.js).
//
// Cada dia tem: day, label, book e chapter (primeiro capítulo, usado pelo botão "Ler").
// Planos com mais de um capítulo por dia trazem também readings: [{ book, from, to }].

(function () {
  // Bíblia completa em 365 dias: 4 capítulos/dia nos primeiros dias e 3 no restante,
  // totalizando exatamente os 1189 capítulos.
  function buildWholeBiblePlan(books) {
    const allChapters = [];
    books.forEach(book => {
      for (let c = 1; c <= book.chapters; c++) allChapters.push({ book, chapter: c });
    });

    const totalDays = 365;
    const baseCount = Math.floor(allChapters.length / totalDays); // 3
    const extraDays = allChapters.length % totalDays;             // 94 dias com 1 capítulo a mais

    const days = [];
    let cursor = 0;
    for (let day = 1; day <= totalDays; day++) {
      const count = baseCount + (day <= extraDays ? 1 : 0);
      const slice = allChapters.slice(cursor, cursor + count);
      cursor += count;

      // Agrupa capítulos consecutivos do mesmo livro: [{ book, from, to }]
      const readings = [];
      slice.forEach(({ book, chapter }) => {
        const last = readings[readings.length - 1];
        if (last && last.book === book.abbrev) last.to = chapter;
        else readings.push({ book: book.abbrev, name: book.name, from: chapter, to: chapter });
      });

      days.push({
        day,
        label: readings.map(r => `${r.name} ${r.from === r.to ? r.from : `${r.from}-${r.to}`}`).join("; "),
        book: readings[0].book,
        chapter: readings[0].from,
        readings: readings.map(({ book, from, to }) => ({ book, from, to }))
      });
    }
    return days;
  }

  // Um capítulo por dia de um único livro
  function oneChapterPerDay(bookAbbrev, bookName, count) {
    return Array.from({ length: count }, (_, i) => ({
      day: i + 1,
      label: `${bookName} ${i + 1}`,
      book: bookAbbrev,
      chapter: i + 1
    }));
  }

  // Lista explícita de capítulos: [["mt", "Mateus", 1, 3], ...] → um dia por item
  function fromRanges(ranges) {
    return ranges.map(([book, name, from, to], i) => ({
      day: i + 1,
      label: from === to ? `${name} ${from}` : `${name} ${from}-${to}`,
      book,
      chapter: from,
      readings: [{ book, from, to }]
    }));
  }

  const plans = {
    "biblia-em-1-ano": {
      name: "Bíblia Completa em 1 Ano",
      description: "Um plano clássico para ler toda a Bíblia em 365 dias (3 a 4 capítulos por dia).",
      days: buildWholeBiblePlan(BIBLE_BOOKS)
    },
    gospels: {
      name: "Evangelhos em 30 Dias",
      description: "Leitura diária dos quatro Evangelhos (Mateus, Marcos, Lucas e João).",
      days: fromRanges([
        ["mt", "Mateus", 1, 3], ["mt", "Mateus", 4, 6], ["mt", "Mateus", 7, 9], ["mt", "Mateus", 10, 12],
        ["mt", "Mateus", 13, 15], ["mt", "Mateus", 16, 18], ["mt", "Mateus", 19, 21], ["mt", "Mateus", 22, 24],
        ["mt", "Mateus", 25, 26], ["mt", "Mateus", 27, 28],
        ["mc", "Marcos", 1, 3], ["mc", "Marcos", 4, 6], ["mc", "Marcos", 7, 9], ["mc", "Marcos", 10, 12],
        ["mc", "Marcos", 13, 16],
        ["lc", "Lucas", 1, 3], ["lc", "Lucas", 4, 6], ["lc", "Lucas", 7, 9], ["lc", "Lucas", 10, 12],
        ["lc", "Lucas", 13, 15], ["lc", "Lucas", 16, 18], ["lc", "Lucas", 19, 21], ["lc", "Lucas", 22, 24],
        ["jo", "João", 1, 3], ["jo", "João", 4, 6], ["jo", "João", 7, 9], ["jo", "João", 10, 12],
        ["jo", "João", 13, 15], ["jo", "João", 16, 18], ["jo", "João", 19, 21]
      ])
    },
    proverbs: {
      name: "Sabedoria (Provérbios em 31 Dias)",
      description: "Leia um capítulo do Livro de Provérbios a cada dia do mês.",
      days: oneChapterPerDay("pv", "Provérbios", 31)
    },
    "conhecendo-jesus": {
      name: "Conhecendo quem é Jesus",
      description: "Uma jornada de 10 dias focada na pessoa e na obra de Cristo.",
      days: fromRanges([
        ["jo", "João", 1, 1], ["jo", "João", 3, 3], ["jo", "João", 6, 6], ["jo", "João", 8, 8], ["jo", "João", 10, 10],
        ["jo", "João", 11, 11], ["jo", "João", 14, 14], ["jo", "João", 15, 15], ["jo", "João", 19, 19], ["jo", "João", 20, 20]
      ])
    },
    "paz-excede": {
      name: "A paz que excede o entendimento",
      description: "Um plano de 5 dias focado em como lidar com a ansiedade à luz da Bíblia.",
      days: fromRanges([
        ["fp", "Filipenses", 4, 4], ["mt", "Mateus", 6, 6], ["sl", "Salmos", 23, 23], ["sl", "Salmos", 91, 91], ["jo", "João", 14, 14]
      ])
    },
    "caminho-da-volta": {
      name: "O Caminho da Volta",
      description: "Reflexões sobre experiências de retorno e transformação encontradas nas Escrituras (Plano SBB).",
      days: fromRanges([
        ["lc", "Lucas", 5, 5], ["lc", "Lucas", 15, 15], ["jr", "Jeremias", 25, 25], ["gn", "Gênesis", 33, 33], ["at", "Atos", 9, 9]
      ])
    },
    "tempo-com-palavra": {
      name: "Um tempo com a Palavra",
      description: "Especialmente planejado para pais e filhos compartilharem momentos de leitura (Plano SBB).",
      days: fromRanges([
        ["pv", "Provérbios", 22, 22], ["ef", "Efésios", 6, 6], ["sl", "Salmos", 127, 127], ["dt", "Deuteronômio", 6, 6], ["cl", "Colossenses", 3, 3]
      ])
    }
  };

  // Navegador: expõe para o app. Node: exporta para o gerador de SQL.
  if (typeof window !== "undefined") window.READING_PLANS = plans;
  if (typeof module !== "undefined") module.exports = plans;
})();
