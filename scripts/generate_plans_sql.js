// Gera supabase/reading_plans_catalog.sql a partir de reading_plans.js (fonte única dos planos).
// Uso: node scripts/generate_plans_sql.js
// Depois, execute o arquivo gerado no SQL Editor do Supabase.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

// offline_data.js declara BIBLE_BOOKS com const; executa num contexto e expõe para reading_plans.js
const context = { module: { exports: {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "offline_data.js"), "utf8") + "\nthis.BIBLE_BOOKS = BIBLE_BOOKS;", context);
vm.runInContext(fs.readFileSync(path.join(root, "reading_plans.js"), "utf8"), context);
const plans = context.module.exports;

const sqlString = value => "'" + String(value).replace(/'/g, "''") + "'";

let sql = `-- Catálogo de Planos de Leitura
-- ARQUIVO GERADO por scripts/generate_plans_sql.js a partir de reading_plans.js. Não edite à mão.
-- Execute no SQL Editor do Supabase (pode ser executado mais de uma vez).

CREATE TABLE IF NOT EXISTS public.reading_plans_catalog (
    plan_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    days_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.reading_plans_catalog ENABLE ROW LEVEL SECURITY;

-- O catálogo é público para leitura
DROP POLICY IF EXISTS "Permitir leitura pública do catálogo" ON public.reading_plans_catalog;
CREATE POLICY "Permitir leitura pública do catálogo" ON public.reading_plans_catalog
    FOR SELECT USING (true);

`;

for (const [planId, plan] of Object.entries(plans)) {
  sql += `INSERT INTO public.reading_plans_catalog (plan_id, name, description, days_data) VALUES (`
    + `${sqlString(planId)}, ${sqlString(plan.name)}, ${sqlString(plan.description)}, ${sqlString(JSON.stringify(plan.days))}`
    + `) ON CONFLICT (plan_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, days_data = EXCLUDED.days_data;\n`;
}

const outDir = path.join(root, "supabase");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "reading_plans_catalog.sql");
fs.writeFileSync(outFile, sql);

const summary = Object.entries(plans).map(([id, p]) => `${id} (${p.days.length} dias)`).join(", ");
console.log(`Gerado ${path.relative(root, outFile)}: ${summary}`);
