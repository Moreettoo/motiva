/**
 * Qual calibração vale para (rodovia, espécie). Espelha `escolher` em `ml/calibracao.py`:
 * (rodovia, espécie) > (rodovia, qualquer) > (qualquer, espécie) > (qualquer, qualquer) > sem calibração.
 * Puro, sem `server-only`, para o vitest importar direto.
 */
export type LinhaCalibracao = {
  fator: number | string;
  rodovia: string | null;
  especie: string | null;
  validacoes?: { n_pares_usados: number; executada_em: string } | { n_pares_usados: number; executada_em: string }[] | null;
};

export type CalibracaoVigente = {
  fator: number;
  origem: "medida" | "sem_calibracao";
  nPares: number | null;
  validadaEm: string | null;
  rodovia: string | null;
  especie: string | null;
};

export const SEM_CALIBRACAO: CalibracaoVigente = { fator: 1, origem: "sem_calibracao", nPares: null, validadaEm: null, rodovia: null, especie: null };

function especificidade(l: LinhaCalibracao, rodovia: string | null, especie: string): number | null {
  if (l.rodovia != null && l.rodovia !== rodovia) return null;
  if (l.especie != null && l.especie !== especie) return null;
  return (l.rodovia ? 2 : 0) + (l.especie ? 1 : 0);
}

export function escolherCalibracao(linhas: LinhaCalibracao[], rodovia: string | null, especie: string): CalibracaoVigente {
  let melhor: { s: number; l: LinhaCalibracao } | null = null;
  for (const l of linhas) {
    const s = especificidade(l, rodovia, especie);
    if (s !== null && (melhor === null || s > melhor.s)) melhor = { s, l };
  }
  if (!melhor) return SEM_CALIBRACAO;
  const v = Array.isArray(melhor.l.validacoes) ? melhor.l.validacoes[0] : melhor.l.validacoes;
  return {
    fator: Number(melhor.l.fator),
    origem: "medida",
    nPares: v?.n_pares_usados ?? null,
    validadaEm: v?.executada_em ?? null,
    rodovia: melhor.l.rodovia,
    especie: melhor.l.especie,
  };
}

/**
 * Os TRÊS estados da calibração, não dois.
 *
 * `origem: "medida"` quer dizer que existe uma validação contra campo, não que
 * o fator dela esteja corrigindo alguma coisa. No Rodoanel o fator vigente é
 * 1,0: a medição aconteceu em 195 pares reais e o resultado dela foi DESLIGAR a
 * calibração — o candidato 1,15 piorou fora da amostra e ficou registrado como
 * rejeitado. Colapsar "medida e aplicada" com "medida e rejeitada" soa como
 * endosso do fator que foi recusado, e esse texto chega ao cliente.
 */
export type EstadoCalibracao = "aplicada" | "desligada" | "ausente";

export function estadoDaCalibracao(c: CalibracaoVigente): EstadoCalibracao {
  if (c.origem !== "medida") return "ausente";
  return Math.abs(c.fator - 1) < 1e-9 ? "desligada" : "aplicada";
}

/**
 * Como descrever a calibração para a LLM. Espelha `_origem_calibracao` em
 * `ml/analise.py`, porque as duas IAs 2 — a do lote e a do simulador — têm que
 * receber a mesma descrição do mesmo fato.
 */
export function origemParaIA(c: CalibracaoVigente): string {
  switch (estadoDaCalibracao(c)) {
    case "ausente":
      return "sem calibração medida: modelo sintético puro";
    case "desligada":
      return (
        "calibração DESLIGADA (fator 1,0): foi medida contra os pares reais do levantamento da " +
        "concessionária e o fator candidato foi testado e REJEITADO fora da amostra; a curva aqui " +
        "é o modelo sem correção"
      );
    case "aplicada":
      return "medida contra pares reais do levantamento da concessionária e aplicada";
  }
}
