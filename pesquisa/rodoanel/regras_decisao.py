"""Estudo extra (fora dos itens numerados do plano): regras de decisao que usam
a banda q10/q50/q90 do modelo, nao so o q50, contra os 195 pares reais do
Rodoanel ja validados na Tarefa 9.

Protocolo pre-registrado (ver .superpowers/sdd/2026-09-13-dados-reais-rodoanel/
para o pedido original), fixado ANTES de rodar qualquer numero:

- Seis regras, nem mais nem menos: q50 (a regra vigente hoje), q10, q90,
  banda_toda, banda_qualquer, sem_mudanca (a linha de base de 83,1%).
- A escolha da regra vencedora usa SO os km pares (validacao.km_par);
  o desempenho nos km impares e o resultado retido, sem participacao
  nenhuma na escolha.
- Criterio de escolha: acuracia nos km pares. Em empate, vence a regra que
  aparece primeiro na lista fixa acima (decidido aqui, antes de rodar --
  nao depois de ver quem empata).
- J (Youden) e reportado ao lado da acuracia para toda regra e toda metade,
  porque J pode ser maximizado por uma regra degenerada ("cresceu sempre")
  que derruba a acuracia -- ver Tarefa 9.

Este modulo fica deliberadamente independente de `validacao.py`: nao o
importa, nao o modifica, e nao chama o modelo nem rede nenhuma. Le direto o
`resultado.sem_calibracao.por_par` ja gravado em `validacao.json` (Tarefa 9)
-- km_marco_m, faixa, classe_inicial, classe_final_observada,
altura_inicial_cm, q10_cm/q50_cm/q90_cm (quantis de CRESCIMENTO em 7 dias,
nao de altura final). A formula de `km_par` e as fronteiras de classe sao
reimplementadas aqui de proposito, com o mesmo valor de `validacao.py`, para
que um estudo "e se" nao dependa do modulo de producao.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from . import DERIVADOS

LIMITE_1_2 = 10.0
LIMITE_2_3 = 30.0

ARQ_VALIDACAO = DERIVADOS / "validacao.json"
ARQ_SAIDA = DERIVADOS / "regras_decisao.json"

# Ordem fixa e pre-registrada: tambem serve de desempate (primeira da lista
# que atinge a acuracia maxima nos km pares vence).
NOMES_REGRAS = ("q50", "q10", "q90", "banda_toda", "banda_qualquer", "sem_mudanca")


def classe_de(altura_cm: float) -> int:
    """Mesmas fronteiras de `validacao.classe_de`: <10 -> 1, 10..30 -> 2, >30 -> 3."""
    if altura_cm < LIMITE_1_2:
        return 1
    if altura_cm <= LIMITE_2_3:
        return 2
    return 3


@dataclass(frozen=True)
class Par:
    km_m: int
    faixa: str
    classe_inicial: int
    classe_final_observada: int
    altura_inicial_cm: float
    q10_cm: float
    q50_cm: float
    q90_cm: float

    def altura(self, quantil: str) -> float:
        return self.altura_inicial_cm + getattr(self, f"{quantil}_cm")

    def classe(self, quantil: str) -> int:
        return classe_de(self.altura(quantil))


def km_par(par: Par) -> bool:
    """Mesma formula de `validacao.km_par`, reimplementada aqui de proposito
    (este modulo fica independente de validacao.py -- ver docstring do modulo)."""
    return (par.km_m // 500) % 2 == 0


def regra_q50(p: Par) -> int:
    """A regra vigente hoje: classifica so pelo q50 (mediana)."""
    return p.classe("q50")


def regra_q10(p: Par) -> int:
    """Classifica so pelo extremo conservador da banda (q10)."""
    return p.classe("q10")


def regra_q90(p: Par) -> int:
    """Classifica so pelo extremo otimista da banda (q90)."""
    return p.classe("q90")


def regra_banda_toda(p: Par) -> int:
    """'So grita lobo quando tem certeza': so preve uma classe ACIMA da
    inicial se a banda INTEIRA ja cruzou a fronteira -- ou seja, se ate o q10
    (o extremo mais conservador) ja implica uma classe acima da inicial.
    Caso contrario, sem mudanca (nunca preve uma classe abaixo da inicial
    por esta via)."""
    c10 = p.classe("q10")
    return c10 if c10 > p.classe_inicial else p.classe_inicial


def regra_banda_qualquer(p: Par) -> int:
    """'Sinaliza qualquer risco': preve uma classe ACIMA da inicial se
    QUALQUER parte da banda ja cruzou a fronteira -- ou seja, se o q90 (o
    extremo mais otimista) ja implica uma classe acima da inicial."""
    c90 = p.classe("q90")
    return c90 if c90 > p.classe_inicial else p.classe_inicial


def regra_sem_mudanca(p: Par) -> int:
    """A linha de base do projeto: 'nada muda em 7 dias' (83,1% nos 195 pares)."""
    return p.classe_inicial


REGRAS: dict[str, Callable[[Par], int]] = {
    "q50": regra_q50,
    "q10": regra_q10,
    "q90": regra_q90,
    "banda_toda": regra_banda_toda,
    "banda_qualquer": regra_banda_qualquer,
    "sem_mudanca": regra_sem_mudanca,
}


def carregar_pares(caminho: Path = ARQ_VALIDACAO) -> list[Par]:
    """Le `resultado.sem_calibracao.por_par` de validacao.json. Nenhuma
    chamada de rede, nenhum recalculo do modelo -- so o que a Tarefa 9 ja
    gravou."""
    dados = json.loads(Path(caminho).read_text())
    por_par = dados["resultado"]["sem_calibracao"]["por_par"]
    return [
        Par(
            km_m=int(r["km_marco_m"]),
            faixa=r["faixa"],
            classe_inicial=int(r["classe_inicial"]),
            classe_final_observada=int(r["classe_final_observada"]),
            altura_inicial_cm=float(r["altura_inicial_cm"]),
            q10_cm=float(r["q10_cm"]),
            q50_cm=float(r["q50_cm"]),
            q90_cm=float(r["q90_cm"]),
        )
        for r in por_par
    ]


def avaliar_regra(pares: list[Par], regra: Callable[[Par], int]) -> dict:
    """Mesmas definicoes de `validacao.avaliar` (acuracia, matriz, J,
    transicoes/alarmes), aplicadas a uma regra de decisao construida so a
    partir da altura inicial e da banda q10/q50/q90 -- sem chamar o modelo."""
    n = len(pares)
    previstos = [regra(p) for p in pares]
    observados = [p.classe_final_observada for p in pares]
    iniciais = [p.classe_inicial for p in pares]

    acertos = sum(1 for pv, ob in zip(previstos, observados) if pv == ob)
    cresceu = [ob > ini for ob, ini in zip(observados, iniciais)]
    estavel = [ob == ini for ob, ini in zip(observados, iniciais)]
    transicoes_total = sum(cresceu)
    estaveis_total = sum(estavel)
    detectadas = sum(1 for pv, ini, c in zip(previstos, iniciais, cresceu) if c and pv > ini)
    alarmes = sum(1 for pv, ini, e in zip(previstos, iniciais, estavel) if e and pv > ini)
    J = detectadas / max(transicoes_total, 1) - alarmes / max(estaveis_total, 1)

    matriz = {
        str(a): {str(b): sum(1 for ob, pv in zip(observados, previstos) if ob == a and pv == b) for b in (1, 2, 3)}
        for a in (1, 2, 3)
    }

    return {
        "n": n,
        "acuracia": acertos / n if n else None,
        "J": float(J),
        "matriz": matriz,
        "transicoes_total": transicoes_total,
        "transicoes_detectadas": detectadas,
        "estaveis_total": estaveis_total,
        "alarmes_falsos": alarmes,
    }


def escolher_vencedora(resultados_por_regra_km_par: dict[str, dict]) -> str:
    """Escolhe pela acuracia nos km pares, desempatando pela ordem fixa de
    `NOMES_REGRAS` (a primeira regra da lista que atinge o maximo vence --
    `max()` sobre uma sequencia ja ordenada devolve o primeiro empate,
    entao isto e deterministico e decidido antes de rodar)."""
    return max(NOMES_REGRAS, key=lambda nome: resultados_por_regra_km_par[nome]["acuracia"])


def rodar_estudo(caminho_validacao: Path = ARQ_VALIDACAO) -> dict:
    """Roda o protocolo inteiro: monta a tabela das seis regras nas duas
    metades, escolhe a vencedora SO pelos km pares, e reporta o desempenho
    dela nos km impares (o numero retido) e no total dos 195 pares (leitura
    operacional: quantos dos 33 cruzamentos ela pega e quantos dos 162
    estaveis ela alarma por engano -- o que a operacao sente como despacho
    de equipe desnecessario)."""
    pares = carregar_pares(caminho_validacao)
    pares_par = [p for p in pares if km_par(p)]
    pares_impar = [p for p in pares if not km_par(p)]

    tabela = {
        nome: {"km_par": avaliar_regra(pares_par, fn), "km_impar": avaliar_regra(pares_impar, fn)}
        for nome, fn in REGRAS.items()
    }

    vencedora = escolher_vencedora({nome: r["km_par"] for nome, r in tabela.items()})

    baseline_geral = avaliar_regra(pares, regra_sem_mudanca)
    resultado_geral_vencedora = avaliar_regra(pares, REGRAS[vencedora])
    vence_so_por_nunca_mudar = all(
        REGRAS[vencedora](p) == regra_sem_mudanca(p) for p in pares
    )

    return {
        "protocolo": {
            "regras": list(NOMES_REGRAS),
            "criterio_escolha": "acuracia nos km pares (validacao.km_par); empate = primeira regra da lista fixa",
            "km_par_n": len(pares_par),
            "km_impar_n": len(pares_impar),
            "descricao": (
                "estudo extra, fora dos itens numerados do plano -- pedido pontual do humano. "
                "protocolo pre-registrado em .superpowers/sdd/2026-09-13-dados-reais-rodoanel/"
            ),
        },
        "n_total": len(pares),
        "tabela_km_par_km_impar": tabela,
        "regra_escolhida": vencedora,
        "regra_escolhida_venceu_so_por_nunca_prever_mudanca": vence_so_por_nunca_mudar,
        "resultado_km_impar_da_escolhida": tabela[vencedora]["km_impar"],
        "resultado_geral_da_escolhida": resultado_geral_vencedora,
        "baseline_sem_mudanca_geral": baseline_geral,
    }


def main() -> None:
    resultado = rodar_estudo()
    ARQ_SAIDA.write_text(json.dumps(resultado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"escrito em {ARQ_SAIDA}")
    print(f"regra escolhida (km pares): {resultado['regra_escolhida']}")
    imp = resultado["resultado_km_impar_da_escolhida"]
    print(f"acuracia nos km impares (retido): {imp['acuracia']:.3f} (n={imp['n']})")
    print(f"venceu so por nunca prever mudanca: {resultado['regra_escolhida_venceu_so_por_nunca_prever_mudanca']}")


if __name__ == "__main__":
    main()
