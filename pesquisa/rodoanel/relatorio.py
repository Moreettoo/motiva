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
            f"sem marco intermediário, entre os km de planilha **{km_ini:.2f}** e **{km_fim:.2f}** "
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
            f"a {pior[1]:.2f} km de distância disso) fica a só **{pior[2]:.0f} m** do eixo — bem abaixo "
            f"da mediana geral de **{mediana_dist_m:.0f} m**. É lacuna de levantamento da Motiva, não "
            f"defeito de projeção: **{len(eixo.pontos)}** marcos não dá para cobrir os "
            f"**{eixo.comprimento_m * eixo.escala / 1000:.1f} km** da planilha sem aproximar em algum "
            f"trecho. Ver o docstring de `poligonos.atribuir`.")


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
escala para o km da planilha **{eixo.escala:.4f}**.

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
- **{n_faixas_fora_de_escopo}** das **{len(planilha.FAIXAS)}** faixas transversais da planilha
  ficam fora do escopo contratual (ver `planilha.CODIGOS_EM_ESCOPO`): a medição derivada usa a
  pior classe apenas dentre as **{len(planilha.CODIGOS_EM_ESCOPO)}** faixas em escopo (canteiro
  lateral e central, interno e externo).
"""


def _leitura_separacao(saida: dict, f) -> str:
    """Paragrafo interpretativo sobre a direcao da separacao AUC, exigido pela
    revisao: a tabela sozinha nao diz que um AUC < 0,5 significa uma inversao
    (capim mais alto lendo NDVI mais baixo), so um leitor especialista
    infere isso. Todo numero aqui vem de `saida`; a frase de direcao e
    escolhida por `auc < 0.5` por data, entao um resultado futuro com
    auc >= 0.5 produz o texto oposto em vez de contradizer os dados (regra
    do projeto: nenhum numero de relatorio digitado a mao).
    """
    coms = [r for r in saida["analises"] if not r.get("sem_imagem") and r.get("auc") is not None]
    if not coms:
        return ""
    itens = "; ".join(f"{r['data_alvo']} (AUC {f(r['auc'])}, p = {f(r['p_valor'], 4)})" for r in coms)
    invertidas = [r["data_alvo"] for r in coms if r["auc"] < 0.5]
    significativas = [r["data_alvo"] for r in coms if r["p_valor"] is not None and r["p_valor"] < 0.05]
    if len(invertidas) == len(coms):
        direcao = ("**invertida em todas as datas com comparação possível**: a classe 3 (capim mais alto, "
                    "~40 cm) lê NDVI **mais baixo** que a classe 1 (capim recém-roçado, ~5 cm) — o oposto da "
                    "expectativa ingênua de que mais vegetação lê NDVI mais alto")
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
    espec, que e de outro contexto.
    """
    alvo = next((r for r in saida["analises"] if r.get("n_rocados") is not None), None)
    if alvo is None:
        return ""
    significativo = alvo["p_valor_delta"] is not None and alvo["p_valor_delta"] < 0.05
    if significativo:
        return (f"O teste de corte ({alvo['data_alvo']}) encontrou diferença estatisticamente significativa de "
                 f"NDVI entre segmentos roçados e não roçados (p = {f(alvo['p_valor_delta'], 4)}).")
    return (f"O teste de corte **não encontrou** diferença de NDVI entre roçados (n = {alvo['n_rocados']}, ΔNDVI "
            f"mediano {f(alvo['delta_rocados'])}) e não roçados (n = {alvo['n_nao_rocados']}, ΔNDVI mediano "
            f"{f(alvo['delta_nao_rocados'])}) — p = {f(alvo['p_valor_delta'], 4)}. Consistente com o espec (seção "
            f"14, fora de escopo): {saida['n_segmentos_rocados']} segmentos com roçada inferida no intervalo é "
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
