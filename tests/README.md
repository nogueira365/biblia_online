# Testes do Bíblia Live

## Pré-requisitos
- Node.js (para `sync.test.js`)
- Python 3 com Playwright: `pip install playwright` e depois `python -m playwright install chromium`

## Rodar tudo
```bash
python tests/run_all.py
```

## Suítes
| Arquivo | O que cobre |
|---|---|
| `sync.test.js` | Fila de sincronização com um Supabase simulado em memória: envio offline, paginação acima de 1000 linhas, erros de rede e de servidor, tabela inexistente, troca de conta, logout. Não acessa a internet. |
| `e2e/geral.py` | Segurança (injeção de HTML), condições de corrida, busca, dados da NTLH, planos, links diretos, acessibilidade, landing e modo offline. |
| `e2e/fase1_responsivo.py` | Seletor de tradução no celular, topo compacto, cartão de fim de capítulo, celular deitado e tablet. |
| `e2e/fase2_navegacao_mobile.py` | Barra de abas, seletor de livros em dois passos, ‹ › no título, menu do versículo como painel. |
| `e2e/fase3_pc_tablet.py` | Seletor "Livro Cap ▾", barra lateral recolhível, tooltips, modo comparação. |
| `e2e/fase4_leitura.py` | Marcação de lido discreta, ícones sem cobrir o texto, espaçamento e largura com prévia. |
| `e2e/fase5_gavetas.py` | Filtros das notas, escopo e buscas recentes da busca, plano de leitura, landing só na primeira visita. |

Cada suíte sobe um servidor local temporário (portas 8770–8791) com a raiz do projeto.
Os testes de ponta a ponta usam o Supabase real apenas para carregar o SDK; nenhum dado é gravado na nuvem.

## Capturas de tela
```bash
python tests/capturas.py
```
Gera capturas no PC e no celular (leitor, gavetas, temas…) em `tests/capturas-saida/` (ignorada pelo git), úteis para comparar o visual antes e depois de uma mudança.
