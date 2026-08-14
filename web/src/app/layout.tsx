import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { Shell } from "@/components/shell/shell";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HighwAI",
    template: "%s · HighwAI",
  },
  description:
    "Painel de regulação de solo da Motiva: previsão de crescimento da vegetação e agendamento de roçada por trecho de rodovia.",
  applicationName: "HighwAI",
  robots: { index: false, follow: false },
};

/**
 * Nada aqui pode ser pre-renderizado.
 *
 * Todas as telas leem estado operacional que muda por fora do app: o
 * `analisar_lote.py` roda todo dia pelo GitHub Actions e reescreve previsoes e
 * agendamentos. Sem isto, o build congela a malha no momento do deploy e o
 * gestor passa a decidir em cima de numero velho — o pior tipo de bug para este
 * produto, porque a tela continua parecendo certa.
 */
export const dynamic = "force-dynamic";

/**
 * Espelha --bg de globals.css: #f7f7f4 no tema claro, #0a0d0c no escuro.
 *
 * O valor precisa ser literal porque <meta name="theme-color"> nao aceita
 * var(). E a unica hex escrita fora de globals.css no projeto inteiro — ao
 * trocar --bg la, trocar aqui junto.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d0c" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Carimba `data-theme` antes da primeira pintura.
 *
 * Sem isso o painel abriria claro e piscaria para escuro. Com isso a variante
 * `dark:` do Tailwind pode olhar so para o atributo — nao existe estado
 * "sistema" nao resolvido em nenhum momento do ciclo de vida.
 */
const SCRIPT_TEMA = `
(function () {
  try {
    var salvo = localStorage.getItem("solo-tema");
    var tema = salvo === "claro" ? "light"
             : salvo === "escuro" ? "dark"
             : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = tema;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      data-theme="dark"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-dvh bg-bg text-ink antialiased">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-ink"
        >
          Pular para o conteúdo
        </a>
        <NuqsAdapter>
          <Shell>{children}</Shell>
        </NuqsAdapter>
      </body>
    </html>
  );
}
