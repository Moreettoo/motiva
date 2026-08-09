import { CalendarClock } from "lucide-react";

import { fmt, relativoEmDias } from "@/lib/format";

/**
 * Não é um botão: é a cadência do lote.
 *
 * Existia aqui um "Analisar Malha" que reprocessava os 50 trechos sob demanda.
 * Ele saiu por não ter uso real — o lote roda todo dia às 06:00 e a janela de
 * previsão do Open-Meteo é a mesma de 16 dias, então reanalisar à tarde custava
 * sete minutos de execução para mover o crescimento previsto quase nada. A
 * reanálise pontual continua existindo, na página do trecho, que é onde ela
 * importa: logo depois de registrar uma medição de campo nova.
 *
 * Mostra a PRÓXIMA execução, não a última: a barra lateral já carrega o carimbo
 * da última em todas as telas, e repetir o mesmo número em dois lugares da
 * mesma tela é ruído.
 */
export function CarimboDoLote({ proximaEm }: { proximaEm: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface px-3.5 py-2.5">
      <CalendarClock aria-hidden="true" className="mt-px size-4 shrink-0 text-ink-3" />
      <div>
        <p className="text-2xs font-medium tracking-wider text-ink-3 uppercase">Reanálise automática</p>
        <p className="mt-1 text-xs text-ink-2">
          Próxima <span className="tnum font-mono text-ink">{fmt.dataCurta(proximaEm)}</span> às{" "}
          <span className="tnum font-mono text-ink">06:00</span>
          <span className="text-ink-3"> · {relativoEmDias(proximaEm)}</span>
        </p>
      </div>
    </div>
  );
}
