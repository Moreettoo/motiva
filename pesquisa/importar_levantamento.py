"""Importa um levantamento RA-RET (unifilar) para o Supabase. E o portao dos dados semanais da Motiva.

    .venv/bin/python -m pesquisa.importar_levantamento --xlsx caminho.xlsx                  # ensaio: so conta
    .venv/bin/python -m pesquisa.importar_levantamento --xlsx caminho.xlsx --anterior a.xlsx --gravar

Sem --gravar nada e escrito. A data vem do nome do arquivo (--data sobrepoe).
--anterior habilita as execucoes inferidas (queda de classe entre os dois).
Idempotente: rodar duas vezes deixa o banco igual.
"""
from __future__ import annotations

import argparse
from datetime import date

from pesquisa.rodoanel import planilha, supabase_io
from pesquisa.rodoanel.segmentos import MARCOS, limites_km


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--data", type=date.fromisoformat, default=None)
    ap.add_argument("--anterior", default=None, help="xlsx do levantamento anterior, para inferir rocadas")
    ap.add_argument("--gravar", action="store_true")
    a = ap.parse_args(argv)

    lev = planilha.ler(a.xlsx, a.data)
    anterior = planilha.ler(a.anterior) if a.anterior else None
    if a.gravar:
        sb = supabase_io.cliente()
        ids = supabase_io.ids_por_marco(sb)
        faltam = [m for m in lev.marcos if m not in ids]
        if faltam:
            raise SystemExit(f"marcos sem trecho no banco: {faltam}. Rode publicar_rodoanel.py antes.")
    else:
        ids = {m: -1 for m in MARCOS}
    ext = {m: limites_km(m)[1] - limites_km(m)[0] for m in MARCOS}

    l_lev = supabase_io.linhas_levantamento(lev, ids)
    l_med = supabase_io.linhas_medicoes(lev, ids)
    l_exec = supabase_io.linhas_execucoes(anterior, lev, ids, ext) if anterior else []
    print(f"{lev.arquivo}: data {lev.data} (interna {lev.data_interna}) · {len(l_lev)} levantamentos · "
          f"{len(l_med)} medicoes derivadas · {len(l_exec)} execucoes inferidas"
          + ("" if anterior else " (sem --anterior)"))
    if not a.gravar:
        print("ensaio: nada gravado. Repita com --gravar.")
        return 0
    supabase_io.upsert_levantamentos(sb, l_lev)
    supabase_io.regravar_medicoes(sb, lev.data, ids, l_med)
    if anterior:
        supabase_io.regravar_execucoes(sb, date.fromisoformat(l_exec[0]["data_execucao"]) if l_exec else lev.data, ids, l_exec)
    print("gravado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
