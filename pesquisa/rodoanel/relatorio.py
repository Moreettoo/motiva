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


def _tabela(cabecalho: list[str], linhas: list[list]) -> str:
    fmt = lambda v: f"{v:.3f}".replace(".", ",") if isinstance(v, float) else str(v)
    out = ["| " + " | ".join(cabecalho) + " |", "|" + "---|" * len(cabecalho)]
    out += ["| " + " | ".join(fmt(v) for v in l) + " |" for l in linhas]
    return "\n".join(out)


def _br(v: float, casas: int = 2) -> str:
    """Formata um float com virgula decimal (padrao BR) fora de tabela --
    mesma conversao que _tabela ja aplica por celula, reaproveitada na prosa
    corrida do relatorio (que e a unica parte deste modulo com acentuacao
    normal em portugues -- ver o docstring do modulo)."""
    return f"{v:.{casas}f}".replace(".", ",")


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
            f"por `marcos.ORDEM_CORRIGIDA`; mesmo corrigido, resta uma lacuna real de **{lacuna_m:,.0f} m** "
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
            f"(**{100 * len(na_lacuna) / len(discordantes):.0f}%**). Não é erro de projeção: mesmo o "
            f"pior caso (polígono {pior[0].indice}, descrito no km {pior[0].km_descricao}, projetando "
            f"a {_br(pior[1])} km de distância disso) fica a só **{pior[2]:.0f} m** do eixo — bem abaixo "
            f"da mediana geral de **{mediana_dist_m:.0f} m**. É lacuna de levantamento da Motiva, não "
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

30 marcos reordenados (`{list(eixo.pontos[0])}` … `{list(eixo.pontos[-1])}`), comprimento **{eixo.comprimento_m:,.0f} m**,
escala para o km da planilha **{_br(eixo.escala, 4)}**.

## Pares de observação (13/03 → 20/03)

{len(pares)} pares · cresceram **{trans['cresceu']}** · roçados **{trans['rocado']}** · estáveis **{trans['estavel']}**.

{_tabela(["transição", "n"], linhas_matriz)}

{_tabela(["faixa", "pares"], linhas_faixa)}

## Polígonos de roçada

{len(poligonos)} polígonos, {sum(area_por_metodo.values())/10000:.1f} ha. Distância do centróide ao eixo: mediana {dist[len(dist)//2]:.0f} m, p90 {dist[int(len(dist)*0.9)]:.0f} m, máximo {dist[-1]:.0f} m.

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
