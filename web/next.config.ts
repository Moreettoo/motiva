import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

/* Sem CSP nesta versao: o script inline de tema e o Motion exigiriam nonce e
   nao ha tempo para medir a regressao antes de 13/09. Os cabecalhos abaixo nao
   quebram nada e fecham o obvio. */
const CABECALHOS_SEGURANCA = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Camera e GPS so para a propria origem: e o app de campo quem usa.
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: CABECALHOS_SEGURANCA }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "mbkcygsqfcxxcmvkuqyt.supabase.co", pathname: "/storage/v1/**" },
    ],
  },
};

export default withSerwist(nextConfig);
