import { cn } from "@/lib/utils";

/**
 * Um numero com nome — a unidade de leitura do painel.
 *
 * O numero vem primeiro na hierarquia: rotulo miudo em maiusculas por cima,
 * valor em monoespacado por baixo, nota opcional em tinta fraca. Sao os mesmos
 * tres passos no cartao da malha e no painel lateral, entao a grandeza nao muda
 * de tamanho quando o gestor pula de uma tela para a outra.
 */
export function Leitura({
  rotulo,
  valor,
  nota,
  className,
}: {
  rotulo: string;
  valor: string;
  nota?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {/* Sem truncate no rótulo: "Deslocamento evitado" e "Temperatura média"
          cabem em duas linhas, mas não em reticências. */}
      <p className="text-2xs font-medium tracking-wider text-ink-3 uppercase">{rotulo}</p>

      {/* Sem truncate: "acima do limite" é justamente a leitura que não pode
          virar reticências. */}
      <p className="tnum mt-1 font-mono text-base break-words text-ink">{valor}</p>

      {nota ? <p className="mt-0.5 truncate text-2xs text-ink-3">{nota}</p> : null}
    </div>
  );
}
