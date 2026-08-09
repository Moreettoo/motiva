/**
 * Rodapé compartilhado pelos `error.tsx`. A etiqueta que o gestor lê no telefone
 * para o suporte mora aqui, num lugar só — antes eram quatro redações diferentes
 * espalhadas por cinco telas.
 */
export function CodigoDoErro({ digest }: { digest?: string }) {
  if (!digest) return null;

  return (
    <p className="mt-2 text-xs text-ink-3">
      Código para o suporte: <span className="tnum font-mono">{digest}</span>
    </p>
  );
}
