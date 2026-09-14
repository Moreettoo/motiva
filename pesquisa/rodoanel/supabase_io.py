"""Gravacao idempotente no Supabase (schema ia) com a chave secreta do .env da raiz.

Chaves de idempotencia (spec 6.3): trechos por (rodovia, km_marco_m); levantamentos
por (trecho_id, faixa_codigo, data); medicoes e execucoes derivadas sao apagadas e
regravadas por (trecho, data, origem). Rodar duas vezes deixa o banco igual.
"""
from __future__ import annotations

import os
from datetime import date

from dotenv import load_dotenv
from supabase import create_client

try:
    from supabase import ClientOptions
except ImportError:                                  # versoes mais antigas
    from supabase.lib.client_options import ClientOptions

from . import ALTURA_LIMITE_CM, CONCESSIONARIA, ESPECIE_PREMISSA, RAIZ, RODOVIA, UF
from .planilha import CODIGOS_EM_ESCOPO, NOME_POR_CODIGO, PONTO_MEDIO_CM, Levantamento
from .segmentos import Segmento, execucoes_inferidas, medicao_derivada

LOTE = 500


def cliente():
    load_dotenv(RAIZ / ".env")
    return create_client(os.environ["SUPABASE_URL"].strip(), os.environ["SUPABASE_SERVICE_KEY"].strip(),
                         options=ClientOptions(schema=os.getenv("DB_SCHEMA", "ia")))


def _lotes(linhas: list[dict]):
    for i in range(0, len(linhas), LOTE):
        yield linhas[i:i + LOTE]


def concessionaria_id(sb, nome: str = CONCESSIONARIA) -> int:
    d = sb.table("concessionarias").select("id").eq("nome", nome).execute().data
    if not d:
        raise LookupError(f"concessionaria {nome!r} nao existe: a migracao 20260913101000 nao foi aplicada")
    return int(d[0]["id"])


def linha_trecho(seg: Segmento, solo: dict | None, conc_id: int) -> dict:
    # Sem poligono no KML (6 dos 60 marcos, ver 01-consolidacao.md): metodo E area ficam
    # vazios -- o dataclass Segmento usa 0.0 como valor de ausencia (montar_segmentos), mas
    # gravar 0.0 no banco afirmaria "area rocavel = zero", que e um numero inventado, nao
    # a lacuna real. So area_rocada_m2 acompanha metodo_rocada: os dois ou os dois vazios.
    sem_poligono = seg.metodo_rocada is None
    metodo_txt = "sem poligono de rocada no KML" if sem_poligono else seg.metodo_rocada
    area_txt = "area nao registrada" if sem_poligono else f"{seg.area_rocada_m2:.0f} m2 rocaveis"
    obs = (f"Segmento do levantamento unifilar da Motiva (RA-ROC-LIMP), marco {seg.km_marco_m} m. "
           f"Metodo de rocada predominante: {metodo_txt} ({area_txt}). "
           f"Especie assumida: braquiaria (premissa, nao medida). "
           f"Limite contratual Artesp Anexo 06 b.1.1: 30 cm.")
    return {
        "rodovia": RODOVIA, "km_inicio": seg.km_inicio, "km_fim": seg.km_fim, "sentido": None, "uf": UF,
        "latitude": seg.latitude, "longitude": seg.longitude, "especie": ESPECIE_PREMISSA,
        "altura_limite_cm": ALTURA_LIMITE_CM, "tipo_pista": "faixa de dominio", "observacoes": obs,
        "concessionaria_id": conc_id, "ativo": True, "fonte_cadastro": "levantamento_motiva",
        "km_marco_m": seg.km_marco_m, "metodo_rocada": seg.metodo_rocada,
        "area_rocada_m2": None if sem_poligono else seg.area_rocada_m2,
        "fertilidade_solo": solo["fertilidade"] if solo else None,
        "capacidade_agua_solo_mm": solo["capacidade_mm"] if solo else None,
        "solo_fonte": solo["fonte"] if solo else None,
    }


def ids_por_marco(sb) -> dict[int, int]:
    d = (sb.table("trechos").select("id,km_marco_m").eq("rodovia", RODOVIA)
         .not_.is_("km_marco_m", "null").execute().data)
    return {int(r["km_marco_m"]): int(r["id"]) for r in d}


def upsert_trechos(sb, segmentos: list[Segmento], solo_por_marco: dict[int, dict], conc_id: int) -> dict[int, int]:
    linhas = [linha_trecho(s, solo_por_marco.get(s.km_marco_m), conc_id) for s in segmentos]
    sb.table("trechos").upsert(linhas, on_conflict="rodovia,km_marco_m").execute()
    return ids_por_marco(sb)


def linhas_levantamento(lev: Levantamento, ids: dict[int, int]) -> list[dict]:
    return [{"trecho_id": ids[o.km_m], "faixa_codigo": o.faixa, "data": lev.data.isoformat(), "classe": o.classe,
             "altura_estimada_cm": PONTO_MEDIO_CM[o.classe] if o.classe else None, "arquivo_origem": lev.arquivo,
             "data_no_arquivo": lev.data_interna.isoformat() if lev.data_interna else None}
            for o in lev.observacoes]


def upsert_levantamentos(sb, linhas: list[dict]) -> None:
    for lote in _lotes(linhas):
        sb.table("levantamentos").upsert(lote, on_conflict="trecho_id,faixa_codigo,data").execute()


def linhas_medicoes(lev: Levantamento, ids: dict[int, int]) -> list[dict]:
    return [{"trecho_id": ids[m], "data": lev.data.isoformat(), "altura_cm": PONTO_MEDIO_CM[classe],
             "origem": "levantamento_classe", "classe": classe, "faixa_codigo": faixa}
            for m, (classe, faixa) in sorted(medicao_derivada(lev).items())]


def regravar_medicoes(sb, data: date, ids: dict[int, int], linhas: list[dict]) -> None:
    (sb.table("medicoes").delete().eq("origem", "levantamento_classe").eq("data", data.isoformat())
     .in_("trecho_id", list(ids.values())).execute())
    for lote in _lotes(linhas):
        sb.table("medicoes").insert(lote).execute()


def linhas_execucoes(lev1: Levantamento, lev2: Levantamento, ids: dict[int, int], extensao_por_marco: dict[int, float]) -> list[dict]:
    return [{"trecho_id": ids[e["km_marco_m"]], "data_execucao": e["data_execucao"].isoformat(),
             "km_rocados": round(extensao_por_marco[e["km_marco_m"]], 3),
             "altura_antes_cm": e["altura_antes_cm"], "altura_depois_cm": e["altura_depois_cm"],
             "origem": "inferida_levantamento", "observacao": e["observacao"]}
            for e in execucoes_inferidas(lev1, lev2)]


def regravar_execucoes(sb, data: date, ids: dict[int, int], linhas: list[dict]) -> None:
    (sb.table("execucoes").delete().eq("origem", "inferida_levantamento").eq("data_execucao", data.isoformat())
     .in_("trecho_id", list(ids.values())).execute())
    for lote in _lotes(linhas):
        sb.table("execucoes").insert(lote).execute()


def _linha_validacao(saida: dict, r: dict, p: dict, fator: float, vigente: bool, observacoes: str | None, n_rocados: int) -> dict:
    tk = saida["resultado"]["teste_km_impares"]
    return {
        "rodovia": RODOVIA, "janela_de": saida["janela"]["de"], "janela_ate": saida["janela"]["ate"],
        "especie": p["especie"], "ponto_medio_classe3_cm": p["ponto_medio_c3_cm"],
        "dias_desde_rocada_premissa": p["dias_desde_rocada"], "fator_calibracao": fator,
        "n_pares_total": r["n"] + n_rocados, "n_pares_usados": r["n"], "n_rocados_excluidos": n_rocados,
        "acuracia_classe": r["acuracia"], "mae_ordinal": r["mae_ordinal"],
        "transicoes_total": r["transicoes_total"], "transicoes_detectadas": r["transicoes_detectadas"],
        "estaveis_total": r["estaveis_total"], "alarmes_falsos": r["alarmes_falsos"],
        "cobertura_banda": r["cobertura_banda"], "matriz_confusao": r["matriz"],
        "parametros": {"parametros": p, "linha_de_base": saida["resultado"]["linha_de_base"],
                       "ajuste_km_pares": saida["resultado"]["ajuste_km_pares"],
                       "calibracao_todos_os_pares": saida["resultado"]["calibracao_todos"],
                       "teste_km_impares": {k: v for k, v in tk.items() if k == "n"}
                       | {"J_sem": tk["sem"]["J"], "J_com": tk["com"]["J"],
                          "acuracia_sem": tk["sem"]["acuracia"], "acuracia_com": tk["com"]["acuracia"]},
                       "fila_retrospectiva": saida["fila_retrospectiva"]},
        "commit_git": saida["commit"], "observacoes": observacoes, "vigente": vigente,
    }


def gravar_validacao(sb, saida: dict, ids: dict[int, int], pares_rocados: list[dict], vigente: bool = True) -> int:
    """Grava a validacao vigente (com pares) e as de sensibilidade (sem pares). Devolve o id da vigente.

    A linha vigente e idempotente por rodovia: `publicar_rodoanel.py` publica UM evento
    coerente (a validacao/calibracao vigentes do Rodoanel), nao um historico incremental --
    a vigente antiga e apagada (nao so desmarcada) antes da nova entrar, e seus pares vao
    junto explicitamente (nao contamos so com o `on delete cascade` da migracao: se o
    schema mudar essa clausula depois, a funcao continua correta). Sem isso, rodar o
    publicador duas vezes duplicaria validacoes e validacao_pares a cada execucao,
    quebrando a idempotencia que a Tarefa 13 pede. `ia.calibracoes` (que referencia
    validacao_id sem cascade) e limpo por quem chama, em `publicar_rodoanel.main`, ANTES
    desta funcao -- senao o delete abaixo bateria em violacao de chave estrangeira.
    """
    res, p = saida["resultado"], saida["parametros"]
    if vigente:
        antigas = sb.table("validacoes").select("id").eq("rodovia", RODOVIA).eq("vigente", True).execute().data
        ids_antigos = [int(a["id"]) for a in antigas]
        if ids_antigos:
            sb.table("validacao_pares").delete().in_("validacao_id", ids_antigos).execute()
            sb.table("validacoes").delete().in_("id", ids_antigos).execute()
    obs = None if res["fator_vigente"] != 1.0 else "calibracao nao melhorou o criterio J; fator 1,0 mantido"
    principal = sb.table("validacoes").insert(_linha_validacao(saida, res["final"], p, res["fator_vigente"], vigente, obs, len(pares_rocados))).execute().data[0]
    vid = int(principal["id"])
    pares = [{"validacao_id": vid, "trecho_id": ids[x["km_marco_m"]], "faixa_codigo": x["faixa"],
              "classe_inicial": x["classe_inicial"], "classe_final_observada": x["classe_final_observada"],
              "classe_final_prevista": x["classe_final_prevista"], "altura_inicial_cm": x["altura_inicial_cm"],
              "q10_cm": x["q10_cm"], "q50_cm": x["q50_cm"], "q90_cm": x["q90_cm"], "incluido": True, "motivo_exclusao": None}
             for x in saida["pares"]]
    pares += [{"validacao_id": vid, "trecho_id": ids[int(x["km_marco_m"])], "faixa_codigo": x["faixa"],
               "classe_inicial": int(x["classe_d1"]), "classe_final_observada": int(x["classe_d2"]),
               "classe_final_prevista": None, "altura_inicial_cm": None, "q10_cm": None, "q50_cm": None, "q90_cm": None,
               "incluido": False, "motivo_exclusao": "rocada_inferida"} for x in pares_rocados]
    for lote in _lotes(pares):
        sb.table("validacao_pares").insert(lote).execute()
    # As linhas de sensibilidade sao regravadas a cada publicacao; a vigente foi apagada e
    # regravada acima pelo mesmo motivo (idempotencia do publicador, nao historico).
    sb.table("validacoes").delete().eq("rodovia", RODOVIA).eq("observacoes", "sensibilidade").execute()
    for s in saida["sensibilidade"]:
        sb.table("validacoes").insert(_linha_validacao(saida, s, s["parametros"], 1.0, False, "sensibilidade", len(pares_rocados))).execute()
    return vid


def ativar_calibracao(sb, validacao_id: int, fator: float, especie: str = ESPECIE_PREMISSA) -> None:
    sb.table("calibracoes").update({"ativo": False}).eq("rodovia", RODOVIA).eq("especie", especie).eq("ativo", True).execute()
    sb.table("calibracoes").insert({"validacao_id": validacao_id, "rodovia": RODOVIA, "especie": especie,
                                    "fator": fator, "ativo": True}).execute()


def upsert_ndvi(sb, linhas: list[dict]) -> None:
    for lote in _lotes(linhas):
        sb.table("ndvi_observacoes").upsert(lote, on_conflict="trecho_id,data_imagem,mascara").execute()


def inserir_ndvi_analise(sb, linha: dict) -> int:
    return int(sb.table("ndvi_analises").insert(linha).execute().data[0]["id"])
