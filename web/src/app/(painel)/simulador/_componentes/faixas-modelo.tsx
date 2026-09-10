import { CircleCheck, TriangleAlert } from "lucide-react";

import { fmt } from "@/lib/format";
import { LIMITES, posicaoNaFaixa, type Limite } from "@/lib/modelo/campos";
import { cn } from "@/lib/utils";

/**
 * SEM CHAMADOR HOJE. O cartao "Ate onde o modelo foi treinado" foi retirado da
 * pagina a pedido; este arquivo ficou porque nunca chegou a ser commitado e
 * apagar seria perde-lo de vez. Para voltar, basta renderizar `<FaixasDoModelo>`
 * em `resultado.tsx` — nada mais precisa mudar, `LIMITES` continua exportado.
 *
 * ------------------------------------------------------------------
 *
 * Onde este pedido cai dentro do que o modelo viu no treino.
 *
 * A pagina existe para mostrar a IA funcionando; mostrar onde ela PARA de
 * funcionar e parte do mesmo trabalho. Fora da faixa o modelo nao erra com
 * barulho: ele satura. Altura inicial de 50, 60 ou 80 cm devolve exatamente o
 * mesmo numero, porque as tres caem no ultimo bin, e a resposta continua
 * saindo com a mesma cara de certeza das outras.
 *
 * As faixas nao sao escritas aqui: saem dos limiares de bin do proprio
 * `modelo.json`. Retreinar o modelo move estas reguas sozinho.
 */
export function FaixasDoModelo({
  alturaCm,
  dias,
  diasDesdeRocada,
  latitude,
  fertilidade,
  capacidadeMm,
}: {
  alturaCm: number;
  dias: number;
  diasDesdeRocada: number;
  latitude: number;
  fertilidade: number;
  capacidadeMm: number;
}) {
  const linhas = [
    { limite: LIMITES.altura, valor: alturaCm, casas: 1 },
    { limite: LIMITES.dias, valor: dias, casas: 0 },
    { limite: LIMITES.rocada, valor: diasDesdeRocada, casas: 0 },
    { limite: LIMITES.latitude, valor: latitude, casas: 2 },
    { limite: LIMITES.fertilidade, valor: fertilidade, casas: 2 },
    { limite: LIMITES.capacidade, valor: capacidadeMm, casas: 0 },
  ];

  const aproximadas = linhas.filter(({ limite }) => !limite.exata);

  return (
    <div className="flex flex-col gap-4">
      {linhas.map(({ limite, valor, casas }) => (
        <Regua key={limite.campo} limite={limite} valor={valor} casas={casas} />
      ))}

      {/* Nem toda faixa é recuperável com a mesma precisão. Para grandeza de
          valores inteiros (o período) os pontos médios entre valores observados
          devolvem a faixa exata. Para grandeza contínua não: o primeiro limiar
          de bin já está DENTRO do treino, por uma margem que o modelo não
          guarda. Erra estreito, que é o lado seguro — mas dizer isso é mais
          honesto que exibir três réguas com a mesma cara de precisão. */}
      {aproximadas.length > 0 ? (
        <p className="border-t border-border pt-3 text-2xs leading-relaxed text-ink-3">
          {aproximadas.map(({ limite }) => limite.rotulo.toLowerCase()).join(" e ")}:{" "}
          {aproximadas.length === 1 ? "esta faixa é aproximada" : "estas faixas são aproximadas"}, tirada
          {aproximadas.length === 1 ? "" : "s"} das bordas dos bins do modelo. A faixa real é um pouco
          mais larga — o modelo não guarda o quanto. O período é exato: sai dos pontos médios entre os
          valores inteiros que ele viu.
        </p>
      ) : null}
    </div>
  );
}

function formatar(v: number, casas: number): string {
  return casas === 0 ? fmt.n(Math.round(v)) : casas === 1 ? fmt.d1(v) : fmt.d2(v);
}

/** Valor com unidade, flexionando quando a unidade flexiona: "1 dia" e não
 *  "1 dias". `cm` e `°` não flexionam e caem no caminho simples. */
function comUnidade(limite: Limite, valor: number, casas: number): string {
  if (limite.unidadeSingular) {
    return fmt.contar(Math.round(valor), limite.unidadeSingular, limite.unidade);
  }
  return `${formatar(valor, casas)} ${limite.unidade}`;
}

function Regua({ limite, valor, casas }: { limite: Limite; valor: number; casas: number }) {
  const dentro = valor >= limite.min && valor <= limite.max;
  const posicao = posicaoNaFaixa(limite, valor);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-ink-2">{limite.rotulo}</span>
        <span
          className={cn(
            "tnum flex items-center gap-1.5 font-mono text-xs",
            dentro ? "text-ink" : "text-warning-ink",
          )}
        >
          {dentro ? (
            <CircleCheck aria-hidden="true" className="size-3.5" />
          ) : (
            <TriangleAlert aria-hidden="true" className="size-3.5" />
          )}
          {comUnidade(limite, valor, casas)}
        </span>
      </div>

      {/* O trilho É a faixa de treino: o ponto encostado na ponta significa
          "daqui para fora o modelo não distingue mais". */}
      <div className="relative mt-2 h-1.5 rounded-full bg-surface-3">
        <div
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface",
            dentro ? "bg-accent-line" : "bg-warning",
          )}
          style={{ left: `${posicao * 100}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="tnum font-mono text-2xs text-ink-3">
          {formatar(limite.min, casas)}
        </span>
        <span className="text-2xs text-ink-3">
          {dentro ? "dentro do treino" : "fora do treino, o modelo satura aqui"}
        </span>
        <span className="tnum font-mono text-2xs text-ink-3">
          {formatar(limite.max, casas)}
        </span>
      </div>
    </div>
  );
}
