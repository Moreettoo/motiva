import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

/**
 * UNICA excecao a regra "nenhum hex fora de globals.css": cliente de e-mail nao
 * le variavel CSS. Os valores sao copias literais dos tokens do tema claro:
 * --bg, --surface-2, --ink, --ink-3, --accent, --accent-ink, --accent-line, --border.
 */
export const CORES = {
  fundo: "#f7f7f4",
  cartao: "#ffffff",
  tinta: "#0c100e",
  tinta3: "#676f6a",
  acento: "#4d7c0f",
  acentoTexto: "#ffffff",
  limao: "#a3e635",
  borda: "#e4e4dc",
} as const;

export const FONTE = "Geist, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function BaseEmail({ previa, children }: { previa: string; children: ReactNode }) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{previa}</Preview>
      <Body style={{ margin: 0, backgroundColor: CORES.fundo, fontFamily: FONTE, color: CORES.tinta }}>
        <Container style={{ maxWidth: 520, margin: "0 auto", padding: "32px 16px" }}>
          {/* O filete de limao e a unica cor de marca: no e-mail ele faz o papel do simbolo. */}
          <Section style={{ height: 3, backgroundColor: CORES.limao, borderRadius: "10px 10px 0 0" }} />
          <Section style={{ backgroundColor: CORES.cartao, border: `1px solid ${CORES.borda}`, borderRadius: "0 0 10px 10px", padding: 28 }}>
            <Text style={{ margin: "0 0 16px", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: CORES.tinta3 }}>
              HighwAI · Regulação de solo para a Motiva
            </Text>
            {children}
          </Section>
          <Hr style={{ borderColor: CORES.borda, margin: "20px 0 8px" }} />
          <Text style={{ fontSize: 12, lineHeight: "18px", color: CORES.tinta3, margin: 0 }}>
            Você recebeu este e-mail porque alguém da operação da Motiva cadastrou este endereço no HighwAI.
            Se não esperava por ele, pode ignorar: nada acontece sem o seu clique.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const estiloTitulo = { margin: "0 0 12px", fontSize: 20, lineHeight: "26px", fontWeight: 600, color: CORES.tinta } as const;
export const estiloTexto = { margin: "0 0 12px", fontSize: 15, lineHeight: "23px", color: CORES.tinta } as const;
export const estiloBotao = {
  display: "inline-block",
  backgroundColor: CORES.acento,
  color: CORES.acentoTexto,
  fontSize: 15,
  fontWeight: 600,
  padding: "12px 20px",
  borderRadius: 8,
  textDecoration: "none",
} as const;
export const estiloLinkCru = { margin: "16px 0 0", fontSize: 12, lineHeight: "18px", color: CORES.tinta3, wordBreak: "break-all" } as const;
