"use client";

import { CloudSun, History, Repeat } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Chip } from "@/components/ui/chip";
import { Leitura } from "@/components/ui/leitura";
import { FaixaEmpilhada } from "@/components/viz/faixa-empilhada";
import { corSerie } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { AgregadoClima } from "@/lib/modelo/campos";
import type { Janela } from "@/lib/clima";

/**
 * De onde veio cada dia de clima.
 *
 * Nao e enfeite: os primeiros 16 dias sao previsao de verdade e o resto e
 * media historica (ou, quando o arquivo do Open-Meteo recusa, a repeticao do
 * padrao previsto). Quem olha a curva precisa saber onde a previsao acaba,
 * porque a confianca nao e a mesma nos dois trechos.
 */
export function JanelaClima({ janela, agregado }: { janela: Janela; agregado: AgregadoClima }) {
  const complementares = janela.dias.length - janela.diasPrevistos;

  const rotuloComplemento =
    janela.complemento === "historico"
      ? `Média observada de ${janela.anos.join(" e ")}`
      : "Padrão previsto, repetido";

  const segmentos = [
    {
      chave: "previsao",
      rotulo: "Previsão",
      valor: janela.diasPrevistos,
      cor: corSerie(0),
      icone: "CloudSun",
    },
    ...(complementares > 0
      ? [
          {
            chave: "complemento",
            rotulo: rotuloComplemento,
            valor: complementares,
            cor: corSerie(1),
            icone: janela.complemento === "historico" ? "History" : "Repeat",
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Com uma fonte só a faixa empilhada seria uma barra sólida sem legenda,
          `FaixaEmpilhada` só desenha legenda a partir de dois segmentos, e
          barra sem rótulo não informa nada. Aí o chip diz o mesmo em uma linha. */}
      {complementares > 0 ? (
        <FaixaEmpilhada
          titulo="Janela de clima usada"
          descricao={`${janela.dias.length} dias, do Open-Meteo, para o ponto exato da simulação.`}
          segmentos={segmentos}
          formatarValor={(v) => `${fmt.n(v)} d`}
        />
      ) : (
        <div>
          <p className="text-sm font-medium text-ink">Janela de clima usada</p>
          <p className="mt-0.5 text-xs text-ink-3">
            {fmt.contar(janela.dias.length, "dia")}, do Open-Meteo, para o ponto exato da simulação.
          </p>
          <Chip tom="acento" className="mt-3" icone={<CloudSun aria-hidden="true" />}>
            Previsão · {fmt.contar(janela.diasPrevistos, "dia")}
          </Chip>
        </div>
      )}

      {/* Duas colunas e não quatro: este cartão ocupa meia tela em `lg`, e com
          quatro os rótulos quebravam em duas linhas cada um. */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Leitura rotulo="Temperatura média" valor={fmt.celsius(agregado.temperaturaMediaC)} />
        <Leitura rotulo="Chuva no período" valor={fmt.mm(agregado.precipitacaoTotalMm)} />
        <Leitura rotulo="Umidade média" valor={`${fmt.n(Math.round(agregado.umidadeMediaPct))} %`} />
        <Leitura
          rotulo="Balanço hídrico"
          valor={fmt.d2(agregado.balancoHidrico)}
          nota="chuva ÷ evapotranspiração"
        />
      </dl>

      {janela.complemento === "repeticao" ? (
        <Aviso tom="warning" titulo="O clima depois do dia 16 é uma suposição">
          {janela.avisoDoComplemento ?? "O arquivo histórico do Open-Meteo não respondeu."} Para não
          deixar a simulação sem resposta, os dias seguintes repetem o padrão dos {janela.diasPrevistos}{" "}
          dias previstos: média e variação iguais, datas diferentes. Recarregue mais tarde para a
          média histórica de verdade.
        </Aviso>
      ) : null}

      <p className="flex items-start gap-2 text-xs text-ink-3">
        {janela.complemento === "historico" ? (
          <History aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        ) : janela.complemento === "repeticao" ? (
          <Repeat aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        ) : (
          <CloudSun aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        )}
        <span>
          {janela.complemento === null
            ? "O período inteiro cabe na previsão de 16 dias do Open-Meteo."
            : janela.complemento === "historico"
              ? `Do dia ${janela.diasPrevistos + 1} em diante o clima é a média dos mesmos dias do calendário em ${janela.anos.join(" e ")}, observados pelo ERA5. Média histórica não é previsão: ela acerta a estação, não o dia.`
              : `Do dia ${janela.diasPrevistos + 1} em diante o clima é o padrão previsto, repetido.`}
        </span>
      </p>
    </div>
  );
}
