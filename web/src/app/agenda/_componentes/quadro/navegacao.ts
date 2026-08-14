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

/** O trilho da fila é um alvo como qualquer outro, mas não tem eixo vertical.
 *  `propostas:${dia}` é um pseudo-alvo (ver `alvoPropostas`, abaixo): nunca
 *  um destino de solta de verdade, só existe para o hit-test do PONTEIRO
 *  conseguir nomear "a linha de Propostas da IA no dia X" e cair na mesma
 *  validação/mensagem que o teclado já usa. Nenhuma função de navegação por
 *  teclado (`proximoAlvo`, `realinharAlvo`, `alvoNaBordaDaSemana`) o produz. */
export type Alvo = ChaveCelula | "fila" | `propostas:${string}`;

/** Constrói/reconhece o pseudo-alvo da linha "Propostas da IA" de um dia — a
 *  MESMA string dos dois lados (produzida aqui, no atributo `data-*` que o
 *  hit-test lê, e testada em `validar`), para não haver dois formatos
 *  divergentes de um valor que nunca passa por `chaveCelula`. */
export function alvoPropostas(dia: string): Alvo {
  return `propostas:${dia}`;
}

export function ehAlvoPropostas(alvo: Alvo): boolean {
  return alvo.startsWith("propostas:");
}

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

export function proximoAlvo(
  grade: Grade,
  atual: Alvo,
  direcao: Direcao,
  /** `false` quando o trilho está colapsado numa doca fora da tela — abaixo
   *  de `lg`, sem a doca aberta (ver `trilho-responsivo.tsx`). Nesse estado o
   *  trilho existe no DOM mas está `inert`, então apontar pra ele por teclado
   *  levaria a um alvo que `validar` aceita mas nenhum cartão real representa
   *  na tela. Default `true` preserva o comportamento de coluna, onde o
   *  trilho está sempre montado e interativo. */
  filaDisponivel: boolean = true,
): PassoNavegacao {
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
      // Mas só quando o trilho está de fato alcançável (ver `filaDisponivel`).
      if (d === 0) {
        return filaDisponivel ? { tipo: "alvo", alvo: "fila" } : { tipo: "borda", alvo: atual };
      }
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

/**
 * Alvo de BORDA da semana nova quando a SETA SIMPLES (sem Shift) atravessa o
 * fim da semana — o caminho `proximoAlvo` → `{tipo: "semana"}` (só ocorre
 * indo para a direita, no último dia; ver `proximoAlvo` acima). Diferente de
 * `realinharAlvo`: Shift+seta significa "uma semana" (mesmo dia da semana,
 * sete dias adiante); seta simples significa "um dia" — o vizinho imediato
 * do dia atual, que é o primeiro dia da semana nova (`delta === 1`) ou o
 * último (`delta === -1`). Usar `realinharAlvo` aqui pularia a semana nova
 * inteira (segunda a sábado) e pousaria sete dias à frente, no MESMO dia da
 * semana — um salto, não um passo.
 *
 * `alvoAtual` nunca é `"fila"` neste caminho (`proximoAlvo` só produz
 * `{tipo: "semana"}` a partir de uma célula), mas o parâmetro aceita `Alvo`
 * e devolve sem tocar por simetria defensiva com `realinharAlvo`.
 */
export function alvoNaBordaDaSemana(grade: Grade, alvoAtual: Alvo, delta: -1 | 1): Alvo {
  if (alvoAtual === "fila") return alvoAtual;
  const { equipeId } = partes(alvoAtual);
  const bordaAtual = delta === 1 ? grade.janela.dias[grade.janela.dias.length - 1] : grade.janela.dias[0];
  return chaveCelula(chaveDia(somarDias(bordaAtual, delta)), equipeId);
}
