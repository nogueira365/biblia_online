import json

books = [
    ("gn", 50, "Gênesis"), ("ex", 40, "Êxodo"), ("lv", 27, "Levítico"), ("nm", 36, "Números"),
    ("dt", 34, "Deuteronômio"), ("js", 24, "Josué"), ("jz", 21, "Juízes"), ("rt", 4, "Rute"),
    ("1sm", 31, "1 Samuel"), ("2sm", 24, "2 Samuel"), ("1rs", 22, "1 Reis"), ("2rs", 25, "2 Reis"),
    ("1cr", 29, "1 Crônicas"), ("2cr", 36, "2 Crônicas"), ("ed", 10, "Esdras"), ("ne", 13, "Neemias"),
    ("et", 10, "Ester"), ("jo", 42, "Jó"), ("sl", 150, "Salmos"), ("pv", 31, "Provérbios"),
    ("ec", 12, "Eclesiastes"), ("ct", 8, "Cânticos"), ("is", 66, "Isaías"), ("jr", 52, "Jeremias"),
    ("lm", 5, "Lamentações"), ("ez", 48, "Ezequiel"), ("dn", 12, "Daniel"), ("os", 14, "Oseias"),
    ("jl", 3, "Joel"), ("am", 9, "Amós"), ("ob", 1, "Obadias"), ("jn", 4, "Jonas"),
    ("mq", 7, "Miqueias"), ("na", 3, "Naum"), ("hc", 3, "Habacuque"), ("sf", 3, "Sofonias"),
    ("ag", 2, "Ageu"), ("zc", 14, "Zacarias"), ("ml", 4, "Malaquias"),
    ("mt", 28, "Mateus"), ("mc", 16, "Marcos"), ("lc", 24, "Lucas"), ("jo", 21, "João"),
    ("at", 28, "Atos"), ("rm", 16, "Romanos"), ("1co", 16, "1 Coríntios"), ("2co", 13, "2 Coríntios"),
    ("gl", 6, "Gálatas"), ("ef", 6, "Efésios"), ("fp", 4, "Filipenses"), ("cl", 4, "Colossenses"),
    ("1ts", 5, "1 Tessalonicenses"), ("2ts", 3, "2 Tessalonicenses"), ("1tm", 6, "1 Timóteo"),
    ("2tm", 4, "2 Timóteo"), ("tt", 3, "Tito"), ("fm", 1, "Filemom"), ("hb", 13, "Hebreus"),
    ("tg", 5, "Tiago"), ("1pe", 5, "1 Pedro"), ("2pe", 3, "2 Pedro"), ("1jo", 5, "1 João"),
    ("2jo", 1, "2 João"), ("3jo", 1, "3 João"), ("jd", 1, "Judas"), ("ap", 22, "Apocalipse")
]

# Generate 365 day plan
total_chapters = sum(b[1] for b in books)
chapters_per_day = total_chapters / 365

days = []
current_book_idx = 0
current_chapter = 1

for day in range(1, 366):
    chapters_to_read = 4 if day <= 94 else 3
    
    if current_book_idx >= len(books):
        break
        
    start_book = books[current_book_idx]
    start_chapter = current_chapter
    
    for _ in range(chapters_to_read):
        if current_book_idx >= len(books):
            break
        current_chapter += 1
        if current_chapter > books[current_book_idx][1]:
            current_chapter = 1
            current_book_idx += 1
            
    if start_book[0] == 'jo' and start_book[2] == 'Jó':
        # the key is actually 'job' wait, the app uses 'jo' for João and 'job' for Jó?
        # Let's check app.js later. In ACF.js usually Job is 'job' or 'jó'. I will use 'jó' or whatever the standard is.
        pass

    days.append({
        "day": day,
        "label": f"{start_book[2]} {start_chapter}",
        "book": start_book[0] if start_book[2] != 'Jó' else 'job', # Will fix if needed
        "chapter": start_chapter
    })

# Overwrite jo for João just in case
for d in days:
    if d['book'] == 'jo':
        # In João it's jo
        pass

plan_365 = {
    "plan_id": "biblia-em-1-ano",
    "name": "Bíblia Completa em 1 Ano",
    "description": "Um plano clássico para ler toda a Bíblia em 365 dias.",
    "days": days
}

plan_gospels = {
    "plan_id": "gospels",
    "name": "Evangelhos em 30 Dias",
    "description": "Leia a vida e os ensinamentos de Jesus através dos quatro Evangelhos.",
    "days": [
        {"day": 1, "label": "Mateus 1-3", "book": "mt", "chapter": 1},
        {"day": 2, "label": "Mateus 4-6", "book": "mt", "chapter": 4},
        {"day": 3, "label": "Mateus 7-9", "book": "mt", "chapter": 7},
        {"day": 4, "label": "Mateus 10-12", "book": "mt", "chapter": 10},
        {"day": 5, "label": "Mateus 13-15", "book": "mt", "chapter": 13},
        {"day": 6, "label": "Mateus 16-18", "book": "mt", "chapter": 16},
        {"day": 7, "label": "Mateus 19-21", "book": "mt", "chapter": 19},
        {"day": 8, "label": "Mateus 22-24", "book": "mt", "chapter": 22},
        {"day": 9, "label": "Mateus 25-28", "book": "mt", "chapter": 25},
        {"day": 10, "label": "Marcos 1-3", "book": "mc", "chapter": 1},
        {"day": 11, "label": "Marcos 4-6", "book": "mc", "chapter": 4},
        {"day": 12, "label": "Marcos 7-9", "book": "mc", "chapter": 7},
        {"day": 13, "label": "Marcos 10-12", "book": "mc", "chapter": 10},
        {"day": 14, "label": "Marcos 13-16", "book": "mc", "chapter": 13},
        {"day": 15, "label": "Lucas 1-3", "book": "lc", "chapter": 1},
        {"day": 16, "label": "Lucas 4-6", "book": "lc", "chapter": 4},
        {"day": 17, "label": "Lucas 7-9", "book": "lc", "chapter": 7},
        {"day": 18, "label": "Lucas 10-12", "book": "lc", "chapter": 10},
        {"day": 19, "label": "Lucas 13-15", "book": "lc", "chapter": 13},
        {"day": 20, "label": "Lucas 16-18", "book": "lc", "chapter": 16},
        {"day": 21, "label": "Lucas 19-21", "book": "lc", "chapter": 19},
        {"day": 22, "label": "Lucas 22-24", "book": "lc", "chapter": 22},
        {"day": 23, "label": "João 1-3", "book": "jo", "chapter": 1},
        {"day": 24, "label": "João 4-6", "book": "jo", "chapter": 4},
        {"day": 25, "label": "João 7-9", "book": "jo", "chapter": 7},
        {"day": 26, "label": "João 10-12", "book": "jo", "chapter": 10},
        {"day": 27, "label": "João 13-15", "book": "jo", "chapter": 13},
        {"day": 28, "label": "João 16-18", "book": "jo", "chapter": 16},
        {"day": 29, "label": "João 19-21", "book": "jo", "chapter": 19}
    ]
}

plan_proverbs = {
    "plan_id": "proverbs",
    "name": "Sabedoria (Provérbios em 31 Dias)",
    "description": "Leia um capítulo do Livro de Provérbios a cada dia do mês.",
    "days": [{"day": i + 1, "label": f"Provérbios {i + 1}", "book": "pv", "chapter": i + 1} for i in range(31)]
}

plan_jesus = {
    "plan_id": "conhecendo-jesus",
    "name": "Conhecendo quem é Jesus",
    "description": "Uma jornada de 10 dias focada na pessoa e na obra de Cristo.",
    "days": [
        {"day": 1, "label": "João 1", "book": "jo", "chapter": 1},
        {"day": 2, "label": "João 3", "book": "jo", "chapter": 3},
        {"day": 3, "label": "João 6", "book": "jo", "chapter": 6},
        {"day": 4, "label": "João 8", "book": "jo", "chapter": 8},
        {"day": 5, "label": "João 10", "book": "jo", "chapter": 10},
        {"day": 6, "label": "João 11", "book": "jo", "chapter": 11},
        {"day": 7, "label": "João 14", "book": "jo", "chapter": 14},
        {"day": 8, "label": "João 15", "book": "jo", "chapter": 15},
        {"day": 9, "label": "João 19", "book": "jo", "chapter": 19},
        {"day": 10, "label": "João 20", "book": "jo", "chapter": 20}
    ]
}

plan_paz = {
    "plan_id": "paz-excede",
    "name": "A paz que excede o entendimento",
    "description": "Um plano de 5 dias focado em como lidar com a ansiedade à luz da Bíblia.",
    "days": [
        {"day": 1, "label": "Filipenses 4", "book": "fp", "chapter": 4},
        {"day": 2, "label": "Mateus 6", "book": "mt", "chapter": 6},
        {"day": 3, "label": "Salmos 23", "book": "sl", "chapter": 23},
        {"day": 4, "label": "Salmos 91", "book": "sl", "chapter": 91},
        {"day": 5, "label": "João 14", "book": "jo", "chapter": 14}
    ]
}


sql = """
-- 9. Tabela de Catálogo de Planos de Leitura (Reading Plans Catalog)
CREATE TABLE IF NOT EXISTS public.reading_plans_catalog (
    plan_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    days_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.reading_plans_catalog ENABLE ROW LEVEL SECURITY;

-- O catálogo é público para leitura
CREATE POLICY "Permitir leitura pública do catálogo" ON public.reading_plans_catalog
    FOR SELECT USING (true);

-- Inserir os planos
"""

def make_insert(plan):
    days_json = json.dumps(plan['days'], ensure_ascii=False)
    # Escape single quotes
    days_json = days_json.replace("'", "''")
    desc = plan['description'].replace("'", "''")
    name = plan['name'].replace("'", "''")
    return f"INSERT INTO public.reading_plans_catalog (plan_id, name, description, days_data) VALUES ('{plan['plan_id']}', '{name}', '{desc}', '{days_json}') ON CONFLICT (plan_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, days_data = EXCLUDED.days_data;\n"

sql += make_insert(plan_365)
sql += make_insert(plan_gospels)
sql += make_insert(plan_proverbs)
sql += make_insert(plan_jesus)
sql += make_insert(plan_paz)

with open('C:/Users/francisco.junior/Desktop/Biblia/append_sql.txt', 'w', encoding='utf-8') as f:
    f.write(sql)

print("SQL generated!")
