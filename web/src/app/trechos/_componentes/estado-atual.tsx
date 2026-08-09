import type { ReactNode } from "react";
import { CloudRain, Gauge, Ruler, Scissors, Sprout, Thermometer, TrendingUp } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/vazio";
import { Medidor } from "@/components/viz/medidor";
import { Minigrafico } from "@/components/viz/minigrafico";
import { rotuloPrazo } from "@/lib/dominio";
import { fmt, parseData, relativoEmDias } from "@/lib/format";
import type { Previsao, TrechoStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** O número primeiro: rótulo pequeno em maiúsculas acima, valor em monoespaçado. */
function Leitura({
  rotulo,
  valor,
  nota,
  icone,
  grafico,
  className,
}: {
  rotulo: string;
  valor: string;
  nota?: string | null;
  icone?: ReactNode;
  grafico?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="flex items-center gap-1.5 text-2xs font-medium tracking-wider text-ink-3 uppercase">
        {icone ? (
          <span aria-hidden="true" className="inline-flex shrink-0 [&_svg]:size-3.5">
            {icone}
          </span>
        ) : null}
        <span className="truncate">{rotulo}</span>
      </p>

      {/* Sem truncate: "acima do limite" é justamente a leitura que não pode virar reticências. */}
      <p className="tnum mt-1.5 font-mono text-xl break-words text-ink">{valor}</p>

      {nota ? <p className="mt-0.5 truncate text-2xs text-ink-3">{nota}</p> : null}
      {grafico ? <div className="mt-2">{grafico}</div> : null}
    </div>
  );
}

export function EstadoAtual({
  trecho,
  previsoes,
  hojeIso,
}: {
  trecho: TrechoStatus;
  previsoes: Previsao[];
  hojeIso: string;
}) {
  const limite = Number(trecho.altura_limite_cm);
  const altura = trecho.altura_atual_cm == null ? null : Number(trecho.altura_atual_cm);
  const crescimento = trecho.crescimento_cm_dia == null ? null : Number(trecho.crescimento_cm_dia);

  const serieCrescimento = previsoes
    .map((p) => Number(p.crescimento_cm_dia))
    .filter((v) => Number.isFinite(v));

  const hoje = parseData(hojeIso);
  const alturaMedida = trecho.altura_medida_cm == null ? null : Number(trecho.altura_medida_cm);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Cartao>
        <CartaoCabecalho
          como="h2"
          icone={<Gauge />}
          titulo="Altura contra o limite"
          descricao="Altura extrapolada da última medição pela taxa do modelo."
        />
        <CartaoCorpo className="flex justify-center pt-1 pb-6">
          {altura == null ? (
            <EstadoVazio
              className="w-full"
              icone={<Ruler />}
              titulo="Sem altura estimada"
              descricao="Este trecho ainda não tem previsão. Registre uma medição e rode a análise."
            />
          ) : (
            <Medidor valor={altura} limite={limite} rotulo="Altura" tamanho={168} />
          )}
        </CartaoCorpo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          como="h2"
          icone={<TrendingUp />}
          titulo="Leituras do trecho"
          descricao="O que o modelo estatístico calculou e quando o campo esteve aqui."
        />
        <CartaoCorpo className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Leitura
            rotulo="Crescimento"
            icone={<Sprout />}
            valor={crescimento == null ? "—" : fmt.cmDia(crescimento)}
            nota={crescimento == null ? "sem previsão" : "modelo de regressão"}
            grafico={
              serieCrescimento.length >= 2 ? (
                <Minigrafico
                  pontos={serieCrescimento}
                  largura={104}
                  rotulo={`Crescimento previsto nas últimas ${serieCrescimento.length} análises`}
                />
              ) : null
            }
          />

          <Leitura
            rotulo="Prazo até o limite"
            icone={<Gauge />}
            valor={rotuloPrazo(trecho.dias_ate_limite)}
            nota={`limite de ${fmt.cm(limite)}`}
          />

          <Leitura
            rotulo="Última medição"
            icone={<Ruler />}
            valor={trecho.medido_em ? fmt.dataMedia(trecho.medido_em) : "—"}
            nota={
              trecho.medido_em
                ? [relativoEmDias(trecho.medido_em, hoje), alturaMedida == null ? null : fmt.cm(alturaMedida)]
                    .filter(Boolean)
                    .join(" · ")
                : "nenhuma medição registrada"
            }
          />

          <Leitura
            rotulo="Última roçada"
            icone={<Scissors />}
            valor={trecho.rocado_em ? fmt.dataMedia(trecho.rocado_em) : "—"}
            nota={trecho.rocado_em ? relativoEmDias(trecho.rocado_em, hoje) : "sem execução registrada"}
          />
        </CartaoCorpo>
      </Cartao>

      <Cartao className="flex flex-col">
        <CartaoCabecalho
          como="h2"
          icone={<CloudRain />}
          titulo="Clima da última previsão"
          descricao="Janela consultada no Open-Meteo para a zona de clima do trecho."
        />
        <CartaoCorpo className="grid flex-1 grid-cols-2 gap-x-4 gap-y-5">
          <Leitura
            rotulo="Temperatura média"
            icone={<Thermometer />}
            valor={fmt.celsius(
              trecho.temperatura_media_c == null ? null : Number(trecho.temperatura_media_c),
            )}
            nota="entrada do modelo"
          />
          <Leitura
            rotulo="Chuva total"
            icone={<CloudRain />}
            valor={fmt.mm(trecho.chuva_total_mm == null ? null : Number(trecho.chuva_total_mm))}
            nota="entrada do modelo"
          />
        </CartaoCorpo>

        <CartaoRodape>
          {trecho.previsto_em ? (
            <span className="min-w-0 truncate">
              Previsão de{" "}
              <span className="tnum font-mono text-ink-2">{fmt.dataMedia(trecho.previsto_em)}</span>
            </span>
          ) : (
            <span>Nenhuma previsão gerada para este trecho.</span>
          )}
        </CartaoRodape>
      </Cartao>
    </div>
  );
}
