import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Ponte para outra tela no canto de um cartão.
 *
 * É navegação, então é <Link> e nunca <button> com router.push: o gestor precisa
 * poder abrir o trecho crítico numa aba nova e mandar o endereço para a equipe.
 */
export function LinkAcao({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex min-w-0 items-center gap-1.5 rounded-sm text-xs font-medium text-ink-2",
        "transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-ink",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      <ArrowRight
        aria-hidden="true"
        className="size-3.5 shrink-0 transition-transform duration-200 ease-[var(--ease-out-quint)] group-hover:translate-x-0.5"
      />
    </Link>
  );
}
