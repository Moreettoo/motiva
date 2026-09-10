"use client";

import { ESTADO_ALTURA, estadoDaAltura } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import { clamp } from "@/lib/utils";

import { borda, ESCALA, Icone } from "./base";

/**
 * A altura do mato contra o limite do trecho, desenhada como REGUA em pe.
 *
 * E o unico grafico do app de campo, e existe porque e o unico objeto do mundo
 * do rocador que a tela pode imitar: ele vai encostar uma regua no capim e
 * fotografar exatamente esta comparacao. Ler "36,9 cm" ao lado de "limite
 * 30,0 cm" obriga a fazer a conta; ver a barra passar do risco nao.
 *
 * A leitura sai de `estadoDaAltura`, a MESMA do medidor do painel e da coluna
 * `ocupacao_pct` da view: se divergisse, o gestor e a equipe estariam olhando o
 * mesmo trecho e discordando sobre ele estar acima do limite.
 *
 * Cor nunca sozinha: o numero, o icone e o rotulo do estado vao ao lado.
 */

/* O topo da regua e 25% acima do limite, para o risco cair a 80% da altura e
   sobrar espaco visivel para o excedente. Mato muito alto estica o teto, senao
   a barra encostaria no topo e "passou em 6 cm" desenharia igual a
   "passou em 30 cm" — o mesmo cuidado do `Medidor`. */
function teto(altura: number, limite: number): number {
  return Math.max(limite * 1.25, altura * 1.05, 1);
}

/**
 * A marca do limite, como a graduacao de uma regua de verdade: um traco que
 * ATRAVESSA a barra e sai um pouco para fora dela.
 *
 * Duas decisoes vem de uma medicao no navegador. Tracejado em `--ink` sobre o
 * preenchimento `--warning` simplesmente NAO APARECIA: branco sobre amarelo da
 * 1,35:1, e num mato a 29,4 cm contra limite de 30 cm o traco cai exatamente
 * sobre a borda do preenchimento, que e o caso em que ele mais importa. Por
 * isso: (a) traco solido com halo em `--bg`, o par de contraste maximo do tema,
 * que le tanto sobre o preenchimento quanto sobre a pista vazia; (b) ele sai da
 * barra para a esquerda, entao o olho o acha mesmo quando coincide com o topo
 * do preenchimento.
 *
 * A cor vem por `style` e nao por `border-ink`: ver `borda()` em `base.tsx`. Foi
 * aqui que a armadilha apareceu — a marca saia em `--border`, invisivel, e a
 * regua ficava sem referencia nenhuma.
 */
function MarcaLimite({ pct }: { pct: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 h-0 border-t-2"
      style={{ ...borda("var(--ink)"), bottom: `${pct}%`, boxShadow: "0 1px 0 var(--bg), 0 -1px 0 var(--bg)" }}
    />
  );
}

export function ReguaAltura({
  alturaCm,
  limiteCm,
  legenda,
}: {
  alturaCm: number | null;
  limiteCm: number;
  /** "informada pelo gestor" ou "prevista pelo modelo". */
  legenda: string;
}) {
  const leitura = estadoDaAltura(alturaCm, limiteCm);

  if (!leitura) {
    return (
      <div>
        <p className={ESCALA.numero}>—</p>
        <p className={`${ESCALA.meta} mt-1 text-ink-3`}>Altura do mato ainda não medida.</p>
      </div>
    );
  }

  const maximo = teto(leitura.alturaCm, leitura.limiteCm);
  const pctBarra = clamp((leitura.alturaCm / maximo) * 100, 2, 100);
  const pctLimite = clamp((leitura.limiteCm / maximo) * 100, 0, 100);
  const token = leitura.token;

  return (
    <div className="flex items-stretch gap-4">
      {/* A regua. `h-28` = 112 px: alto o suficiente para a marca do limite
          ficar longe do topo do preenchimento, baixo o suficiente para o bloco
          inteiro caber acima da dobra num Pixel 7. `pl-2` da o espaco por onde
          a marca do limite sai da barra. */}
      <div
        role="img"
        aria-label={`Mato em ${fmt.cm(leitura.alturaCm)}, limite do trecho em ${fmt.cm(leitura.limiteCm)}. ${token.rotulo}.`}
        className="relative h-28 shrink-0 pl-2"
      >
        {/* O recorte mora na barra, nao no bloco: um pseudoelemento em `inset`
            negativo dentro de uma caixa com `overflow-hidden` seria cortado, e a
            marca do limite precisa passar da borda. */}
        <div className="relative h-full w-9 overflow-hidden rounded-md border border-border bg-surface-3">
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-300 ease-[var(--ease-out-quint)]"
            style={{ height: `${pctBarra}%`, backgroundColor: token.cor }}
          />
        </div>
        <MarcaLimite pct={pctLimite} />
      </div>

      <div className="min-w-0">
        <p className={ESCALA.numero} style={{ color: token.tinta }}>
          {fmt.cm(leitura.alturaCm)}
        </p>
        <p className={`${ESCALA.meta} mt-1 flex items-center gap-1.5`} style={{ color: token.tinta }}>
          <Icone nome={token.icone} className="size-4" />
          <span>{token.rotulo}</span>
        </p>
        <p className={`${ESCALA.meta} mt-2 text-ink-2`}>Limite do trecho: {fmt.cm(leitura.limiteCm)}</p>
        <p className={`${ESCALA.rotulo} text-ink-3`}>{legenda}</p>
      </div>
    </div>
  );
}

/**
 * Depois de finalizada: a mesma regua com as duas medidas, para a pessoa ver o
 * trabalho. Antes e depois lado a lado, na MESMA escala — dois tetos diferentes
 * mentiriam sobre o quanto baixou.
 */
export function ReguaAntesDepois({
  antesCm,
  depoisCm,
  limiteCm,
}: {
  antesCm: number | null;
  depoisCm: number;
  limiteCm: number;
}) {
  const antes = antesCm ?? 0;
  const maximo = teto(Math.max(antes, depoisCm), limiteCm);
  const pctLimite = clamp((limiteCm / maximo) * 100, 0, 100);

  const barras = [
    { rotulo: "antes", valor: antes, token: estadoDaAltura(antes, limiteCm)?.token ?? ESTADO_ALTURA.dentro },
    { rotulo: "depois", valor: depoisCm, token: estadoDaAltura(depoisCm, limiteCm)?.token ?? ESTADO_ALTURA.dentro },
  ];

  return (
    <div className="flex items-stretch gap-4">
      <div className="relative h-28 shrink-0 pl-2">
        <div className="flex h-full gap-1.5">
          {barras.map((b) => (
            <div key={b.rotulo} className="relative w-9 overflow-hidden rounded-md border border-border bg-surface-3">
              <div
                className="absolute inset-x-0 bottom-0"
                style={{ height: `${clamp((b.valor / maximo) * 100, 2, 100)}%`, backgroundColor: b.token.cor }}
              />
            </div>
          ))}
        </div>
        <MarcaLimite pct={pctLimite} />
      </div>

      <div className="min-w-0">
        <p className={ESCALA.numero}>{fmt.cm(depoisCm)}</p>
        <p className={`${ESCALA.meta} mt-1 text-ink-2`}>
          {antesCm == null ? "altura final medida pela equipe" : `de ${fmt.cm(antesCm)} para ${fmt.cm(depoisCm)}`}
        </p>
        <p className={`${ESCALA.meta} mt-2 text-ink-2`}>Limite do trecho: {fmt.cm(limiteCm)}</p>
      </div>
    </div>
  );
}
