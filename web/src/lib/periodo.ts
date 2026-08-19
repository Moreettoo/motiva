import { isoHoje, somarDias } from "./format";

/**
 * O período de uma simulação: duas datas, e as contas que elas exigem.
 *
 * O simulador nasceu com "quantos dias a partir de hoje", e isso amarrava a
 * pergunta ao dia em que ela era feita. Um intervalo solta as duas pontas: dá
 * para reproduzir uma janela que já passou (com o clima OBSERVADO daqueles
 * dias, que é o que o caderno de calibração faz) e para olhar um trecho de
 * futuro que não começa hoje.
 *
 * AS DUAS DATAS SÃO INCLUSIVAS. "de 12/08 a 16/08" são cinco dias, que é o que
 * uma pessoa lê ao ver dois campos de data. O caderno de calibração usa a
 * convenção contrária (`[d0, d1)`, com o fim exclusivo, e chama isso de quatro
 * dias) — então comparar o simulador com o caderno pede um dia a menos no
 * campo de fim. A tela mostra a contagem em dias justamente para essa diferença
 * nunca ficar implícita.
 */

/** Faixa que o modelo viu no treino, e o que o campo aceita. */
export const DIAS_MIN = 1;
export const DIAS_MAX = 120;

/**
 * Até onde para trás o início pode ir.
 *
 * O ERA5 do Open-Meteo cobre desde 1940, então o limite aqui não é de dado: é
 * de custo. Cada ano a mais é mais requisição em série no arquivo, que é
 * justamente a API que responde 429 quando se insiste.
 */
export const ANOS_PARA_TRAS = 2;

/** Até onde para a frente o fim pode ir. Além disso o clima é chute puro. */
export const DIAS_PARA_FRENTE = 120;

export type Periodo = {
  /** AAAA-MM-DD, inclusivo. */
  inicio: string;
  /** AAAA-MM-DD, inclusivo. */
  fim: string;
  /** Quantos dias o período cobre, contando as duas pontas. */
  dias: number;
};

/** Diferença em dias entre duas datas AAAA-MM-DD. Positiva quando `b` > `a`. */
export function diferencaEmDias(a: string, b: string): number {
  const ms = Date.UTC(...(desmontar(b) as [number, number, number])) -
    Date.UTC(...(desmontar(a) as [number, number, number]));
  return Math.round(ms / 86_400_000);
}

function desmontar(d: string): [number, number, number] {
  const [a, m, dia] = d.split("-").map(Number);
  return [a, m - 1, dia];
}

/** A data de hoje mais `n` dias, em AAAA-MM-DD. Usa `isoHoje`, que formata em
 *  `America/Sao_Paulo` — nunca o relógio da máquina, pelo motivo de sempre. */
export function hojeMais(n: number): string {
  return somarDias(isoHoje(), n).toISOString().slice(0, 10);
}

export function montarPeriodo(inicio: string, fim: string): Periodo {
  return { inicio, fim, dias: diferencaEmDias(inicio, fim) + 1 };
}

/** O período padrão, para a primeira visita: de hoje a 45 dias à frente. */
export function periodoPadrao(): Periodo {
  return montarPeriodo(isoHoje(), hojeMais(44));
}

export type ErroPeriodo = { campo: "inicio" | "fim"; texto: string };

/**
 * Valida o par. Devolve o primeiro problema, ou `null`.
 *
 * A ordem dos testes importa: "fim antes do início" tem que vir antes de
 * "período longo demais", ou uma inversão de datas sairia com a mensagem
 * errada (a contagem fica negativa, nunca acima do teto).
 */
export function validarPeriodo(inicio: string, fim: string): ErroPeriodo | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(inicio)) return { campo: "inicio", texto: "Escolha a data inicial." };
  if (!iso.test(fim)) return { campo: "fim", texto: "Escolha a data final." };

  const dias = diferencaEmDias(inicio, fim) + 1;
  if (dias < DIAS_MIN) {
    return { campo: "fim", texto: "A data final não pode ser anterior à inicial." };
  }
  if (dias > DIAS_MAX) {
    return {
      campo: "fim",
      texto: `O período tem ${dias} dias. O modelo viu de ${DIAS_MIN} a ${DIAS_MAX}; escolha um intervalo menor.`,
    };
  }

  const hoje = isoHoje();
  if (diferencaEmDias(inicio, hoje) > ANOS_PARA_TRAS * 365) {
    return {
      campo: "inicio",
      texto: `O clima observado só é buscado até ${ANOS_PARA_TRAS} anos atrás.`,
    };
  }
  if (diferencaEmDias(hoje, fim) > DIAS_PARA_FRENTE) {
    return {
      campo: "fim",
      texto: `Além de ${DIAS_PARA_FRENTE} dias à frente não há clima para sustentar a conta.`,
    };
  }

  return null;
}
