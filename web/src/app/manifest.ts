import type { MetadataRoute } from "next";

/* Segunda excecao a regra do hex (a primeira e o theme-color em layout.tsx, pelo
   mesmo motivo): manifesto nao le variavel CSS. #0a0d0c espelha --bg do tema escuro. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/campo",
    name: "HighwAI Campo",
    short_name: "Campo",
    description: "Chamados de roçada da sua equipe, com ou sem sinal.",
    start_url: "/campo",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "pt-BR",
    background_color: "#0a0d0c",
    theme_color: "#0a0d0c",
    icons: [
      { src: "/icones/campo-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icones/campo-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icones/campo-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
