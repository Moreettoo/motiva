"use client";

import type * as React from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { MapPinned, Maximize, Minus, Plus } from "lucide-react";

import { ChipRisco } from "@/components/ui/chip";
import { EstadoVazio } from "@/components/ui/vazio";
import { CLASSE_BALAO, LARGURA_BALAO } from "@/components/viz/dica-grafico";
import { IconeDominio } from "@/components/viz/legenda";
import { useLargura } from "@/components/viz/usar-largura";
import {
  ORDEM_RISCO,
  RISCO,
  estadoDaAltura,
  ordemRisco,
  rotuloPrazo,
  textoPrazo,
} from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { Risco, TrechoStatus } from "@/lib/types";
import { clamp, cn, scale } from "@/lib/utils";

import {
  ANCORA_CENTRO,
  LIMIAR_ARRASTO,
  PASSO_ZOOM,
  ZOOM_MIN,
  aplicarZoom,
  deslocar,
  escalaDaVista,
  estaAjustada,
  fatorDaRoda,
  limitarVista,
  mesmaVista,
  trazerParaVista,
  vistaAjustada,
  type Enquadramento,
  type Limites,
  type Vista,
} from "./zoom-mapa";

const RECUO = { topo: 14, direita: 14, base: 24, esquerda: 52 };
/**
 * Passos da grade, do mais fino ao mais grosso, cada um com as casas decimais
 * que o rótulo precisa.
 *
 * As casas saem do PASSO, não de um limiar de grandeza: com uma casa só, o
 * passo de 0,25° escreve "-22,3 / -22,5 / -22,8" para linhas igualmente
 * espaçadas, e o de 0,05° repete o mesmo número em duas linhas vizinhas.
 */
const PASSOS_GRAU: { passo: number; casas: 1 | 2 }[] = [
  { passo: 0.01, casas: 2 },
  { passo: 0.02, casas: 2 },
  { passo: 0.05, casas: 2 },
  { passo: 0.1, casas: 1 },
  { passo: 0.25, casas: 2 },
  { passo: 0.5, casas: 1 },
  { passo: 1, casas: 1 },
  { passo: 2, casas: 1 },
  { passo: 5, casas: 1 },
  { passo: 10, casas: 1 },
];
const FOLGA_PARALELO = 56;
const FOLGA_MERIDIANO = 76;
/** Alvo de ponteiro maior que a marca (raio máximo de 9px). */
const ALVO = 28;
/** Quantos pontos ainda cabem com rótulo direto antes de virar poluição. */
const MAX_ROTULOS = 12;
/** Passo do teclado, em px de tela. Shift multiplica. */
const PASSO_TECLADO = 44;

type Ponto = {
  id: number;
  /** Coordenada projetada (grau), que é onde o zoom trabalha. */
  gx: number;
  gy: number;
  /** Posição na tela, já com a vista aplicada. */
  x: number;
  y: number;
  raio: number;
  risco: Risco;
  trecho: TrechoStatus;
  /** Dentro da área de plotagem na vista atual — fora dela não há alvo nem rótulo. */
  visivel: boolean;
  rotuloDireto: string | null;
  rotuloX: number;
  rotuloAncora: "start" | "end";
};

type PassoGrau = (typeof PASSOS_GRAU)[number];

function escolherPassoGrau(pixelsPorGrau: number, folga: number): PassoGrau {
  for (const entrada of PASSOS_GRAU) {
    if (entrada.passo * pixelsPorGrau >= folga) return entrada;
  }
  return PASSOS_GRAU[PASSOS_GRAU.length - 1];
}

function rotuloGrau(valor: number, { casas }: PassoGrau): string {
  return `${casas === 2 ? fmt.d2(valor) : fmt.d1(valor)}°`;
}

function graus(de: number, ate: number, passo: number): number[] {
  const primeiro = Math.ceil(de / passo - 1e-9) * passo;
  const total = Math.floor((ate - primeiro) / passo + 1e-9);
  if (total < 0) return [];

  const saida: number[] = [];
  for (let i = 0; i <= Math.min(total, 60); i += 1) saida.push(primeiro + i * passo);
  return saida;
}

/**
 * Dispersão geográfica da malha, em SVG puro.
 *
 * Sem biblioteca de mapa e sem tile externo de propósito: o painel precisa abrir
 * numa sala de operação sem internet. A projeção é equirretangular corrigida pelo
 * cosseno da latitude média — na escala de uma concessionária o erro é irrelevante
 * e o desenho não distorce distância leste-oeste.
 *
 * Os pontos são desenhados em SVG mas o alvo de interação é uma camada de <button>
 * (ou <Link>) em HTML por cima: foco de teclado, ordem de tabulação e aria-label
 * de verdade, sem inventar `role` em elemento gráfico.
 *
 * ## Zoom
 *
 * O enquadramento é estado (`vista`: fator e centro em GRAUS projetados) e a
 * projeção é recalculada a partir dele — não é um `transform` no SVG. Isso custa
 * um `map` de 50 pontos por quadro e paga três coisas que a escala em CSS não
 * daria: a tipografia dos rótulos não estica, a grade troca de passo conforme se
 * aproxima (10° → 1° → 0,1°) em vez de virar um quadriculado gigante, e o raio
 * da marca continua significando extensão em km, não distância da câmera.
 *
 * A aritmética — âncora, limites, fator da roda — mora em `zoom-mapa.ts`, que é
 * puro e testado. Aqui fica só o que precisa de DOM.
 */
export function MapaMalha({
  trechos,
  selecionado = null,
  aoSelecionar,
  altura = 420,
  className,
}: {
  trechos: TrechoStatus[];
  selecionado?: number | null;
  aoSelecionar?: (id: number) => void;
  altura?: number;
  className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const largura = useLargura(caixa);
  const [destacado, setDestacado] = useState<number | null>(null);
  // `useId` sai com pontuação que não vale dentro de `url(#…)`; o id do recorte
  // é referenciado por CSS, então fica só o alfanumérico.
  const recorte = `recorte-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const alturaPx = Math.max(altura, 240);

  /* O que NÃO depende da vista: a nuvem de pontos, a escala do ajuste e a caixa
     de plotagem. Refazer isto a cada quadro de arrasto seria refazer três
     `Math.min(...lista)` e a escala de raio à toa. */
  const base = useMemo(() => {
    const validos = trechos.filter(
      (t) => Number.isFinite(Number(t.latitude)) && Number.isFinite(Number(t.longitude)),
    );
    if (validos.length === 0) return null;

    const lats = validos.map((t) => Number(t.latitude));
    const lons = validos.map((t) => Number(t.longitude));

    const latMedia = (Math.min(...lats) + Math.max(...lats)) / 2;
    const k = Math.max(Math.cos((latMedia * Math.PI) / 180), 0.1);

    const xs = lons.map((lon) => lon * k);
    const limites: Limites = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...lats),
      maxY: Math.max(...lats),
    };

    const larguraPlot = Math.max(largura - RECUO.esquerda - RECUO.direita, 10);
    const alturaPlot = Math.max(alturaPx - RECUO.topo - RECUO.base, 10);

    // Piso no intervalo para não estourar a escala quando a malha é quase pontual.
    const dx = Math.max(limites.maxX - limites.minX, 0.02);
    const dy = Math.max(limites.maxY - limites.minY, 0.02);
    // 0.9 deixa respiro para o raio do ponto e para o rótulo direto.
    const enq: Enquadramento = {
      esc0: Math.min(larguraPlot / dx, alturaPlot / dy) * 0.9,
      larguraPlot,
      alturaPlot,
    };

    const extensoes = validos.map((t) => Number(t.extensao_km) || 0);
    const minExt = Math.min(...extensoes);
    const maxExt = Math.max(...extensoes);
    const raioDe = (ext: number) =>
      maxExt - minExt < 0.01 ? 7 : scale(ext, [minExt, maxExt], [5, 9]);

    /* Identidade da NUVEM, não do enquadramento: um filtro que muda os trechos
       reenquadra do zero (o zoom de outra malha não quer dizer nada aqui), mas
       redimensionar a janela — que muda `esc0` sem mexer no dado — preserva
       onde a pessoa estava olhando. */
    const chave = [limites.minX, limites.maxX, limites.minY, limites.maxY, validos.length]
      .map((n) => n.toFixed(5))
      .join("|");

    return {
      validos,
      k,
      limites,
      enq,
      raioDe,
      chave,
      meioPlotX: RECUO.esquerda + larguraPlot / 2,
      meioPlotY: RECUO.topo + alturaPlot / 2,
    };
  }, [trechos, largura, alturaPx]);

  /* A vista carrega a chave da nuvem a que pertence. Quando o filtro muda, a
     chave não bate e o valor guardado é simplesmente ignorado — sem efeito de
     reset, sem `setState` no render. */
  const [vista, setVista] = useState<Vista & { chave: string }>({
    chave: "",
    z: ZOOM_MIN,
    cx: 0,
    cy: 0,
  });

  const atual = useMemo<Vista | null>(() => {
    if (!base) return null;
    const bruta = vista.chave === base.chave ? vista : vistaAjustada(base.limites);
    // Limita também aqui: `esc0` muda quando a caixa é redimensionada, e um
    // centro que era legal numa largura pode deixar de ser em outra.
    return limitarVista(bruta, base.limites, base.enq);
  }, [base, vista]);

  /* Espelho de `atual` para os manipuladores. A roda dispara várias vezes por
     quadro e o React só entrega o estado novo no render seguinte: sem o espelho
     escrito na hora, o segundo evento do mesmo quadro partiria do zoom velho e
     o gesto perderia metade dos entalhes. */
  const vistaViva = useRef<Vista | null>(null);
  useEffect(() => {
    vistaViva.current = atual;
  }, [atual]);

  const aplicar = useCallback(
    (nova: Vista) => {
      if (!base) return;
      vistaViva.current = nova;
      setVista({ chave: base.chave, ...nova });
    },
    [base],
  );

  /** A vista de onde um gesto parte — o espelho, com o ajuste como rede. */
  const partida = useCallback(
    () => (base ? (vistaViva.current ?? vistaAjustada(base.limites)) : null),
    [base],
  );

  /** Âncora de um evento de ponteiro: px a partir do centro da plotagem. */
  const ancoraDo = useCallback(
    (clientX: number, clientY: number) => {
      const r = caixa.current?.getBoundingClientRect();
      if (!r || !base) return ANCORA_CENTRO;
      return { dx: clientX - r.left - base.meioPlotX, dy: clientY - r.top - base.meioPlotY };
    },
    [base],
  );

  /* A roda entra por `addEventListener` e não por `onWheel`: o React registra
     `wheel` como PASSIVO na raiz, e num ouvinte passivo o `preventDefault` é
     ignorado com aviso no console — a página rolaria junto com o zoom. */
  useEffect(() => {
    const el = caixa.current;
    if (!el || !base) return;

    function roda(evento: WheelEvent) {
      if (!base || evento.deltaY === 0) return;
      const de = partida();
      if (!de) return;

      const para = aplicarZoom(
        de,
        fatorDaRoda(evento.deltaY, evento.deltaMode),
        ancoraDo(evento.clientX, evento.clientY),
        base.limites,
        base.enq,
      );
      // No teto e no chão do zoom o gesto não muda nada — devolver a rolagem
      // para a página é o que impede o ponteiro de ficar preso no mapa.
      if (mesmaVista(de, para)) return;

      evento.preventDefault();
      aplicar(para);
    }

    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, [base, partida, ancoraDo, aplicar]);

  /* Arrasto para deslocar. Os ouvintes ficam em `window` porque o gesto não
     pode morrer quando o ponteiro sai da caixa, e a captura de ponteiro não
     serve aqui: capturar redireciona o `click` para quem capturou, e as marcas
     — que são <button>/<Link> de verdade por cima — deixariam de abrir. */
  const arrasto = useRef<{ id: number; x: number; y: number; moveu: boolean } | null>(null);
  const [arrastando, setArrastando] = useState(false);
  /** Um arrasto que terminou engole o `click` que o navegador sintetiza em
   *  seguida — senão soltar o mapa sobre uma marca abre o trecho. */
  const engoliuClique = useRef(false);
  /* O sinal acima precisa MORRER sozinho, e não só quando um clique o consome:
     um arrasto que termina fora da caixa (ou sobre o balão, que não recebe
     ponteiro) não gera clique nenhum ali dentro, e o sinal ficava armado até o
     PRÓXIMO clique — que virava o clique comido, num botão de zoom ou numa
     marca que ninguém arrastou. A limpeza é diferida por uma tarefa porque o
     `click` sintético DESTE gesto ainda é despachado na mesma em que o
     `pointerup`: zerar de forma síncrona reabriria o buraco original. */
  const limpezaClique = useRef<number | null>(null);
  const agendarLimpeza = useCallback(() => {
    if (limpezaClique.current != null) window.clearTimeout(limpezaClique.current);
    limpezaClique.current = window.setTimeout(() => {
      engoliuClique.current = false;
      limpezaClique.current = null;
    }, 0);
  }, []);

  useEffect(
    () => () => {
      if (limpezaClique.current != null) window.clearTimeout(limpezaClique.current);
    },
    [],
  );

  useEffect(() => {
    if (!base) return;

    function mover(evento: PointerEvent) {
      const s = arrasto.current;
      if (!s || evento.pointerId !== s.id || !base) return;

      const dx = evento.clientX - s.x;
      const dy = evento.clientY - s.y;
      if (!s.moveu) {
        if (Math.hypot(dx, dy) < LIMIAR_ARRASTO) return;
        s.moveu = true;
        engoliuClique.current = true;
        setArrastando(true);
      }
      s.x = evento.clientX;
      s.y = evento.clientY;

      const de = partida();
      if (de) aplicar(deslocar(de, dx, dy, base.limites, base.enq));
    }

    function terminar(evento: PointerEvent) {
      if (arrasto.current?.id !== evento.pointerId) return;
      const arrastou = arrasto.current.moveu;
      arrasto.current = null;
      setArrastando(false);
      if (arrastou) agendarLimpeza();
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", terminar);
    window.addEventListener("pointercancel", terminar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", terminar);
      window.removeEventListener("pointercancel", terminar);
    };
  }, [base, partida, aplicar, agendarLimpeza]);

  const podeDeslocar = (atual?.z ?? ZOOM_MIN) > ZOOM_MIN;

  const aoApontar = (evento: React.PointerEvent<HTMLDivElement>) => {
    if (evento.pointerType === "mouse" && evento.button !== 0) return;
    // No ajuste não há para onde deslocar: deixar o gesto nascer só transformaria
    // seleção de texto e rolagem por toque em nada.
    if (!podeDeslocar) return;
    // Arrastar A PARTIR de uma marca desloca o mapa, de propósito — ela é uma
    // bolinha de 9px no meio da área de plotagem. A partir dos controles, não:
    // ali o gesto é "apertar o botão", e o mapa fugir sob o dedo seria acidente.
    if ((evento.target as HTMLElement).closest("[data-controles]")) return;
    // Defensivo: um gesto novo nunca herda o sinal do anterior, e uma limpeza
    // ainda pendente apagaria o sinal DESTE gesto no meio dele.
    engoliuClique.current = false;
    if (limpezaClique.current != null) {
      window.clearTimeout(limpezaClique.current);
      limpezaClique.current = null;
    }
    arrasto.current = { id: evento.pointerId, x: evento.clientX, y: evento.clientY, moveu: false };
  };

  const engolirClique = (evento: React.MouseEvent) => {
    if (!engoliuClique.current) return;
    engoliuClique.current = false;
    evento.preventDefault();
    evento.stopPropagation();
  };

  const ampliar = (fator: number, ancora = ANCORA_CENTRO) => {
    const de = partida();
    if (de && base) aplicar(aplicarZoom(de, fator, ancora, base.limites, base.enq));
  };

  const reenquadrar = () => {
    if (base) aplicar(limitarVista(vistaAjustada(base.limites), base.limites, base.enq));
  };

  const aoDuploClique = (evento: React.MouseEvent<HTMLDivElement>) => {
    // Duplo clique numa marca já é "abrir duas vezes"; e nos controles seria o
    // botão contando duas vezes e o mapa uma terceira. A guarda é na MARCA e no
    // controle, nunca na camada que os hospeda: ela cobre a área de plotagem
    // inteira, e mirá-la desligaria o duplo clique em todo o mapa.
    if ((evento.target as HTMLElement).closest("[data-marca],[data-controles]")) return;
    ampliar(evento.altKey ? 1 / PASSO_ZOOM : PASSO_ZOOM, ancoraDo(evento.clientX, evento.clientY));
  };

  const aoTeclar = (evento: React.KeyboardEvent<HTMLDivElement>) => {
    const de = partida();
    if (!de || !base) return;
    const passo = evento.shiftKey ? PASSO_TECLADO * 3 : PASSO_TECLADO;

    switch (evento.key) {
      case "+":
      case "=":
        ampliar(PASSO_ZOOM);
        break;
      case "-":
      case "_":
        ampliar(1 / PASSO_ZOOM);
        break;
      case "0":
        reenquadrar();
        break;
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        // No ajuste as setas não têm o que deslocar, e engoli-las tiraria da
        // pessoa a rolagem da página com o foco dentro do mapa.
        if (!podeDeslocar) return;
        const dx = evento.key === "ArrowLeft" ? passo : evento.key === "ArrowRight" ? -passo : 0;
        const dy = evento.key === "ArrowUp" ? passo : evento.key === "ArrowDown" ? -passo : 0;
        aplicar(deslocar(de, dx, dy, base.limites, base.enq));
        break;
      }
      default:
        return;
    }
    evento.preventDefault();
  };

  /** Desencosta da moldura a marca que acabou de receber o foco (ver
   *  `trazerParaVista`). Só no foco de TECLADO: no clique o ponteiro já está
   *  sobre a marca, e recentrar faria o mapa fugir de baixo do cursor. */
  const seguirFoco = (elemento: HTMLElement, ponto: { gx: number; gy: number }) => {
    if (!base || !elemento.matches(":focus-visible")) return;
    const de = partida();
    if (de) aplicar(trazerParaVista(de, { x: ponto.gx, y: ponto.gy }, base.limites, base.enq));
  };

  const desenho = useMemo(() => {
    if (!base || !atual) return null;

    const { k, enq, raioDe, meioPlotX, meioPlotY } = base;
    const esc = escalaDaVista(enq, atual.z);
    const projetar = (lat: number, gx: number) => ({
      x: meioPlotX + (gx - atual.cx) * esc,
      y: meioPlotY - (lat - atual.cy) * esc,
    });

    // Crítico por último para ficar por cima na pilha de desenho.
    const ordenados = [...base.validos].sort((a, b) => ordemRisco(b.risco) - ordemRisco(a.risco));

    const ocupadas: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const cabe = (x1: number, y1: number, x2: number, y2: number) =>
      !ocupadas.some((r) => !(x2 < r.x1 || x1 > r.x2 || y2 < r.y1 || y1 > r.y2));

    const pontos: Ponto[] = ordenados.map((t) => {
      const gx = Number(t.longitude) * k;
      const gy = Number(t.latitude);
      const { x, y } = projetar(gy, gx);
      const raio = raioDe(Number(t.extensao_km) || 0);
      const visivel =
        x >= RECUO.esquerda - raio &&
        x <= largura - RECUO.direita + raio &&
        y >= RECUO.topo - raio &&
        y <= alturaPx - RECUO.base + raio;

      if (visivel) {
        ocupadas.push({ x1: x - raio - 2, y1: y - raio - 2, x2: x + raio + 2, y2: y + raio + 2 });
      }
      return {
        id: t.id,
        gx,
        gy,
        x,
        y,
        raio,
        risco: t.risco,
        trecho: t,
        visivel,
        rotuloDireto: null,
        rotuloX: x,
        rotuloAncora: "start" as const,
      };
    });

    const naVista = pontos.filter((p) => p.visivel);

    /* Rótulo direto só quando são poucos pontos na tela e sobra espaço — nunca
       um número em cima de toda marca. Conta os VISÍVEIS, não a malha inteira:
       é o que faz os nomes das rodovias aparecerem ao se aproximar, que é
       metade do motivo de existir o zoom. */
    if (naVista.length <= MAX_ROTULOS) {
      // Por urgência, não por ordem de desenho: quando dois pontos disputam o
      // mesmo espaço, quem fica com o rótulo é o trecho mais crítico.
      const disputa = [...naVista].sort((a, b) => ordemRisco(a.risco) - ordemRisco(b.risco));
      for (const p of disputa) {
        const texto = p.trecho.rodovia;
        const w = texto.length * 5.9 + 8;
        // 9px afasta o rótulo também do anel de seleção (raio + 5, traço de 2).
        const direita = p.x + p.raio + 9;
        const paraDireita = direita + w <= largura - RECUO.direita;
        const x1 = paraDireita ? direita : p.x - p.raio - 9 - w;
        const x2 = x1 + w;

        if (x1 < RECUO.esquerda) continue;
        if (!cabe(x1, p.y - 7, x2, p.y + 7)) continue;

        ocupadas.push({ x1, y1: p.y - 7, x2, y2: p.y + 7 });
        p.rotuloDireto = texto;
        p.rotuloX = paraDireita ? direita : p.x - p.raio - 9;
        p.rotuloAncora = paraDireita ? "start" : "end";
      }
    }

    const latMin = atual.cy - enq.alturaPlot / 2 / esc;
    const latMax = atual.cy + enq.alturaPlot / 2 / esc;
    const lonMin = (atual.cx - enq.larguraPlot / 2 / esc) / k;
    const lonMax = (atual.cx + enq.larguraPlot / 2 / esc) / k;

    const passoLat = escolherPassoGrau(esc, FOLGA_PARALELO);
    const passoLon = escolherPassoGrau(esc * k, FOLGA_MERIDIANO);
    const paralelos = graus(latMin, latMax, passoLat.passo).map((lat) => ({
      lat,
      y: projetar(lat, atual.cx).y,
    }));
    const meridianos = graus(lonMin, lonMax, passoLon.passo).map((lon) => ({
      lon,
      x: projetar(atual.cy, lon * k).x,
    }));

    return { pontos, naVista, paralelos, meridianos, passoLat, passoLon };
  }, [base, atual, largura, alturaPx]);

  const contagem = useMemo(() => {
    const contas: Record<Risco, number> = { critica: 0, alta: 0, media: 0, baixa: 0 };
    for (const t of trechos) contas[t.risco] += 1;
    return contas;
  }, [trechos]);

  if (!base || !atual || !desenho) {
    return (
      <EstadoVazio
        className={className}
        icone={<MapPinned />}
        titulo="Nenhum trecho com coordenada"
        descricao="A dispersão geográfica aparece assim que os trechos tiverem latitude e longitude preenchidas."
      />
    );
  }

  const { pontos, naVista, paralelos, meridianos, passoLat, passoLon } = desenho;
  const { larguraPlot, alturaPlot } = base.enq;
  const ajustada = estaAjustada(atual);
  const emFoco = naVista.find((p) => p.id === destacado) ?? null;
  const alturaEmFoco = emFoco
    ? estadoDaAltura(emFoco.trecho.altura_atual_cm, emFoco.trecho.altura_limite_cm)
    : null;

  // O desenho empilha o crítico por último; a tabulação faz o contrário, para
  // que a primeira parada de teclado seja o trecho mais urgente.
  const porUrgencia = [...naVista].sort((a, b) => ordemRisco(a.risco) - ordemRisco(b.risco));

  let estiloDica: CSSProperties = {};
  if (emFoco) {
    const acima = emFoco.y - emFoco.raio - 12 > 120;
    estiloDica = {
      width: LARGURA_BALAO,
      left:
        largura <= LARGURA_BALAO
          ? largura / 2
          : clamp(emFoco.x, LARGURA_BALAO / 2, largura - LARGURA_BALAO / 2),
      top: acima ? emFoco.y - emFoco.raio - 12 : emFoco.y + emFoco.raio + 12,
      transform: acima ? "translate(-50%, -100%)" : "translate(-50%, 0)",
    };
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div
        ref={caixa}
        className={cn(
          // `select-none` na CAIXA, não durante o arrasto: a seleção nasce onde
          // o `pointerdown` cai, e um arrasto que sai do mapa pintava de azul a
          // legenda e o rodapé no caminho. Não custa nada — o que há aqui é
          // texto de eixo em SVG e um balão sem ponteiro, nada que se copie.
          "relative w-full overflow-hidden rounded-lg border border-border bg-surface select-none",
          podeDeslocar && (arrastando ? "cursor-grabbing" : "cursor-grab"),
        )}
        style={{ height: alturaPx, touchAction: podeDeslocar ? "none" : undefined }}
        onPointerDown={aoApontar}
        onClickCapture={engolirClique}
        onDoubleClick={aoDuploClique}
        onKeyDown={aoTeclar}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          width={largura}
          height={alturaPx}
          viewBox={`0 0 ${largura} ${alturaPx}`}
          className="block"
        >
          <defs>
            {/* A marca vive dentro da moldura, ampliada ou não: sem o recorte,
                um ponto deslocado para fora atravessaria os rótulos dos eixos. */}
            <clipPath id={recorte}>
              <rect
                x={RECUO.esquerda}
                y={RECUO.topo}
                width={larguraPlot}
                height={alturaPlot}
              />
            </clipPath>
          </defs>

          <g shapeRendering="crispEdges">
            {paralelos.map(({ lat, y }) => (
              <g key={`p-${lat}`}>
                <line
                  x1={RECUO.esquerda}
                  x2={largura - RECUO.direita}
                  y1={y}
                  y2={y}
                  className="stroke-grid"
                  strokeWidth={1}
                />
                <text
                  x={RECUO.esquerda - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-ink-3 font-mono text-2xs"
                  shapeRendering="auto"
                >
                  {rotuloGrau(lat, passoLat)}
                </text>
              </g>
            ))}

            {meridianos.map(({ lon, x }) => (
              <g key={`m-${lon}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={RECUO.topo}
                  y2={alturaPx - RECUO.base}
                  className="stroke-grid"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={alturaPx - RECUO.base + 14}
                  textAnchor="middle"
                  className="fill-ink-3 font-mono text-2xs"
                  shapeRendering="auto"
                >
                  {rotuloGrau(lon, passoLon)}
                </text>
              </g>
            ))}

            <rect
              x={RECUO.esquerda}
              y={RECUO.topo}
              width={larguraPlot}
              height={alturaPlot}
              fill="none"
              className="stroke-axis"
              strokeWidth={1}
            />
          </g>

          <g clipPath={`url(#${recorte})`}>
            {pontos.map((p, i) => {
              const cor = RISCO[p.risco].cor;
              const ativo = p.id === selecionado;
              const sobre = p.id === destacado;

              return (
                <g key={p.id} className="fade" style={{ "--i": Math.min(i, 14) } as CSSProperties}>
                  {/* Pulso só no que é crítico: o movimento é o canal mais caro da tela. */}
                  {p.risco === "critica" ? (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={p.raio}
                      fill="none"
                      strokeWidth={2}
                      style={{
                        stroke: cor,
                        transformBox: "fill-box",
                        transformOrigin: "center",
                        // Defasagem em ciclo curto: os críticos são desenhados por
                        // último, e o índice cru atrasaria o pulso em vários segundos.
                        animation: `pulse-ring 2.4s var(--ease-out-quint) ${(i % 4) * 260}ms infinite`,
                      }}
                    />
                  ) : null}

                  {/* Segundo canal, estático: os 4 passos de status ficam abaixo de 3:1 entre si
                      (serious×warning = 1,44:1) e o mapa é forma de todos-os-pares. O anel escuro
                      separa o que precisa de equipe do que espera — e, ao contrário do pulso,
                      sobrevive a prefers-reduced-motion. */}
                  {p.risco === "critica" || p.risco === "alta" ? (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={p.raio + 3}
                      fill="none"
                      className="stroke-ink"
                      strokeWidth={1.5}
                      strokeDasharray={p.risco === "alta" ? "2 2.5" : undefined}
                    />
                  ) : null}

                  {ativo ? (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={p.raio + 5}
                      fill="none"
                      className="stroke-accent-line"
                      strokeWidth={2}
                    />
                  ) : null}

                  {/* Anel na cor da superfície: pontos sobrepostos continuam separáveis. */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={sobre ? p.raio + 2 : p.raio}
                    className="stroke-surface"
                    strokeWidth={2}
                    style={{ fill: cor }}
                  />

                  {p.rotuloDireto ? (
                    <text
                      x={p.rotuloX}
                      y={p.y}
                      textAnchor={p.rotuloAncora}
                      dominantBaseline="middle"
                      className="fill-ink-2 text-2xs"
                    >
                      {p.rotuloDireto}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Camada de interação: <button> ou <Link> de verdade sobre cada marca.
            Recortada na área de plotagem pelo mesmo motivo do SVG — e só com o
            que está na vista, para não deixar alvo invisível sobre os eixos. */}
        <div
          className="absolute overflow-hidden"
          style={{
            left: RECUO.esquerda,
            top: RECUO.topo,
            width: larguraPlot,
            height: alturaPlot,
          }}
        >
          {porUrgencia.map((p) => {
            const t = p.trecho;
            const rotulo = [
              t.sentido ? `${t.rodovia} sentido ${t.sentido}` : t.rodovia,
              fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim)),
              t.uf,
              `classificação de risco ${RISCO[p.risco].rotulo.toLowerCase()}`,
              textoPrazo(t.dias_ate_limite),
            ].join(", ");

            const estilo: CSSProperties = {
              left: p.x - RECUO.esquerda,
              top: p.y - RECUO.topo,
              width: ALVO,
              height: ALVO,
            };
            const classe =
              "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full outline-offset-2";

            const soltarDestaque = () =>
              setDestacado((anterior) => (anterior === p.id ? null : anterior));

            const eventos = {
              onMouseEnter: () => setDestacado(p.id),
              onMouseLeave: soltarDestaque,
              onFocus: (evento: React.FocusEvent<HTMLElement>) => {
                setDestacado(p.id);
                seguirFoco(evento.currentTarget, p);
              },
              onBlur: soltarDestaque,
            };

            if (aoSelecionar) {
              return (
                <button
                  key={p.id}
                  type="button"
                  data-marca
                  aria-label={rotulo}
                  aria-pressed={p.id === selecionado}
                  className={classe}
                  style={estilo}
                  onClick={() => aoSelecionar(p.id)}
                  {...eventos}
                />
              );
            }

            return (
              <Link
                key={p.id}
                href={`/trechos/${p.id}`}
                data-marca
                aria-label={rotulo}
                aria-current={p.id === selecionado ? "true" : undefined}
                className={classe}
                style={estilo}
                {...eventos}
              />
            );
          })}
        </div>

        <div
          data-controles
          role="group"
          aria-label="Zoom do mapa"
          className="absolute top-2 right-2 z-20 flex items-center gap-0.5 rounded-md border border-border bg-surface-2/90 p-0.5 backdrop-blur-sm"
        >
          <BotaoZoom rotulo="Aproximar" onClick={() => ampliar(PASSO_ZOOM)}>
            <Plus />
          </BotaoZoom>
          <BotaoZoom rotulo="Afastar" onClick={() => ampliar(1 / PASSO_ZOOM)} desligado={ajustada}>
            <Minus />
          </BotaoZoom>
          <BotaoZoom rotulo="Enquadrar a malha inteira" onClick={reenquadrar} desligado={ajustada}>
            <Maximize />
          </BotaoZoom>
          {/* O fator só aparece quando há um: no ajuste ele seria um "1×" sempre
              aceso, ruído numa faixa que já vive por cima do dado. */}
          {ajustada ? null : (
            <span className="tnum px-1.5 font-mono text-2xs text-ink-2">
              {fmt.d1(atual.z)}×
            </span>
          )}
        </div>

        {emFoco ? (
          <div
            role="tooltip"
            className={cn("pointer-events-none absolute z-30", CLASSE_BALAO)}
            style={estiloDica}
          >
            <p className="truncate text-sm font-medium text-ink">
              {emFoco.trecho.sentido
                ? `${emFoco.trecho.rodovia} · ${emFoco.trecho.sentido}`
                : emFoco.trecho.rodovia}
            </p>
            <p className="tnum mt-0.5 font-mono text-2xs text-ink-3">
              {fmt.faixaKm(Number(emFoco.trecho.km_inicio), Number(emFoco.trecho.km_fim))} ·{" "}
              {emFoco.trecho.uf}
            </p>

            <div className="mt-2">
              <ChipRisco risco={emFoco.risco} tamanho="sm" />
            </div>

            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-2xs">
              <dt className="text-ink-3">Prazo</dt>
              <dd className="tnum text-right font-mono text-ink">
                {rotuloPrazo(emFoco.trecho.dias_ate_limite)}
              </dd>

              {/* Mesma leitura do balão da régua: altura contra limite, não o
                  percentual — o limite muda de trecho para trecho. */}
              <dt className="text-ink-3">Altura</dt>
              <dd className="tnum flex items-center justify-end gap-1 text-right font-mono text-ink">
                {alturaEmFoco == null ? (
                  "—"
                ) : (
                  <>
                    {alturaEmFoco.excedido ? (
                      <span
                        className="inline-flex shrink-0"
                        style={{ color: alturaEmFoco.token.tinta }}
                      >
                        <IconeDominio nome={alturaEmFoco.token.icone} className="size-3" />
                      </span>
                    ) : null}
                    {fmt.d1(alturaEmFoco.alturaCm)} / {fmt.cm(alturaEmFoco.limiteCm)}
                  </>
                )}
              </dd>

              <dt className="text-ink-3">Coordenada</dt>
              <dd className="tnum truncate text-right font-mono text-ink">
                {fmt.d3(Number(emFoco.trecho.latitude))}, {fmt.d3(Number(emFoco.trecho.longitude))}
              </dd>
            </dl>
          </div>
        ) : null}
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {ORDEM_RISCO.map((risco) => (
          <li key={risco} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full ring-2 ring-surface"
              style={{
                backgroundColor: RISCO[risco].cor,
                outline:
                  risco === "critica"
                    ? "1.5px solid var(--ink)"
                    : risco === "alta"
                      ? "1.5px dashed var(--ink)"
                      : undefined,
                outlineOffset: "2px",
              }}
            />
            <ChipRisco risco={risco} tamanho="sm" />
            <span className="tnum font-mono text-2xs text-ink-3">{fmt.n(contagem[risco])}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-2xs text-ink-3">
        {ajustada
          ? `${pontos.length} ${pontos.length === 1 ? "trecho posicionado" : "trechos posicionados"}`
          : `${naVista.length} de ${pontos.length} trechos na vista`}{" "}
        · raio proporcional à extensão em&nbsp;km · contorno escuro nos trechos que precisam de
        equipe
      </p>
      <p className="mt-1 text-2xs text-ink-3">
        Roda ou duplo clique aproxima · arraste desloca ·{" "}
        <kbd className="font-mono">+</kbd> <kbd className="font-mono">−</kbd> e as setas fazem o
        mesmo pelo teclado, <kbd className="font-mono">0</kbd> reenquadra
      </p>
    </div>
  );
}

/** Botão da faixa de zoom. Miúdo e fantasma de propósito: ele mora por cima do
 *  dado, e um botão sólido ali apagaria os trechos do canto superior direito. */
function BotaoZoom({
  rotulo,
  onClick,
  desligado = false,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  desligado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      disabled={desligado}
      onClick={onClick}
      className={cn(
        "inline-grid size-7 cursor-pointer place-items-center rounded text-ink-2",
        "transition-[background-color,color] duration-150 ease-[var(--ease-out-quint)]",
        "hover:bg-surface-3 hover:text-ink",
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:size-3.5",
      )}
    >
      <span aria-hidden="true" className="inline-flex">
        {children}
      </span>
    </button>
  );
}
