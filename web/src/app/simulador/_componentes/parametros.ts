import { LIMITES } from "@/lib/modelo/campos";
import { ESPECIES, type Especie } from "@/lib/types";

/**
 * Leitura e validacao dos parametros da URL.
 *
 * O estado da simulacao vive na URL, como manda a convencao do painel, e aqui
 * isso rende de brinde uma simulacao compartilhavel por link.
 *
 * Puro de proposito: a mesma funcao valida no servidor (que roda a simulacao) e
 * preenche o formulario no cliente. Duas copias da regra e o jeito conhecido de
 * a tela aceitar o que o servidor recusa.
 */

export type Pedido = {
  especie: Especie;
  latitude: number;
  longitude: number;
  alturaCm: number;
  dias: number;
};

/** O que os campos mostram: sempre preenchido, mesmo sem parametro na URL. */
export type ValoresFormulario = {
  especie: Especie;
  latitude: string;
  longitude: string;
  altura: string;
  dias: string;
};

export type Erros = Partial<Record<keyof ValoresFormulario, string>>;

/**
 * Faixa que o CAMPO aceita, de propósito mais larga que a faixa de treino.
 *
 * O modelo viu períodos de `LIMITES.dias.min` a `LIMITES.dias.max` — 7 a 120
 * dias, recuperados EXATAMENTE dos limiares de bin (ver `exportar_modelo.py`).
 * O teto do campo coincide com o teto do treino; quem extrapola é só a ponta de
 * baixo, de 1 a 6 dias, onde a resposta gruda no bin da ponta: um pedido de 3
 * dias recebe o comportamento de uma janela de 7. Isso não é motivo para travar
 * o campo: é motivo para AVISAR, que é o que a régua de `FaixasDoModelo` faz.
 * Numa página que existe para mostrar a IA funcionando, deixar ver onde ela para
 * de funcionar é parte do produto.
 */
export const DIAS_MIN = 1;
export const DIAS_MAX = 120;

/** As pontas do que o modelo realmente viu, para o texto de ajuda do campo. */
export const DIAS_TREINO_MIN = LIMITES.dias.min;
export const DIAS_TREINO_MAX = LIMITES.dias.max;

/** Altura também passa da faixa de treino: é justamente ali que a saturação do
 *  modelo fica visível, e a tela avisa em vez de impedir. */
export const ALTURA_MIN = 0.5;
export const ALTURA_MAX = 200;

/** Caixa do Brasil continental, so para pegar coordenada trocada ou digitada
 *  com sinal errado. O aviso de latitude fora do treino e outro, e vem do modelo. */
const CAIXA_BRASIL = { latMin: -34, latMax: 6, lonMin: -74, lonMax: -34 };

/** Ponto padrao: SP-330, altura de Limeira. Existe para a primeira visita ja ter
 *  o formulario preenchido com algo que roda, pagina de demonstracao que abre
 *  vazia obriga quem esta vendo a inventar uma coordenada. */
export const PADRAO: ValoresFormulario = {
  especie: "braquiaria",
  latitude: "-22.53",
  longitude: "-47.43",
  altura: "12",
  dias: "45",
};

function texto(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s == null || s.trim() === "" ? null : s.trim();
}

/** Aceita virgula decimal: o painel e operado no Brasil e "12,5" e o que sai do
 *  teclado de quem digita numero aqui. */
function numero(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function entre(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}

export type Leitura = {
  /** `null` quando falta parametro ou algum e invalido. */
  pedido: Pedido | null;
  valores: ValoresFormulario;
  erros: Erros;
  /** A URL trazia alguma tentativa de simulacao? Distingue "primeira visita" de
   *  "pediu e errou", a tela diz coisas diferentes nos dois casos. */
  tentou: boolean;
};

export function interpretar(
  params: Record<string, string | string[] | undefined>,
): Leitura {
  const cru = {
    especie: texto(params.especie),
    latitude: texto(params.lat),
    longitude: texto(params.lon),
    altura: texto(params.altura),
    dias: texto(params.dias),
  };

  const tentou = Object.values(cru).some((v) => v !== null);

  const valores: ValoresFormulario = {
    especie: (ESPECIES as readonly string[]).includes(cru.especie ?? "")
      ? (cru.especie as Especie)
      : PADRAO.especie,
    latitude: cru.latitude ?? PADRAO.latitude,
    longitude: cru.longitude ?? PADRAO.longitude,
    altura: cru.altura ?? PADRAO.altura,
    dias: cru.dias ?? PADRAO.dias,
  };

  if (!tentou) return { pedido: null, valores, erros: {}, tentou };

  const erros: Erros = {};

  if (cru.especie != null && !(ESPECIES as readonly string[]).includes(cru.especie)) {
    erros.especie = `O modelo só conhece ${ESPECIES.join(", ")}.`;
  }

  const lat = numero(valores.latitude);
  if (lat == null) erros.latitude = "Digite a latitude em graus decimais, por exemplo −22,53.";
  else if (!entre(lat, CAIXA_BRASIL.latMin, CAIXA_BRASIL.latMax)) {
    erros.latitude = "Latitude fora do Brasil. No Sudeste ela é negativa, entre −25 e −18.";
  }

  const lon = numero(valores.longitude);
  if (lon == null) erros.longitude = "Digite a longitude em graus decimais, por exemplo −47,43.";
  else if (!entre(lon, CAIXA_BRASIL.lonMin, CAIXA_BRASIL.lonMax)) {
    erros.longitude = "Longitude fora do Brasil. Aqui ela é negativa, entre −74 e −34.";
  }

  const altura = numero(valores.altura);
  if (altura == null) erros.altura = "Digite a altura atual em centímetros.";
  else if (!entre(altura, ALTURA_MIN, ALTURA_MAX)) {
    erros.altura = `A altura precisa ficar entre ${ALTURA_MIN} e ${ALTURA_MAX} cm.`;
  }

  const dias = numero(valores.dias);
  if (dias == null || !Number.isInteger(dias)) erros.dias = "Digite o período em dias inteiros.";
  else if (!entre(dias, DIAS_MIN, DIAS_MAX)) {
    erros.dias = `O período precisa ficar entre ${DIAS_MIN} e ${DIAS_MAX} dias.`;
  }

  if (Object.keys(erros).length > 0) return { pedido: null, valores, erros, tentou };

  return {
    pedido: {
      especie: valores.especie,
      latitude: lat as number,
      longitude: lon as number,
      alturaCm: altura as number,
      dias: dias as number,
    },
    valores,
    erros,
    tentou,
  };
}
