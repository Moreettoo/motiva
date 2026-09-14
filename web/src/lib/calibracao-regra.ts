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
