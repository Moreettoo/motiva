/**
 * Navegação pura pela grade do quadro.
 *
 * Separada do hook de arrasto de propósito: é a única parte da interação que dá
 * para testar sem DOM, e é onde os erros de borda doem — um "dá a volta" no fim
 * da semana faz o gestor perder de vista onde o cartão está.
 */

import { somarDias } from "@/lib/format";

import { chaveCelula, chaveDia, type ChaveCelula, type Grade } from "../dados";

export type Direcao = "esquerda" | "direita" | "cima" | "baixo";

/** O trilho da fila é um alvo como qualquer outro, mas não tem eixo vertical. */
export type Alvo = ChaveCelula | "fila";

export type PassoNavegacao =
  | { tipo: "alvo"; alvo: Alvo }
  /** Passou do fim da semana: quem trata é o quadro, trocando `?semana`. */
  | { tipo: "semana"; delta: -1 | 1 }
  /** Bateu numa borda que não leva a lugar nenhum. O alvo não muda; o anúncio muda. */
  | { tipo: "borda"; alvo: Alvo };

function partes(alvo: ChaveCelula): { dia: string; equipeId: number } {
  const [dia, id] = alvo.split("|");
  return { dia, equipeId: Number(id) };
}

export function proximoAlvo(grade: Grade, atual: Alvo, direcao: Direcao): PassoNavegacao {
  const linhas = grade.linhas;
  if (linhas.length === 0) return { tipo: "borda", alvo: atual };

  if (atual === "fila") {
    if (direcao === "direita") {
      return { tipo: "alvo", alvo: chaveCelula(grade.janela.dias[0], linhas[0].equipe.id) };
    }
    return { tipo: "borda", alvo: "fila" };
  }

  const { dia, equipeId } = partes(atual);
  const d = grade.janela.dias.indexOf(dia);
  const l = linhas.findIndex((linha) => linha.equipe.id === equipeId);
  if (d === -1 || l === -1) return { tipo: "borda", alvo: atual };

  switch (direcao) {
    case "esquerda":
      // Sair do primeiro dia pela esquerda leva ao trilho, não à semana anterior:
      // o trilho está fisicamente ali, e a semana anterior é sempre passado.
      if (d === 0) return { tipo: "alvo", alvo: "fila" };
      return { tipo: "alvo", alvo: chaveCelula(grade.janela.dias[d - 1], equipeId) };

    case "direita":
      if (d === grade.janela.dias.length - 1) return { tipo: "semana", delta: 1 };
      return { tipo: "alvo", alvo: chaveCelula(grade.janela.dias[d + 1], equipeId) };

    case "cima":
      if (l === 0) return { tipo: "borda", alvo: atual };
      return { tipo: "alvo", alvo: chaveCelula(dia, linhas[l - 1].equipe.id) };

    case "baixo":
      if (l === linhas.length - 1) return { tipo: "borda", alvo: atual };
      return { tipo: "alvo", alvo: chaveCelula(dia, linhas[l + 1].equipe.id) };
  }
}

/**
 * Realinha o alvo para a semana nova ao atravessar semana em pleno movimento
 * (Shift+seta, ou seta simples no fim da semana): mesmo dia da semana, mesma
 * turma — só desloca a data em `delta * 7` dias, porque é exatamente quanto
 * a semana desloca. "fila" não desloca: o trilho existe em qualquer semana.
 *
 * Sem isto, o alvo continua apontando para um dia que só existia na semana
 * velha; a próxima seta cai em `d === -1` acima e trava em `{tipo: "borda"}`
 * para sempre, porque o dia antigo nunca mais aparece em `grade.janela.dias`.
 */
export function realinharAlvo(alvo: Alvo, delta: -1 | 1): Alvo {
  if (alvo === "fila") return alvo;
  const { dia, equipeId } = partes(alvo);
  return chaveCelula(chaveDia(somarDias(dia, delta * 7)), equipeId);
}
