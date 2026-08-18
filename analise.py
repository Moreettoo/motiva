"""
A analise de um trecho: clima, solo, modelo, prazo. Uma copia so.

`analisar_lote.py` (o lote diario, que grava) e `main.py` (a API de
desenvolvimento) precisavam do mesmo caminho, e ate o modelo v3.1 tinham duas
copias dele -- com `buscar_clima` e `prever_crescimento` escritos duas vezes,
que era sustentavel enquanto a conta era "media de sete variaveis, multiplica
por dias". Nao e mais: agora ha balanco de agua no solo com aquecimento, busca
de solo no SoilGrids e varredura de 120 horizontes. Duas copias disso divergem.

O QUE O MODELO NOVO MUDOU
-------------------------
O `modelo_vegetacao.pkl` respondia UM numero, `crescimento_medio_diario_cm`, e
tudo depois dele era multiplicacao: altura de hoje = medicao + cm/dia x dias;
dias ate o limite = (limite - altura) / cm/dia. Reta.

O `modelo_gramas.pkl` responde `crescimento_total_cm` do PERIODO, em intervalo
(q10/q50/q90), e a resposta nao e linear no tamanho do periodo. Entao:

  altura de hoje    sai de uma previsao com o clima OBSERVADO da janela
                    [ultima medicao, hoje). O modelo ve os dias que de fato
                    passaram, e nao uma taxa de hoje aplicada para tras.

  dias ate o limite saem de varrer horizontes de 1 a 120 dias e achar o
                    primeiro que cruza (`modelo.curva` + `modelo.cruzamento`).
"""

from datetime import date

import clima
import modelo
import solo


def resolver_ambiente(lat: float, lon: float, hoje: date):
    """(serie de clima, solo) para um ponto. As duas consultas externas."""
    return clima.buscar_serie(lat, lon, hoje), solo.buscar(lat, lon)


def analisar_trecho(sb, t: dict, serie: clima.Serie, terra: solo.Solo, hoje: date) -> dict:
    """Roda o modelo para um trecho. Devolve os numeros, sem gravar nada.

    Levanta `LookupError` quando falta o dado de entrada (medicao), que e o
    unico caso em que o trecho deve ser pulado em silencio.
    """
    m = (sb.table("medicoes").select("data,altura_cm").eq("trecho_id", t["id"])
         .order("data", desc=True).order("id", desc=True).limit(1).execute().data)
    if not m:
        raise LookupError("sem medicao")

    altura_med = float(m[0]["altura_cm"])
    data_med = date.fromisoformat(m[0]["data"])

    # `dias_desde_rocada_inicio` e feature do modelo, e agora ela existe de
    # verdade: `ia.execucoes` guarda o que foi roçado e quando. Sem execucao
    # nenhuma, o trecho e tratado como ha muito sem corte (fase rapida da
    # curva), que e a leitura conservadora -- preve mais crescimento, nao menos.
    ex = (sb.table("execucoes").select("data_execucao").eq("trecho_id", t["id"])
          .order("data_execucao", desc=True).limit(1).execute().data)
    data_rocada = date.fromisoformat(ex[0]["data_execucao"]) if ex else None
    dias_rocada_hoje = float((hoje - data_rocada).days) if data_rocada else 200.0

    limite = float(t["altura_limite_cm"])
    lat = float(t["latitude"])
    especie = t["especie"]

    # --- 1. atualizar a altura ate hoje ------------------------------------
    #
    # Antes isto era `altura_medida + cm_dia x dias_decorridos`. Agora e uma
    # PREVISAO com o clima que de fato aconteceu naqueles dias: a janela
    # [medicao, hoje) esta inteira no passado da serie, entao o modelo ve
    # temperatura, chuva e agua no solo observadas, e nao uma media projetada.
    decorridos = (hoje - data_med).days
    fr_med, en_med = clima.balanco_solo(serie.dias, terra.capacidade_mm, altura_med)
    crescido = 0.0
    janela_medicao = 0

    if decorridos >= 1:
        dias_rocada_med = (max(0.0, float((data_med - data_rocada).days))
                           if data_rocada else 200.0)
        linha = clima.montar_features(
            especie=especie, altura_cm=altura_med, dias_desde_rocada=dias_rocada_med,
            latitude=lat, serie=serie, inicio=data_med, dias_periodo=decorridos,
            fertilidade=terra.fertilidade, capacidade_mm=terra.capacidade_mm,
            fracoes=fr_med, encharcado=en_med)
        janela_medicao = linha["dias_periodo"]
        crescido = float(modelo.prever([linha])[0, 1])

    altura_hoje = max(altura_med + crescido, 0.5)

    # --- 2. a curva daqui para a frente ------------------------------------
    fr, en = clima.balanco_solo(serie.dias, terra.capacidade_mm, altura_hoje)

    def montar(d):
        return clima.montar_features(
            especie=especie, altura_cm=altura_hoje, dias_desde_rocada=dias_rocada_hoje,
            latitude=lat, serie=serie, inicio=hoje, dias_periodo=d,
            fertilidade=terra.fertilidade, capacidade_mm=terra.capacidade_mm,
            fracoes=fr, encharcado=en)

    Q = modelo.curva(montar)
    if len(Q) == 0:
        raise RuntimeError("a serie de clima nao cobre nem um dia a frente")

    dias, taxa = modelo.cruzamento(altura_hoje, limite, Q[:, 1])
    cedo, tarde = modelo.banda_de_cruzamento(altura_hoje, limite, Q)

    # `altura_prevista_cm` sempre significou "daqui a 30 dias" e continua
    # significando. O horizonte vem do modelo, nao de `taxa x 30`: sao
    # perguntas diferentes e a resposta certa para esta e a de 30 dias.
    ref = min(modelo.JANELA_REFERENCIA, len(Q))
    prev30 = float(Q[ref - 1, 1])

    # O intervalo apresentado e o do horizonte que decide: onde cruza, ou o
    # horizonte de referencia quando nao cruza dentro da varredura.
    onde = dias if dias and 1 <= dias <= len(Q) else ref
    q10, q50, q90 = (float(x) for x in Q[onde - 1])

    return {
        "altura_med": altura_med, "data_med": data_med, "decorridos": decorridos,
        "janela_medicao": janela_medicao, "crescido": crescido,
        "altura_hoje": altura_hoje, "limite": limite,
        "dias": dias, "taxa": taxa, "prev30": prev30,
        "cedo": cedo, "tarde": tarde,
        "horizonte_intervalo": onde, "q10": q10, "q50": q50, "q90": q90,
        "dias_rocada": dias_rocada_hoje, "data_rocada": data_rocada,
        "janela": montar(onde), "n_horizontes": len(Q), "solo": terra,
    }


def frase_da_banda(r: dict) -> str:
    """O intervalo em DIAS, escrito para o gestor.

    Em dias e nao em centimetros de proposito: "+5,6 a +9,7 cm" nao ajuda
    ninguem a marcar equipe; "entre 28 e 61 dias" ajuda.
    """
    if r["cedo"] is None:
        return "Intervalo 80% do modelo: não cruza o limite em 120 dias"
    if r["tarde"] is None:
        return (f"Intervalo 80% do modelo: cruza o limite a partir de {r['cedo']} dias; "
                f"no ritmo pessimista pode não cruzar em 120 dias")
    return (f"Intervalo 80% do modelo: cruza o limite entre {r['cedo']} e "
            f"{r['tarde']} dias (mediana {r['dias']})")


def contexto_para_llm(t: dict, r: dict, hoje: date) -> dict:
    """O que a IA 2 recebe. Em snake_case e portugues, igual ao painel.

    Nao e preciosismo: no simulador, a versao em camelCase fez a LLM ler
    `diaQueCruza: 61` como prazo curto e devolver `critica`. Nomear o campo do
    jeito que as instrucoes falam dele custa nada e fecha essa porta.
    """
    j = r["janela"]
    terra = r["solo"]
    return {
        "rodovia": t["rodovia"],
        "km": f'{t["km_inicio"]} a {t["km_fim"]}',
        "tipo_pista": t.get("tipo_pista"),
        "especie": t["especie"],
        "altura_atual_cm": round(r["altura_hoje"], 1),
        "altura_limite_cm": r["limite"],
        "dias_ate_atingir_limite": r["dias"],
        "quando_cruza_o_limite": {
            "mediana_dias": r["dias"],
            "mais_cedo_dias": r["cedo"],
            "mais_tarde_dias": r["tarde"],
            "nota": ("mais_tarde nulo significa que no ritmo pessimista o trecho "
                     "pode nem cruzar dentro de 120 dias"),
        },
        "crescimento_ate_o_limite": {
            "horizonte_dias": r["horizonte_intervalo"],
            "q10_cm": round(r["q10"], 2),
            "q50_cm": round(r["q50"], 2),
            "q90_cm": round(r["q90"], 2),
        },
        "crescimento_medio_cm_por_dia": round(r["taxa"], 3),
        "dias_desde_a_ultima_rocada": int(r["dias_rocada"]),
        "temperatura_media_prevista_c": j["temperatura_media_c"],
        "temperatura_minima_prevista_c": j["temperatura_min_c"],
        "chuva_total_prevista_mm": j["precipitacao_total_mm"],
        "dias_com_chuva_previstos": j["dias_com_chuva"],
        "agua_no_solo_media_pct": j["agua_solo_media_pct"],
        "solo": {
            "fertilidade_0_a_1": round(terra.fertilidade, 2),
            "capacidade_de_agua_mm": round(terra.capacidade_mm, 1),
            "origem": ("estimado do mapa SoilGrids" if terra.fonte == "soilgrids"
                       else "premissa, o SoilGrids nao cobre este ponto"),
        },
        "observacoes_do_trecho": t.get("observacoes") or "sem observacoes",
        "data_de_hoje": hoje.isoformat(),
    }


def linha_de_previsao(trecho_id: int, r: dict) -> dict:
    """A linha de `ia.previsoes`, do jeito que as duas pontas gravam."""
    return {
        "trecho_id": trecho_id,
        "crescimento_cm_dia": round(r["taxa"], 4),
        "altura_atual_cm": round(r["altura_hoje"], 2),
        "altura_prevista_cm": round(r["altura_hoje"] + r["prev30"], 2),
        "dias_ate_limite": r["dias"],
        "temperatura_media_c": round(r["janela"]["temperatura_media_c"], 2),
        "chuva_total_mm": round(r["janela"]["precipitacao_total_mm"], 2),
    }
