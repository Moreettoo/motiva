import "server-only";

import { unstable_cache } from "next/cache";

import { REGIME } from "./dominio";
import { REGIME_PADRAO, type Regime } from "./types";

/**
 * As duas features de solo que o modelo pede e o banco nao tem.
 *
 * Espelho de `solo.py`, que carrega a explicacao longa: por que SoilGrids, por
 * que Saxton & Rawls para a agua disponivel, por que a rampa de nitrogenio e
 * PREMISSA declarada e nao equacao publicada, e por que o ponto exato de uma
 * zona de rodovia cai em mancha urbana com tanta frequencia.
 *
 * O resumo que importa para quem le so este arquivo:
 *
 *   fertilidade_solo         move o crescimento previsto em ~71% entre 0,20 e
 *                            0,90. Nao e detalhe, e nao pode ser constante.
 *   capacidade_agua_solo_mm  move ~55% entre 35 e 120 mm, mas nesta malha o
 *                            SoilGrids devolve 56 a 65. A premissa de 60 mm nao
 *                            e chute: e a mediana medida.
 *
 * O simulador chama isto uma vez por ponto e guarda por 30 dias. Solo nao muda
 * em 30 dias -- o cache longo aqui e sobre a natureza do dado, e nao sobre
 * economizar requisicao.
 */

const API = "https://rest.isric.org/soilgrids/v2.0/properties/query";

/** Camadas dos 0-30 cm e a espessura de cada uma, em mm. */
const CAMADAS = [
  { nome: "0-5cm", espessura: 50 },
  { nome: "5-15cm", espessura: 100 },
  { nome: "15-30cm", espessura: 150 },
] as const;

const PROPRIEDADES = ["clay", "sand", "soc", "nitrogen"] as const;

/** Profundidade de raiz efetiva por regime, em mm. Vem de `REGIME`, em
 *  `dominio.ts`, porque o formulario tambem precisa dela e este arquivo e
 *  `server-only` -- ver a nota longa la. */
const raizMm = (regime: Regime): number => REGIME[regime].raizMm;

/** A faixa que o modelo VIU. Fora dela ele satura, entao o valor sai preso. */
const CAP_MIN = 35;
const CAP_MAX = 120;

/** A rampa de nitrogenio para fertilidade. PREMISSA declarada, ver `solo.py`. */
const N_POBRE_GKG = 0.5;
const N_RICO_GKG = 3.5;
const FERT_MIN = 0.05;
const FERT_MAX = 1;

/** A queda. A capacidade acompanha o regime porque ela e uma mediana MEDIDA
 *  (59,6 mm na raiz de 500 mm), reescalada pela profundidade; a fertilidade nao
 *  acompanha porque nao existe mediana medida de pastagem para reescalar. */
export const FERTILIDADE_PREMISSA = 0.35;
export const CAPACIDADE_PREMISSA_MM: Record<Regime, number> = { faixa: 60, pasto: 95 };

/** Deslocamentos sondados quando o ponto exato esta mascarado: ~2 km. */
const VIZINHANCA = [
  { dlat: 0, dlon: 0, km: 0 },
  { dlat: 0.02, dlon: 0, km: 2.2 },
  { dlat: -0.02, dlon: 0, km: 2.2 },
  { dlat: 0, dlon: 0.02, km: 2.0 },
  { dlat: 0, dlon: -0.02, km: 2.0 },
] as const;

const TIMEOUT_MS = 9_000;
/** Orcamento total. Passando disto a pagina fica com a premissa: o simulador e
 *  uma tela de demonstracao, e um mapa de solo lento nao pode segurar a curva. */
const ORCAMENTO_MS = 20_000;

export type Solo = {
  fertilidade: number;
  capacidadeMm: number;
  fonte: "soilgrids" | "premissa";
  /** A que distancia do ponto pedido o mapa respondeu, em km. */
  distanciaKm: number;
  /** Nitrogenio total 0-30 cm em g/kg, quando veio do mapa. */
  nitrogenioGkg: number | null;
  /** Qual conjunto de premissas produziu os dois numeros. O mesmo ponto devolve
   *  capacidades diferentes nos dois regimes, e a tela precisa poder dizer isso. */
  regime: Regime;
};

export function premissa(regime: Regime = REGIME_PADRAO): Solo {
  return {
    fertilidade: FERTILIDADE_PREMISSA,
    capacidadeMm: CAPACIDADE_PREMISSA_MM[regime],
    fonte: "premissa",
    distanciaKm: 0,
    nitrogenioGkg: null,
    regime,
  };
}

/** A premissa de faixa de dominio, que era o unico regime. */
export const PREMISSA: Solo = premissa();

/**
 * Agua disponivel para a planta, em fracao volumetrica.
 *
 * Saxton & Rawls (2006), SSSAJ 70:1569-1578, equacoes 1 e 2. `areiaPct` e
 * `argilaPct` em porcentagem de massa, `moPct` em porcentagem de materia
 * organica. Exportada para ser testavel sem rede.
 */
export function aguaDisponivel(areiaPct: number, argilaPct: number, moPct: number): number {
  const S = areiaPct / 100;
  const C = argilaPct / 100;
  const OM = moPct;

  const t15 =
    -0.024 * S + 0.487 * C + 0.006 * OM + 0.005 * (S * OM) - 0.013 * (C * OM) + 0.068 * (S * C) + 0.031;
  const murcha = t15 + (0.14 * t15 - 0.02);

  const t33 =
    -0.251 * S + 0.195 * C + 0.011 * OM + 0.006 * (S * OM) - 0.027 * (C * OM) + 0.452 * (S * C) + 0.299;
  const campo = t33 + (1.283 * t33 * t33 - 0.374 * t33 - 0.015);

  return Math.max(campo - murcha, 0);
}

/** A rampa. Isolada para ser trocavel e testavel de fora. */
export function fertilidadePorNitrogenio(nGkg: number): number {
  const bruto = (nGkg - N_POBRE_GKG) / (N_RICO_GKG - N_POBRE_GKG);
  return Math.min(FERT_MAX, Math.max(FERT_MIN, bruto));
}

type Camadas = Record<string, Record<string, number | null>>;

type RespostaSoilGrids = {
  properties?: {
    layers?: {
      name: string;
      unit_measure: { d_factor: number };
      depths: { label: string; values: { mean: number | null } }[];
    }[];
  };
};

function mediaPonderada(camada: Record<string, number | null> | undefined): number | null {
  if (!camada) return null;
  let soma = 0;
  let peso = 0;
  for (const { nome, espessura } of CAMADAS) {
    const v = camada[nome];
    if (v == null) continue;
    soma += v * espessura;
    peso += espessura;
  }
  return peso > 0 ? soma / peso : null;
}

async function consultar(lat: number, lon: number): Promise<Camadas | null> {
  const params = new URLSearchParams();
  params.set("lon", String(lon));
  params.set("lat", String(lat));
  params.set("value", "mean");
  for (const { nome } of CAMADAS) params.append("depth", nome);
  for (const p of PROPRIEDADES) params.append("property", p);

  const resposta = await fetch(`${API}?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!resposta.ok) throw new Error(`SoilGrids respondeu ${resposta.status}`);

  const corpo = (await resposta.json()) as RespostaSoilGrids;
  const camadas = corpo.properties?.layers;
  if (!camadas?.length) return null;

  const saida: Camadas = {};
  for (const camada of camadas) {
    // O divisor vem no proprio corpo, e ler dali e o que impede o erro classico
    // de argila virar 3,4% em vez de 34%.
    const divisor = camada.unit_measure.d_factor;
    saida[camada.name] = Object.fromEntries(
      camada.depths.map((d) => [d.label, d.values.mean == null ? null : d.values.mean / divisor]),
    );
  }

  const temAlgo = Object.values(saida).some((c) => Object.values(c).some((v) => v != null));
  return temAlgo ? saida : null;
}

function interpretar(bruto: Camadas, distanciaKm: number, regime: Regime): Solo | null {
  const areia = mediaPonderada(bruto.sand);
  const argila = mediaPonderada(bruto.clay);
  const carbono = mediaPonderada(bruto.soc);
  const nitrogenio = mediaPonderada(bruto.nitrogen);

  if (areia == null || argila == null || carbono == null || nitrogenio == null) return null;

  // SOC em g/kg -> % de massa -> materia organica pelo fator de Van Bemmelen.
  const materiaOrganica = (carbono / 10) * 1.724;
  const capacidade = aguaDisponivel(areia, argila, materiaOrganica) * raizMm(regime);

  if (!Number.isFinite(capacidade) || capacidade <= 0) return null;

  return {
    fertilidade: fertilidadePorNitrogenio(nitrogenio),
    capacidadeMm: Math.min(CAP_MAX, Math.max(CAP_MIN, capacidade)),
    fonte: "soilgrids",
    distanciaKm,
    nitrogenioGkg: nitrogenio,
    regime,
  };
}

/** ~1,1 km. Arredondar da acerto de cache entre simulacoes vizinhas sem mudar
 *  o resultado: a grade do SoilGrids e de 250 m, mas o solo nao vira outro em
 *  1 km, e o cache de um ponto redondo serve o quarteirao inteiro. */
function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

const doPonto = unstable_cache(
  async (lat: number, lon: number, regime: Regime): Promise<Solo> => {
    const comecou = Date.now();

    for (const { dlat, dlon, km } of VIZINHANCA) {
      if (Date.now() - comecou > ORCAMENTO_MS) break;
      try {
        const bruto = await consultar(lat + dlat, lon + dlon);
        if (bruto) {
          const s = interpretar(bruto, km, regime);
          if (s) return s;
        }
      } catch {
        // Timeout, 429 ou rede: tenta o proximo ponto da vizinhanca. Falhar
        // aqui nunca derruba a pagina -- a premissa e uma resposta valida e a
        // tela diz que foi ela que valeu.
      }
    }

    return premissa(regime);
  },
  ["soilgrids-ponto"],
  // Trinta dias. Solo nao muda; o que muda e o mapa, uma vez por ano.
  { revalidate: 2_592_000, tags: ["solo"] },
);

/** O `regime` entra na chave do cache junto com as coordenadas: os dois regimes
 *  leem a MESMA textura e a multiplicam por profundidades diferentes, e um cache
 *  cego para ele devolveria o balde do regime que perguntou primeiro. */
export function soloDoPonto(
  latitude: number,
  longitude: number,
  regime: Regime = REGIME_PADRAO,
): Promise<Solo> {
  return doPonto(arredondar(latitude), arredondar(longitude), regime);
}
