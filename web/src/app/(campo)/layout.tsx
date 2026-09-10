import type { Viewport } from "next";

import { SerwistProvider } from "@/components/campo/serwist-provider";

/* Sem Shell, sem barra lateral, tema escuro fixo: sol forte pede fundo escuro e
   texto claro, e a paleta escura ja foi medida. `maximumScale: 1` evita o zoom
   acidental ao tocar num campo, comum com luva. */
export const viewport: Viewport = {
  themeColor: "#0a0d0c",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function LayoutCampo({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js">
      <div data-theme="dark" className="min-h-dvh bg-bg text-ink text-[17px] leading-6 antialiased">
        {children}
      </div>
    </SerwistProvider>
  );
}
