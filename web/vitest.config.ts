import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Só funções puras: nenhum teste deste projeto toca DOM, rede ou banco.
 *  O ambiente `node` é o mais rápido e é o único de que precisamos. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
