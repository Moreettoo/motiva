import { LIMITES } from "@/lib/modelo/campos";
import {
  DIAS_MAX,
  DIAS_MIN,
  montarPeriodo,
  periodoPadrao,
  validarPeriodo,
  type Periodo,
} from "@/lib/periodo";
import { ESPECIES, type Especie } from "@/lib/types";

export { DIAS_MAX, DIAS_MIN };

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
  /** O intervalo pedido, com as duas datas inclusivas. */
  periodo: Periodo;
  /** Fase da curva de rebrota. Feature do modelo, nao enfeite. */
  diasDesdeRocada: number;
  /** `null` = deixa o SoilGrids responder pelo ponto. */
  fertilidade: number | null;
  /** `null` = deixa o SoilGrids responder pelo ponto. */
  capacidadeMm: number | null;
};

/** O que os campos mostram: sempre preenchido, mesmo sem parametro na URL. */
export type ValoresFormulario = {
  especie: Especie;
  latitude: string;
  longitude: string;
  altura: string;
  dataInicio: string;
  dataFim: string;
  rocada: string;
  /** Vazio significa "automatico". Nao ha valor padrao para mostrar aqui: ele
   *  so existe depois que o SoilGrids responde, no servidor. */
  fertilidade: string;
  capacidade: string;
};

export type Erros = Partial<Record<keyof ValoresFormulario, string>>;

/** As pontas do que o modelo realmente viu, para o texto de ajuda do campo.
 *
 *  O modelo viu periodos de 1 a 120 dias, faixa EXATA recuperada dos limiares
 *  de bin (ver `exportar_modelo.py`). `DIAS_MIN`/`DIAS_MAX`, em `periodo.ts`,
 *  sao os mesmos numeros: com o modelo v3.1 o campo deixou de ser mais largo
 *  que o treino. */
export const DIAS_TREINO_MIN = LIMITES.dias.min;
export const DIAS_TREINO_MAX = LIMITES.dias.max;

/** Altura também passa da faixa de treino: é justamente ali que a saturação do
 *  modelo fica visível, e a tela avisa em vez de impedir. */
export const ALTURA_MIN = 0.5;
export const ALTURA_MAX = 200;

/** O modelo viu de 0 a ~203 dias desde a roçada. O campo aceita até 365, para
 *  caber o trecho que passou um ano inteiro sem visita. */
export const ROCADA_MIN = 0;
export const ROCADA_MAX = 365;

export const FERTILIDADE_MIN = 0.02;
export const FERTILIDADE_MAX = 1;
export const CAPACIDADE_MIN = 15;
export const CAPACIDADE_MAX = 200;

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
  // O padrao acompanha o relogio: de hoje a 45 dias. Uma data fixa aqui
  // envelheceria e a primeira visita abriria com um periodo no passado.
  dataInicio: periodoPadrao().inicio,
  dataFim: periodoPadrao().fim,
  rocada: "40",
  fertilidade: "",
  capacidade: "",
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
    dataInicio: texto(params.de),
    dataFim: texto(params.ate),
    rocada: texto(params.rocada),
    fertilidade: texto(params.fert),
    capacidade: texto(params.solo),
  };

  const tentou = Object.values(cru).some((v) => v !== null);

  const valores: ValoresFormulario = {
    especie: (ESPECIES as readonly string[]).includes(cru.especie ?? "")
      ? (cru.especie as Especie)
      : PADRAO.especie,
    latitude: cru.latitude ?? PADRAO.latitude,
    longitude: cru.longitude ?? PADRAO.longitude,
    altura: cru.altura ?? PADRAO.altura,
    dataInicio: cru.dataInicio ?? PADRAO.dataInicio,
    dataFim: cru.dataFim ?? PADRAO.dataFim,
    rocada: cru.rocada ?? PADRAO.rocada,
    fertilidade: cru.fertilidade ?? PADRAO.fertilidade,
    capacidade: cru.capacidade ?? PADRAO.capacidade,
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

  // As duas datas viram um problema só: a validação do par mora em
  // `periodo.ts`, porque a ordem dos testes importa (fim antes do início tem
  // que ser diagnosticado antes de "período longo demais", ou a contagem
  // negativa sairia com a mensagem errada).
  const problema = validarPeriodo(valores.dataInicio, valores.dataFim);
  if (problema) {
    erros[problema.campo === "inicio" ? "dataInicio" : "dataFim"] = problema.texto;
  }

  const rocada = numero(valores.rocada);
  if (rocada == null || !Number.isInteger(rocada)) {
    erros.rocada = "Digite quantos dias inteiros se passaram desde a última roçada.";
  } else if (!entre(rocada, ROCADA_MIN, ROCADA_MAX)) {
    erros.rocada = `Use um valor entre ${ROCADA_MIN} e ${ROCADA_MAX} dias.`;
  }

  // Os dois campos de solo são opcionais: vazio quer dizer "pergunte ao mapa".
  const fertilidade = valores.fertilidade === "" ? null : numero(valores.fertilidade);
  if (valores.fertilidade !== "" && fertilidade == null) {
    erros.fertilidade = "Digite um número de 0 a 1, ou deixe vazio para usar o mapa de solo.";
  } else if (fertilidade != null && !entre(fertilidade, FERTILIDADE_MIN, FERTILIDADE_MAX)) {
    erros.fertilidade = `A fertilidade vai de ${FERTILIDADE_MIN} a ${FERTILIDADE_MAX}.`;
  }

  const capacidade = valores.capacidade === "" ? null : numero(valores.capacidade);
  if (valores.capacidade !== "" && capacidade == null) {
    erros.capacidade = "Digite os milímetros, ou deixe vazio para usar o mapa de solo.";
  } else if (capacidade != null && !entre(capacidade, CAPACIDADE_MIN, CAPACIDADE_MAX)) {
    erros.capacidade = `A água disponível vai de ${CAPACIDADE_MIN} a ${CAPACIDADE_MAX} mm.`;
  }

  if (Object.keys(erros).length > 0) return { pedido: null, valores, erros, tentou };

  return {
    pedido: {
      especie: valores.especie,
      latitude: lat as number,
      longitude: lon as number,
      alturaCm: altura as number,
      periodo: montarPeriodo(valores.dataInicio, valores.dataFim),
      diasDesdeRocada: rocada as number,
      fertilidade,
      capacidadeMm: capacidade,
    },
    valores,
    erros,
    tentou,
  };
}
