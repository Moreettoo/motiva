import "server-only";

import { render, toPlainText } from "@react-email/components";
import type { ReactElement } from "react";
import { Resend } from "resend";

import type { Resultado } from "../resultado";

/**
 * Unica porta de saida de e-mail do sistema. O Supabase NAO envia e-mail: convite
 * e redefinicao sao fluxos nossos, e o template mora em `src/emails/`.
 *
 * Modo de teste do Resend (sem dominio verificado): so entrega para o e-mail da
 * propria conta; qualquer outro destinatario volta erro, e quem chamou mostra o
 * link copiavel na tela. Por isso o retorno e `Resultado`, nunca `throw`.
 */
export async function enviarEmail(e: {
  para: string;
  assunto: string;
  react: ReactElement;
}): Promise<Resultado<{ id: string | null }>> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    return {
      ok: false,
      erro: "O envio de e-mail precisa da variável RESEND_API_KEY. Configure-a no ambiente (web/.env.local ou na Vercel).",
    };
  }

  // O HTML sai daqui, e nao do `react:` do Resend: `resend` importa
  // `@react-email/render` de forma dinamica e o declara como peer OPCIONAL, e o
  // npm so o instalou aninhado dentro de `@react-email/components` — o import
  // dele nao resolve a partir de `resend/dist` e todo envio morre em
  // "Failed to render React component". Renderizando aqui, com o `render` que a
  // propria `@react-email/components` reexporta, o caminho e o mesmo e nenhuma
  // dependencia nova entra. O texto puro vai junto: e-mail so-HTML pesa no spam.
  const html = await render(e.react);

  const resend = new Resend(chave);
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_REMETENTE ?? "HighwAI <onboarding@resend.dev>",
    to: e.para,
    subject: e.assunto,
    html,
    text: toPlainText(html),
  });

  if (error) return { ok: false, erro: `O Resend recusou o envio: ${error.message}` };
  return { ok: true, dados: { id: data?.id ?? null } };
}
