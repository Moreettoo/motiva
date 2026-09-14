"""A decisão humana sobre a calibração do Rodoanel — em UM lugar só.

Por que este módulo existe
--------------------------
O contrato estava partido em três, e as três partes discordavam:

1. `pesquisa/validar.py` grava `resultado["fator_vigente"] = 1,15` porque é o
   que a regra da spec §7.3 escolhe sozinha (maior J refitando em TODOS os 195
   pares — circular: refita nos mesmos pares que avalia);
2. `pesquisa/rodoanel/relatorio.py` renderizava `docs/pesquisa/02-validacao.md`
   direto desse campo, então o documento dizia "Vigente: **1,15**" e intitulava
   a matriz de confusão de 31,8% como "cenário vigente";
3. a decisão humana — **fator 1,0, calibração DESLIGADA** — vivia só dentro de
   `pesquisa/publicar_rodoanel.py`, era aplicada ao banco e nunca ao markdown.

O resultado: `docs/relatorio-motiva.md` citava `02-validacao.md` para sustentar
a conclusão OPOSTA à que aquele arquivo afirmava. Agora a decisão mora aqui, e
o publicador e o renderizador leem os dois do mesmo ponto.

A decisão, e a evidência dela (2026-09-14, task-13-report.md)
------------------------------------------------------------
O teste honesto — ajusta só nos km pares (fator 1,05, J = +0,254) e testa nos
km ímpares — mostra a calibração PIORANDO fora da amostra: J cai para +0,033 e
a acurácia cai de 0,598 para 0,478. Por isso o vigente é 1,0; o 1,15 fica
registrado como **testado e rejeitado**, com a evidência, em `ia.calibracoes`
(`ativo = false`) e no `parametros`/`observacoes` da validação vigente.

Isto é uma decisão sobre ESTA validação, não uma regra geral: se o artefato
mudar de cenário rejeitado, `aplicar` levanta em vez de deixar o documento
rotular errado em silêncio — quem decide de novo é gente, não o código.
"""
from __future__ import annotations

import copy

#: O fator que de fato vale: calibração desligada.
FATOR_VIGENTE = 1.0

#: O que a regra §7.3 escolheria sozinha. Testado e rejeitado; nunca ativo.
FATOR_REJEITADO = 1.15


def aplicar(saida: dict) -> dict:
    """Cópia de `saida` com a decisão humana aplicada. Não escreve nada.

    O que muda em relação ao artefato cru de `validar.py`:

    - `resultado["fator_vigente"]` passa a ser 1,0 (era a escolha da regra);
    - `resultado["final"]` — a linha que vira a validação vigente no banco e o
      "cenário vigente" no documento — passa a ser `sem_calibracao`, ou seja
      60,5% com fator 1,0, e não os 31,8% do 1,15;
    - `resultado["rejeitado"]` passa a guardar o cenário que a regra escolheria,
      para o documento poder mostrá-lo **rotulado como rejeitado** em vez de
      escondê-lo (o número existe e foi medido; o que não pode é chamá-lo de
      vigente). Fica `None` quando a própria regra já escolheu 1,0;
    - `pares` passa a ser o `por_par` do cenário vigente;
    - `fila_retrospectiva` é REFEITA com o fator vigente. Os números não mudam
      hoje (0 marcados / 1 cruzou / 0 acertos, 55 segmentos — um fator MENOR
      nunca marca mais segmentos que um maior), e é justamente por isso que
      vale refazer em vez de assumir: o documento passa a narrar uma fila que
      foi calculada com o fator que ele diz estar usando.
    """
    from .planilha import CODIGOS_EM_ESCOPO
    from .validacao import fila_de_pares

    v = copy.deepcopy(saida)
    res = v["resultado"]
    fator_da_regra = float(res["fator_vigente"])

    rejeitado = None
    if fator_da_regra != FATOR_VIGENTE:
        if abs(fator_da_regra - FATOR_REJEITADO) > 1e-9:
            raise ValueError(
                f"A regra §7.3 escolheu o fator {fator_da_regra:.2f}, e a decisão humana "
                f"registrada neste módulo é sobre o {FATOR_REJEITADO:.2f}. O artefato mudou: "
                f"refaça a decisão (e a evidência do teste km pares/ímpares) antes de publicar "
                f"ou re-renderizar, em vez de rotular o cenário novo com a justificativa velha."
            )
        rejeitado = res["final"]

    res["fator_da_regra"] = fator_da_regra
    res["rejeitado"] = rejeitado
    res["fator_vigente"] = FATOR_VIGENTE
    res["final"] = res["sem_calibracao"]
    v["pares"] = res["sem_calibracao"]["por_par"]
    if "por_par" in res["sem_calibracao"]:
        v["fila_retrospectiva"] = fila_de_pares(res["sem_calibracao"]["por_par"], FATOR_VIGENTE, CODIGOS_EM_ESCOPO)
    return v
