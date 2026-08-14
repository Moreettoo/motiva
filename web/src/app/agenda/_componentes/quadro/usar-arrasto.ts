"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Grade } from "../dados";
import { proximoAlvo, realinharAlvo, type Alvo, type Direcao } from "./navegacao";

// Os componentes importam interação de um lugar só; espalhar o conhecimento de
// que existem dois módulos (navegação pura + hook) seria pior.
export type { Alvo, Direcao } from "./navegacao";

/** Deslocamento em px que compromete o gesto no mouse e na caneta. */
const LIMIAR_PX = 8;
/** Pressão longa que compromete o gesto no toque, sem competir com a rolagem. */
const PRESSAO_MS = 250;
/** Faixa da borda que dispara auto-rolagem, e velocidade máxima em px por quadro. */
const BORDA_PX = 56;
const VELOCIDADE_MAX = 18;

export type CargaArrasto = {
  id: number;
  origem: Alvo;
  /** Frase curta para o anúncio e para o sobrevoo. Nunca o item inteiro. */
  rotulo: string;
};

export type EstadoArrasto =
  | { fase: "ocioso" }
  | { fase: "candidato"; carga: CargaArrasto }
  | { fase: "arrastando"; carga: CargaArrasto; alvo: Alvo | null; recusa: string | null; x: number; y: number }
  | { fase: "carregando"; carga: CargaArrasto; alvo: Alvo; recusa: string | null };

type OpcoesArrasto = {
  grade: Grade;
  /** `null` aceita; texto em pt-BR recusa e vira o motivo mostrado. */
  validar: (carga: CargaArrasto, alvo: Alvo) => string | null;
  aoSoltar: (carga: CargaArrasto, alvo: Alvo) => void;
  /** Frase lida a cada passo do teclado. */
  descrever: (alvo: Alvo, carga: CargaArrasto) => string;
  anunciar: (texto: string) => void;
  aoNavegarSemana: (delta: -1 | 1) => void;
};

/** Elementos roláveis que participam da auto-rolagem, do mais interno ao mais externo. */
function roladores(alvo: Element | null): HTMLElement[] {
  const lista: HTMLElement[] = [];
  for (let no = alvo; no instanceof HTMLElement; no = no.parentElement) {
    const estilo = getComputedStyle(no);
    if (/(auto|scroll)/.test(estilo.overflowX + estilo.overflowY)) lista.push(no);
  }
  return lista;
}

/**
 * Alvo sob o ponteiro.
 *
 * `elementsFromPoint` no PLURAL: devolve a pilha inteira em ordem de pintura, o
 * que atravessa o cabeçalho grudado e a barra superior sem precisar mexer no CSS
 * deles. Coordenadas de viewport, então a auto-rolagem sai de graça — um cache
 * de `getBoundingClientRect` ficaria inválido a cada quadro justamente enquanto
 * o quadro rola, que é quando ele mais seria usado.
 */
function alvoSob(x: number, y: number): Alvo | null {
  for (const no of document.elementsFromPoint(x, y)) {
    const celula = no.closest<HTMLElement>("[data-celula]");
    if (celula?.dataset.celula) return celula.dataset.celula;
    if (no.closest("[data-trilho]")) return "fila";
  }
  return null;
}

type Vivo = {
  carga: CargaArrasto;
  ponteiroId: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  comprometido: boolean;
  temporizador: number | null;
  quadro: number | null;
  houveArrasto: boolean;
};

/**
 * Cancela o que um gesto deixou pendente — temporizador, rAF, o atributo que
 * trava cursor e seleção — sem tocar em `estado`. Uma cópia só, dois
 * chamadores: o fim normal do gesto (`fechar`) e o desmonte do componente.
 * `iniciar` também chama, para o gesto ANTERIOR, quando um segundo ponteiro
 * chega antes de o primeiro soltar — sem isto o temporizador do primeiro
 * sobrevive à troca e compromete o ponteiro errado quando dispara.
 */
function limparRecursos(s: Vivo | null): void {
  if (!s) return;
  if (s.temporizador != null) clearTimeout(s.temporizador);
  if (s.quadro != null) cancelAnimationFrame(s.quadro);
  delete document.documentElement.dataset.arrastando;
}

export function useArrasto({
  grade,
  validar,
  aoSoltar,
  descrever,
  anunciar,
  aoNavegarSemana,
}: OpcoesArrasto) {
  const [estado, setEstado] = useState<EstadoArrasto>({ fase: "ocioso" });

  // Espelho de `estado` para leitura em `aoTeclar` sem entrar no array de
  // deps: durante um arrasto por ponteiro, `laco()` chama `definirEstado` a
  // ~60 quadros por segundo, e `estado` no array recriaria `aoTeclar` junto —
  // o mesmo furo que o comentário abaixo já evita para o próprio `laco`.
  // Atualizado sempre no mesmo lugar em que `estado` muda, nunca à parte.
  const estadoRef = useRef<EstadoArrasto>({ fase: "ocioso" });
  const definirEstado = useCallback((novo: EstadoArrasto) => {
    estadoRef.current = novo;
    setEstado(novo);
  }, []);

  // Tudo que o loop de animação lê mora em ref: ler de estado recriaria os
  // callbacks a cada quadro e derrubaria o `memo` dos ~130 cartões.
  const vivo = useRef<Vivo | null>(null);

  const fechar = useCallback(() => {
    limparRecursos(vivo.current);
    vivo.current = null;
    definirEstado({ fase: "ocioso" });
  }, [definirEstado]);

  const laco = useCallback(() => {
    const s = vivo.current;
    if (!s || !s.comprometido) return;

    // LER antes de ESCREVER: `elementsFromPoint` depois de mexer no transform do
    // sobrevoo seria leitura de layout logo após escrita, no mesmo quadro.
    const alvo = alvoSob(s.x, s.y);
    const recusa = alvo == null ? null : validar(s.carga, alvo);

    definirEstado({ fase: "arrastando", carga: s.carga, alvo, recusa, x: s.x, y: s.y });

    // Auto-rolagem nos dois eixos. `scroll-behavior: auto` local no container
    // (globals.css) — o `smooth` global animaria cada quadro deste laço.
    for (const no of roladores(document.elementFromPoint(s.x, s.y))) {
      const caixa = no.getBoundingClientRect();
      const dx = passo(s.x - caixa.left, caixa.right - s.x);
      const dy = passo(s.y - caixa.top, caixa.bottom - s.y);
      if (dx || dy) {
        no.scrollBy(dx, dy);
        break;
      }
    }

    // O laço se rechama por closure — o React Compiler não está ligado neste
    // projeto (ver `next.config.ts`), então a regra de imutabilidade do
    // compilador não se aplica aqui; é o idioma padrão de loop de rAF autorreferente.
    // eslint-disable-next-line react-hooks/immutability
    s.quadro = requestAnimationFrame(laco);
  }, [validar, definirEstado]);

  const comprometer = useCallback(() => {
    const s = vivo.current;
    if (!s || s.comprometido) return;
    if (s.temporizador != null) clearTimeout(s.temporizador);

    // A CAPTURA ENTRA SÓ AQUI. Capturar no `pointerdown` redireciona os eventos
    // de mouse de compatibilidade para quem capturou, e o `click` passa a ter o
    // quadro como alvo — o cartão nunca o vê e abrir o detalhe some da tela.
    document.documentElement.setPointerCapture?.(s.ponteiroId);
    document.documentElement.dataset.arrastando = "";

    s.comprometido = true;
    s.houveArrasto = true;
    s.quadro = requestAnimationFrame(laco);
    anunciar(`${s.carga.rotulo} pego.`);
  }, [laco, anunciar]);

  const iniciar = useCallback(
    (evento: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => {
      if (evento.button !== 0 && evento.pointerType === "mouse") return;
      evento.preventDefault();

      // Um segundo ponteiro pode chegar antes de o primeiro soltar ou
      // cancelar: sem limpar aqui, o temporizador do gesto anterior (ainda
      // não comprometido) sobrevive à troca e comprometeria o ponteiro ERRADO
      // quando disparasse. Não é suporte a dois dedos — é não vazar recurso.
      limparRecursos(vivo.current);

      vivo.current = {
        carga,
        ponteiroId: evento.pointerId,
        x0: evento.clientX,
        y0: evento.clientY,
        x: evento.clientX,
        y: evento.clientY,
        comprometido: false,
        temporizador:
          evento.pointerType === "mouse"
            ? null
            : window.setTimeout(comprometer, PRESSAO_MS),
        quadro: null,
        houveArrasto: false,
      };

      definirEstado({ fase: "candidato", carga });
    },
    [comprometer, definirEstado],
  );

  // Os ouvintes ficam em `window` e não no quadro: entre o `pointerdown` e o
  // `comprometer()` ainda não há captura, e sem isto o fim do gesto se perde se
  // o ponteiro sair do elemento.
  useEffect(() => {
    function mover(evento: PointerEvent) {
      const s = vivo.current;
      if (!s || evento.pointerId !== s.ponteiroId) return;

      s.x = evento.clientX;
      s.y = evento.clientY;

      if (!s.comprometido) {
        const dist = Math.hypot(s.x - s.x0, s.y - s.y0);
        if (dist > LIMIAR_PX) comprometer();
        return;
      }
      evento.preventDefault();
    }

    function soltar(evento: PointerEvent) {
      const s = vivo.current;
      if (!s || evento.pointerId !== s.ponteiroId) return;

      if (s.comprometido) {
        // Re-testar o alvo AQUI, não confiar no último realce: o amortecimento
        // visual atrasa o realce e faria todo arrasto curto no toque ser recusado.
        const alvo = alvoSob(evento.clientX, evento.clientY);
        const recusa = alvo == null ? "" : validar(s.carga, alvo);
        if (alvo != null && !recusa && alvo !== s.carga.origem) aoSoltar(s.carga, alvo);
      }

      document.documentElement.releasePointerCapture?.(evento.pointerId);
      fechar();
    }

    function cancelar(evento: PointerEvent) {
      if (vivo.current?.ponteiroId === evento.pointerId) fechar();
    }

    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", cancelar);
    window.addEventListener("lostpointercapture", cancelar);

    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", cancelar);
      window.removeEventListener("lostpointercapture", cancelar);
    };
  }, [comprometer, fechar, validar, aoSoltar]);

  // Efeito só de desmontagem: cancela temporizador e rAF pendentes, e solta o
  // atributo de cursor, se o quadro sumir da tela no meio de um arrasto (troca
  // de rota, por exemplo). Sem isto o laço de `requestAnimationFrame`
  // continuaria se rechamando para sempre — os ouvintes de `window` já
  // teriam sumido, então nada mais o pararia — e `data-arrastando` ficaria
  // preso no `<html>`, travando cursor e seleção para a próxima página.
  // Separado do efeito acima porque aquele reexecuta a cada troca de callback;
  // cancelar o arrasto nesse momento derrubaria um gesto em andamento à toa.
  useEffect(() => {
    return () => limparRecursos(vivo.current);
  }, []);

  /** Espalhar no botão de detalhe do cartão: engole o clique que fecha um arrasto. */
  const engolirClique = useCallback((evento: React.MouseEvent) => {
    if (vivo.current?.houveArrasto) {
      evento.preventDefault();
      evento.stopPropagation();
    }
  }, []);

  /* Realinha `estado.alvo` para a semana nova ao atravessar semana em pleno
     movimento: mesmo dia da semana, mesma turma (ver `realinharAlvo`, em
     `navegacao.ts`, para a aritmética e a razão do bug sem isto). Otimista —
     a grade nova só existe no próximo render, então não dá para validar a
     chave nova aqui contra dado fresco; ela é determinística (±7 dias) e
     `recusa: null` assume que continua valendo o que valia antes de cruzar a
     semana. Se a suposição estiver errada (por exemplo, a turma ficou
     desativada só na semana nova), a PRÓXIMA seta já revalida contra a grade
     fresca, através do caminho normal (`validar` mais abaixo). */
  const realinhar = useCallback(
    (atual: { carga: CargaArrasto; alvo: Alvo }, delta: -1 | 1) => {
      definirEstado({
        fase: "carregando",
        carga: atual.carga,
        alvo: realinharAlvo(atual.alvo, delta),
        recusa: null,
      });
    },
    [definirEstado],
  );

  const aoTeclar = useCallback(
    (evento: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => {
      // Lido do espelho, não de `estado`: `estado` recriaria este callback a
      // cada quadro de um arrasto por ponteiro em andamento (ver `estadoRef`).
      const atual = estadoRef.current.fase === "carregando" ? estadoRef.current : null;

      if (evento.key === " " || evento.key === "Spacebar") {
        evento.preventDefault();
        if (atual) {
          if (!atual.recusa) aoSoltar(atual.carga, atual.alvo);
          fechar();
          return;
        }
        definirEstado({ fase: "carregando", carga, alvo: carga.origem, recusa: null });
        anunciar(`${carga.rotulo} pego. Setas escolhem o dia e a equipe, Enter solta.`);
        return;
      }

      if (!atual) return;

      if (evento.key === "Escape") {
        evento.preventDefault();
        anunciar("Movimento cancelado. O serviço continua onde estava.");
        fechar();
        return;
      }

      // `preventDefault` no Enter: sem ele, soltar também dispara o botão de
      // detalhe e a gaveta abre por cima do quadro que acabou de mudar.
      if (evento.key === "Enter") {
        evento.preventDefault();
        if (atual.recusa) {
          anunciar(atual.recusa);
          return;
        }
        aoSoltar(atual.carga, atual.alvo);
        fechar();
        return;
      }

      const direcoes: Record<string, Direcao> = {
        ArrowLeft: "esquerda",
        ArrowRight: "direita",
        ArrowUp: "cima",
        ArrowDown: "baixo",
      };
      const direcao = direcoes[evento.key];
      if (!direcao) return;

      evento.preventDefault();

      if (evento.shiftKey && (direcao === "esquerda" || direcao === "direita")) {
        const delta = direcao === "direita" ? 1 : -1;
        aoNavegarSemana(delta);
        realinhar(atual, delta);
        return;
      }

      const passo = proximoAlvo(grade, atual.alvo, direcao);

      if (passo.tipo === "semana") {
        aoNavegarSemana(passo.delta);
        realinhar(atual, passo.delta);
        return;
      }
      if (passo.tipo === "borda") {
        // "Fim da semana" só faz sentido no eixo horizontal. No vertical (uma
        // ponta da coluna de equipes) e a partir do trilho (que não tem
        // eixo vertical e só sai pela direita) o motivo é outro — dizer "fim
        // da semana" ali confundiria quem usa leitor de tela à toa.
        const semEixoHorizontal = direcao === "cima" || direcao === "baixo" || atual.alvo === "fila";
        const sufixo = semEixoHorizontal
          ? "Não há equipe nessa direção."
          : "Fim da semana; Shift e seta para a próxima.";
        anunciar(`${descrever(passo.alvo, atual.carga)} ${sufixo}`);
        return;
      }

      const recusa = validar(atual.carga, passo.alvo);
      definirEstado({ fase: "carregando", carga: atual.carga, alvo: passo.alvo, recusa });
      anunciar(recusa ?? descrever(passo.alvo, atual.carga));
    },
    [grade, validar, aoSoltar, descrever, anunciar, aoNavegarSemana, fechar, definirEstado, realinhar],
  );

  return { estado, iniciar, aoTeclar, engolirClique, cancelar: fechar };
}

/** Velocidade da auto-rolagem num eixo: 0 no meio, cresce ao chegar na borda. */
function passo(distanciaInicio: number, distanciaFim: number): number {
  if (distanciaInicio < BORDA_PX) {
    return -Math.round(((BORDA_PX - distanciaInicio) / BORDA_PX) * VELOCIDADE_MAX);
  }
  if (distanciaFim < BORDA_PX) {
    return Math.round(((BORDA_PX - distanciaFim) / BORDA_PX) * VELOCIDADE_MAX);
  }
  return 0;
}
