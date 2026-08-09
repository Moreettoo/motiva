/**
 * Formatacao — sempre via Intl, nunca string montada na mao.
 *
 * O painel e operado no Brasil, entao pt-BR e o locale fixo: uma equipe em
 * campo nao deve ver a data virar MM/DD porque o navegador esta em ingles.
 */

const LOCALE = "pt-BR";
const TZ = "America/Sao_Paulo";

const numero = new Intl.NumberFormat(LOCALE);
const decimal1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const decimal2 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimal3 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const moeda = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dataCurta = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", timeZone: TZ });
const dataMedia = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
const dataLonga = new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const diaSemana = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: TZ });
const mesAno = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone: TZ });
const horaMin = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const relativo = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

/** Datas do banco vem como `AAAA-MM-DD` (sem fuso). Ler com `new Date(s)` as
 *  trataria como UTC e no Brasil elas voltariam um dia. */
export function parseData(s: string): Date {
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(s);
  return soData ? new Date(`${s}T12:00:00`) : new Date(s);
}

/* `en-CA` formata como AAAA-MM-DD, que e exatamente o formato do banco. */
const diaNoFuso = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * "Hoje" no fuso do painel, nao no fuso da maquina.
 *
 * `getFullYear/getMonth/getDate` leem o relogio LOCAL. Num servidor em UTC — o
 * caso normal em produçao — das 21h a meia-noite de Brasilia o dia local ja
 * virou e o painel passaria tres horas por noite mostrando amanha: "roçadas em
 * 7 dias" desloca a janela, a marca de hoje na linha do tempo pula um dia, e
 * agendamento de hoje aparece como vencido.
 */
export function hojeNoFusoDoPainel(): string {
  return diaNoFuso.format(new Date());
}

export const fmt = {
  n: (v: number) => numero.format(v),
  d1: (v: number) => decimal1.format(v),
  d2: (v: number) => decimal2.format(v),
  d3: (v: number) => decimal3.format(v),
  brl: (v: number) => moeda.format(v),
  pct: (v: number, casas = 0) =>
    new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: casas }).format(v / 100),

  /** "1 trecho" / "12 trechos". O plural do portugues nem sempre e o "s" solto
   *  (`km` nao flexiona), entao o irregular entra pelo terceiro argumento. */
  contar: (n: number, singular: string, plural = `${singular}s`) =>
    `${numero.format(n)} ${n === 1 ? singular : plural}`,

  cm: (v: number | null | undefined) => (v == null ? "—" : `${decimal1.format(v)} cm`),
  cmDia: (v: number | null | undefined) => (v == null ? "—" : `${decimal3.format(v)} cm/dia`),
  km: (v: number | null | undefined) => (v == null ? "—" : `${decimal1.format(v)} km`),
  celsius: (v: number | null | undefined) => (v == null ? "—" : `${decimal1.format(v)} °C`),
  mm: (v: number | null | undefined) => (v == null ? "—" : `${numero.format(Math.round(v))} mm`),

  /** Faixa de km no formato que o pessoal de campo usa. */
  faixaKm: (ini: number, fim: number) => `km ${decimal1.format(ini)} – ${decimal1.format(fim)}`,

  dataCurta: (s: string | Date) => dataCurta.format(typeof s === "string" ? parseData(s) : s),
  dataMedia: (s: string | Date) => dataMedia.format(typeof s === "string" ? parseData(s) : s),
  dataLonga: (s: string | Date) => dataLonga.format(typeof s === "string" ? parseData(s) : s),
  diaSemana: (s: string | Date) => diaSemana.format(typeof s === "string" ? parseData(s) : s),
  mesAno: (s: string | Date) => mesAno.format(typeof s === "string" ? parseData(s) : s),
  horaMin: (s: string | Date) => horaMin.format(typeof s === "string" ? parseData(s) : s),
};

/** "em 3 dias", "ontem", "hoje" — a partir de uma data do banco.
 *  A base padrao e o dia no fuso do painel, nao o relogio da maquina. */
export function relativoEmDias(alvo: string | Date, base: string | Date = hojeNoFusoDoPainel()): string {
  const d = typeof alvo === "string" ? parseData(alvo) : alvo;
  const dias = diasEntre(base, d);
  if (dias === 0) return "hoje";
  if (Math.abs(dias) < 30) return relativo.format(dias, "day");
  if (Math.abs(dias) < 365) return relativo.format(Math.round(dias / 30), "month");
  return relativo.format(Math.round(dias / 365), "year");
}

/** Diferenca em dias inteiros, ignorando hora. */
export function diasEntre(de: Date | string, ate: Date | string): number {
  const a = typeof de === "string" ? parseData(de) : de;
  const b = typeof ate === "string" ? parseData(ate) : ate;
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** Alias historico: todo "hoje" do painel sai do fuso de Brasilia. */
export const isoHoje = hojeNoFusoDoPainel;

export function somarDias(base: Date | string, dias: number): Date {
  const d = typeof base === "string" ? parseData(base) : new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
}

/** Segunda-feira da semana de `d`. A operacao de roçada e planejada por semana. */
export function inicioDaSemana(d: Date | string): Date {
  const dt = typeof d === "string" ? parseData(d) : new Date(d);
  const diff = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - diff);
  dt.setHours(12, 0, 0, 0);
  return dt;
}
