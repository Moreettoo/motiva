"use client";

import { useState } from "react";
import { Copy, MailX, Send } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { Chip } from "@/components/ui/chip";
import { useNotificacao } from "@/components/ui/notificacoes";
import { IconeDominio } from "@/components/viz/legenda";
import { expirado } from "@/lib/auth/tokens";
import { CARGO } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import { reenviarConvite, revogarConvite } from "@/lib/usuarios/acoes";

import type { ConviteNaTela, Executar } from "./gestao-usuarios";
import { IconeCargo } from "./icone-cargo";

export function ConvitesPendentes({
  convites,
  executar,
  pendente,
}: {
  convites: ConviteNaTela[];
  executar: Executar;
  pendente: boolean;
}) {
  const { mostrar } = useNotificacao();
  /* O link completo só existe na resposta da action: o banco guarda o hash.
     Então o botão "Copiar link" só aparece para o convite reemitido NESTA
     sessão; para os outros, o caminho é reenviar, que gera um link novo. */
  const [links, setLinks] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState<string | null>(null);

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      mostrar({ tom: "good", titulo: "Link copiado" });
    } catch {
      mostrar({
        tom: "critical",
        titulo: "O navegador não deixou copiar",
        descricao: "Selecione o endereço na tela e copie na mão.",
        duracao: 0,
      });
    }
  }

  return (
    <Cartao>
      <CartaoCabecalho
        titulo="Convites pendentes"
        descricao="Quem foi convidado e ainda não criou o acesso."
        icone={<Send />}
      />
      <CartaoCorpo className="flex flex-col gap-3">
        {convites.map((c) => {
          const cargo = CARGO[c.cargo];
          const venceu = expirado(c.expira_em);
          const link = links[c.id];

          return (
            <div
              key={c.id}
              className="flex flex-col gap-3 rounded-md border border-border bg-surface-2 p-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">
                      {c.email}
                    </span>
                    <Chip tamanho="sm" icone={<IconeCargo cargo={c.cargo} />}>
                      {cargo.rotulo}
                    </Chip>
                    {c.equipe_nome ? (
                      <Chip tamanho="sm" tom="acento">
                        {c.equipe_nome}
                      </Chip>
                    ) : null}
                    {venceu ? (
                      <Chip
                        tamanho="sm"
                        tom="warning"
                        icone={<IconeDominio nome="TriangleAlert" />}
                      >
                        expirado
                      </Chip>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-ink-3">
                    Convidado por {c.convidador_nome},{" "}
                    {venceu
                      ? `venceu em ${fmt.dataMedia(c.expira_em)}`
                      : `vale até ${fmt.dataMedia(c.expira_em)}`}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Botao
                    tamanho="sm"
                    variante="secundario"
                    disabled={pendente}
                    iconeEsquerda={<Send />}
                    onClick={() =>
                      executar(
                        "Convite reenviado",
                        () => reenviarConvite(c.id),
                        {
                          aoConcluir: (dados) => {
                            setLinks((atual) => ({
                              ...atual,
                              [c.id]: dados.link,
                            }));
                            if (!dados.emailEnviado && dados.aviso) {
                              mostrar({
                                tom: "info",
                                titulo: "O e-mail não saiu; use o link",
                                descricao: dados.aviso,
                                duracao: 0,
                              });
                            }
                          },
                        },
                      )
                    }
                  >
                    Reenviar
                  </Botao>

                  {link && !venceu ? (
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      iconeEsquerda={<Copy />}
                      onClick={() => void copiar(link)}
                    >
                      Copiar link
                    </Botao>
                  ) : null}

                  {/* Revogar apaga o convite: pede confirmação em vez de obedecer
                    no primeiro clique. */}
                  {confirmando === c.id ? (
                    <>
                      <Botao
                        tamanho="sm"
                        variante="perigo"
                        disabled={pendente}
                        onClick={() => {
                          setConfirmando(null);
                          executar("Convite revogado", () =>
                            revogarConvite(c.id),
                          );
                        }}
                      >
                        Confirmar revogação
                      </Botao>
                      <Botao
                        tamanho="sm"
                        variante="fantasma"
                        onClick={() => setConfirmando(null)}
                      >
                        Manter convite
                      </Botao>
                    </>
                  ) : (
                    <Botao
                      tamanho="sm"
                      variante="perigo"
                      disabled={pendente}
                      iconeEsquerda={<MailX />}
                      onClick={() => setConfirmando(c.id)}
                    >
                      Revogar
                    </Botao>
                  )}
                </div>
              </div>

              {link ? (
                <Aviso tom="info" titulo="Link deste convite">
                  <p className="font-mono text-2xs break-all text-ink-2">
                    {link}
                  </p>
                </Aviso>
              ) : null}
            </div>
          );
        })}
      </CartaoCorpo>
    </Cartao>
  );
}
