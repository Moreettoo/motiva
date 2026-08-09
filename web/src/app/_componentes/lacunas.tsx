import { Aviso } from "@/components/ui/aviso";
import { fmt } from "@/lib/format";
import type { LacunasDeDados } from "@/lib/queries";

import { LinkAcao } from "./link-acao";

/**
 * Só aparece quando há lacuna. Um aviso permanente vira moldura e para de ser lido.
 *
 * Importa porque `altura_atual_cm` é extrapolada da última medição: sem medição
 * nova, o erro do modelo se acumula em silêncio e o prazo do painel mente.
 */
export function Lacunas({ lacunas }: { lacunas: LacunasDeDados }) {
  const linhas = [
    { chave: "sem-previsao", n: lacunas.semPrevisao.length, texto: "sem previsão do modelo" },
    { chave: "sem-medicao", n: lacunas.semMedicao.length, texto: "sem nenhuma medição de campo" },
    {
      chave: "medicao-velha",
      n: lacunas.medicaoVelha.length,
      texto: "com a última medição há mais de 45 dias",
    },
    {
      chave: "sem-agendamento",
      n: lacunas.semAgendamento.length,
      texto: "em risco alto ou crítico e ainda sem roçada sugerida",
    },
  ].filter((linha) => linha.n > 0);

  if (linhas.length === 0) return null;

  return (
    <Aviso
      tom="warning"
      titulo="Lacunas nos dados de campo"
      acao={<LinkAcao href="/malha">Conferir na malha</LinkAcao>}
    >
      <ul className="space-y-1">
        {linhas.map((linha) => (
          <li key={linha.chave} className="flex gap-2 text-sm">
            <span
              aria-hidden="true"
              className="mt-2 size-1 shrink-0 rounded-full bg-border-strong"
            />
            <span className="min-w-0 break-words">
              <span className="tnum font-mono font-medium text-ink">
                {fmt.contar(linha.n, "trecho")}
              </span>{" "}
              {linha.texto}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-ink-3">
        A altura atual é extrapolada da última medição. Quanto mais velha a medição, maior o erro
        acumulado no prazo — registre a altura em campo para o painel voltar a acertar.
      </p>
    </Aviso>
  );
}
