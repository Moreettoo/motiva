# Diário dos dados reais do Rodoanel

Uma linha por tarefa concluída, em ordem. Formato: `- AAAA-MM-DD HH:MM · Tarefa N · o que rodou · resultado em uma linha · commit abc1234`.
Hora de Brasília. Números só quando saíram de código.

- 2026-09-13 HH:MM · Tarefa 0 · `pesquisa/verificar_preparacao.sh` · preparação manual conferida · commit (a preencher)
- 2026-09-13 20:21 · Tarefa 1 · `git mv` da raiz para `ml/`, ajuste de caminhos e do workflow, `pytest` de 0 testes · antes: `FileNotFoundError` do `.pkl` rodando de `/tmp`; depois: `2026-08-20 00:18 1815037` · commit 96a923b
- 2026-09-13 20:32 · Tarefa 2 · esqueleto de `pesquisa/`, `banco.py` (sqlite local) e copia dos 4 brutos da Motiva; `pytest` focado em `test_banco.py` e `pytest` completo do repo · 3 passed no foco, 3 passed na suite inteira; 4 arquivos brutos commitados (120 KB, 120 KB, 3 KB, 1,9 MB) · commit 57f4dca
- 2026-09-13 20:44 · Tarefa 3 · `planilha.py` (parser do unifilar RA-RET) via TDD contra as duas planilhas reais; `pytest` focado em `test_planilha.py` e `pytest` completo do repo · 8 passed no foco, 11 passed na suite inteira; 60 marcos, 720 observacoes por arquivo, contagens por faixa batendo com a especificação · commit 426f2a4
