import Link from "next/link";
import { CircleCheck, DatabaseZap, TriangleAlert } from "lucide-react";

import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { fmt } from "@/lib/format";
import type { LacunasDeDados } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * O que decide se a resposta do copiloto vale alguma coisa.
 *
 * A tela inteira apoia numa cadeia: medicao recente -> previsao -> agendamento.
 * Quando um elo falta, a resposta continua saindo bonita e vira palpite. Este
 * bloco existe para o gestor ver o elo faltando antes de acreditar no texto.
 */

const GRUPOS = [
  {
    chave: "semPrevisao",
    rotulo: "Sem previsão",
    nota: "O modelo nunca rodou aqui.",
    href: "/malha",
  },
  {
    chave: "semMedicao",
    rotulo: "Sem medição",
    nota: "Nenhuma leitura de campo registrada.",
    href: "/malha",
  },
  {
    chave: "medicaoVelha",
    rotulo: "Medição vencida",
    nota: "Última visita há mais de 45 dias.",
    href: "/malha",
  },
  {
    chave: "semAgendamento",
    rotulo: "Sem agendamento",
    nota: "Risco alto ou crítico e nenhuma data.",
    href: "/malha",
  },
] as const satisfies readonly { chave: keyof LacunasDeDados; rotulo: string; nota: string; href: string }[];

export function QualidadeDados({
  lacunas,
  total,
}: {
  lacunas: LacunasDeDados;
  total: number;
}) {
  // Um trecho conta como completo quando nao aparece em nenhuma lacuna de
  // leitura. `semAgendamento` fica de fora: e falta de decisao, nao de dado.
  const comprometidos = new Set(
    [...lacunas.semPrevisao, ...lacunas.semMedicao, ...lacunas.medicaoVelha].map((t) => t.id),
  );
  const completos = Math.max(0, total - comprometidos.size);
  const tudoEmDia = comprometidos.size === 0;

  return (
    <Cartao>
      <CartaoCabecalho
        icone={<DatabaseZap />}
        titulo="Qualidade dos dados"
        descricao="O copiloto responde sobre o que existe na base. Isto é o que falta."
      />

      <CartaoCorpo className="space-y-5">
        <div>
          <span className="block text-2xs tracking-widest text-ink-3 uppercase">
            Trechos com leitura confiável
          </span>
          <span className="mt-1.5 flex items-baseline gap-1.5">
            <span className="tnum font-mono text-2xl leading-none font-semibold text-ink">
              {fmt.n(completos)}
            </span>
            <span className="text-xs text-ink-3">de {fmt.n(total)}</span>
          </span>

          <BarraProgresso
            className="mt-3"
            valor={completos}
            max={Math.max(total, 1)}
            tom={tudoEmDia ? "good" : "warning"}
            rotulo="Trechos com previsão e medição dentro do prazo"
          />

          <p
            className={cn(
              "mt-2 flex items-center gap-1.5 text-xs font-medium",
              tudoEmDia ? "text-good-ink" : "text-warning-ink",
            )}
          >
            {tudoEmDia ? (
              <CircleCheck aria-hidden="true" className="size-3.5 shrink-0" />
            ) : (
              <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
            )}
            {tudoEmDia
              ? "Malha completa: previsão e medição em dia"
              : `${fmt.n(comprometidos.size)} trechos com leitura comprometida`}
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2.5">
          {GRUPOS.map((grupo) => {
            const quantidade = lacunas[grupo.chave].length;

            const conteudo = (
              <>
                <span className="block truncate text-2xs tracking-widest text-ink-3 uppercase">
                  {grupo.rotulo}
                </span>
                <span className="mt-1.5 flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "tnum font-mono text-xl leading-none font-semibold",
                      quantidade === 0 ? "text-ink-3" : "text-ink",
                    )}
                  >
                    {fmt.n(quantidade)}
                  </span>
                  <span className="text-2xs text-ink-3">
                    {quantidade === 1 ? "trecho" : "trechos"}
                  </span>
                </span>
                {quantidade === 0 ? (
                  <span className="mt-1.5 flex items-center gap-1 text-2xs text-good-ink">
                    <CircleCheck aria-hidden="true" className="size-3 shrink-0" />
                    Sem pendência
                  </span>
                ) : (
                  <span className="mt-1.5 block text-2xs text-ink-3">{grupo.nota}</span>
                )}
              </>
            );

            return (
              <li key={grupo.chave} className="min-w-0">
                {quantidade === 0 ? (
                  <div className="rounded-md border border-border bg-surface-2 p-3">{conteudo}</div>
                ) : (
                  <Link
                    href={grupo.href}
                    className={cn(
                      "group relative block overflow-hidden rounded-md border border-border bg-surface-2 p-3",
                      "transition-[background-color,border-color] duration-200 ease-[var(--ease-out-quint)]",
                      "hover:border-border-strong hover:bg-surface-3",
                    )}
                  >
                    {conteudo}
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent-line transition-transform duration-200 ease-[var(--ease-out-quint)] group-hover:scale-x-100 group-focus-visible:scale-x-100"
                    />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </CartaoCorpo>
    </Cartao>
  );
}
