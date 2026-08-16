/**
 * Clima diario e sua agregacao: a parte pura, sem rede.
 *
 * A busca no Open-Meteo mora em `open-meteo.ts`. Aqui ficam as contas, porque
 * sao elas que precisam de teste e a suite deste projeto nao toca rede.
 *
 * A conta que mais importa e a distincao entre TOTAL e MEDIA. O modelo recebe
 * `precipitacao_total_mm` (soma do periodo) junto com `dias_periodo`, e o
 * balanco hidrico divide a chuva por `et0 x dias`. Alimentar o total de uma
 * janela de 16 dias declarando 90 dias faz o modelo enxergar uma seca de dois
 * meses e prever crescimento perto de zero, com a mesma cara de certeza de
 * sempre. E por isso que a janela tem que ter o tamanho do periodo simulado.
 */

import type { AgregadoClima } from "./modelo/campos";

/** Teto da API de previsao do Open-Meteo. */
export const DIAS_DE_PREVISAO = 16;

export type FonteDia =
  /** Previsao de verdade para aquele dia. */
  | "previsao"
  /** Media do mesmo dia do calendario em anos anteriores (ERA5 observado). */
  | "historico"
  /** O padrao dos dias previstos, repetido, a queda quando o historico falha. */
  | "repeticao";

export type DiaClima = {
  /** AAAA-MM-DD. */
  data: string;
  temperaturaC: number;
  umidadePct: number;
  chuvaMm: number;
  radiacaoMjM2: number;
  et0MmDia: number;
  fonte: FonteDia;
};

/** O formato bruto que as duas APIs do Open-Meteo devolvem, a de previsao e a
 *  de arquivo usam exatamente os mesmos nomes de variavel. */
export type RespostaDiaria = {
  daily?: {
    time?: string[];
    temperature_2m_mean?: (number | null)[];
    relative_humidity_2m_mean?: (number | null)[];
    precipitation_sum?: (number | null)[];
    shortwave_radiation_sum?: (number | null)[];
    et0_fao_evapotranspiration?: (number | null)[];
  };
  error?: boolean;
  reason?: string;
};

/**
 * Converte a resposta em dias utilizaveis.
 *
 * Dia com qualquer variavel nula e DESCARTADO, em vez de virar zero. Zero nao e
 * "nao sei": zero de radiacao e noite polar, zero de et0 e ar saturado, e os
 * dois puxariam a media para baixo fingindo medicao.
 */
export function lerDiario(resposta: RespostaDiaria, fonte: FonteDia): DiaClima[] {
  const d = resposta.daily;
  if (!d?.time) return [];

  const dias: DiaClima[] = [];

  for (let i = 0; i < d.time.length; i += 1) {
    const valores = [
      d.temperature_2m_mean?.[i],
      d.relative_humidity_2m_mean?.[i],
      d.precipitation_sum?.[i],
      d.shortwave_radiation_sum?.[i],
      d.et0_fao_evapotranspiration?.[i],
    ];
    if (valores.some((v) => v == null || !Number.isFinite(v))) continue;

    dias.push({
      data: d.time[i],
      temperaturaC: valores[0] as number,
      umidadePct: valores[1] as number,
      chuvaMm: valores[2] as number,
      radiacaoMjM2: valores[3] as number,
      et0MmDia: valores[4] as number,
      fonte,
    });
  }

  return dias;
}

function media(valores: number[]): number {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
}

/**
 * Os sete agregados que o modelo recebe.
 *
 * Espelha `buscar_clima` do `analisar_lote.py`, inclusive o `|| 0.1` no et0: um
 * evapotranspiracao media de zero zeraria o divisor do balanco hidrico e o
 * modelo receberia infinito.
 */
export function agregar(dias: DiaClima[]): AgregadoClima {
  const n = dias.length;
  if (n === 0) {
    throw new Error("Não dá para agregar uma janela de clima vazia.");
  }

  const chuva = dias.reduce((total, d) => total + d.chuvaMm, 0);
  const et0 = media(dias.map((d) => d.et0MmDia)) || 0.1;

  return {
    dias: n,
    temperaturaMediaC: media(dias.map((d) => d.temperaturaC)),
    umidadeMediaPct: media(dias.map((d) => d.umidadePct)),
    precipitacaoTotalMm: chuva,
    precipitacaoMediaDiariaMm: chuva / n,
    radiacaoMediaMjM2: media(dias.map((d) => d.radiacaoMjM2)),
    et0MedioMmDia: et0,
    balancoHidrico: chuva / (et0 * n),
  };
}

/**
 * Media dia a dia entre varios anos, alinhada por POSICAO e nao por data.
 *
 * Por posicao porque 29 de fevereiro desalinha o calendario: a janela de um ano
 * bissexto tem um dia a mais que a do ano seguinte, e casar por data deixaria
 * buracos no meio da serie. O que interessa aqui e "o enesimo dia depois do
 * inicio", que e o que a simulacao consome.
 *
 * As datas devolvidas sao as do PRIMEIRO ano da lista, so para a serie ter
 * rotulo; quem chama sobrescreve com as datas futuras de verdade.
 */
export function mediaEntreAnos(anos: DiaClima[][]): DiaClima[] {
  const uteis = anos.filter((a) => a.length > 0);
  if (uteis.length === 0) return [];

  const comprimento = Math.min(...uteis.map((a) => a.length));
  const saida: DiaClima[] = [];

  for (let i = 0; i < comprimento; i += 1) {
    const doDia = uteis.map((a) => a[i]);
    saida.push({
      data: uteis[0][i].data,
      temperaturaC: media(doDia.map((d) => d.temperaturaC)),
      umidadePct: media(doDia.map((d) => d.umidadePct)),
      chuvaMm: media(doDia.map((d) => d.chuvaMm)),
      radiacaoMjM2: media(doDia.map((d) => d.radiacaoMjM2)),
      et0MmDia: media(doDia.map((d) => d.et0MmDia)),
      fonte: "historico",
    });
  }

  return saida;
}

/**
 * Estica a previsao repetindo-a ciclicamente ate `total` dias.
 *
 * Ciclicamente, e nao com a media dos 16 dias em todos os dias, porque o modelo
 * le a variabilidade: uma serie chapada na media tem a mesma temperatura media
 * mas nenhum dia de chuva forte, e o balanco hidrico muda. Repetir o ciclo
 * preserva media e dispersao.
 *
 * E a queda, nao a primeira escolha: o historico observado e melhor. Mas ela
 * nunca falha, e numa tela de demonstracao um 429 do Open-Meteo nao pode virar
 * pagina de erro.
 */
export function completarPorRepeticao(base: DiaClima[], total: number, datas: string[]): DiaClima[] {
  if (base.length === 0) return [];

  const saida = [...base];
  for (let i = base.length; i < total; i += 1) {
    const molde = base[i % base.length];
    saida.push({ ...molde, data: datas[i] ?? molde.data, fonte: "repeticao" });
  }
  return saida.slice(0, total);
}

export type Janela = {
  dias: DiaClima[];
  /** Quantos dias vieram de previsao de verdade. */
  diasPrevistos: number;
  /** Como o resto foi preenchido. `null` quando a previsao cobriu tudo. */
  complemento: "historico" | "repeticao" | null;
  /** Anos do ERA5 que entraram na media, quando o complemento foi historico. */
  anos: number[];
  /** Por que caiu para a repeticao, quando caiu. Vai para a tela. */
  avisoDoComplemento: string | null;
};

/**
 * Monta a janela final de `total` dias: previsao na frente, complemento atras.
 *
 * As datas do complemento sao sempre as datas FUTURAS de verdade, o historico
 * empresta os numeros, nao o calendario.
 */
export function montarJanela(entrada: {
  previsao: DiaClima[];
  historico: DiaClima[];
  anos: number[];
  total: number;
  datas: string[];
  avisoDoComplemento?: string | null;
}): Janela {
  const { previsao, historico, anos, total, datas } = entrada;

  if (previsao.length === 0) {
    throw new Error("A previsão do Open-Meteo voltou sem nenhum dia utilizável.");
  }

  const previstos = Math.min(previsao.length, total);
  const cabeca = previsao.slice(0, previstos);

  if (previstos >= total) {
    return {
      dias: cabeca,
      diasPrevistos: previstos,
      complemento: null,
      anos: [],
      avisoDoComplemento: null,
    };
  }

  const faltam = total - previstos;
  const cauda = historico.slice(0, faltam).map((d, i) => ({
    ...d,
    data: datas[previstos + i] ?? d.data,
  }));

  if (cauda.length === faltam) {
    return {
      dias: [...cabeca, ...cauda],
      diasPrevistos: previstos,
      complemento: "historico",
      anos,
      avisoDoComplemento: entrada.avisoDoComplemento ?? null,
    };
  }

  return {
    dias: completarPorRepeticao(cabeca, total, datas),
    diasPrevistos: previstos,
    complemento: "repeticao",
    anos: [],
    avisoDoComplemento:
      entrada.avisoDoComplemento ??
      "O arquivo histórico do Open-Meteo não respondeu a tempo.",
  };
}
