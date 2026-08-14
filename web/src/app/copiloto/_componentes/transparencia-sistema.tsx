"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";

import { BotaoIcone } from "@/components/ui/botao";
import { Modal } from "@/components/ui/modal";

/**
 * O ícone que abre a qualidade dos dados e a ficha do modelo.
 *
 * Esse conteúdo já foi coluna fixa ao lado da conversa; virou sob demanda
 * porque quem só quer perguntar não precisa ler a ficha do modelo toda vez —
 * mas a explicação continua a um clique, não desaparece.
 */
export function TransparenciaSistema({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <BotaoIcone rotulo="Transparência do sistema" onClick={() => setAberto(true)}>
        <Info aria-hidden="true" />
      </BotaoIcone>

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Transparência do sistema"
        descricao="A qualidade dos dados que sustentam a resposta e a ficha completa do modelo."
        largura="lg"
      >
        <div className="flex flex-col gap-6">{children}</div>
      </Modal>
    </>
  );
}
