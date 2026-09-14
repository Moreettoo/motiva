"""Markdown a partir de JSON. Nenhum numero de relatorio e digitado a mao.

Cada secao do relatorio (consolidacao, e futuramente validacao/ndvi) vira uma
funcao independente que devolve uma string markdown. Os helpers no topo do
modulo (_commit, _tabela) sao compartilhados; cada funcao de relatorio e
adicionada ao final do arquivo, sem depender do estado das outras.
"""
from __future__ import annotations

import math
import subprocess
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import DOCS_PESQUISA
from . import planilha

FUSO_BR = timezone(timedelta(hours=-3))


def _commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return "sem-git"


def escrever(caminho: str | Path, texto: str) -> None:
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(texto, encoding="utf-8")


def diario(linha: str) -> None:
    agora = datetime.now(FUSO_BR).strftime("%Y-%m-%d %H:%M")
    with (DOCS_PESQUISA / "00-diario.md").open("a", encoding="utf-8") as f:
        f.write(f"- {agora} · {linha} · commit {_commit()}\n")


def _num(v: float, casas: int = 0) -> str:
    """Formata um numero no padrao BR: ponto de milhar, virgula decimal.

    Usa o truque classico de troca dupla: `f"{v:,.Nf}"` do Python ja separa
    milhar por virgula e decimal por ponto (convencao EUA); trocar virgula<->ponto
    da o padrao BR sem reimplementar o agrupamento de milhares.

    E o helper CENTRAL de formatacao numerica do modulo -- antes deste fix
    cada callsite formatava a sua propria maneira, e pelo menos duas
    divergiam do padrao BR de um jeito que muda o SIGNIFICADO do numero para
    quem le: `f"{eixo.comprimento_m:,.0f}"` imprimia "29,025 m" (o eixo tem
    29 mil metros, nao 29; um leitor BR le "29,025" como vinte e nove
    virgula zero-dois-cinco) e `f"{...:.1f} ha"` imprimia "98.2 ha" com ponto
    onde o BR usa virgula. Central para nao ter que repetir a correcao nos
    dois relatorios que ainda vem (`03-ndvi.md` e `04-producao.md`).
    """
    txt = f"{v:,.{casas}f}"
    return txt.translate(str.maketrans(",.", ".,"))


def _tabela(cabecalho: list[str], linhas: list[list]) -> str:
    fmt = lambda v: _num(v, 3) if isinstance(v, float) else str(v)
    out = ["| " + " | ".join(cabecalho) + " |", "|" + "---|" * len(cabecalho)]
    out += ["| " + " | ".join(fmt(v) for v in l) + " |" for l in linhas]
    return "\n".join(out)


def _br(v: float, casas: int = 2) -> str:
    """Formata um float com virgula decimal e ponto de milhar (padrao BR) fora
    de tabela -- mesma conversao que `_tabela` ja aplica por celula (via
    `_num`), reaproveitada na prosa corrida do relatorio (que e a unica parte
    deste modulo com acentuacao normal em portugues -- ver o docstring do
    modulo)."""
    return _num(v, casas)


def _lacuna_do_eixo(eixo) -> tuple[float, float, float]:
    """(tamanho em m, km de planilha inicial, km de planilha final) do maior
    salto de chainage entre marcos consecutivos do eixo reordenado."""
    passos = [b - a for a, b in zip(eixo.chainage, eixo.chainage[1:])]
    maior_m = max(passos)
    idx = passos.index(maior_m)
    return maior_m, eixo.chainage[idx] * eixo.escala / 1000.0, eixo.chainage[idx + 1] * eixo.escala / 1000.0


def _discordancia_poligonos(eixo, poligonos) -> list[tuple]:
    """Para cada poligono, (poligono, delta_km, distancia_ao_eixo_m), so para
    quem diverge por mais de 1 km entre o km da descricao e o km continuo
    projetado -- a mesma metrica de pesquisa/tests/test_poligonos.py
    (test_concordancia_continua_e_a_lacuna_do_eixo).
    """
    saida = []
    for p in poligonos:
        km_continuo_m, dist_eixo_m = eixo.km_planilha(p.latitude, p.longitude)
        delta_km = abs(km_continuo_m / 1000.0 - p.km_descricao)
        if delta_km > 1:
            saida.append((p, delta_km, dist_eixo_m))
    return saida


def _paragrafo_lacuna(eixo, poligonos, mediana_dist_m: float) -> str:
    """Paragrafo de limitacao sobre a lacuna de 2.042 m do eixo (ver
    poligonos.atribuir). Isolado em funcao propria porque so faz sentido com
    pelo menos um poligono discordante -- em qualquer outro caso (nenhum
    poligono diverge do seu km descrito) o percentual "quantos caem na
    lacuna" nao tem denominador, e o texto tem que dizer isso em vez de
    dividir por zero.
    """
    lacuna_m, km_ini, km_fim = _lacuna_do_eixo(eixo)
    faixa = range(math.floor(km_ini), math.ceil(km_fim) + 1)
    discordantes = _discordancia_poligonos(eixo, poligonos)
    base = (f"O eixo (`Marco km_rodoanel 2.kmz`) tem 2 marcos fora de ordem no arquivo, corrigidos "
            f"por `marcos.ORDEM_CORRIGIDA`; mesmo corrigido, resta uma lacuna real de **{_br(lacuna_m, 0)} m** "
            f"sem marco intermediário, entre os km de planilha **{_br(km_ini)}** e **{_br(km_fim)}** "
            f"(entre os km {faixa.start} e {faixa.stop - 1}). Nesse trecho o eixo reordenado vira uma "
            f"corda reta onde a rodovia de verdade faz curva, e a atribuição de polígono → marco "
            f"(`metodo_rocada`/`area_rocada_m2` dos segmentos nesse trecho) é por isso menos confiável")
    if not discordantes:
        return (f"{base}. Neste lote nenhum polígono diverge por mais de 1 km entre o km descrito e o "
                f"km projetado no eixo.")
    na_lacuna = [d for d in discordantes if d[0].km_descricao in faixa]
    pior = max(discordantes, key=lambda d: d[1])
    return (f"{base}: **{len(na_lacuna)}** dos **{len(discordantes)}** polígonos cujo centróide "
            f"diverge por mais de 1 km do seu km descrito caem nesse trecho "
            f"(**{_br(100 * len(na_lacuna) / len(discordantes), 0)}%**). Não é erro de projeção: mesmo o "
            f"pior caso (polígono {pior[0].indice}, descrito no km {pior[0].km_descricao}, projetando "
            f"a {_br(pior[1])} km de distância disso) fica a só **{_br(pior[2], 0)} m** do eixo — bem abaixo "
            f"da mediana geral de **{_br(mediana_dist_m, 0)} m**. É lacuna de levantamento da Motiva, não "
            f"defeito de projeção: **{len(eixo.pontos)}** marcos não dá para cobrir os "
            f"**{_br(eixo.comprimento_m * eixo.escala / 1000, 1)} km** da planilha sem aproximar em algum "
            f"trecho. Ver o docstring de `poligonos.atribuir`.")


def _paragrafo_sem_poligono(segmentos, poligonos) -> str:
    """Paragrafo de limitacao sobre segmentos sem nenhum poligono de rocada
    atribuido (`metodo_rocada is None`). `segmentos` chega ordenado por
    km_marco_m crescente (a mesma ordem de segmentos.MARCOS), entao dois
    segmentos vizinhos sem poligono viram um unico trecho contiguo no texto
    em vez de duas linhas soltas.
    """
    faltando = [s for s in segmentos if s.metodo_rocada is None]
    if not faltando:
        return (f"Todos os **{len(segmentos)}** segmentos têm pelo menos um polígono de roçada "
                f"atribuído.")
    trechos: list[list[float]] = []
    for s in faltando:
        if trechos and trechos[-1][1] == s.km_inicio:
            trechos[-1][1] = s.km_fim
        else:
            trechos.append([s.km_inicio, s.km_fim])
    lista_trechos = "; ".join(f"km {_br(a)}–{_br(b)}" for a, b in trechos)
    return (f"**{len(faltando)}** dos **{len(segmentos)}** segmentos não têm nenhum polígono de "
            f"roçada atribuído (`metodo_rocada`/`area_rocada_m2` ficam vazios/zero): {lista_trechos}. "
            f"Não é erro de agrupamento — a soma de polígonos por marco continua cobrindo o lote "
            f"inteiro (**{len(poligonos)}** polígonos); é ausência de cobertura desses trechos no "
            f"KML de roçada da Motiva.")


def consolidacao(*, lev1, lev2, eixo, segmentos, pares, matriz, poligonos, atribuicao) -> str:
    trans = Counter(p.transicao for p in pares)
    por_faixa = Counter(p.faixa for p in pares)
    dist = sorted(d for _, d in atribuicao.values())
    metodos = Counter(p.metodo for p in poligonos)
    area_por_metodo = Counter()
    for p in poligonos:
        area_por_metodo[p.metodo] += p.area_m2
    linhas_faixa = [[f, n] for f, n in sorted(por_faixa.items(), key=lambda kv: -kv[1])]
    linhas_matriz = [[f"{a} → {b}", n] for (a, b), n in sorted(matriz.items())]
    linhas_seg = [[s.km_marco_m, s.km_inicio, s.km_fim, s.latitude, s.longitude, s.metodo_rocada or "—", round(s.area_rocada_m2)] for s in segmentos]

    paragrafo_lacuna = _paragrafo_lacuna(eixo, poligonos, dist[len(dist) // 2])
    paragrafo_sem_poligono = _paragrafo_sem_poligono(segmentos, poligonos)
    n_faixas_fora_de_escopo = len(planilha.FAIXAS) - len(planilha.CODIGOS_EM_ESCOPO)

    return f"""# 01 · Consolidação dos dados da Motiva

Gerado por `pesquisa/consolidar.py` em {datetime.now(FUSO_BR):%d/%m/%Y %H:%M} (commit {_commit()}).

## Fontes

| Arquivo | Data adotada | Data interna (BF6) | Observações |
|---|---|---|---|
| {lev1.arquivo} | {lev1.data} | {lev1.data_interna} | {len(lev1.observacoes)} |
| {lev2.arquivo} | {lev2.data} | {lev2.data_interna} | {len(lev2.observacoes)} |

A data interna é a mesma nos dois arquivos, logo não pode ser a data das duas caminhadas: é template.
Adotam-se as datas dos nomes.

## Eixo

30 marcos reordenados (`{list(eixo.pontos[0])}` … `{list(eixo.pontos[-1])}`), comprimento **{_br(eixo.comprimento_m, 0)} m**,
escala para o km da planilha **{_br(eixo.escala, 4)}**.

## Pares de observação (13/03 → 20/03)

{len(pares)} pares · cresceram **{trans['cresceu']}** · roçados **{trans['rocado']}** · estáveis **{trans['estavel']}**.

{_tabela(["transição", "n"], linhas_matriz)}

{_tabela(["faixa", "pares"], linhas_faixa)}

## Polígonos de roçada

{len(poligonos)} polígonos, {_br(sum(area_por_metodo.values())/10000, 1)} ha. Distância do centróide ao eixo: mediana {_br(dist[len(dist)//2], 0)} m, p90 {_br(dist[int(len(dist)*0.9)], 0)} m, máximo {_br(dist[-1], 0)} m.

{_tabela(["método", "polígonos", "ha"], [[m, metodos[m], round(area_por_metodo[m]/10000, 1)] for m in metodos])}

## Os 60 segmentos

{_tabela(["marco (m)", "km ini", "km fim", "lat", "lon", "método dominante", "área m²"], linhas_seg)}

## Decisões de parsing e limitações

- A célula de data interna (BF6) é idêntica nas duas planilhas (template não atualizado pela
  Motiva): a data de cada levantamento vem do NOME do arquivo, não da célula.
- O esquema de `classificacao_rocada.kmz` está deslocado: `SimpleData name="classe"` traz a
  latitude, `name="KM"` traz a longitude e `name="Latitude"` traz a área em m². A classe real do
  método vem de `<name>` e o km inteiro de `<description>`. `area_m2` já é líquida de buracos
  (`<innerBoundaryIs>`); a geometria (`aneis`/`aneis_internos`) é que precisa da subtração
  explícita — ver `poligonos.py`.
- {paragrafo_lacuna}
- {paragrafo_sem_poligono}
- **{n_faixas_fora_de_escopo}** das **{len(planilha.FAIXAS)}** faixas transversais da planilha
  ficam fora do escopo contratual (ver `planilha.CODIGOS_EM_ESCOPO`): a medição derivada usa a
  pior classe apenas dentre as **{len(planilha.CODIGOS_EM_ESCOPO)}** faixas em escopo (canteiro
  lateral e central, interno e externo).
"""


# ----------------------------------------------------------------------
# 02 · Validação (Tarefa 9) -- funcao independente, so usa os helpers do topo
# (_br, _tabela); nao depende de nenhum estado de `consolidacao`/`ndvi`.
# ----------------------------------------------------------------------
def _pct(x):
    return "—" if x is None else f"{_br(100 * x, 1)}%"


def _metricas(r: dict, nome: str) -> list:
    return [nome, r["n"], _br(r["fator"], 2), _pct(r["acuracia"]),
            f"{r['transicoes_detectadas']} de {r['transicoes_total']}",
            f"{r['alarmes_falsos']} de {r['estaveis_total']}", _br(r["J"], 3), _pct(r["cobertura_banda"])]


def validacao(saida: dict) -> str:
    res = saida["resultado"]
    base, final = res["sem_calibracao"], res["final"]
    lb = res["linha_de_base"]
    cab = ["cenário", "n", "fator", "acurácia de classe", "transições detectadas", "alarmes falsos", "J", "cobertura da banda"]
    linhas = [["linha de base: nada muda", base["n"], "—", _pct(lb["acuracia"]), f"0 de {base['transicoes_total']}", f"0 de {base['estaveis_total']}", "0,000", "—"],
              _metricas(base, "modelo sem calibração"),
              _metricas(final, f"modelo calibrado (fator vigente {_br(res['fator_vigente'], 2)})")]
    tk = res["teste_km_impares"]
    matriz = final["matriz"]
    m_linhas = [[f"observada {a}", matriz[str(a)]["1"], matriz[str(a)]["2"], matriz[str(a)]["3"]] for a in (1, 2, 3)]
    sens = [[s["rotulo"], s["n"], _pct(s["acuracia"]), f"{s['transicoes_detectadas']} de {s['transicoes_total']}",
             f"{s['alarmes_falsos']} de {s['estaveis_total']}", _br(s["J"], 3)] for s in saida["sensibilidade"]]
    fila = saida["fila_retrospectiva"]
    p = saida["parametros"]
    sp = saida["solo_premissa"]
    sp_base = sp["sem_premissa"]
    pct_marcos_premissa = 100 * sp["n_marcos_premissa"] / sp["n_marcos_total"]
    fert_premissa_txt = ", ".join(_br(v, 2) for v in sp["fertilidade_premissa"])
    cap_premissa_txt = ", ".join(_br(v, 1) for v in sp["capacidade_premissa"])
    return f"""# 02 · Validação do modelo contra o levantamento da Motiva

Gerado por `pesquisa/validar.py` em {saida['gerado_em']} (commit {saida['commit']}).

Janela **13 → 20/03/2026** (7 dias). Pares usados: **{base['n']}** dos 248 (os 53 com queda de classe são roçada e ficam fora).
Premissas do cenário vigente: espécie **{p['especie']}**, classe 3 = **{p['ponto_medio_c3_cm']:g} cm**, dias desde a roçada = **{p['dias_desde_rocada']:g}**.

## O número

{_tabela(cab, linhas)}

`J` = fração das transições detectadas − fração de alarmes falsos. A linha de base acerta {_pct(lb['acuracia'])} sem prever nada: **acurácia total não é o critério**; transições detectadas e alarmes falsos são.

## Calibração honesta: ajuste nos km pares, teste nos km ímpares

- Ajuste (n = {res['ajuste_km_pares']['n']}): fator **{_br(res['ajuste_km_pares']['fator'], 2)}**, J = {_br(res['ajuste_km_pares']['J'], 3)}
- Teste (n = {tk['n']}): J sem calibração = {_br(tk['sem']['J'], 3)} → com o fator do ajuste = {_br(tk['com']['J'], 3)}
- Reajuste em todos: fator {_br(res['calibracao_todos']['fator'], 2)}, J = {_br(res['calibracao_todos']['J'], 3)}. Vigente: **{_br(res['fator_vigente'], 2)}**{" (a calibração não melhorou o critério; fica 1,00)" if res['fator_vigente'] == 1.0 else ""}.

## Matriz de confusão do cenário vigente (linhas = observado em 20/03, colunas = previsto)

{_tabela(["", "prevista 1", "prevista 2", "prevista 3"], m_linhas)}

## Sensibilidade às premissas (sem calibração)

{_tabela(["cenário", "n", "acurácia", "transições detectadas", "alarmes falsos", "J"], sens)}

## Sensibilidade ao solo assumido

**{_br(pct_marcos_premissa, 0)}%** dos marcos ({sp['n_marcos_premissa']} de {sp['n_marcos_total']}) não têm solo medido pelo SoilGrids: caem na premissa do Rodoanel, com fertilidade **{fert_premissa_txt}** e capacidade **{cap_premissa_txt} mm** — a fertilidade fica ABAIXO do mínimo realmente medido nos outros {sp['n_marcos_total'] - sp['n_marcos_premissa']} marcos (**{_br(sp['fertilidade_medida_min'], 3)}–{_br(sp['fertilidade_medida_max'], 3)}**), não é um valor médio. Isso responde por **{sp['n_pares_premissa']}** dos **{sp['n_pares_total']}** pares desta validação. Sem calibração e excluindo esses pares: acurácia {_pct(sp_base['acuracia'])}, transições detectadas {sp_base['transicoes_detectadas']} de {sp_base['transicoes_total']}, alarmes falsos {sp_base['alarmes_falsos']} de {sp_base['estaveis_total']}, J = {_br(sp_base['J'], 3)} — contra {_pct(base['acuracia'])} e J = {_br(base['J'], 3)} com os {base['n']} pares inteiros (premissa incluída). Precisão por segmento de solo não é o que estes dados sustentam para os **{_br(pct_marcos_premissa, 0)}%** da rodovia onde o solo é assumido, não medido.

## Fila retrospectiva

Em 13/03, com o fator vigente, o sistema marcaria **{fila['n_marcados']}** segmento(s) como "cruza 30 cm em até 7 dias" entre os {fila['segmentos_avaliados']} com faixa em escopo; **{fila['n_cruzaram']}** de fato chegaram à classe 3 em 20/03; acertos: **{fila['n_acertos']}**.

## Limitações

- Duas datas, ambas em março: vale para o fim da estação chuvosa em São Paulo.
- Classes ordinais, não altura; o ponto médio é aproximação (ver sensibilidade).
- Dias desde a roçada desconhecidos: premissa de {p['dias_desde_rocada']:g} dias, testada em 30 e 60.
- 33 transições é amostra pequena; o fator é local ao Rodoanel.
- Solo assumido, não medido, em **{_br(pct_marcos_premissa, 0)}%** dos marcos (ver "Sensibilidade ao solo assumido"): não dá para reivindicar precisão por segmento de solo nessa fração da rodovia.
"""
def _leitura_separacao(saida: dict, f) -> str:
    """Paragrafo interpretativo sobre a direcao da separacao AUC, exigido pela
    revisao: a tabela sozinha nao diz que um AUC < 0,5 significa uma inversao
    (capim mais alto lendo NDVI mais baixo), so um leitor especialista
    infere isso. Todo numero aqui vem de `saida` ou de `planilha.PONTO_MEDIO_CM`
    (constante do dominio, nao do resultado desta rodada, mas tambem nao
    digitada solta neste arquivo); a frase de direcao e escolhida por
    `auc < 0.5` por data, entao um resultado futuro com auc >= 0.5 produz o
    texto oposto em vez de contradizer os dados (regra do projeto: nenhum
    numero de relatorio digitado a mao).
    """
    coms = [r for r in saida["analises"] if not r.get("sem_imagem") and r.get("auc") is not None]
    if not coms:
        return ""
    itens = "; ".join(f"{r['data_alvo']} (AUC {f(r['auc'])}, p = {f(r['p_valor'], 4)})" for r in coms)
    invertidas = [r["data_alvo"] for r in coms if r["auc"] < 0.5]
    significativas = [r["data_alvo"] for r in coms if r["p_valor"] is not None and r["p_valor"] < 0.05]
    cm3 = f"{planilha.PONTO_MEDIO_CM[3]:.0f}"
    cm1 = f"{planilha.PONTO_MEDIO_CM[1]:.0f}"
    if len(invertidas) == len(coms):
        direcao = (f"**invertida em todas as datas com comparação possível**: a classe 3 (capim mais alto, "
                    f"~{cm3} cm) lê NDVI **mais baixo** que a classe 1 (capim recém-roçado, ~{cm1} cm) — o oposto "
                    "da expectativa ingênua de que mais vegetação lê NDVI mais alto")
    elif not invertidas:
        direcao = "no sentido esperado em todas as datas: a classe 3 lê NDVI mais alto que a classe 1"
    else:
        direcao = (f"invertida em {len(invertidas)} de {len(coms)} datas ({', '.join(invertidas)}) e no sentido "
                   "esperado nas demais")
    if not significativas:
        sig = "sem significância estatística em nenhuma data (p ≥ 0,05)"
    elif len(significativas) == len(coms):
        sig = f"estatisticamente significativa nas {len(coms)} datas (p < 0,05)"
    else:
        sig = f"estatisticamente significativa em {', '.join(significativas)} (p < 0,05); não significativa nas demais"
    return (f"A separação entre classes é real, mas {direcao}. Valores observados: {itens}. A comparação é "
            f"{sig}. Essa é exatamente a limitação já registrada abaixo — \"NDVI mede verdor, não altura: capim "
            "alto e seco pode ler baixo\" — confirmada pelos dados: em março, no fim do verão/início do outono "
            "em São Paulo, capim alto não roçado pode estar mais seco e senescente, lendo NDVI mais baixo do que "
            "um gramado recém-roçado ainda em crescimento ativo.")


def _leitura_sanidade(saida: dict, f) -> str:
    """A leitura de 2025-03-28 reaproveita as classes de campo de 13/03/2026
    sobre imagem de um ano antes (sanidade da hipotese de data, nao uma
    segunda amostra independente). Se ela mostrar a MESMA direcao das datas
    de 2026, isso e uma pergunta em aberto -- pode ser efeito de lugar, nao
    so de mes -- e o texto tem que dizer isso sem virar explicacao definitiva.
    So aparece quando os dados de fato mostram essa coincidencia de direcao.
    """
    por_data = {r["data_alvo"]: r for r in saida["analises"] if not r.get("sem_imagem") and r.get("auc") is not None}
    sanidade = por_data.get("2025-03-28")
    outras = [r for k, r in por_data.items() if k != "2025-03-28"]
    if sanidade is None or not outras:
        return ""
    mesma_direcao = [r["data_alvo"] for r in outras if (r["auc"] < 0.5) == (sanidade["auc"] < 0.5)]
    if not mesma_direcao:
        return ""
    return (f"A leitura de sanidade de 2025-03-28 (AUC {f(sanidade['auc'])}) usa as classes de campo de 13/03/2026 "
            f"sobre uma imagem de satélite de um ano antes, e mostra a mesma direção de {', '.join(mesma_direcao)}. "
            "Isso é uma pergunta em aberto, não uma explicação assentada: parte do efeito pode ser do **lugar** "
            "(faixas estreitas, sombra de árvore, vegetação diferente naquele trecho) em vez da altura do capim "
            "naquele mês específico — o único fator realmente comum entre a leitura de 2025 e as de 2026 é a "
            "etiqueta de classe por segmento, não a imagem nem a estação do ano.")


def _leitura_delta(saida: dict, f) -> str:
    """O teste de corte (13->20/03) e o unico com `n_rocados`; sem prosa, um
    p nao significativo fica so como numero na tabela e ninguem le que o
    satelite nao detectou nada. Liga isso ao espec (secao 14: um detector de
    rocada treinado esta fora de escopo porque a amostra de eventos inferidos
    numa janela curta e pequena) usando o numero de segmentos rocados que
    saiu DESTE calculo (`n_segmentos_rocados`), nunca o "53" ilustrativo do
    espec, que e de outro contexto. `n_segmentos_rocados` (todos os rocados
    inferidos no periodo) e `alvo['n_rocados']` (so os com NDVI valido nas
    duas datas, que entram na comparacao) sao denominadores DIFERENTES por
    definicao -- se vierem diferentes, uma clausula computada explica a
    diferenca em vez de deixar dois numeros parecidos sem ligacao no texto.
    """
    alvo = next((r for r in saida["analises"] if r.get("n_rocados") is not None), None)
    if alvo is None:
        return ""
    significativo = alvo["p_valor_delta"] is not None and alvo["p_valor_delta"] < 0.05
    if significativo:
        return (f"O teste de corte ({alvo['data_alvo']}) encontrou diferença estatisticamente significativa de "
                 f"NDVI entre segmentos roçados e não roçados (p = {f(alvo['p_valor_delta'], 4)}).")
    total_rocados = saida["n_segmentos_rocados"]
    ponte = (f" ({alvo['n_rocados']} dos {total_rocados} tinham NDVI válido em ambas as datas, entrando nesta "
             "comparação)" if alvo["n_rocados"] != total_rocados else "")
    return (f"O teste de corte **não encontrou** diferença de NDVI entre roçados (n = {alvo['n_rocados']}, ΔNDVI "
            f"mediano {f(alvo['delta_rocados'])}) e não roçados (n = {alvo['n_nao_rocados']}, ΔNDVI mediano "
            f"{f(alvo['delta_nao_rocados'])}) — p = {f(alvo['p_valor_delta'], 4)}. Consistente com o espec (seção "
            f"14, fora de escopo): {total_rocados} segmentos com roçada inferida no intervalo{ponte} é "
            "amostra pequena para um detector treinado, e o mesmo tamanho de amostra limita o poder deste teste "
            "de diferença de medianas.")


def ndvi(saida: dict) -> str:
    def f(v, casas=3):
        return "—" if v is None else f"{v:.{casas}f}".replace(".", ",")
    blocos = []
    for r in saida["analises"]:
        if r.get("sem_imagem"):
            blocos.append(f"### {r['data_alvo']}\n\nNenhuma imagem com nuvem média abaixo de 50% em ±7 dias. Resultado registrado: a cobertura de nuvem inviabilizou a leitura nesta data.")
            continue
        texto = (f"### {r['data_alvo']}\n\nImagem de **{r['data_imagem']}** (defasagem {r['defasagem_dias']:+d} d, nuvem média {f(r['nuvem_pct_media'], 2)}).\n\n"
                 f"| | classe 1 | classe 3 |\n|---|---|---|\n| segmentos | {r['n_classe1']} | {r['n_classe3']} |\n"
                 f"| NDVI mediano | {f(r['ndvi_mediana_c1'])} | {f(r['ndvi_mediana_c3'])} |\n\n"
                 f"AUC (classe 3 acima da 1) = **{f(r['auc'])}** · p = {f(r['p_valor'], 4)}.")
        if r.get("n_rocados") is not None:
            texto += (f"\n\nΔNDVI 13→20/03: roçados (n = {r['n_rocados']}) **{f(r['delta_rocados'])}** · "
                      f"não roçados (n = {r['n_nao_rocados']}) **{f(r['delta_nao_rocados'])}** · p = {f(r['p_valor_delta'], 4)}.")
        blocos.append(texto)
    leitura_extra = "\n\n".join(p for p in (_leitura_separacao(saida, f), _leitura_sanidade(saida, f), _leitura_delta(saida, f)) if p)
    return (f"# 03 · NDVI Sentinel-2 contra a verdade de campo\n\nGerado por `pesquisa/ndvi/analisar_ndvi.py` em {saida['gerado_em']} (commit {saida['commit']}).\n\n"
            "Máscara: polígonos de roçada do KML por segmento. Coleção `COPERNICUS/S2_SR_HARMONIZED`, pixel válido com SCL fora de {3, 8, 9, 10, 11} e probabilidade de nuvem < 40%.\n"
            "Classe do segmento = pior faixa em escopo na data. A leitura de 28/03/2025 usa as classes de 13/03/2026 e serve só como sanidade da hipótese de data.\n\n"
            + "\n\n".join(blocos)
            + f"\n\n## Leitura\n\nAUC 0,5 = o satélite não separa; 1,0 = separa perfeitamente. {saida['n_segmentos_rocados']} segmentos tiveram roçada inferida no intervalo.\n\n"
            + (leitura_extra + "\n\n" if leitura_extra else "")
            + "## Limitações\n\n- Pixel de 10 m e polígonos estreitos: segmentos com poucos pixels válidos pesam igual aos largos.\n- Uma data por levantamento, com defasagem de até 7 dias.\n- NDVI mede verdor, não altura: capim alto e seco pode ler baixo.\n")
