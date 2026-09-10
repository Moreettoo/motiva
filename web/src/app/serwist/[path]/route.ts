import { createSerwistRoute } from "@serwist/turbopack";

/* A revisao muda a cada deploy para o precache de /campo nao servir casca velha
   apontando para chunks que nao existem mais. Na Vercel o id do deploy basta;
   fora dela, o instante do build. */
const revision = process.env.VERCEL_DEPLOYMENT_ID ?? String(Date.now());

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
  additionalPrecacheEntries: [{ url: "/campo", revision }],
});
