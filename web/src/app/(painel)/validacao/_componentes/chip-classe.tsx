import { IconeDominio } from "@/components/viz/legenda";
import { CLASSE_ALTURA } from "@/lib/dominio";
import type { ClasseAltura } from "@/lib/types";

/**
 * Cor nunca sozinha: ícone e rótulo sempre juntos, como manda `dominio.ts`.
 *
 * O ícone resolve por `IconeDominio` (o registro `ICONES` de `legenda.tsx`),
 * o mesmo caminho de `ChipRisco`/`ChipStatus` — não um mapa privado. Um mapa
 * privado escaparia de `legenda.test.ts` (que itera `CLASSE_ALTURA` contra
 * aquele registro): o teste continuaria verde enquanto o mapa daqui
 * ficasse desatualizado. E o fallback importa tanto quanto o registro: o de
 * `IconeDominio` é um `Circle` neutro, que o resto do painel já trata como
 * "não carregou". Um fallback como `TriangleAlert` (o que este componente
 * tinha antes) é pior que não ter ícone nenhum — um ícone ausente pintaria
 * como alerta ativo sobre o segmento, não como falha de carregamento.
 */
export function ChipClasse({ classe, curto = false }: { classe: ClasseAltura; curto?: boolean }) {
  const t = CLASSE_ALTURA[classe];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-2xs font-medium"
      style={{ color: t.tinta, background: t.fundo }}
      title={t.descricao}
    >
      <IconeDominio nome={t.icone} className="size-3" />
      {curto ? String(classe) : t.rotulo}
    </span>
  );
}
