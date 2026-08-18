/**
 * Clima diario e o balanco de agua no solo: a parte pura, sem rede.
 *
 * A busca no Open-Meteo mora em `open-meteo.ts`. Aqui ficam as contas, porque
 * sao elas que precisam de teste e a suite deste projeto nao toca rede.
 *
 * O QUE O MODELO NOVO EXIGIU DAQUI
 * --------------------------------
 * O modelo antigo pedia sete medias de uma janela. O `modelo_gramas.pkl` pede
 * `agua_solo_media_pct` e `dias_encharcado`, que sao ESTADO: nao saem de uma
 * media, saem de um balde de agua rodando dia a dia. E balde precisa de
 * AQUECIMENTO -- comecar hoje e chutar quanta agua ha no solo agora, e essa
 * feature move o crescimento previsto em mais de 100% entre 10% e 55% de balde
 * cheio. Por isso `Janela` passou a carregar os dias ANTERIORES a hoje.
 *
 * A distincao entre TOTAL e MEDIA continua sendo a conta que mais importa. O
 * modelo recebe `precipitacao_total_mm` (soma do periodo) junto com
 * `dias_periodo`. Alimentar o total de uma janela de 16 dias declarando 90 dias
 * faz o modelo enxergar uma seca de dois meses e prever crescimento perto de
 * zero, com a mesma cara de certeza de sempre. E por isso que a janela tem que
 * ter o tamanho do periodo simulado.
 */

/** Teto da API de previsao do Open-Meteo. */
export const DIAS_DE_PREVISAO = 16;

/**
 * Quantos dias de passado pedir para aquecer o balde.
 *
 * A API de previsao aceita 92 e entrega ~63 uteis (antes disso ela devolve
 * nulo, e `lerDiario` descarta). Sessenta e tres bastam: com ET0 de ~3 mm/dia
 * um balde de 60 mm se esvazia em vinte. O notebook de calibracao usa 120 e vai
 * ao arquivo ERA5 para conseguir; aqui uma requisicao a menos vale mais que os
 * 57 dias extras, porque o arquivo e justamente o que responde 429.
 */
export const DIAS_DE_AQUECIMENTO = 92;

export type FonteDia =
  /** Dia que ja passou, com o dado que a propria API de previsao guarda. */
  | "observado"
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
  temperaturaMinC: number;
  temperaturaMaxC: number;
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
    temperature_2m_min?: (number | null)[];
    temperature_2m_max?: (number | null)[];
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
 * dois puxariam a media para baixo fingindo medicao. E tambem o que separa o
 * passado que a API tem do passado que ela nao tem: pedir 92 dias e receber 63
 * com dado e 29 nulos e o caso normal, nao erro.
 */
export function lerDiario(resposta: RespostaDiaria, fonte: FonteDia): DiaClima[] {
  const d = resposta.daily;
  if (!d?.time) return [];

  const dias: DiaClima[] = [];

  for (let i = 0; i < d.time.length; i += 1) {
    const valores = [
      d.temperature_2m_mean?.[i],
      d.temperature_2m_min?.[i],
      d.temperature_2m_max?.[i],
      d.relative_humidity_2m_mean?.[i],
      d.precipitation_sum?.[i],
      d.shortwave_radiation_sum?.[i],
      d.et0_fao_evapotranspiration?.[i],
    ];
    if (valores.some((v) => v == null || !Number.isFinite(v))) continue;

    dias.push({
      data: d.time[i],
      temperaturaC: valores[0] as number,
      temperaturaMinC: valores[1] as number,
      temperaturaMaxC: valores[2] as number,
      umidadePct: valores[3] as number,
      chuvaMm: valores[4] as number,
      radiacaoMjM2: valores[5] as number,
      et0MmDia: valores[6] as number,
      fonte,
    });
  }

  return dias;
}

function media(valores: number[]): number {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
}

/* ------------------------------------------------------------------ *
 * Balanco de agua no solo
 * ------------------------------------------------------------------ */

export type Balanco = {
  /** Quanto o balde esta cheio em cada dia, de 0 a 1. */
  fracoes: number[];
  /** Tres dias seguidos de balde quase cheio com chuva forte. */
  encharcado: boolean[];
};

/**
 * Balde FAO simplificado, dia a dia.
 *
 * Porte fiel do `balanco_solo` de `clima.py`, que por sua vez repete o do
 * `gerador_v3_1_rebrota.py` -- as tres copias precisam continuar iguais, ou
 * `agua_solo_media_pct` passa a significar coisas diferentes no treino, no lote
 * e no simulador.
 *
 * Uma diferenca deliberada em relacao ao gerador: o Kc fica FIXO na altura
 * inicial em vez de acompanhar a altura dia a dia. No gerador a altura e
 * conhecida em todo dia porque ele a simula; na inferencia ela e justamente o
 * que se quer prever, entao fixar no ponto de partida e o que da para fazer sem
 * circularidade.
 */
export function balancoSolo(
  dias: readonly DiaClima[],
  capacidadeMm: number,
  alturaCm: number,
): Balanco {
  const cap = Math.max(capacidadeMm, 1e-6);
  let agua = cap * 0.6; // comeco neutro, como no gerador
  const kc = 0.4 + 0.6 * Math.min(Math.max(alturaCm, 0) / 40, 1);

  const fracoes: number[] = [];
  const encharcado: boolean[] = [];
  let seguidos = 0;

  for (const d of dias) {
    agua = Math.min(agua + d.chuvaMm, cap);
    const ks = Math.min(Math.max(agua / (0.55 * cap), 0), 1);
    agua = Math.min(Math.max(agua - d.et0MmDia * kc * ks, 0), cap);
    const f = agua / cap;
    seguidos = f > 0.97 && d.chuvaMm > 8 ? seguidos + 1 : 0;
    fracoes.push(f);
    encharcado.push(seguidos >= 3);
  }

  return { fracoes, encharcado };
}

/* ------------------------------------------------------------------ *
 * Agregados de tela
 * ------------------------------------------------------------------ */

/** O resumo que a tela mostra da janela. As features do modelo sao outra coisa
 *  e saem de `montarFeatures`, em `modelo/campos.ts`. */
export type ResumoClima = {
  dias: number;
  temperaturaMediaC: number;
  temperaturaMinC: number;
  temperaturaMaxC: number;
  umidadeMediaPct: number;
  precipitacaoTotalMm: number;
  diasComChuva: number;
  radiacaoMediaMjM2: number;
  et0MedioMmDia: number;
  /** Media do balde cheio no periodo, de 0 a 100. */
  aguaSoloMediaPct: number | null;
};

export function resumir(dias: readonly DiaClima[], fracoes?: readonly number[]): ResumoClima {
  const n = dias.length;
  if (n === 0) {
    throw new Error("Não dá para resumir uma janela de clima vazia.");
  }

  return {
    dias: n,
    temperaturaMediaC: media(dias.map((d) => d.temperaturaC)),
    temperaturaMinC: Math.min(...dias.map((d) => d.temperaturaMinC)),
    temperaturaMaxC: Math.max(...dias.map((d) => d.temperaturaMaxC)),
    umidadeMediaPct: media(dias.map((d) => d.umidadePct)),
    precipitacaoTotalMm: dias.reduce((total, d) => total + d.chuvaMm, 0),
    diasComChuva: dias.filter((d) => d.chuvaMm > 1).length,
    radiacaoMediaMjM2: media(dias.map((d) => d.radiacaoMjM2)),
    et0MedioMmDia: media(dias.map((d) => d.et0MmDia)),
    aguaSoloMediaPct: fracoes?.length ? media([...fracoes]) * 100 : null,
  };
}

/* ------------------------------------------------------------------ *
 * Montagem da janela
 * ------------------------------------------------------------------ */

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
      // Minima e maxima do periodo sao EXTREMOS no modelo, e media de extremos
      // entre anos ja e o que se quer: um dia frio isolado em 2024 nao deve
      // definir sozinho a minima de uma janela de 2026.
      temperaturaMinC: media(doDia.map((d) => d.temperaturaMinC)),
      temperaturaMaxC: media(doDia.map((d) => d.temperaturaMaxC)),
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
 * mas nenhum dia de chuva forte, e `dias_com_chuva` e o balde mudam. Repetir o
 * ciclo preserva media e dispersao.
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
  /** Dias ANTERIORES a hoje, so para aquecer o balde de agua no solo. Nao
   *  entram em nenhuma media da tela nem em nenhuma feature de periodo. */
  aquecimento: DiaClima[];
  /** Os dias simulados, a partir de hoje. */
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
  aquecimento?: DiaClima[];
  previsao: DiaClima[];
  historico: DiaClima[];
  anos: number[];
  total: number;
  datas: string[];
  avisoDoComplemento?: string | null;
}): Janela {
  const { previsao, historico, anos, total, datas } = entrada;
  const aquecimento = entrada.aquecimento ?? [];

  if (previsao.length === 0) {
    throw new Error("A previsão do Open-Meteo voltou sem nenhum dia utilizável.");
  }

  const previstos = Math.min(previsao.length, total);
  const cabeca = previsao.slice(0, previstos);

  if (previstos >= total) {
    return {
      aquecimento,
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
      aquecimento,
      dias: [...cabeca, ...cauda],
      diasPrevistos: previstos,
      complemento: "historico",
      anos,
      avisoDoComplemento: entrada.avisoDoComplemento ?? null,
    };
  }

  return {
    aquecimento,
    dias: completarPorRepeticao(cabeca, total, datas),
    diasPrevistos: previstos,
    complemento: "repeticao",
    anos: [],
    avisoDoComplemento:
      entrada.avisoDoComplemento ??
      "O arquivo histórico do Open-Meteo não respondeu a tempo.",
  };
}
