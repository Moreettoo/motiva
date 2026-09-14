"""Poe o Rodoanel no Supabase: trechos, os dois levantamentos, medicoes, execucoes inferidas,
solo por trecho, a validacao vigente (com pares) e a calibracao.

    .venv/bin/python -m pesquisa.publicar_rodoanel                # ensaio: so conta, sem rede
    .venv/bin/python -m pesquisa.publicar_rodoanel --gravar

Sem --gravar nada e escrito e o Supabase nunca e contatado (as contagens de levantamento/
medicao/execucao saem dos mesmos arquivos locais, com ids de rascunho, como no ensaio de
`importar_levantamento.py`). Pre-condicoes para --gravar: migracoes 20260913100000 e
20260913101000 aplicadas; consolidar, validar e solo_km ja rodados (derivados presentes).
Idempotente: rodar duas vezes deixa o banco igual.

Decisao humana sobre a calibracao (2026-09-14, ver docs/superpowers/sdd/2026-09-13-dados-reais-rodoanel/
task-13-report.md): a regra da spec 7.3 escolheria o fator 1,15 sozinha porque ele maximiza
J refitando em TODOS os 195 pares -- e circular, refita nos mesmos pares que avalia. O teste
honesto (ajusta so nos km pares, fator 1,05, J=+0,254; testa nos km impares, J cai pra +0,033
e a acuracia cai de 0,598 pra 0,478) mostra o oposto: a calibracao piora fora da amostra.
O vigente fica 1,0 (calibracao DESLIGADA); o 1,15 fica registrado como testado e rejeitado,
com a evidencia, em ia.calibracoes (ativo=false) e no `parametros`/`observacoes` da validacao
vigente -- nunca 1,15 como vigente.
"""
from __future__ import annotations

import argparse
import json
from datetime import date

from pesquisa.rodoanel import ARQ_LEV_1, ARQ_LEV_2, ARQ_MARCOS, DERIVADOS, ESPECIE_PREMISSA, RODOVIA, banco, decisao, marcos, planilha, relatorio, solo_km, supabase_io
from pesquisa.rodoanel.segmentos import MARCOS, Segmento, limites_km

# A decisao humana (fator vigente 1,0, fator 1,15 testado e rejeitado) mora em
# `pesquisa/rodoanel/decisao.py`, um ponto so, compartilhado com o renderizador
# de `docs/pesquisa/02-validacao.md`. Antes ela vivia AQUI e so aqui: o banco
# recebia 1,0 e o markdown continuava dizendo "Vigente: 1,15".
FATOR_VIGENTE = decisao.FATOR_VIGENTE
FATOR_REJEITADO = decisao.FATOR_REJEITADO


def _segmentos() -> list[Segmento]:
    return [Segmento(int(r["km_marco_m"]), float(r["km_inicio"]), float(r["km_fim"]), float(r["latitude"]),
                     float(r["longitude"]), r["metodo_rocada"] or None, float(r["area_rocada_m2"]),
                     json.loads(r["areas_por_metodo"] or "{}"))
            for r in banco.ler_csv(DERIVADOS / "segmentos.csv")]


def _observacoes_vigente(saida: dict) -> str:
    tk = saida["resultado"]["teste_km_impares"]
    return (f"Fator de calibracao vigente: 1,0 (calibracao DESLIGADA). Decisao humana em "
            f"2026-09-14: o fator {saida['resultado']['calibracao_todos']['fator']:.2f} que a regra da "
            f"spec 7.3 escolheria sozinha (refit em todos os {saida['resultado']['final']['n']} pares, "
            f"J sobe de {saida['resultado']['sem_calibracao']['J']:.3f} para "
            f"{saida['resultado']['calibracao_todos']['J']:.3f}) e circular: refita nos mesmos pares que "
            f"avalia. O teste honesto (ajusta nos km pares, fator {saida['resultado']['ajuste_km_pares']['fator']:.2f}, "
            f"J={saida['resultado']['ajuste_km_pares']['J']:.3f}; testa nos km impares) mostra o oposto: "
            f"J cai para {tk['com']['J']:.3f} (sem calibracao seria {tk['sem']['J']:.3f}) e a acuracia cai de "
            f"{tk['sem']['acuracia']:.3f} para {tk['com']['acuracia']:.3f}. O fator {FATOR_REJEITADO:.2f} foi "
            f"testado e REJEITADO -- ver ia.calibracoes (fator {FATOR_REJEITADO:.2f}, ativo=false) e o campo "
            f"parametros desta linha (ajuste_km_pares/teste_km_impares/calibracao_todos_os_pares).")


def _ensaio(segs: list[Segmento], lev1, lev2, ext: dict[int, float], saida: dict, rocados: list[dict]) -> None:
    """So conta -- nenhuma linha aqui chama `supabase_io.cliente()` nem toca rede."""
    ids_rascunho = {m: -1 for m in MARCOS}
    r = decisao.aplicar(saida)["resultado"]["final"]
    print(f"ensaio: {len(segs)} trechos (fonte_cadastro=levantamento_motiva, rodovia={RODOVIA!r})")
    for lev, anterior in ((lev1, None), (lev2, lev1)):
        l_lev = supabase_io.linhas_levantamento(lev, ids_rascunho)
        l_med = supabase_io.linhas_medicoes(lev, ids_rascunho)
        n_exec = len(supabase_io.linhas_execucoes(anterior, lev, ids_rascunho, ext)) if anterior else 0
        print(f"{lev.data}: {len(l_lev)} levantamentos · {len(l_med)} medicoes derivadas"
              + (f" · {n_exec} execucoes inferidas" if anterior else ""))
    print(f"validacao: n_usados={r['n']} acuracia={r['acuracia']:.3f} · fator vigente {FATOR_VIGENTE:.2f} "
          f"(fator {FATOR_REJEITADO:.2f} testado e rejeitado) · {r['n']} pares incluidos + {len(rocados)} excluidos · "
          f"{len(saida['sensibilidade'])} linhas de sensibilidade")
    print("ensaio: nada gravado, Supabase nao foi contatado. Repita com --gravar.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--gravar", action="store_true")
    a = ap.parse_args(argv)

    segs = _segmentos()
    lev1, lev2 = planilha.ler(ARQ_LEV_1), planilha.ler(ARQ_LEV_2)
    ext = {m: limites_km(m)[1] - limites_km(m)[0] for m in MARCOS}
    saida = json.loads((DERIVADOS / "validacao.json").read_text(encoding="utf-8"))
    rocados = [r for r in banco.ler_csv(DERIVADOS / "pares.csv") if r["transicao"] == "rocado"]

    if not a.gravar:
        _ensaio(segs, lev1, lev2, ext, saida, rocados)
        return 0

    sb = supabase_io.cliente()
    conc = supabase_io.concessionaria_id(sb)
    eixo = marcos.carregar(ARQ_MARCOS)
    solo = solo_km.carregar_ou_buscar(eixo)
    ids = supabase_io.upsert_trechos(sb, segs, solo, conc)
    print(f"trechos: {len(ids)} (ids {min(ids.values())}..{max(ids.values())})")

    for lev, anterior in ((lev1, None), (lev2, lev1)):
        supabase_io.upsert_levantamentos(sb, supabase_io.linhas_levantamento(lev, ids))
        med = supabase_io.linhas_medicoes(lev, ids)
        supabase_io.regravar_medicoes(sb, lev.data, ids, med)
        n_exec = 0
        if anterior:
            ex = supabase_io.linhas_execucoes(anterior, lev, ids, ext)
            if ex:
                supabase_io.regravar_execucoes(sb, date.fromisoformat(ex[0]["data_execucao"]), ids, ex)
            n_exec = len(ex)
        print(f"{lev.data}: 720 levantamentos · {len(med)} medicoes · {n_exec} execucoes inferidas")

    # Reset da trilha de validacao/calibracao deste rodovia: publicar_rodoanel.py publica UM
    # evento coerente, nao um historico incremental (ver docstring do modulo). calibracoes sai
    # primeiro -- seu validacao_id nao tem "on delete cascade" e bloquearia o delete de baixo.
    sb.table("calibracoes").delete().eq("rodovia", RODOVIA).execute()

    saida_vig = decisao.aplicar(saida)
    vid = supabase_io.gravar_validacao(sb, saida_vig, ids, rocados, vigente=True)
    sb.table("validacoes").update({"observacoes": _observacoes_vigente(saida)}).eq("id", vid).execute()
    supabase_io.ativar_calibracao(sb, vid, FATOR_VIGENTE)
    # o fator que a regra 7.3 escolheria sozinho fica registrado, mas nunca ativo
    sb.table("calibracoes").insert({"validacao_id": vid, "rodovia": RODOVIA, "especie": ESPECIE_PREMISSA,
                                    "fator": FATOR_REJEITADO, "ativo": False}).execute()

    r = saida_vig["resultado"]["final"]
    print(f"validacao {vid} vigente · fator {FATOR_VIGENTE:.2f} (fator {FATOR_REJEITADO:.2f} testado e "
          f"rejeitado, ver ia.calibracoes) · n={r['n']} acuracia={r['acuracia']:.3f} · "
          f"{len(saida_vig['pares'])} pares incluidos + {len(rocados)} excluidos · "
          f"{len(saida['sensibilidade'])} linhas de sensibilidade")
    relatorio.diario(f"Tarefa 13 · pesquisa.publicar_rodoanel · {len(ids)} trechos, validacao {vid}, "
                     f"fator vigente {FATOR_VIGENTE:.2f} (fator {FATOR_REJEITADO:.2f} testado e rejeitado)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
