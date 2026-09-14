"""Serie NDVI por segmento, 2019-01-01 ate hoje, uma chamada por ano (limite de payload do getInfo).

    .venv/bin/python -m pesquisa.ndvi.ndvi_serie

So observacoes com nuvem_pct < 20% no segmento entram. Cada linha: km_marco_m, data_imagem, ndvi_mediana, n_pixels, nuvem_pct.

Os dois bugs de contagem achados e corrigidos em `ndvi_datas.estatisticas()` (Tarefa 14) sao armadilhas do Earth Engine,
nao daquela funcao especifica -- se repetem em qualquer reducao nova, e se repetiriam aqui se copiadas sem cuidado:

1. `ee.Image.constant(1)` nao tem projecao fixa: contado direto, `reduceRegions` cai numa grade padrao do Earth Engine
   desalinhada da grade nativa de 10 m do Sentinel-2. Corrigido com `.reproject()` na projecao da banda B4 -- e aqui
   POR IMAGEM, nao uma vez so por periodo (ver o item abaixo sobre `_total_imagem`).
2. O `count` que sai de um reducer COMBINADO (aqui, median+count) NAO e o numero de pixels validos -- vem inflado por
   um fator variavel, medido em `estatisticas()` entre 1,8x e 2,8x contra um `ee.Reducer.count()` isolado. Por isso
   `n_pixels` (e o numerador de `nuvem_pct`) vem de uma chamada SEPARADA com `ee.Reducer.count()` puro, nunca do count
   de um reducer combinado com outra estatistica.

Um TERCEIRO problema, especifico deste modulo (nao existia em `ndvi_datas.py`, que so olha 3 datas isoladas): o
corredor do Rodoanel (29 km) cruza mais de um tile/orbita do Sentinel-2. Duas consequencias, achadas rodando a serie
real de 2019-2026 (nao previstas a priori):

- Em ~350 das ~2.700 datas com imagem no periodo, DUAS imagens (tiles/orbitas diferentes) cobrem o mesmo marco no
  MESMO dia -- ate 4 imagens para um unico (marco, dia). Casar mediana/contagem so por (km_marco_m, data_imagem)
  mistura a mediana de uma imagem com a contagem de OUTRA, e ainda gera duas linhas para a mesma chave primaria de
  `ndvi_serie` (violando a UNIQUE constraint na gravacao). Por isso o casamento e feito por (km_marco_m, imagem_id) --
  `imagem_id` = `img.id()`, que distingue as imagens mesmo na mesma data -- e SO DEPOIS disso, quando mais de uma
  imagem cai no mesmo (marco, data), fica a de menor nuvem_pct (a mais confiavel).
- Reprojetar `total` (pixels totais do poligono) uma vez so por periodo, usando a projecao de UMA imagem de
  referencia (a primeira do periodo), da nuvem_pct LEVEMENTE negativo (ate -0,28%) nas datas cobertas por uma imagem
  de OUTRO tile: a grade de referencia nao bate exatamente com a grade real daquela imagem especifica. Corrigido
  reprojetando `total` na banda B4 de CADA imagem (`_total_imagem`), a mesma disciplina que `estatisticas()` ja usa
  por imagem (aqui o pull e por periodo, entao "por imagem" e o nivel de granularidade certo, nao "por periodo").

Se um ano estourar o limite de payload do getInfo (EEException de memoria/elementos), `_por_ano` divide aquele ano em
dois semestres e concatena os resultados.
"""
from __future__ import annotations

import time
from datetime import date

import ee

from pesquisa.rodoanel import ARQ_MARCOS, ARQ_POLIGONOS, DERIVADOS, banco, marcos, poligonos
from pesquisa.ndvi import geometrias
from pesquisa.ndvi.gee_check import iniciar
from pesquisa.ndvi.ndvi_datas import COLECAO, mascarar, ndvi

ANO_INICIAL = 2019
NUVEM_MAXIMA = 0.2
# "collection query aborted after accumulating over 5000 elements" e o texto REAL devolvido pelo
# Earth Engine para 2019-2022 na primeira rodada real deste modulo (54 marcos x >90 imagens por
# semestre ja estoura o limite de elementos do getInfo do lado do map().flatten()) -- um texto
# diferente do "user memory limit exceeded" da Tarefa 14, mesma familia de erro (payload grande
# demais para o getInfo), e por isso tem que cair no mesmo particionamento em vez de marcar o ano
# inteiro como falho.
_ERROS_DE_PAYLOAD = ("memory limit", "payload", "user memory", "accumulating over", "collection query aborted")


def _juntar_mediana_e_contagem(feats_mediana: list[dict], feats_contagem: list[dict], total_por_imagem: dict) -> list[dict]:
    """Funcao pura (sem `ee`). Casa mediana/contagem/total pela chave (km_marco_m, imagem_id) --
    NUNCA so por (km_marco_m, data_imagem), porque mais de uma imagem pode cobrir o mesmo marco no
    mesmo dia (ver o docstring do modulo). So DEPOIS de casar corretamente por imagem, se mais de
    um candidato sobrar para o mesmo (km_marco_m, data_imagem), fica so o de menor nuvem_pct -- o
    schema (`ndvi_serie.csv`/tabela sqlite) tem uma linha por (km_marco_m, data_imagem), nao por
    imagem."""
    n_por_imagem = {(f["properties"]["km_marco_m"], f["properties"]["imagem_id"]): f["properties"].get("count", 0) or 0
                     for f in feats_contagem}
    candidatos = []
    for f in feats_mediana:
        pr = f["properties"]
        m, imagem_id, data_imagem = pr["km_marco_m"], pr["imagem_id"], pr["data_imagem"]
        n = n_por_imagem.get((m, imagem_id), 0)
        total_m = total_por_imagem.get((m, imagem_id), 0) or 0
        if total_m == 0 or pr.get("median") is None:
            continue
        nuvem = 1 - n / total_m
        if nuvem < NUVEM_MAXIMA:
            candidatos.append({"km_marco_m": m, "data_imagem": data_imagem, "ndvi_mediana": round(pr["median"], 4),
                                "n_pixels": n, "nuvem_pct": round(nuvem, 4)})
    melhor: dict[tuple, dict] = {}
    for c in candidatos:
        chave = (c["km_marco_m"], c["data_imagem"])
        atual = melhor.get(chave)
        if atual is None or c["nuvem_pct"] < atual["nuvem_pct"]:
            melhor[chave] = c
    return list(melhor.values())


def _total_imagem(fc, img):
    """FeatureCollection (nao resolvida) de pixels totais de 10 m por marco desta imagem
    especifica, reprojetados na propria banda B4 dela -- ver o item 1 e o item do tile no docstring
    do modulo. Por imagem, nao por periodo inteiro: uma unica projecao de referencia para o
    periodo dava nuvem_pct levemente negativo nas datas cobertas por uma imagem de outro tile."""
    return (ee.Image.constant(1).rename("total").reproject(img.select("B4").projection())
            .reduceRegions(collection=fc, reducer=ee.Reducer.count(), scale=10))


def _por_periodo(fc, inicio: str, fim: str) -> list[dict]:
    col = ee.ImageCollection(COLECAO).filterBounds(fc.geometry().bounds()).filterDate(inicio, fim)
    if col.size().getInfo() == 0:
        return []

    def com_identidade(img, feats):
        return feats.map(lambda f: f.set("data_imagem", img.date().format("YYYY-MM-dd")).set("imagem_id", img.id()))

    def medianas_imagem(img):
        return com_identidade(img, ndvi(mascarar(img)).reduceRegions(collection=fc, reducer=ee.Reducer.median(), scale=10))

    def contagens_imagem(img):
        return com_identidade(img, ndvi(mascarar(img)).reduceRegions(collection=fc, reducer=ee.Reducer.count(), scale=10))

    def totais_imagem(img):
        return com_identidade(img, _total_imagem(fc, img))

    feats_mediana = col.map(medianas_imagem).flatten().getInfo()["features"]
    feats_contagem = col.map(contagens_imagem).flatten().getInfo()["features"]
    feats_total = col.map(totais_imagem).flatten().getInfo()["features"]
    total_por_imagem = {(f["properties"]["km_marco_m"], f["properties"]["imagem_id"]): f["properties"].get("count", 0) or 0
                         for f in feats_total}
    return _juntar_mediana_e_contagem(feats_mediana, feats_contagem, total_por_imagem)


def _por_ano(fc, ano: int) -> list[dict]:
    try:
        return _por_periodo(fc, f"{ano}-01-01", f"{ano + 1}-01-01")
    except ee.EEException as e:
        if not any(t in str(e).lower() for t in _ERROS_DE_PAYLOAD):
            raise
        print(f"  {ano}: payload estourou no ano inteiro ({e}); dividindo em semestres")
        return (_por_periodo(fc, f"{ano}-01-01", f"{ano}-07-01") +
                _por_periodo(fc, f"{ano}-07-01", f"{ano + 1}-01-01"))


def _por_ano_com_retentativa(fc, ano: int) -> list[dict]:
    """Uma tentativa extra apos 20s antes de desistir do ano: o pull cobre 8 anos numa unica
    execucao longa, e um rate-limit transitorio do Earth Engine nao pode derrubar anos que ja
    teriam funcionado numa segunda tentativa."""
    try:
        return _por_ano(fc, ano)
    except Exception as e:
        print(f"  {ano}: falhou na 1a tentativa ({e}); esperando 20s e tentando de novo")
        time.sleep(20)
        return _por_ano(fc, ano)


def main() -> None:
    iniciar()
    pols = poligonos.ler_poligonos(ARQ_POLIGONOS)
    eixo = marcos.carregar(ARQ_MARCOS)
    fc = geometrias.feature_collection(geometrias.aneis_por_marco(pols, poligonos.atribuir(pols, eixo)))
    linhas = []
    anos_ok, anos_com_falha = [], []
    for ano in range(ANO_INICIAL, date.today().year + 1):
        try:
            parte = _por_ano_com_retentativa(fc, ano)
        except Exception as e:
            print(f"{ano}: FALHOU (2 tentativas) -- {e}")
            anos_com_falha.append(ano)
            continue
        print(f"{ano}: {len(parte)} observacoes limpas")
        linhas += parte
        anos_ok.append(ano)
    linhas.sort(key=lambda l: (l["km_marco_m"], l["data_imagem"]))
    banco.gravar_csv(DERIVADOS / "ndvi_serie.csv", linhas)
    banco.substituir(banco.abrir(), "ndvi_serie", linhas)
    print(f"-> {len(linhas)} linhas em ndvi_serie.csv")
    print(f"anos ok: {anos_ok}")
    if anos_com_falha:
        print(f"ANOS QUE FALHARAM (fora da serie): {anos_com_falha}")


if __name__ == "__main__":
    main()
