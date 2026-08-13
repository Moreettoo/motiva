# Quadro da semana da agenda — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a régua Gantt da agenda por um quadro semanal de colunas por dia onde arrastar um serviço para o cruzamento de um dia com uma turma grava data e equipe numa ação só.

**Architecture:** Toda a matemática de janela, grade e capacidade fica em funções puras testáveis em `dados.tsx`. O arrasto é um hook de Pointer Events próprio (`usar-arrasto.ts`) que resolve o alvo por `document.elementsFromPoint` e desenha o cartão num portal no `<body>`. Os componentes de tela são finos e memoizados; a escrita é uma Server Action única com validação no servidor e `useOptimistic` no cliente.

**Tech Stack:** Next.js 16 (App Router), React 19.2.8, TypeScript, Tailwind v4, motion 13 (`motion/react`), nuqs 2, lucide-react 1.30, Supabase JS 2. Vitest entra como dependência **de desenvolvimento** neste plano.

**Spec:** `docs/superpowers/specs/2026-08-13-calendario-agenda-design.md` — leia antes da Tarefa 1. O plano argumenta a partir dela.

## Global Constraints

- Código, nomes de arquivo, identificadores, comentários e texto de UI em **português do Brasil**.
- Datas e números **sempre** por `Intl`, através de `src/lib/format.ts`. Nada de `toFixed` solto.
- Datas do banco chegam como `AAAA-MM-DD` sem fuso: use `parseData()`. `new Date(s)` as trata como UTC e no Brasil elas voltam um dia.
- "Hoje" nunca sai do relógio da máquina: `isoHoje()` formata em `America/Sao_Paulo`. O valor vem do servidor por prop.
- Animação só em `transform` e `opacity`. Nunca `transition: all`. `prefers-reduced-motion` já é desligado globalmente em `globals.css`; não reimplemente por componente.
- Nenhum componente escreve hex. Cor, ícone, rótulo e ordenação de risco/status/espécie saem de `src/lib/dominio.ts`.
- Cor de status nunca aparece sozinha: sempre com ícone **e** rótulo.
- Estado de filtro, aba e seleção vai para a URL via `nuqs`, não `useState`.
- Números em coluna usam a classe `.tnum`.
- Nenhuma dependência nova de runtime. `vitest` é `devDependencies` e não entra no bundle.
- `npm run verificar` precisa passar ao fim de cada tarefa que toque em `web/`.

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `web/vitest.config.ts` | criar | Alias `@` e ambiente `node` para os testes puros |
| `web/src/app/agenda/_componentes/dados.tsx` | alterar | Todo o modelo puro: janela ancorada, grade por célula, fatias, prévia, resumo de 28 dias |
| `web/src/app/agenda/_componentes/dados.test.ts` | criar | Testes das funções puras |
| `web/src/lib/acoes.ts` | alterar | `alocarAgendamento`, `devolverParaFila`, `desfazerAlocacao`; corrige `remarcarAgendamento` |
| `web/src/app/agenda/_componentes/quadro/navegacao.ts` | criar | Navegação pura pelo teclado sobre a grade |
| `web/src/app/agenda/_componentes/quadro/navegacao.test.ts` | criar | Testes da navegação |
| `web/src/app/agenda/_componentes/quadro/usar-arrasto.ts` | criar | Máquina de estados do arrasto, hit-test, auto-rolagem, teclado |
| `web/src/app/agenda/_componentes/quadro/cartao-servico.tsx` | criar | O cartão arrastável, memoizado |
| `web/src/app/agenda/_componentes/quadro/sobrevoo.tsx` | criar | O clone no portal, dois nós |
| `web/src/app/agenda/_componentes/quadro/celula-equipe.tsx` | criar | Uma célula `(dia, equipe)`, memoizada, com barra de capacidade e prévia |
| `web/src/app/agenda/_componentes/quadro/cabecalho-dia.tsx` | criar | Cabeçalho grudado de uma coluna de dia |
| `web/src/app/agenda/_componentes/quadro/trilho-fila.tsx` | criar | A fila como coluna ou doca |
| `web/src/app/agenda/_componentes/quadro/mini-mapa.tsx` | criar | Faixa de 28 dias |
| `web/src/app/agenda/_componentes/quadro/quadro-semana.tsx` | criar | Orquestra grade, arrasto, foco e anúncios |
| `web/src/app/agenda/_componentes/planejamento.tsx` | alterar | Semana na URL, ação única, `pendente` por cartão, equipe vira destaque |
| `web/src/app/agenda/_componentes/controles.tsx` | alterar | Navegação de semana no lugar do período |
| `web/src/app/agenda/_componentes/resumo.tsx` | alterar | Vira faixa fina do cabeçalho do quadro |
| `web/src/app/agenda/_componentes/painel-agendamento.tsx` | alterar | Importa `textoServico` de `dados.tsx` |
| `web/src/app/globals.css` | alterar | Grade do quadro, estados de arrasto, hachura, anel de erro |
| `web/src/app/agenda/_componentes/linha-do-tempo.tsx` | remover | Substituído pelo quadro |
| `web/src/app/agenda/_componentes/fila-decisao.tsx` | remover | Substituído pelo trilho |

---

### Task 1: Infraestrutura de teste e o modelo puro da grade

**Files:**
- Create: `web/vitest.config.ts`
- Create: `web/src/app/agenda/_componentes/dados.test.ts`
- Modify: `web/src/app/agenda/_componentes/dados.tsx`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: `ItemAgenda`, `Janela`, `chaveDia`, `montarItens`, `ordenarPorUrgencia` (já existem em `dados.tsx`); `Equipe` de `@/lib/types`; `diasEntre`, `inicioDaSemana`, `somarDias`, `parseData` de `@/lib/format`; `ordemRisco` de `@/lib/dominio`.
- Produces:
  ```ts
  export type ChaveCelula = string;                      // `${dia}|${equipeId}`
  export function chaveCelula(dia: string, equipeId: number): ChaveCelula;
  export function montarJanela(ancora: string, dias?: number): Janela;   // assinatura MUDA
  export function ocupaDia(item: ItemAgenda, dia: string): boolean;
  export function diasDeServico(km: number, capacidade: number): number;
  export type Fatia = { chave: ChaveCelula; dia: string; equipeId: number; km: number };
  export function fatiasEm(item: ItemAgenda, dia: string, equipe: Equipe): Fatia[];
  export type Ocupacao = { km: number; ocupacao: number; excedida: boolean };
  export type Celula = { chave: ChaveCelula; dia: string; equipeId: number;
                         itens: ItemAgenda[]; km: number; capacidade: number;
                         ocupacao: number; excedida: boolean; aceitaSolta: boolean };
  export type LinhaEquipe = { equipe: Equipe; celulas: Celula[]; kmSemana: number };
  export type ResumoDia = { dia: string; comEquipe: number; semEquipe: number; algumaExcedida: boolean };
  export type Grade = { janela: Janela; propostas: Map<string, ItemAgenda[]>;
                        linhas: LinhaEquipe[]; fila: ItemAgenda[]; porDia: ResumoDia[];
                        porCelula: Map<ChaveCelula, Celula> };
  export function montarGrade(e: { itens: ItemAgenda[]; equipes: Equipe[]; janela: Janela; hoje: string }): Grade;
  export function previaDoMovimento(grade: Grade, item: ItemAgenda, destino: ChaveCelula,
                                    equipes: Equipe[]): Map<ChaveCelula, Ocupacao>;
  export function resumo28(itens: ItemAgenda[], ancora: string): ResumoDia[];
  export function textoServico(dias: number): string;    // MUDA de casa: vem de linha-do-tempo.tsx
  export const HACHURA_EXCESSO: string;                  // MUDA de casa: vem de linha-do-tempo.tsx
  ```

- [ ] **Step 1: Instalar o vitest e criar a configuração**

```bash
cd web && npm install -D vitest@^3
```

Criar `web/vitest.config.ts`:

```ts
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
```

Em `web/package.json`, acrescentar o script e encaixá-lo em `verificar`:

```json
"testes": "vitest run",
"verificar": "npm run tipos && npm run lint && npm run testes && npm run fumaca && npm run build"
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `web/src/app/agenda/_componentes/dados.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AgendamentoDetalhado, Equipe } from "@/lib/types";

import {
  chaveCelula,
  diasDeServico,
  fatiasEm,
  montarGrade,
  montarItens,
  montarJanela,
  ocupaDia,
  previaDoMovimento,
  resumo28,
  type ItemAgenda,
} from "./dados";

/* ---------- fábricas mínimas: só os campos que o modelo lê ---------- */

function equipe(parcial: Partial<Equipe> & { id: number }): Equipe {
  return {
    nome: `Turma ${parcial.id}`,
    base_uf: "SP",
    base_cidade: null,
    capacidade_km_dia: 6,
    ativo: true,
    ...parcial,
  } as Equipe;
}

function agendamento(p: {
  id: number;
  data: string;
  equipeId?: number | null;
  kmInicio?: number;
  kmFim?: number;
  status?: AgendamentoDetalhado["status"];
}): AgendamentoDetalhado {
  const eq = p.equipeId == null ? null : { id: p.equipeId, nome: `Turma ${p.equipeId}`, base_uf: "SP" as const };
  return {
    id: p.id,
    trecho_id: p.id,
    previsao_id: null,
    data_sugerida: p.data,
    prioridade: "media",
    justificativa: "teste",
    fatores: null,
    status: p.status ?? "sugerido",
    modelo_usado: null,
    equipe_id: p.equipeId ?? null,
    atualizado_em: null,
    criado_em: "2026-08-01T00:00:00Z",
    trecho: {
      id: p.id,
      rodovia: `BR-${100 + p.id}`,
      km_inicio: p.kmInicio ?? 10,
      km_fim: p.kmFim ?? 13,
      uf: "SP",
      sentido: null,
      especie: "braquiaria",
      tipo_pista: null,
      altura_limite_cm: 40,
      latitude: -22,
      longitude: -45,
    },
    equipe: eq,
    previsao: null,
  } as AgendamentoDetalhado;
}

function itens(ags: AgendamentoDetalhado[], eqs: Equipe[], hoje = "2026-08-13"): ItemAgenda[] {
  return montarItens({ agendamentos: ags, trechos: [], equipes: eqs, hoje });
}

/* ---------- janela ---------- */

describe("montarJanela", () => {
  it("abre na segunda-feira da semana da âncora", () => {
    // 2026-08-13 é uma quinta-feira; a segunda da semana é 2026-08-10.
    const j = montarJanela("2026-08-13");
    expect(j.dias).toHaveLength(7);
    expect(j.inicio).toBe("2026-08-10");
    expect(j.fim).toBe("2026-08-16");
  });

  it("navega para a semana seguinte pela âncora, sem depender de hoje", () => {
    expect(montarJanela("2026-08-17").inicio).toBe("2026-08-17");
  });

  it("mantém a segunda-feira quando a âncora já é segunda", () => {
    expect(montarJanela("2026-08-10").inicio).toBe("2026-08-10");
  });
});

/* ---------- duração e fatias ---------- */

describe("diasDeServico", () => {
  it("arredonda para cima em dias inteiros", () => {
    // A turma mobiliza caminhão e sinalização por dia: meio dia ainda ocupa o dia.
    expect(diasDeServico(3, 6)).toBe(1);
    expect(diasDeServico(5, 4.5)).toBe(2);
    expect(diasDeServico(0, 6)).toBe(1);
  });
});

describe("fatiasEm", () => {
  it("reparte os km pelos dias que o serviço ocupa na turma de destino", () => {
    const eq = equipe({ id: 1, capacidade_km_dia: 4.5 });
    const [item] = itens([agendamento({ id: 1, data: "2026-08-13", kmInicio: 0, kmFim: 5 })], [eq]);

    const fatias = fatiasEm(item, "2026-08-13", eq);

    expect(fatias).toHaveLength(2);
    expect(fatias[0]).toMatchObject({ dia: "2026-08-13", equipeId: 1, km: 2.5 });
    expect(fatias[1]).toMatchObject({ dia: "2026-08-14", equipeId: 1, km: 2.5 });
  });

  it("recalcula a duração pela capacidade do destino, não pela da origem", () => {
    const lenta = equipe({ id: 1, capacidade_km_dia: 4.5 });
    const rapida = equipe({ id: 2, capacidade_km_dia: 11 });
    const [item] = itens([agendamento({ id: 1, data: "2026-08-13", kmInicio: 0, kmFim: 5, equipeId: 1 })], [lenta, rapida]);

    expect(fatiasEm(item, "2026-08-13", lenta)).toHaveLength(2);
    expect(fatiasEm(item, "2026-08-13", rapida)).toHaveLength(1);
  });
});

describe("ocupaDia", () => {
  it("conta o serviço iniciado antes da janela que ainda ocupa a turma", () => {
    const eq = equipe({ id: 1, capacidade_km_dia: 4.5 });
    const [item] = itens([agendamento({ id: 1, data: "2026-08-09", kmInicio: 0, kmFim: 5 })], [eq]);

    // Domingo 09 e segunda 10: o serviço de 2 dias atravessa a virada da janela.
    expect(ocupaDia(item, "2026-08-09")).toBe(true);
    expect(ocupaDia(item, "2026-08-10")).toBe(true);
    expect(ocupaDia(item, "2026-08-11")).toBe(false);
  });
});

/* ---------- grade ---------- */

describe("montarGrade", () => {
  const eqs = [equipe({ id: 1, capacidade_km_dia: 6 }), equipe({ id: 2, capacidade_km_dia: 11 })];
  const janela = montarJanela("2026-08-13");

  it("põe o serviço com equipe na célula e o sem equipe na fila e nas propostas", () => {
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-08-13", equipeId: 1 }),
        agendamento({ id: 2, data: "2026-08-13", equipeId: null }),
      ],
      eqs,
    );

    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });

    expect(g.porCelula.get(chaveCelula("2026-08-13", 1))?.itens.map((i) => i.id)).toEqual([1]);
    expect(g.fila.map((i) => i.id)).toEqual([2]);
    expect(g.propostas.get("2026-08-13")?.map((i) => i.id)).toEqual([2]);
  });

  it("aceita `aprovado` sem equipe na fila — são 10 no banco e sumiriam do quadro", () => {
    const lista = itens([agendamento({ id: 3, data: "2026-08-13", equipeId: null, status: "aprovado" })], eqs);
    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });
    expect(g.fila.map((i) => i.id)).toEqual([3]);
  });

  it("mantém a fila estável quando a semana muda", () => {
    const lista = itens([agendamento({ id: 4, data: "2026-09-20", equipeId: null })], eqs);
    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });
    // A data está a cinco semanas daqui: some das propostas, permanece na fila.
    expect(g.fila.map((i) => i.id)).toEqual([4]);
    expect(g.propostas.size).toBe(0);
  });

  it("marca a célula excedida e calcula a ocupação", () => {
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 4 }),
        agendamento({ id: 2, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 3 }),
      ],
      eqs,
    );

    const c = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" }).porCelula.get(
      chaveCelula("2026-08-13", 1),
    );

    expect(c?.km).toBeCloseTo(7);
    expect(c?.ocupacao).toBeCloseTo((7 / 6) * 100);
    expect(c?.excedida).toBe(true);
  });

  it("recusa solta em dia anterior a hoje", () => {
    const g = montarGrade({ itens: [], equipes: eqs, janela, hoje: "2026-08-13" });
    expect(g.porCelula.get(chaveCelula("2026-08-10", 1))?.aceitaSolta).toBe(false);
    expect(g.porCelula.get(chaveCelula("2026-08-13", 1))?.aceitaSolta).toBe(true);
    expect(g.porCelula.get(chaveCelula("2026-08-14", 1))?.aceitaSolta).toBe(true);
  });

  it("dá linha a turma desativada que tem serviço na semana, e só a ela", () => {
    const desativada = equipe({ id: 9, ativo: false });
    const outra = equipe({ id: 8, ativo: false });
    const lista = itens([agendamento({ id: 1, data: "2026-08-13", equipeId: 9 })], [...eqs, desativada, outra]);

    const g = montarGrade({ itens: lista, equipes: [...eqs, desativada, outra], janela, hoje: "2026-08-13" });

    expect(g.linhas.map((l) => l.equipe.id).sort()).toEqual([1, 2, 9]);
    // A turma desativada guarda o serviço mas não recebe serviço novo.
    expect(g.porCelula.get(chaveCelula("2026-08-14", 9))?.aceitaSolta).toBe(false);
  });

  it("gera uma célula por par dia × turma, mesmo vazia — toda célula é alvo", () => {
    const g = montarGrade({ itens: [], equipes: eqs, janela, hoje: "2026-08-13" });
    expect(g.porCelula.size).toBe(7 * 2);
    expect(g.linhas[0].celulas).toHaveLength(7);
  });
});

/* ---------- prévia ---------- */

describe("previaDoMovimento", () => {
  const eqs = [equipe({ id: 1, capacidade_km_dia: 6 }), equipe({ id: 2, capacidade_km_dia: 11 })];
  const janela = montarJanela("2026-08-13");

  it("tira da origem e põe no destino", () => {
    const lista = itens([agendamento({ id: 1, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 3 })], eqs);
    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });

    const previa = previaDoMovimento(g, lista[0], chaveCelula("2026-08-14", 2), eqs);

    expect(previa.get(chaveCelula("2026-08-13", 1))?.km).toBeCloseTo(0);
    expect(previa.get(chaveCelula("2026-08-14", 2))?.km).toBeCloseTo(3);
  });

  it("devolve mapa vazio quando origem e destino são a mesma célula", () => {
    const lista = itens([agendamento({ id: 1, data: "2026-08-13", equipeId: 1 })], eqs);
    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });

    expect(previaDoMovimento(g, lista[0], chaveCelula("2026-08-13", 1), eqs).size).toBe(0);
  });

  it("mostra o excesso antes de soltar", () => {
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 5 }),
        agendamento({ id: 2, data: "2026-08-14", equipeId: null, kmInicio: 0, kmFim: 4 }),
      ],
      eqs,
    );
    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });

    const previa = previaDoMovimento(g, lista[1], chaveCelula("2026-08-13", 1), eqs);

    expect(previa.get(chaveCelula("2026-08-13", 1))?.excedida).toBe(true);
  });
});

/* ---------- faixa de 28 dias ---------- */

describe("resumo28", () => {
  it("cobre 28 dias a partir da segunda-feira da âncora", () => {
    const r = resumo28([], "2026-08-13");
    expect(r).toHaveLength(28);
    expect(r[0].dia).toBe("2026-08-10");
    expect(r[27].dia).toBe("2026-09-06");
  });

  it("separa alocado de não alocado", () => {
    const eqs = [equipe({ id: 1 })];
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-08-12", equipeId: 1 }),
        agendamento({ id: 2, data: "2026-08-12", equipeId: null }),
        agendamento({ id: 3, data: "2026-08-12", equipeId: null }),
      ],
      eqs,
    );

    const dia = resumo28(lista, "2026-08-13").find((d) => d.dia === "2026-08-12");

    expect(dia).toMatchObject({ comEquipe: 1, semEquipe: 2 });
  });
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `cd web && npm run testes`
Expected: FAIL — os símbolos `chaveCelula`, `diasDeServico`, `fatiasEm`, `montarGrade`, `previaDoMovimento`, `resumo28`, `ocupaDia` não existem, e `montarJanela` tem outra assinatura.

- [ ] **Step 4: Reescrever o modelo em `dados.tsx`**

Remover de `dados.tsx`: `PERIODOS`, `PERIODO_PADRAO`, `ROTULO_PERIODO`, `DIAS_DO_PERIODO`, `LARGURA_DIA`, `LARGURA_RAIA`, `ALTURA_BLOCO`, `FOLGA_BLOCO`, `ALTURA_RAIA_MINIMA`, `type Periodo`, `type ItemPosicionado`, `type Raia`, `empilhar`, `montarRaias`, `alturaDaRaia`, `fatiarPorMes`. Manter `chaveDia`, `ehFimDeSemana`, `TrechoResumo`, `CargaEquipe`, `ItemAgenda`, `montarItens`, `ordenarPorUrgencia`, `combinaEquipe`, `capacidadeAplicavel`, `riscoDoItem`, `Janela`.

Trazer de `linha-do-tempo.tsx`:

```ts
export const HACHURA_EXCESSO =
  "repeating-linear-gradient(45deg, color-mix(in oklab, var(--critical) 26%, transparent) 0 5px, transparent 5px 10px)";

export function textoServico(dias: number): string {
  return dias === 1 ? "1 dia de serviço" : `${fmt.n(dias)} dias de serviço`;
}
```

Acrescentar (`fmt` precisa entrar no import de `@/lib/format`):

```ts
/** Quantos dias inteiros a turma gasta. Dias inteiros porque a turma mobiliza
 *  caminhão, sinalização e equipe por dia — meio dia de roçada ainda ocupa o dia. */
export function diasDeServico(km: number, capacidade: number): number {
  return Math.max(1, Math.ceil(km / (capacidade || 1)));
}

export type ChaveCelula = string;

/** `dia|equipeId`. O separador é pipe porque nenhum dos dois lados pode contê-lo.
 *  O id de DOM usa outro formato — ver `idDoGrupo` em `quadro-semana.tsx`. */
export function chaveCelula(dia: string, equipeId: number): ChaveCelula {
  return `${dia}|${equipeId}`;
}

/** A janela sempre abre na segunda-feira: a operação é planejada por semana.
 *  A âncora é qualquer dia da semana desejada — é o que permite navegar sem
 *  depender de "hoje" e sem ida ao servidor. */
export function montarJanela(ancora: string, dias = 7): Janela {
  const primeiro = inicioDaSemana(ancora);
  const lista = Array.from({ length: dias }, (_, i) => chaveDia(somarDias(primeiro, i)));
  return { dias: lista, inicio: lista[0], fim: lista[dias - 1] };
}

/** Serviço ocupa `[inicio, inicio + diasServico)`. Comparar por igualdade de data
 *  faria a capacidade mentir no dia em que `diasServico` deixar de ser sempre 1. */
export function ocupaDia(item: ItemAgenda, dia: string): boolean {
  const d = diasEntre(item.data, dia);
  return d >= 0 && d < item.diasServico;
}

export type Fatia = { chave: ChaveCelula; dia: string; equipeId: number; km: number };

/** Fatias que o item ocuparia se caísse em (dia, equipe). A duração é recalculada
 *  na capacidade do DESTINO: mover para uma turma mais rápida encurta o serviço. */
export function fatiasEm(item: ItemAgenda, dia: string, equipe: Equipe): Fatia[] {
  const capacidade = Number(equipe.capacidade_km_dia) || 1;
  const dias = diasDeServico(item.km, capacidade);
  const km = item.km / dias;

  return Array.from({ length: dias }, (_, i) => {
    const d = chaveDia(somarDias(dia, i));
    return { chave: chaveCelula(d, equipe.id), dia: d, equipeId: equipe.id, km };
  });
}

export type Ocupacao = { km: number; ocupacao: number; excedida: boolean };

function medir(km: number, capacidade: number): Ocupacao {
  return {
    km,
    ocupacao: capacidade > 0 ? (km / capacidade) * 100 : 0,
    excedida: km > capacidade + 1e-6,
  };
}

export type Celula = {
  chave: ChaveCelula;
  dia: string;
  equipeId: number;
  itens: ItemAgenda[];
  km: number;
  capacidade: number;
  ocupacao: number;
  excedida: boolean;
  /** Falso para dia passado e para turma inativa. Célula que não aceita solta
   *  NÃO emite `data-celula` no DOM — senão o hit-test a encontraria mesmo assim. */
  aceitaSolta: boolean;
};

export type LinhaEquipe = { equipe: Equipe; celulas: Celula[]; kmSemana: number };

export type ResumoDia = {
  dia: string;
  comEquipe: number;
  semEquipe: number;
  algumaExcedida: boolean;
};

export type Grade = {
  janela: Janela;
  /** dia → itens sem equipe cuja data cai nele. Alimenta a linha de propostas. */
  propostas: Map<string, ItemAgenda[]>;
  linhas: LinhaEquipe[];
  /** TODOS os em aberto sem equipe, por urgência. Independe da semana visível:
   *  um backlog que encolhe quando você olha para outra semana não é um backlog. */
  fila: ItemAgenda[];
  porDia: ResumoDia[];
  porCelula: Map<ChaveCelula, Celula>;
  /** id do item → fatias que ele ocupa hoje. Devolve a carga da origem em O(1). */
  fatiasPorItem: Map<number, Fatia[]>;
};

const EM_ABERTO = new Set<StatusAgendamento>(["sugerido", "aprovado"]);

export function montarGrade({
  itens,
  equipes,
  janela,
  hoje,
}: {
  itens: ItemAgenda[];
  equipes: Equipe[];
  janela: Janela;
  hoje: string;
}): Grade {
  const porId = new Map(equipes.map((e) => [e.id, e]));
  const diasDaJanela = new Set(janela.dias);

  // Uma turma desativada com serviço na janela ainda precisa de linha: sem ela o
  // cartão sumiria do quadro enquanto o resumo continuaria contando o serviço.
  const desativadaComServico = new Set(
    itens
      .filter((i) => i.equipeId != null && EM_ABERTO.has(i.status) && diasDaJanela.has(i.data))
      .map((i) => i.equipeId as number),
  );

  const comLinha = equipes
    .filter((e) => e.ativo || desativadaComServico.has(e.id))
    .sort((a, b) => a.base_uf.localeCompare(b.base_uf, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));

  const fatiasPorItem = new Map<number, Fatia[]>();
  const kmPorCelula = new Map<ChaveCelula, number>();
  const itensPorCelula = new Map<ChaveCelula, ItemAgenda[]>();

  for (const item of itens) {
    if (!EM_ABERTO.has(item.status) || item.equipeId == null) continue;
    const equipe = porId.get(item.equipeId);
    if (!equipe) continue;

    const fatias = fatiasEm(item, item.data, equipe);
    fatiasPorItem.set(item.id, fatias);

    for (const fatia of fatias) {
      kmPorCelula.set(fatia.chave, (kmPorCelula.get(fatia.chave) ?? 0) + fatia.km);
    }
    // O cartão desenha no dia em que começa; as demais fatias só entram na carga.
    const chave = chaveCelula(item.data, item.equipeId);
    itensPorCelula.set(chave, [...(itensPorCelula.get(chave) ?? []), item]);
  }

  const porCelula = new Map<ChaveCelula, Celula>();

  const linhas: LinhaEquipe[] = comLinha.map((equipe) => {
    const capacidade = Number(equipe.capacidade_km_dia) || 0;

    const celulas = janela.dias.map((dia) => {
      const chave = chaveCelula(dia, equipe.id);
      const km = kmPorCelula.get(chave) ?? 0;
      const medida = medir(km, capacidade);

      const celula: Celula = {
        chave,
        dia,
        equipeId: equipe.id,
        itens: (itensPorCelula.get(chave) ?? []).slice().sort(ordenarPorUrgencia),
        capacidade,
        km: medida.km,
        ocupacao: medida.ocupacao,
        excedida: medida.excedida,
        aceitaSolta: equipe.ativo && dia >= hoje,
      };

      porCelula.set(chave, celula);
      return celula;
    });

    return { equipe, celulas, kmSemana: celulas.reduce((n, c) => n + c.km, 0) };
  });

  const semEquipe = itens.filter((i) => EM_ABERTO.has(i.status) && i.equipeId == null);

  const propostas = new Map<string, ItemAgenda[]>();
  for (const item of semEquipe) {
    if (!diasDaJanela.has(item.data)) continue;
    propostas.set(item.data, [...(propostas.get(item.data) ?? []), item]);
  }
  for (const lista of propostas.values()) lista.sort(ordenarPorUrgencia);

  const porDia: ResumoDia[] = janela.dias.map((dia) => ({
    dia,
    comEquipe: linhas.reduce((n, l) => n + (porCelula.get(chaveCelula(dia, l.equipe.id))?.itens.length ?? 0), 0),
    semEquipe: propostas.get(dia)?.length ?? 0,
    algumaExcedida: linhas.some((l) => porCelula.get(chaveCelula(dia, l.equipe.id))?.excedida ?? false),
  }));

  return {
    janela,
    propostas,
    linhas,
    fila: semEquipe.slice().sort(ordenarPorUrgencia),
    porDia,
    porCelula,
    fatiasPorItem,
  };
}

/** Delta escalar sobre 2 a 4 células, nunca um recálculo da grade: isto roda a
 *  cada `pointermove` enquanto o cartão paira. */
export function previaDoMovimento(
  grade: Grade,
  item: ItemAgenda,
  destino: ChaveCelula,
  equipes: Equipe[],
): Map<ChaveCelula, Ocupacao> {
  const [dia, idTexto] = destino.split("|");
  const equipe = equipes.find((e) => e.id === Number(idTexto));
  if (!equipe) return new Map();

  const antigas = grade.fatiasPorItem.get(item.id) ?? [];
  const novas = fatiasEm(item, dia, equipe);

  const mesmas =
    antigas.length === novas.length && antigas.every((f, i) => f.chave === novas[i].chave);
  if (mesmas) return new Map();

  const delta = new Map<ChaveCelula, number>();
  for (const f of antigas) delta.set(f.chave, (delta.get(f.chave) ?? 0) - f.km);
  for (const f of novas) delta.set(f.chave, (delta.get(f.chave) ?? 0) + f.km);

  const previa = new Map<ChaveCelula, Ocupacao>();
  for (const [chave, dif] of delta) {
    const celula = grade.porCelula.get(chave);
    if (!celula) continue;
    previa.set(chave, medir(Math.max(0, celula.km + dif), celula.capacidade));
  }
  return previa;
}

/** Quatro semanas a partir da segunda da âncora. Ancorada na semana VISÍVEL e não
 *  na de hoje: navegar seis semanas à frente com a faixa parada em agosto
 *  apontaria para um intervalo que não contém o quadro. */
export function resumo28(itens: ItemAgenda[], ancora: string): ResumoDia[] {
  const janela = montarJanela(ancora, 28);
  const abertos = itens.filter((i) => EM_ABERTO.has(i.status));

  return janela.dias.map((dia) => {
    const doDia = abertos.filter((i) => i.data === dia);
    return {
      dia,
      comEquipe: doDia.filter((i) => i.equipeId != null).length,
      semEquipe: doDia.filter((i) => i.equipeId == null).length,
      algumaExcedida: false,
    };
  });
}
```

`ItemAgenda.diasServico` passa a usar o helper: em `montarItens`, trocar
`Math.max(1, Math.ceil(km / capacidade))` por `diasDeServico(km, capacidade)`.

Acrescentar aos imports do arquivo: `StatusAgendamento` em `@/lib/types`, `diasEntre` e `fmt` em `@/lib/format`.

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd web && npm run testes`
Expected: PASS, 20 testes.

- [ ] **Step 6: Confirmar que o resto ainda tipa**

Run: `cd web && npm run tipos`
Expected: FAIL, e **só** em `linha-do-tempo.tsx`, `planejamento.tsx`, `controles.tsx`, `resumo.tsx` e `painel-agendamento.tsx` — os consumidores dos símbolos removidos. Nenhum erro dentro de `dados.tsx` ou `dados.test.ts`. Esses arquivos são consertados nas tarefas 5 a 8.

- [ ] **Step 7: Commit**

```bash
cd .. && git add web/package.json web/package-lock.json web/vitest.config.ts web/src/app/agenda/_componentes/dados.tsx web/src/app/agenda/_componentes/dados.test.ts
git commit -m "feat(agenda): modelo puro da grade semanal, com testes"
```

---

### Task 2: A Server Action única

**Files:**
- Modify: `web/src/lib/acoes.ts`

**Interfaces:**
- Consumes: `db` de `./supabase`, `Resultado` (já existe no arquivo), `isoHoje` de `./format`.
- Produces:
  ```ts
  export async function alocarAgendamento(id: number, data: string, equipeId: number): Promise<Resultado>;
  export async function desfazerAlocacao(id: number, data: string, equipeId: number | null): Promise<Resultado>;
  export async function devolverParaFila(id: number): Promise<Resultado>;
  ```

- [ ] **Step 1: Escrever as ações**

Em `web/src/lib/acoes.ts`, acrescentar `import { isoHoje } from "./format";` e, depois de `atribuirEquipe`:

```ts
/**
 * Grava data e equipe de uma vez.
 *
 * NÃO é exportada de propósito: num arquivo `"use server"` todo export vira
 * endpoint alcançável pela rede, e `permitirPassado` precisa continuar sendo
 * uma decisão do servidor. O desfazer legítimo entra por `desfazerAlocacao`.
 */
async function gravarAlocacao(
  agendamentoId: number,
  data: string,
  equipeId: number | null,
  opcoes: { permitirPassado: boolean },
): Promise<Resultado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false, erro: "Data inválida. Use o formato AAAA-MM-DD." };
  }
  if (!opcoes.permitirPassado && data < isoHoje()) {
    return { ok: false, erro: "Não dá para agendar para um dia que já passou." };
  }

  if (equipeId != null) {
    const { data: equipe, error: erroEquipe } = await db
      .from("equipes")
      .select("id, ativo")
      .eq("id", equipeId)
      .maybeSingle();

    if (erroEquipe) return { ok: false, erro: `Não foi possível ler a equipe: ${erroEquipe.message}` };
    if (!equipe) return { ok: false, erro: "Equipe não encontrada. Recarregue a página." };
    if (!equipe.ativo && !opcoes.permitirPassado) {
      return { ok: false, erro: "Essa turma está desativada e não recebe serviço novo." };
    }
  }

  // `.in(status)` + `.maybeSingle()` juntos: sem eles, um id inexistente ou um
  // serviço já executado devolve ok e o cartão fica no lugar novo na tela e no
  // lugar velho no banco — que é exatamente o que a ação única existe para evitar.
  const { data: linha, error } = await db
    .from("agendamentos")
    .update({ data_sugerida: data, equipe_id: equipeId, atualizado_em: new Date().toISOString() })
    .eq("id", agendamentoId)
    .in("status", ["sugerido", "aprovado"])
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, erro: `Não foi possível agendar: ${error.message}` };
  if (!linha) {
    return { ok: false, erro: "Serviço não encontrado ou já encerrado. Recarregue a página." };
  }

  revalidarTudo();
  return { ok: true, dados: undefined };
}

/** Soltar um serviço numa célula (dia, equipe) do quadro. */
export async function alocarAgendamento(
  agendamentoId: number,
  data: string,
  equipeId: number,
): Promise<Resultado> {
  return gravarAlocacao(agendamentoId, data, equipeId, { permitirPassado: false });
}

/**
 * Desfazer volta o serviço ao estado anterior, e esse estado pode ser um dia que
 * já passou — 26 dos 62 serviços da fila têm data vencida. Sem esta porta, o
 * desfazer morreria justamente nos cartões que mais serão arrastados.
 */
export async function desfazerAlocacao(
  agendamentoId: number,
  data: string,
  equipeId: number | null,
): Promise<Resultado> {
  return gravarAlocacao(agendamentoId, data, equipeId, { permitirPassado: true });
}

/** Soltar no trilho: tira a turma e o serviço volta a ser proposta da IA. */
export async function devolverParaFila(agendamentoId: number): Promise<Resultado> {
  const { data, error } = await db
    .from("agendamentos")
    .update({ equipe_id: null, atualizado_em: new Date().toISOString() })
    .eq("id", agendamentoId)
    .in("status", ["sugerido", "aprovado"])
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, erro: `Não foi possível devolver para a fila: ${error.message}` };
  if (!data) return { ok: false, erro: "Serviço não encontrado ou já encerrado. Recarregue a página." };

  revalidarTudo();
  return { ok: true, dados: undefined };
}
```

- [ ] **Step 2: Corrigir `remarcarAgendamento`, que mente em silêncio hoje**

Substituir o corpo do `update` em `remarcarAgendamento` por:

```ts
  const { data, error } = await db
    .from("agendamentos")
    .update({ data_sugerida: novaData, atualizado_em: new Date().toISOString() })
    .eq("id", agendamentoId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, erro: `Não foi possível remarcar: ${error.message}` };
  if (!data) return { ok: false, erro: "Agendamento não encontrado. Recarregue a página." };
```

Mesma correção em `atribuirEquipe`.

- [ ] **Step 3: Verificar tipos**

Run: `cd web && npm run tipos`
Expected: os mesmos erros da Tarefa 1 nos componentes ainda não migrados, e nenhum erro novo em `acoes.ts`.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/acoes.ts
git commit -m "feat(agenda): acao unica de alocacao, com validacao no servidor"
```

---

### Task 3: Navegação por teclado (pura) e o motor de arrasto

**Files:**
- Create: `web/src/app/agenda/_componentes/quadro/navegacao.ts`
- Create: `web/src/app/agenda/_componentes/quadro/navegacao.test.ts`
- Create: `web/src/app/agenda/_componentes/quadro/usar-arrasto.ts`

**Interfaces:**
- Consumes: `ChaveCelula`, `chaveCelula`, `Grade` de `../dados`.
- Produces:
  ```ts
  // navegacao.ts
  export type Direcao = "esquerda" | "direita" | "cima" | "baixo";
  export type Alvo = ChaveCelula | "fila";
  export type PassoNavegacao =
    | { tipo: "alvo"; alvo: Alvo }
    | { tipo: "semana"; delta: -1 | 1 }
    | { tipo: "borda"; alvo: Alvo };
  export function proximoAlvo(grade: Grade, atual: Alvo, direcao: Direcao): PassoNavegacao;

  // usar-arrasto.ts
  export type CargaArrasto = { id: number; origem: Alvo; rotulo: string };
  export type EstadoArrasto =
    | { fase: "ocioso" }
    | { fase: "candidato"; carga: CargaArrasto }
    | { fase: "arrastando"; carga: CargaArrasto; alvo: Alvo | null; recusa: string | null; x: number; y: number }
    | { fase: "carregando"; carga: CargaArrasto; alvo: Alvo; recusa: string | null };
  export function usarArrasto(opcoes: OpcoesArrasto): RetornoArrasto;
  ```

- [ ] **Step 1: Escrever os testes da navegação**

Criar `web/src/app/agenda/_componentes/quadro/navegacao.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Equipe } from "@/lib/types";

import { chaveCelula, montarGrade, montarJanela, type Grade } from "../dados";
import { proximoAlvo } from "./navegacao";

function equipe(id: number, nome: string): Equipe {
  return {
    id, nome, base_uf: "SP", base_cidade: null, capacidade_km_dia: 6, ativo: true,
  } as Equipe;
}

// Duas turmas, ordenadas por base_uf e depois nome: "Alfa" antes de "Beta".
const equipes = [equipe(1, "Alfa"), equipe(2, "Beta")];
const grade: Grade = montarGrade({
  itens: [],
  equipes,
  janela: montarJanela("2026-08-13"),
  hoje: "2026-08-13",
});

describe("proximoAlvo", () => {
  it("anda de dia com esquerda e direita", () => {
    expect(proximoAlvo(grade, chaveCelula("2026-08-12", 1), "direita")).toEqual({
      tipo: "alvo",
      alvo: chaveCelula("2026-08-13", 1),
    });
    expect(proximoAlvo(grade, chaveCelula("2026-08-12", 1), "esquerda")).toEqual({
      tipo: "alvo",
      alvo: chaveCelula("2026-08-11", 1),
    });
  });

  it("anda de turma com cima e baixo", () => {
    expect(proximoAlvo(grade, chaveCelula("2026-08-12", 1), "baixo")).toEqual({
      tipo: "alvo",
      alvo: chaveCelula("2026-08-12", 2),
    });
  });

  it("para na borda de baixo em vez de dar a volta", () => {
    // Dar a volta faria o gestor perder de vista onde o cartão está.
    expect(proximoAlvo(grade, chaveCelula("2026-08-12", 2), "baixo")).toEqual({
      tipo: "borda",
      alvo: chaveCelula("2026-08-12", 2),
    });
  });

  it("sai do trilho para a primeira célula do dia mais próximo de hoje", () => {
    expect(proximoAlvo(grade, "fila", "direita")).toEqual({
      tipo: "alvo",
      alvo: chaveCelula("2026-08-10", 1),
    });
  });

  it("volta para o trilho pela esquerda no primeiro dia", () => {
    expect(proximoAlvo(grade, chaveCelula("2026-08-10", 1), "esquerda")).toEqual({
      tipo: "alvo",
      alvo: "fila",
    });
  });

  it("pede a semana seguinte ao passar do último dia", () => {
    expect(proximoAlvo(grade, chaveCelula("2026-08-16", 1), "direita")).toEqual({
      tipo: "semana",
      delta: 1,
    });
  });

  it("não sai do trilho pelo eixo vertical", () => {
    expect(proximoAlvo(grade, "fila", "baixo")).toEqual({ tipo: "borda", alvo: "fila" });
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `cd web && npm run testes`
Expected: FAIL — `Cannot find module './navegacao'`.

- [ ] **Step 3: Escrever `navegacao.ts`**

```ts
/**
 * Navegação pura pela grade do quadro.
 *
 * Separada do hook de arrasto de propósito: é a única parte da interação que dá
 * para testar sem DOM, e é onde os erros de borda doem — um "dá a volta" no fim
 * da semana faz o gestor perder de vista onde o cartão está.
 */

import { chaveCelula, type ChaveCelula, type Grade } from "../dados";

export type Direcao = "esquerda" | "direita" | "cima" | "baixo";

/** O trilho da fila é um alvo como qualquer outro, mas não tem eixo vertical. */
export type Alvo = ChaveCelula | "fila";

export type PassoNavegacao =
  | { tipo: "alvo"; alvo: Alvo }
  /** Passou do fim da semana: quem trata é o quadro, trocando `?semana`. */
  | { tipo: "semana"; delta: -1 | 1 }
  /** Bateu numa borda que não leva a lugar nenhum. O alvo não muda; o anúncio muda. */
  | { tipo: "borda"; alvo: Alvo };

function partes(alvo: ChaveCelula): { dia: string; equipeId: number } {
  const [dia, id] = alvo.split("|");
  return { dia, equipeId: Number(id) };
}

export function proximoAlvo(grade: Grade, atual: Alvo, direcao: Direcao): PassoNavegacao {
  const linhas = grade.linhas;
  if (linhas.length === 0) return { tipo: "borda", alvo: atual };

  if (atual === "fila") {
    if (direcao === "direita") {
      return { tipo: "alvo", alvo: chaveCelula(grade.janela.dias[0], linhas[0].equipe.id) };
    }
    return { tipo: "borda", alvo: "fila" };
  }

  const { dia, equipeId } = partes(atual);
  const d = grade.janela.dias.indexOf(dia);
  const l = linhas.findIndex((linha) => linha.equipe.id === equipeId);
  if (d === -1 || l === -1) return { tipo: "borda", alvo: atual };

  switch (direcao) {
    case "esquerda":
      // Sair do primeiro dia pela esquerda leva ao trilho, não à semana anterior:
      // o trilho está fisicamente ali, e a semana anterior é sempre passado.
      if (d === 0) return { tipo: "alvo", alvo: "fila" };
      return { tipo: "alvo", alvo: chaveCelula(grade.janela.dias[d - 1], equipeId) };

    case "direita":
      if (d === grade.janela.dias.length - 1) return { tipo: "semana", delta: 1 };
      return { tipo: "alvo", alvo: chaveCelula(grade.janela.dias[d + 1], equipeId) };

    case "cima":
      if (l === 0) return { tipo: "borda", alvo: atual };
      return { tipo: "alvo", alvo: chaveCelula(dia, linhas[l - 1].equipe.id) };

    case "baixo":
      if (l === linhas.length - 1) return { tipo: "borda", alvo: atual };
      return { tipo: "alvo", alvo: chaveCelula(dia, linhas[l + 1].equipe.id) };
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd web && npm run testes`
Expected: PASS, 27 testes.

- [ ] **Step 5: Escrever o motor `usar-arrasto.ts`**

Este é o arquivo mais delicado do plano. Os seis pontos comentados abaixo são
correções de furos reais encontrados na revisão do desenho — não são estilo.

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Grade } from "../dados";
import { proximoAlvo, type Alvo, type Direcao } from "./navegacao";

/** Deslocamento em px que compromete o gesto no mouse e na caneta. */
const LIMIAR_PX = 8;
/** Pressão longa que compromete o gesto no toque, sem competir com a rolagem. */
const PRESSAO_MS = 250;
/** Faixa da borda que dispara auto-rolagem, e velocidade máxima em px por quadro. */
const BORDA_PX = 56;
const VELOCIDADE_MAX = 18;

export type CargaArrasto = {
  id: number;
  origem: Alvo;
  /** Frase curta para o anúncio e para o sobrevoo. Nunca o item inteiro. */
  rotulo: string;
};

export type EstadoArrasto =
  | { fase: "ocioso" }
  | { fase: "candidato"; carga: CargaArrasto }
  | { fase: "arrastando"; carga: CargaArrasto; alvo: Alvo | null; recusa: string | null; x: number; y: number }
  | { fase: "carregando"; carga: CargaArrasto; alvo: Alvo; recusa: string | null };

type OpcoesArrasto = {
  grade: Grade;
  /** `null` aceita; texto em pt-BR recusa e vira o motivo mostrado. */
  validar: (carga: CargaArrasto, alvo: Alvo) => string | null;
  aoSoltar: (carga: CargaArrasto, alvo: Alvo) => void;
  /** Frase lida a cada passo do teclado. */
  descrever: (alvo: Alvo, carga: CargaArrasto) => string;
  anunciar: (texto: string) => void;
  aoNavegarSemana: (delta: -1 | 1) => void;
};

/** Elementos roláveis que participam da auto-rolagem, do mais interno ao mais externo. */
function roladores(alvo: Element | null): HTMLElement[] {
  const lista: HTMLElement[] = [];
  for (let no = alvo; no instanceof HTMLElement; no = no.parentElement) {
    const estilo = getComputedStyle(no);
    if (/(auto|scroll)/.test(estilo.overflowX + estilo.overflowY)) lista.push(no);
  }
  return lista;
}

/**
 * Alvo sob o ponteiro.
 *
 * `elementsFromPoint` no PLURAL: devolve a pilha inteira em ordem de pintura, o
 * que atravessa o cabeçalho grudado e a barra superior sem precisar mexer no CSS
 * deles. Coordenadas de viewport, então a auto-rolagem sai de graça — um cache
 * de `getBoundingClientRect` ficaria inválido a cada quadro justamente enquanto
 * o quadro rola, que é quando ele mais seria usado.
 */
function alvoSob(x: number, y: number): Alvo | null {
  for (const no of document.elementsFromPoint(x, y)) {
    const celula = no.closest<HTMLElement>("[data-celula]");
    if (celula?.dataset.celula) return celula.dataset.celula;
    if (no.closest("[data-trilho]")) return "fila";
  }
  return null;
}

export function usarArrasto({
  grade,
  validar,
  aoSoltar,
  descrever,
  anunciar,
  aoNavegarSemana,
}: OpcoesArrasto) {
  const [estado, setEstado] = useState<EstadoArrasto>({ fase: "ocioso" });

  // Tudo que o loop de animação lê mora em ref: ler de estado recriaria os
  // callbacks a cada quadro e derrubaria o `memo` dos ~130 cartões.
  const vivo = useRef<{
    carga: CargaArrasto;
    ponteiroId: number;
    x0: number;
    y0: number;
    x: number;
    y: number;
    comprometido: boolean;
    temporizador: number | null;
    quadro: number | null;
    houveArrasto: boolean;
  } | null>(null);

  const fechar = useCallback(() => {
    const s = vivo.current;
    if (s) {
      if (s.temporizador != null) clearTimeout(s.temporizador);
      if (s.quadro != null) cancelAnimationFrame(s.quadro);
    }
    vivo.current = null;
    delete document.documentElement.dataset.arrastando;
    setEstado({ fase: "ocioso" });
  }, []);

  const laco = useCallback(() => {
    const s = vivo.current;
    if (!s || !s.comprometido) return;

    // LER antes de ESCREVER: `elementsFromPoint` depois de mexer no transform do
    // sobrevoo seria leitura de layout logo após escrita, no mesmo quadro.
    const alvo = alvoSob(s.x, s.y);
    const recusa = alvo == null ? null : validar(s.carga, alvo);

    setEstado({ fase: "arrastando", carga: s.carga, alvo, recusa, x: s.x, y: s.y });

    // Auto-rolagem nos dois eixos. `scroll-behavior: auto` local no container
    // (globals.css) — o `smooth` global animaria cada quadro deste laço.
    for (const no of roladores(document.elementFromPoint(s.x, s.y))) {
      const caixa = no.getBoundingClientRect();
      const dx = passo(s.x - caixa.left, caixa.right - s.x);
      const dy = passo(s.y - caixa.top, caixa.bottom - s.y);
      if (dx || dy) {
        no.scrollBy(dx, dy);
        break;
      }
    }

    s.quadro = requestAnimationFrame(laco);
  }, [validar]);

  const comprometer = useCallback(() => {
    const s = vivo.current;
    if (!s || s.comprometido) return;
    if (s.temporizador != null) clearTimeout(s.temporizador);

    // A CAPTURA ENTRA SÓ AQUI. Capturar no `pointerdown` redireciona os eventos
    // de mouse de compatibilidade para quem capturou, e o `click` passa a ter o
    // quadro como alvo — o cartão nunca o vê e abrir o detalhe some da tela.
    document.documentElement.setPointerCapture?.(s.ponteiroId);
    document.documentElement.dataset.arrastando = "";

    s.comprometido = true;
    s.houveArrasto = true;
    s.quadro = requestAnimationFrame(laco);
    anunciar(`${s.carga.rotulo} pego.`);
  }, [laco, anunciar]);

  const iniciar = useCallback(
    (evento: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => {
      if (evento.button !== 0 && evento.pointerType === "mouse") return;
      evento.preventDefault();

      vivo.current = {
        carga,
        ponteiroId: evento.pointerId,
        x0: evento.clientX,
        y0: evento.clientY,
        x: evento.clientX,
        y: evento.clientY,
        comprometido: false,
        temporizador:
          evento.pointerType === "mouse"
            ? null
            : window.setTimeout(comprometer, PRESSAO_MS),
        quadro: null,
        houveArrasto: false,
      };

      setEstado({ fase: "candidato", carga });
    },
    [comprometer],
  );

  // Os ouvintes ficam em `window` e não no quadro: entre o `pointerdown` e o
  // `comprometer()` ainda não há captura, e sem isto o fim do gesto se perde se
  // o ponteiro sair do elemento.
  useEffect(() => {
    function mover(evento: PointerEvent) {
      const s = vivo.current;
      if (!s || evento.pointerId !== s.ponteiroId) return;

      s.x = evento.clientX;
      s.y = evento.clientY;

      if (!s.comprometido) {
        const dist = Math.hypot(s.x - s.x0, s.y - s.y0);
        if (dist > LIMIAR_PX) comprometer();
        return;
      }
      evento.preventDefault();
    }

    function soltar(evento: PointerEvent) {
      const s = vivo.current;
      if (!s || evento.pointerId !== s.ponteiroId) return;

      if (s.comprometido) {
        // Re-testar o alvo AQUI, não confiar no último realce: o amortecimento
        // visual atrasa o realce e faria todo arrasto curto no toque ser recusado.
        const alvo = alvoSob(evento.clientX, evento.clientY);
        const recusa = alvo == null ? "" : validar(s.carga, alvo);
        if (alvo != null && !recusa && alvo !== s.carga.origem) aoSoltar(s.carga, alvo);
      }

      document.documentElement.releasePointerCapture?.(evento.pointerId);
      fechar();
    }

    function cancelar(evento: PointerEvent) {
      if (vivo.current?.ponteiroId === evento.pointerId) fechar();
    }

    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", cancelar);
    window.addEventListener("lostpointercapture", cancelar);

    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", cancelar);
      window.removeEventListener("lostpointercapture", cancelar);
    };
  }, [comprometer, fechar, validar, aoSoltar]);

  /** Espalhar no botão de detalhe do cartão: engole o clique que fecha um arrasto. */
  const engolirClique = useCallback((evento: React.MouseEvent) => {
    if (vivo.current?.houveArrasto) {
      evento.preventDefault();
      evento.stopPropagation();
    }
  }, []);

  const aoTeclar = useCallback(
    (evento: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => {
      const atual = estado.fase === "carregando" ? estado : null;

      if (evento.key === " " || evento.key === "Spacebar") {
        evento.preventDefault();
        if (atual) {
          if (!atual.recusa) aoSoltar(atual.carga, atual.alvo);
          fechar();
          return;
        }
        setEstado({ fase: "carregando", carga, alvo: carga.origem, recusa: null });
        anunciar(`${carga.rotulo} pego. Setas escolhem o dia e a equipe, Enter solta.`);
        return;
      }

      if (!atual) return;

      if (evento.key === "Escape") {
        evento.preventDefault();
        anunciar("Movimento cancelado. O serviço continua onde estava.");
        fechar();
        return;
      }

      // `preventDefault` no Enter: sem ele, soltar também dispara o botão de
      // detalhe e a gaveta abre por cima do quadro que acabou de mudar.
      if (evento.key === "Enter") {
        evento.preventDefault();
        if (atual.recusa) {
          anunciar(atual.recusa);
          return;
        }
        aoSoltar(atual.carga, atual.alvo);
        fechar();
        return;
      }

      const direcoes: Record<string, Direcao> = {
        ArrowLeft: "esquerda",
        ArrowRight: "direita",
        ArrowUp: "cima",
        ArrowDown: "baixo",
      };
      const direcao = direcoes[evento.key];
      if (!direcao) return;

      evento.preventDefault();

      if (evento.shiftKey && (direcao === "esquerda" || direcao === "direita")) {
        aoNavegarSemana(direcao === "direita" ? 1 : -1);
        return;
      }

      const passo = proximoAlvo(grade, atual.alvo, direcao);

      if (passo.tipo === "semana") {
        aoNavegarSemana(passo.delta);
        return;
      }
      if (passo.tipo === "borda") {
        anunciar(`${descrever(passo.alvo, atual.carga)} Fim da semana; Shift e seta para a próxima.`);
        return;
      }

      const recusa = validar(atual.carga, passo.alvo);
      setEstado({ fase: "carregando", carga: atual.carga, alvo: passo.alvo, recusa });
      anunciar(recusa ?? descrever(passo.alvo, atual.carga));
    },
    [estado, grade, validar, aoSoltar, descrever, anunciar, aoNavegarSemana, fechar],
  );

  return { estado, iniciar, aoTeclar, engolirClique, cancelar: fechar };
}

/** Velocidade da auto-rolagem num eixo: 0 no meio, cresce ao chegar na borda. */
function passo(distanciaInicio: number, distanciaFim: number): number {
  if (distanciaInicio < BORDA_PX) {
    return -Math.round(((BORDA_PX - distanciaInicio) / BORDA_PX) * VELOCIDADE_MAX);
  }
  if (distanciaFim < BORDA_PX) {
    return Math.round(((BORDA_PX - distanciaFim) / BORDA_PX) * VELOCIDADE_MAX);
  }
  return 0;
}
```

- [ ] **Step 6: Verificar tipos e lint dos arquivos novos**

Run: `cd web && npm run tipos && npm run lint`
Expected: nenhum erro novo em `quadro/`. Os erros pendentes continuam sendo só os componentes ainda não migrados.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/agenda/_componentes/quadro/
git commit -m "feat(agenda): motor de arrasto por pointer events e navegacao por teclado"
```

---

### Task 4: O cartão e o sobrevoo

**Files:**
- Create: `web/src/app/agenda/_componentes/quadro/cartao-servico.tsx`
- Create: `web/src/app/agenda/_componentes/quadro/sobrevoo.tsx`

**Interfaces:**
- Consumes: `ItemAgenda`, `textoServico` de `../dados`; `Alvo`, `CargaArrasto` de `./usar-arrasto`; `RISCO`, `STATUS` de `@/lib/dominio`; `IconeDominio` de `@/components/viz/legenda`; `fmt` de `@/lib/format`.
- Produces:
  ```ts
  export const CartaoServico: React.MemoExoticComponent<(p: {
    item: ItemAgenda; origem: Alvo; compacto?: boolean; fantasma: boolean;
    selecionado: boolean; salvando: boolean; desfazer: (() => void) | null;
    aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
    aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
    aoAbrir: (id: number) => void;
    engolirClique: (e: React.MouseEvent) => void;
    refCartao: (no: HTMLElement | null) => void;
  }) => React.ReactElement>;

  export function Sobrevoo(p: { estado: EstadoArrasto; item: ItemAgenda | null }): React.ReactElement | null;
  export function cargaDoItem(item: ItemAgenda, origem: Alvo): CargaArrasto;
  ```

- [ ] **Step 1: Escrever `cartao-servico.tsx`**

Pontos que não são estilo:

- O `<li>` é container; o **alvo de foco tem `role="button"`**. Um `<li tabIndex>` mudo não faz o NVDA/JAWS trocar para modo de foco.
- "Abrir detalhe" é um `<button>` separado, não o gesto principal — assim `Espaço` fica livre para pegar.
- A alça (`GripVertical`) é o único ponto com `touch-action: none`. `touch-none` no cartão inteiro mataria a rolagem do trilho, que tem 62 itens.
- `memo` com props escalares: o quadro tem ~130 cartões e re-renderiza a cada `pointermove`.

```tsx
"use client";

import { memo } from "react";
import { GripVertical, Undo2 } from "lucide-react";

import { ChipRisco } from "@/components/ui/chip";
import { IconeDominio } from "@/components/viz/legenda";
import { RISCO, STATUS } from "@/lib/dominio";
import { fmt, relativoEmDias } from "@/lib/format";
import { cn } from "@/lib/utils";

import { textoServico, type ItemAgenda } from "../dados";
import type { Alvo, CargaArrasto } from "./usar-arrasto";

export function cargaDoItem(item: ItemAgenda, origem: Alvo): CargaArrasto {
  const t = item.ag.trecho;
  return {
    id: item.id,
    origem,
    rotulo: `${t.rodovia}, ${fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}`,
  };
}

function rotuloCompleto(item: ItemAgenda): string {
  const t = item.ag.trecho;
  return [
    `${t.rodovia}, ${fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}, ${t.uf}`,
    `Roçada para ${fmt.dataMedia(item.data)}`,
    `Situação: ${STATUS[item.status].rotulo}`,
    `Risco: ${RISCO[item.risco].rotulo}`,
    `Estimativa: ${textoServico(item.diasServico)}`,
    item.equipeNome ? `Equipe: ${item.equipeNome}` : "Sem equipe atribuída",
  ].join(". ");
}

export const CartaoServico = memo(function CartaoServico({
  item,
  origem,
  compacto = false,
  fantasma,
  selecionado,
  salvando,
  desfazer,
  aoPegar,
  aoTeclar,
  aoAbrir,
  engolirClique,
  refCartao,
}: {
  item: ItemAgenda;
  origem: Alvo;
  compacto?: boolean;
  /** O cartão saiu para o sobrevoo: reserva a caixa e some, sem colapsar a linha. */
  fantasma: boolean;
  selecionado: boolean;
  salvando: boolean;
  desfazer: (() => void) | null;
  aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoAbrir: (id: number) => void;
  engolirClique: (e: React.MouseEvent) => void;
  refCartao: (no: HTMLElement | null) => void;
}) {
  const token = RISCO[item.risco];
  const encerrado = item.status === "executado" || item.status === "descartado";
  const carga = cargaDoItem(item, origem);
  const t = item.ag.trecho;

  return (
    <li
      aria-busy={salvando || undefined}
      style={{ visibility: fantasma ? "hidden" : undefined }}
      className="min-w-0"
    >
      <div
        ref={refCartao}
        role="button"
        tabIndex={-1}
        aria-label={rotuloCompleto(item)}
        aria-roledescription="serviço arrastável"
        aria-pressed={selecionado}
        onKeyDown={(evento) => aoTeclar(evento, carga)}
        style={{
          backgroundColor: encerrado ? "var(--surface-3)" : token.fundo,
          color: encerrado ? "var(--ink-3)" : token.tinta,
          borderColor: `color-mix(in oklab, ${token.cor} ${encerrado ? 28 : 55}%, transparent)`,
        }}
        className={cn(
          "group relative flex min-w-0 items-stretch gap-1 overflow-hidden rounded-sm border",
          "transition-transform duration-150 ease-[var(--ease-out-quint)] hover:-translate-y-px",
          selecionado && "ring-2 ring-accent",
        )}
      >
        <span aria-hidden="true" className="w-1 shrink-0" style={{ backgroundColor: token.cor }} />

        {encerrado ? null : (
          <button
            type="button"
            aria-label={`Arrastar ${t.rodovia}`}
            tabIndex={-1}
            onPointerDown={(evento) => aoPegar(evento, carga)}
            className="flex w-5 shrink-0 cursor-grab touch-none items-center justify-center text-current opacity-45 group-hover:opacity-80"
          >
            <GripVertical aria-hidden="true" className="size-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={aoAbrir.bind(null, item.id)}
          onClickCapture={engolirClique}
          className="min-w-0 flex-1 py-1.5 pr-2 text-left"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <IconeDominio
              nome={encerrado ? STATUS[item.status].icone : token.icone}
              className="size-3.5 shrink-0"
            />
            <span className="block truncate text-2xs font-medium">{t.rodovia}</span>
          </span>

          {compacto ? null : (
            <span className="tnum mt-0.5 block truncate font-mono text-2xs opacity-80">
              {fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}
            </span>
          )}

          {compacto ? null : (
            <span className="chip-km tnum mt-0.5 block truncate font-mono text-2xs opacity-70">
              {fmt.km(item.km)} · {relativoEmDias(item.data)}
            </span>
          )}

          <span className="sr-only">Abrir detalhe</span>
        </button>

        {item.diasServico > 1 ? (
          <span className="tnum absolute top-1 right-1 rounded-xs bg-surface-2/70 px-1 font-mono text-2xs text-ink-2">
            {fmt.n(item.diasServico)} d
          </span>
        ) : null}
      </div>

      {desfazer ? (
        <button
          type="button"
          onClick={desfazer}
          className="mt-1 inline-flex items-center gap-1 rounded-sm px-1 text-2xs text-ink-3 hover:text-ink"
        >
          <Undo2 aria-hidden="true" className="size-3" />
          Desfazer
        </button>
      ) : null}
    </li>
  );
});
```

- [ ] **Step 2: Escrever `sobrevoo.tsx`**

**Dois nós, não um.** O externo recebe só o `translate3d` do loop; o `motion.div` interno faz entrada e saída. No mesmo nó, a animação de entrada sobrescreveria o transform do loop e o cartão ficaria parado sob o dedo.

```tsx
"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

import { RISCO } from "@/lib/dominio";
import { IconeDominio } from "@/components/viz/legenda";
import { fmt } from "@/lib/format";

import type { ItemAgenda } from "../dados";
import type { EstadoArrasto } from "./usar-arrasto";

/* O sobrevoo vai para o <body>: o quadro tem overflow nos dois eixos — é o que
   faz o cabeçalho e a calha grudarem — então qualquer posicionamento interno
   seria recortado na primeira e na última linha. */
const semAssinatura = () => () => {};
const verdadeiro = () => true;
const falso = () => false;

export function Sobrevoo({ estado, item }: { estado: EstadoArrasto; item: ItemAgenda | null }) {
  const montado = useSyncExternalStore(semAssinatura, verdadeiro, falso);
  if (!montado) return null;

  const voando = estado.fase === "arrastando" ? estado : null;

  return createPortal(
    <AnimatePresence>
      {voando && item ? (
        <div
          aria-hidden="true"
          /* `pointer-events: none` é obrigatório: sem ele o `elementsFromPoint`
             devolveria o próprio sobrevoo e nunca acharia a célula embaixo. */
          className="pointer-events-none fixed top-0 left-0 z-50 w-52"
          style={{ transform: `translate3d(${voando.x - 80}px, ${voando.y - 18}px, 0)` }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1.03 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            style={{
              backgroundColor: RISCO[item.risco].fundo,
              color: RISCO[item.risco].tinta,
              borderColor: voando.recusa ? "var(--ink-3)" : RISCO[item.risco].cor,
            }}
            className="rounded-sm border-2 px-2 py-1.5 shadow-lg"
          >
            <p className="flex items-center gap-1.5 truncate text-2xs font-medium">
              <IconeDominio nome={RISCO[item.risco].icone} className="size-3.5 shrink-0" />
              {item.ag.trecho.rodovia}
            </p>
            <p className="tnum truncate font-mono text-2xs opacity-80">
              {fmt.km(item.km)}
            </p>
          </motion.div>

          {voando.recusa ? (
            <p className="mt-1 rounded-sm border border-border-strong bg-surface-2 px-2 py-1 text-2xs text-ink-2 shadow-md">
              {voando.recusa}
            </p>
          ) : null}
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 3: Verificar tipos e lint**

Run: `cd web && npm run tipos && npm run lint`
Expected: nenhum erro novo nos dois arquivos.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/agenda/_componentes/quadro/cartao-servico.tsx web/src/app/agenda/_componentes/quadro/sobrevoo.tsx
git commit -m "feat(agenda): cartao arrastavel e sobrevoo no portal"
```

---

### Task 5: Célula, cabeçalho de dia e mini-mapa

**Files:**
- Create: `web/src/app/agenda/_componentes/quadro/celula-equipe.tsx`
- Create: `web/src/app/agenda/_componentes/quadro/cabecalho-dia.tsx`
- Create: `web/src/app/agenda/_componentes/quadro/mini-mapa.tsx`
- Modify: `web/src/app/globals.css`

**Interfaces:**
- Consumes: `Celula`, `Ocupacao`, `ResumoDia`, `ItemAgenda`, `HACHURA_EXCESSO`, `ehFimDeSemana` de `../dados`; `CartaoServico` de `./cartao-servico`.
- Produces:
  ```ts
  export const CelulaEquipe: React.MemoExoticComponent<(p: {
    celula: Celula; equipeNome: string; previa: Ocupacao | null; realcada: boolean;
    recusada: boolean; filhos: React.ReactNode;
  }) => React.ReactElement>;

  export function CabecalhoDia(p: { dia: string; hoje: string; resumo: ResumoDia }): React.ReactElement;

  export function MiniMapa(p: {
    resumos: ResumoDia[]; janela: string[]; aoEscolherSemana: (dia: string) => void;
  }): React.ReactElement;
  ```

- [ ] **Step 1: Acrescentar a grade do quadro em `globals.css`**

No fim do arquivo, antes do bloco `TEXTURA`:

```css
/* ==========================================================================
   QUADRO DA SEMANA
   A grade é plana de propósito: a calha das turmas é a coluna 1 da MESMA grade,
   então as linhas alinham por construção, sem `subgrid` e sem medir nada em JS.
   ========================================================================== */
.quadro-pista {
  overflow: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  /* `html { scroll-behavior: smooth }` transformaria cada quadro da auto-rolagem
     numa animação que continua depois de o dedo parar. */
  scroll-behavior: auto;
  /* A barra horizontal come altura no rodapé e cortaria a última linha. */
  padding-block-end: 2px;
}

.quadro-grade {
  --calha: 9rem;
  --dia-min: 9rem;
  --altura-linha: 4.5rem;
  display: grid;
  /* `1fr` reparte quando sobra largura; `--dia-min` é o piso que dispara a
     rolagem. É daqui que sai a degradação contínua 7 → 6 → 5 → … → 1 coluna,
     sem nenhuma media query. */
  grid-template-columns: var(--calha) repeat(7, minmax(var(--dia-min), 1fr));
  grid-template-rows: auto auto repeat(var(--linhas, 10), minmax(var(--altura-linha), auto));
}

.quadro-celula {
  container: dia / inline-size;
}

/* Ordem de sacrifício conforme a coluna encolhe. O nome da turma nunca sai: ele
   está na calha, não na célula. */
@container dia (max-width: 8rem) {
  .chip-km { display: none; }
}

/* Enquanto há arrasto em voo o cursor é o mesmo em toda a tela, e nenhuma
   seleção de texto acontece por acidente. */
html[data-arrastando] { cursor: grabbing; }
html[data-arrastando] * { user-select: none; }

@keyframes anel-erro {
  from { opacity: 0.9; }
  to   { opacity: 0; }
}

/* A reversão do otimista é um salto — sob reduced-motion ela SEMPRE é um salto.
   O anel é o que explica o salto; por isso ele é opacity e sobrevive à regra. */
.anel-erro::after {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: var(--radius-sm);
  border: 2px solid var(--critical);
  animation: anel-erro 450ms var(--ease-exit) both;
  pointer-events: none;
}
```

- [ ] **Step 2: Escrever `celula-equipe.tsx`**

```tsx
"use client";

import { memo } from "react";

import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import { HACHURA_EXCESSO, type Celula, type Ocupacao } from "../dados";

export const CelulaEquipe = memo(function CelulaEquipe({
  celula,
  equipeNome,
  previa,
  realcada,
  recusada,
  filhos,
}: {
  celula: Celula;
  equipeNome: string;
  /** Ocupação projetada enquanto um cartão paira; `null` fora do arrasto. */
  previa: Ocupacao | null;
  realcada: boolean;
  recusada: boolean;
  filhos: React.ReactNode;
}) {
  const leitura = previa ?? celula;
  const largura = Math.min(100, leitura.ocupacao);

  return (
    <div
      /* Célula que não aceita solta NÃO emite `data-celula`: se emitisse, o
         hit-test a encontraria e a recusa dependeria só de validação. */
      data-celula={celula.aceitaSolta ? celula.chave : undefined}
      className={cn(
        "quadro-celula relative flex min-w-0 flex-col gap-1 border-b border-l border-grid p-1.5",
        realcada && "ring-2 ring-accent ring-inset",
        recusada && "ring-2 ring-ink-3 ring-inset",
      )}
    >
      {leitura.excedida ? (
        <span
          aria-hidden="true"
          style={{ backgroundImage: HACHURA_EXCESSO }}
          className="pointer-events-none absolute inset-0"
        />
      ) : null}

      <ul className="relative flex min-w-0 flex-col gap-1">{filhos}</ul>

      {celula.capacidade > 0 && (leitura.km > 0 || realcada) ? (
        <p className="relative mt-auto flex items-center gap-1">
          <span
            aria-hidden="true"
            className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"
          >
            <span
              className={cn(
                "block h-full origin-left rounded-full",
                "transition-transform duration-150 ease-[var(--ease-out-quint)]",
                leitura.excedida ? "bg-critical" : "bg-ink-3",
              )}
              style={{ transform: `scaleX(${largura / 100})` }}
            />
          </span>
          <span className="tnum shrink-0 font-mono text-2xs text-ink-3">
            {fmt.d1(leitura.km)}/{fmt.d1(celula.capacidade)}
          </span>
        </p>
      ) : null}

      <span className="sr-only">
        {equipeNome}, {fmt.dataLonga(celula.dia)}.{" "}
        {celula.itens.length === 0
          ? "Sem serviço."
          : `${fmt.contar(celula.itens.length, "serviço", "serviços")}, ${fmt.km(leitura.km)} de ${fmt.km(celula.capacidade)} no dia.`}
        {leitura.excedida ? " Acima da capacidade." : ""}
        {celula.aceitaSolta ? "" : " Não recebe serviço novo."}
      </span>
    </div>
  );
});
```

- [ ] **Step 3: Escrever `cabecalho-dia.tsx`**

```tsx
"use client";

import { OctagonAlert } from "lucide-react";

import { fmt, parseData } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ehFimDeSemana, type ResumoDia } from "../dados";

export function CabecalhoDia({
  dia,
  hoje,
  resumo,
}: {
  dia: string;
  hoje: string;
  resumo: ResumoDia;
}) {
  const fds = ehFimDeSemana(dia);
  const ehHoje = dia === hoje;
  const passado = dia < hoje;

  return (
    <div
      aria-current={ehHoje ? "date" : undefined}
      className={cn(
        "sticky top-0 z-20 border-b border-l border-border bg-surface px-2 py-1.5",
        fds && "bg-surface-3",
        passado && "opacity-60",
      )}
    >
      <p className="flex items-baseline justify-between gap-1">
        <span
          className={cn(
            "truncate text-2xs tracking-widest uppercase",
            ehHoje ? "text-ink" : "text-ink-3",
          )}
        >
          {fmt.diaSemana(dia)}
        </span>
        <span
          className={cn(
            "tnum font-mono text-sm leading-none",
            ehHoje ? "font-semibold text-ink" : "text-ink-2",
          )}
        >
          {fmt.n(parseData(dia).getDate())}
        </span>
      </p>

      <p className="tnum mt-1 flex items-center gap-1 font-mono text-2xs text-ink-3">
        <span>{fmt.n(resumo.comEquipe)}</span>
        <span aria-hidden="true">·</span>
        <span className={resumo.semEquipe > 0 ? "text-ink-2" : undefined}>
          {fmt.n(resumo.semEquipe)} s/ turma
        </span>
        {resumo.algumaExcedida ? (
          <OctagonAlert aria-hidden="true" className="ml-auto size-3 shrink-0 text-critical-ink" />
        ) : null}
      </p>

      <span className="sr-only">
        {fmt.dataLonga(dia)}. {fmt.contar(resumo.comEquipe, "serviço com turma", "serviços com turma")},{" "}
        {fmt.contar(resumo.semEquipe, "sem turma")}.
        {resumo.algumaExcedida ? " Alguma turma está acima da capacidade." : ""}
        {ehHoje ? " Hoje." : ""}
      </span>

      {ehHoje ? (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-accent-line" />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Escrever `mini-mapa.tsx`**

A faixa mede **contagem de serviços**, não km: com a capacidade instalada constante,
`km / capacidade` é km reescalado e o pico real ficaria em 20% de altura. Escala local.
Nenhuma cor de status na barra — o único status é o ícone.

```tsx
"use client";

import { OctagonAlert } from "lucide-react";

import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ehFimDeSemana, type ResumoDia } from "../dados";

export function MiniMapa({
  resumos,
  janela,
  aoEscolherSemana,
}: {
  resumos: ResumoDia[];
  /** Dias da semana visível, para marcar o intervalo no mapa. */
  janela: string[];
  aoEscolherSemana: (dia: string) => void;
}) {
  // Escala local: o dia mais cheio das quatro semanas vai à altura cheia. Uma
  // escala global sobre a capacidade instalada achataria tudo abaixo de 21%.
  const teto = Math.max(1, ...resumos.map((r) => r.comEquipe + r.semEquipe));
  const naJanela = new Set(janela);

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-end gap-px">
        {resumos.map((r) => {
          const total = r.comEquipe + r.semEquipe;
          const dentro = naJanela.has(r.dia);

          return (
            <button
              key={r.dia}
              type="button"
              onClick={() => aoEscolherSemana(r.dia)}
              aria-label={`${fmt.dataLonga(r.dia)}. ${fmt.contar(r.comEquipe, "serviço com turma", "serviços com turma")}, ${fmt.contar(r.semEquipe, "sem turma")}. Ir para esta semana.`}
              className={cn(
                "group relative flex h-10 flex-1 flex-col justify-end rounded-xs",
                ehFimDeSemana(r.dia) && "bg-surface-3",
                dentro && "bg-accent-soft",
              )}
            >
              {r.algumaExcedida ? (
                <OctagonAlert
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 mx-auto size-2.5 text-critical-ink"
                />
              ) : null}

              <span
                aria-hidden="true"
                style={{ transform: `scaleY(${r.semEquipe / teto})` }}
                className="block h-8 origin-bottom rounded-t-xs border border-border-strong bg-surface-3"
              />
              <span
                aria-hidden="true"
                style={{ transform: `scaleY(${r.comEquipe / teto})` }}
                className="block h-8 origin-bottom bg-ink-3"
              />
              <span className="mt-0.5 block h-px w-full bg-transparent group-hover:bg-accent-line" />
              <span className="sr-only">{fmt.n(total)}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-2xs text-ink-3">
        A altura é o número de serviços no dia; a parte clara ainda não tem equipe. O ícone marca
        dia com turma acima da capacidade. Clique para ir à semana.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Verificar tipos e lint**

Run: `cd web && npm run tipos && npm run lint`
Expected: nenhum erro novo nos três arquivos nem no CSS.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/agenda/_componentes/quadro/ web/src/app/globals.css
git commit -m "feat(agenda): celula, cabecalho de dia e faixa de 28 dias"
```

---

### Task 6: O trilho da fila

**Files:**
- Create: `web/src/app/agenda/_componentes/quadro/trilho-fila.tsx`

**Interfaces:**
- Consumes: `ItemAgenda` de `../dados`; `CartaoServico` de `./cartao-servico`; `EstadoVazio` de `@/components/ui/vazio`.
- Produces:
  ```ts
  export function TrilhoFila(p: {
    itens: ItemAgenda[]; hoje: string; janelaFim: string; realcado: boolean;
    idEmVoo: number | null; selecionado: number | null; salvandoIds: ReadonlySet<number>;
    aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
    aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
    aoAbrir: (id: number) => void;
    engolirClique: (e: React.MouseEvent) => void;
    refCartao: (id: number) => (no: HTMLElement | null) => void;
  }): React.ReactElement;
  ```

- [ ] **Step 1: Escrever `trilho-fila.tsx`**

O trilho carrega os 62 sem equipe. Três coisas que importam:

- Teto de 25 com "mostrar mais": 62 cartões de uma vez são 62 subárvores no
  hit-test de cada quadro do arrasto.
- Cabeçalhos "Vence nesta semana" e "Depois", porque a ordenação é por urgência
  e sem os cabeçalhos o corte entre os dois grupos fica invisível.
- `data-trilho` no container é o que o `alvoSob` procura para aceitar a devolução.

```tsx
"use client";

import { Fragment, useState } from "react";

import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/vazio";
import { IconeDominio } from "@/components/viz/legenda";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ItemAgenda } from "../dados";
import { CartaoServico } from "./cartao-servico";
import type { CargaArrasto } from "./usar-arrasto";

const TETO = 25;

export function TrilhoFila({
  itens,
  janelaFim,
  realcado,
  idEmVoo,
  selecionado,
  salvandoIds,
  aoPegar,
  aoTeclar,
  aoAbrir,
  engolirClique,
  refCartao,
}: {
  itens: ItemAgenda[];
  hoje: string;
  janelaFim: string;
  realcado: boolean;
  idEmVoo: number | null;
  selecionado: number | null;
  salvandoIds: ReadonlySet<number>;
  aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoAbrir: (id: number) => void;
  engolirClique: (e: React.MouseEvent) => void;
  refCartao: (id: number) => (no: HTMLElement | null) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const visiveis = expandido ? itens : itens.slice(0, TETO);
  const corte = visiveis.findIndex((item) => item.data > janelaFim);

  return (
    <section
      data-trilho=""
      aria-label={`Fila de decisão, ${fmt.contar(itens.length, "serviço", "serviços")} sem equipe`}
      className={cn(
        "flex min-h-0 w-full flex-col border-r border-border bg-surface",
        realcado && "ring-2 ring-accent ring-inset",
      )}
    >
      <header className="sticky top-0 z-20 flex items-start gap-2 border-b border-border bg-surface p-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-ink">Fila de decisão</h3>
          <p className="mt-0.5 text-2xs text-ink-3">
            Arraste para um dia e uma turma. Soltar decide as duas coisas de uma vez.
          </p>
        </div>
        <span className="tnum shrink-0 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-ink">
          {fmt.n(itens.length)}
        </span>
      </header>

      {itens.length === 0 ? (
        <div className="p-3">
          <EstadoVazio
            icone={<IconeDominio nome="CircleCheck" />}
            titulo="Nada esperando decisão"
            descricao="Toda sugestão da IA já tem turma."
          />
        </div>
      ) : (
        <ul className="flex min-w-0 flex-col gap-1.5 p-2">
          {visiveis.map((item, i) => (
            <Fragment key={item.id}>
              {i === 0 && corte !== 0 ? (
                <li className="px-1 pt-1 text-2xs tracking-widest text-ink-3 uppercase">
                  Vence nesta semana
                </li>
              ) : null}
              {i === corte ? (
                <li className="px-1 pt-2 text-2xs tracking-widest text-ink-3 uppercase">Depois</li>
              ) : null}
              <CartaoServico
                item={item}
                origem="fila"
                fantasma={item.id === idEmVoo}
                selecionado={item.id === selecionado}
                salvando={salvandoIds.has(item.id)}
                desfazer={null}
                aoPegar={aoPegar}
                aoTeclar={aoTeclar}
                aoAbrir={aoAbrir}
                engolirClique={engolirClique}
                refCartao={refCartao(item.id)}
              />
            </Fragment>
          ))}
        </ul>
      )}

      {!expandido && itens.length > TETO ? (
        <div className="border-t border-border p-2">
          <Botao tamanho="sm" variante="fantasma" onClick={() => setExpandido(true)}>
            Mostrar os outros {fmt.n(itens.length - TETO)}
          </Botao>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Verificar tipos e lint**

Run: `cd web && npm run tipos && npm run lint`
Expected: nenhum erro novo em `trilho-fila.tsx`.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/agenda/_componentes/quadro/trilho-fila.tsx
git commit -m "feat(agenda): trilho da fila de decisao"
```

---

### Task 7: O quadro que amarra tudo

**Files:**
- Create: `web/src/app/agenda/_componentes/quadro/quadro-semana.tsx`

**Interfaces:**
- Consumes: tudo das tarefas 1 e 3 a 6.
- Produces:
  ```ts
  export function QuadroSemana(p: {
    grade: Grade; itens: ItemAgenda[]; equipes: Equipe[]; hoje: string;
    semana: string; selecionado: number | null; salvandoIds: ReadonlySet<number>;
    desfazerPorId: ReadonlyMap<number, () => void>;
    aoNavegar: (semana: string) => void;
    aoSelecionar: (id: number) => void;
    aoAlocar: (item: ItemAgenda, dia: string, equipe: Equipe) => void;
    aoDevolver: (item: ItemAgenda) => void;
  }): React.ReactElement;
  ```

- [ ] **Step 1: Escrever `quadro-semana.tsx`**

Cinco pontos que não são estilo:

- **Restauração de foco sem array de dependências.** O cartão remonta em outro pai; a guarda precisa cobrir *todo* commit, inclusive o da reversão do `useOptimistic`. Testar `isConnected`, nunca `refQuadro.contains` — este último é falso para qualquer portal e roubaria o foco de dentro do `PainelAgendamento`.
- **Duas regiões `aria-live`**: assertiva para o passo, polite para o desfecho.
- **`--linhas`** é escrito na grade a partir de `grade.linhas.length` — inclui a turma desativada com serviço.
- A calha é a coluna 1 da mesma grade, com `sticky left-0`.
- Linha de propostas: itens sem equipe no dia proposto. **Não emite `data-celula`** — a regra é que um dia só é marcado com turma.

```tsx
"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Botao, BotaoIcone } from "@/components/ui/botao";
import { fmt, inicioDaSemana, somarDias } from "@/lib/format";
import type { Equipe } from "@/lib/types";
import { cn } from "@/lib/utils";

import {
  chaveCelula,
  chaveDia,
  previaDoMovimento,
  textoServico,
  type Grade,
  type ItemAgenda,
  type Ocupacao,
} from "../dados";
import { CabecalhoDia } from "./cabecalho-dia";
import { cargaDoItem, CartaoServico } from "./cartao-servico";
import { CelulaEquipe } from "./celula-equipe";
import { MiniMapa } from "./mini-mapa";
import { Sobrevoo } from "./sobrevoo";
import { TrilhoFila } from "./trilho-fila";
import { usarArrasto, type Alvo, type CargaArrasto } from "./usar-arrasto";

export function QuadroSemana({
  grade,
  itens,
  equipes,
  hoje,
  semana,
  selecionado,
  salvandoIds,
  desfazerPorId,
  resumo28dias,
  aoNavegar,
  aoSelecionar,
  aoAlocar,
  aoDevolver,
}: {
  grade: Grade;
  itens: ItemAgenda[];
  equipes: Equipe[];
  hoje: string;
  semana: string;
  selecionado: number | null;
  salvandoIds: ReadonlySet<number>;
  desfazerPorId: ReadonlyMap<number, () => void>;
  resumo28dias: import("../dados").ResumoDia[];
  aoNavegar: (semana: string) => void;
  aoSelecionar: (id: number) => void;
  aoAlocar: (item: ItemAgenda, dia: string, equipe: Equipe) => void;
  aoDevolver: (item: ItemAgenda) => void;
}) {
  const [passo, setPasso] = useState("");
  const [desfecho, setDesfecho] = useState("");
  const refsCartoes = useRef(new Map<number, HTMLElement>());
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const equipePorId = useMemo(() => new Map(equipes.map((e) => [e.id, e])), [equipes]);

  const validar = useCallback(
    (carga: CargaArrasto, alvo: Alvo): string | null => {
      if (alvo === carga.origem) return null;
      if (alvo === "fila") {
        return porId.get(carga.id)?.equipeId == null
          ? "Este serviço já está na fila."
          : null;
      }
      const celula = grade.porCelula.get(alvo);
      if (!celula) return "Essa célula não existe mais. Recarregue a página.";
      if (celula.dia < hoje) return "Esse dia já passou.";
      if (!celula.aceitaSolta) return "Essa turma está desativada e não recebe serviço novo.";
      return null;
    },
    [grade, hoje, porId],
  );

  const descrever = useCallback(
    (alvo: Alvo, carga: CargaArrasto): string => {
      if (alvo === "fila") return "Fila de decisão. Soltar aqui tira a turma.";
      const celula = grade.porCelula.get(alvo);
      if (!celula) return "";
      const equipe = equipePorId.get(celula.equipeId);
      const item = porId.get(carga.id);
      const previa = item ? previaDoMovimento(grade, item, alvo, equipes).get(alvo) : null;
      const leitura = previa ?? celula;

      return `${fmt.dataLonga(celula.dia)}. ${equipe?.nome ?? "Turma"}. ${fmt.km(leitura.km)} de ${fmt.km(celula.capacidade)} no dia.${leitura.excedida ? " Acima da capacidade." : ""}`;
    },
    [grade, equipePorId, equipes, porId],
  );

  const soltar = useCallback(
    (carga: CargaArrasto, alvo: Alvo) => {
      const item = porId.get(carga.id);
      if (!item) return;

      if (alvo === "fila") {
        aoDevolver(item);
        setDesfecho(`${carga.rotulo} devolvido para a fila.`);
        return;
      }

      const celula = grade.porCelula.get(alvo);
      const equipe = celula ? equipePorId.get(celula.equipeId) : undefined;
      if (!celula || !equipe) return;

      aoAlocar(item, celula.dia, equipe);
      setDesfecho(`${carga.rotulo} alocado para ${fmt.dataLonga(celula.dia)}, ${equipe.nome}.`);
    },
    [porId, grade, equipePorId, aoAlocar, aoDevolver],
  );

  const navegarSemana = useCallback(
    (delta: -1 | 1) => aoNavegar(chaveDia(somarDias(semana, delta * 7))),
    [aoNavegar, semana],
  );

  const { estado, iniciar, aoTeclar, engolirClique } = usarArrasto({
    grade,
    validar,
    aoSoltar: soltar,
    descrever,
    anunciar: setPasso,
    aoNavegarSemana: navegarSemana,
  });

  const emVoo =
    estado.fase === "arrastando" || estado.fase === "carregando" ? estado.carga.id : null;
  const itemEmVoo = emVoo == null ? null : (porId.get(emVoo) ?? null);
  const alvoAtual = estado.fase === "arrastando" || estado.fase === "carregando" ? estado.alvo : null;
  const recusaAtual =
    estado.fase === "arrastando" || estado.fase === "carregando" ? estado.recusa : null;

  const previa = useMemo<Map<string, Ocupacao>>(() => {
    if (!itemEmVoo || !alvoAtual || alvoAtual === "fila" || recusaAtual) return new Map();
    return previaDoMovimento(grade, itemEmVoo, alvoAtual, equipes);
  }, [grade, itemEmVoo, alvoAtual, recusaAtual, equipes]);

  /* O cartão remonta em outro pai depois de um movimento, então o foco se perde.
     Sem array de deps de propósito: a guarda é barata e precisa cobrir TODO
     commit, inclusive o da reversão do otimista. `isConnected` e não
     `refQuadro.contains`: o segundo é falso para portais e roubaria o foco de
     dentro da gaveta de detalhe. */
  useLayoutEffect(() => {
    if (emVoo == null) return;
    if (selecionado != null) return;
    const ativo = document.activeElement;
    if (ativo && ativo !== document.body && ativo.isConnected) return;
    refsCartoes.current.get(emVoo)?.focus({ preventScroll: true });
  });

  const refCartao = useCallback(
    (id: number) => (no: HTMLElement | null) => {
      if (no) refsCartoes.current.set(id, no);
      else refsCartoes.current.delete(id);
    },
    [],
  );

  const desfazerDe = useCallback(
    (id: number) => desfazerPorId.get(id) ?? null,
    [desfazerPorId],
  );

  return (
    <section aria-label="Quadro da semana" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <BotaoIcone rotulo="Semana anterior" tamanho="sm" onClick={() => navegarSemana(-1)}>
          <ChevronLeft />
        </BotaoIcone>
        <p aria-live="polite" className="tnum min-w-0 font-mono text-sm text-ink">
          {fmt.dataCurta(grade.janela.inicio)} – {fmt.dataMedia(grade.janela.fim)}
        </p>
        <BotaoIcone rotulo="Próxima semana" tamanho="sm" onClick={() => navegarSemana(1)}>
          <ChevronRight />
        </BotaoIcone>
        <Botao
          tamanho="sm"
          variante="fantasma"
          onClick={() => aoNavegar(chaveDia(inicioDaSemana(hoje)))}
        >
          Hoje
        </Botao>
      </div>

      <MiniMapa
        resumos={resumo28dias}
        janela={grade.janela.dias}
        aoEscolherSemana={(dia) => aoNavegar(chaveDia(inicioDaSemana(dia)))}
      />

      <div className="flex min-w-0 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="hidden w-60 shrink-0 overflow-y-auto lg:block scroll-thin max-h-[min(78vh,760px)]">
          <TrilhoFila
            itens={grade.fila}
            hoje={hoje}
            janelaFim={grade.janela.fim}
            realcado={alvoAtual === "fila" && !recusaAtual}
            idEmVoo={emVoo}
            selecionado={selecionado}
            salvandoIds={salvandoIds}
            aoPegar={iniciar}
            aoTeclar={aoTeclar}
            aoAbrir={aoSelecionar}
            engolirClique={engolirClique}
            refCartao={refCartao}
          />
        </div>

        <div className="quadro-pista scroll-thin max-h-[min(78vh,760px)] min-w-0 flex-1">
          <div
            className="quadro-grade"
            style={{ "--linhas": grade.linhas.length } as React.CSSProperties}
          >
            <div className="sticky top-0 left-0 z-30 border-r border-b border-border bg-surface px-2 py-1.5">
              <span className="block text-2xs tracking-widest text-ink-3 uppercase">Equipe</span>
            </div>

            {grade.janela.dias.map((dia, i) => (
              <CabecalhoDia key={dia} dia={dia} hoje={hoje} resumo={grade.porDia[i]} />
            ))}

            <div className="sticky left-0 z-20 border-r border-b border-border bg-surface px-2 py-1.5">
              <span className="block text-2xs font-medium text-ink-2">Propostas da IA</span>
              <span className="block text-2xs text-ink-3">sem turma</span>
            </div>

            {grade.janela.dias.map((dia) => (
              <div key={`prop-${dia}`} className="border-b border-l border-grid p-1.5">
                <ul className="flex min-w-0 flex-col gap-1">
                  {(grade.propostas.get(dia) ?? []).map((item) => (
                    <CartaoServico
                      key={item.id}
                      item={item}
                      origem="fila"
                      compacto
                      fantasma={item.id === emVoo}
                      selecionado={item.id === selecionado}
                      salvando={salvandoIds.has(item.id)}
                      desfazer={null}
                      aoPegar={iniciar}
                      aoTeclar={aoTeclar}
                      aoAbrir={aoSelecionar}
                      engolirClique={engolirClique}
                      refCartao={refCartao(item.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}

            {grade.linhas.map((linha) => (
              <Linha
                key={linha.equipe.id}
                linha={linha}
                previa={previa}
                alvoAtual={alvoAtual}
                recusaAtual={recusaAtual}
                emVoo={emVoo}
                selecionado={selecionado}
                salvandoIds={salvandoIds}
                aoPegar={iniciar}
                aoTeclar={aoTeclar}
                aoAbrir={aoSelecionar}
                engolirClique={engolirClique}
                refCartao={refCartao}
                desfazerDe={desfazerDe}
              />
            ))}
          </div>
        </div>
      </div>

      <Sobrevoo estado={estado} item={itemEmVoo} />

      <p aria-live="assertive" aria-atomic="true" className="sr-only">
        {passo}
      </p>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {desfecho}
      </p>
    </section>
  );
}
```

O subcomponente `Linha` renderiza a calha grudada com o nome da turma e as 7 células. Escreva-o
no mesmo arquivo, logo abaixo:

```tsx
function Linha({
  linha,
  previa,
  alvoAtual,
  recusaAtual,
  emVoo,
  selecionado,
  salvandoIds,
  aoPegar,
  aoTeclar,
  aoAbrir,
  engolirClique,
  refCartao,
  desfazerDe,
}: {
  linha: import("../dados").LinhaEquipe;
  previa: Map<string, Ocupacao>;
  alvoAtual: Alvo | null;
  recusaAtual: string | null;
  emVoo: number | null;
  selecionado: number | null;
  salvandoIds: ReadonlySet<number>;
  aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoAbrir: (id: number) => void;
  engolirClique: (e: React.MouseEvent) => void;
  refCartao: (id: number) => (no: HTMLElement | null) => void;
  desfazerDe: (id: number) => (() => void) | null;
}) {
  const eq = linha.equipe;

  return (
    <>
      <div className="sticky left-0 z-10 flex flex-col justify-center border-r border-b border-border bg-surface px-2 py-1.5">
        <p className="truncate text-2xs font-medium text-ink" title={eq.nome}>
          {eq.nome}
        </p>
        <p className="tnum truncate font-mono text-2xs text-ink-3">
          {fmt.km(Number(eq.capacidade_km_dia))}/dia
          {eq.ativo ? "" : " · desativada"}
        </p>
      </div>

      {linha.celulas.map((celula) => (
        <CelulaEquipe
          key={celula.chave}
          celula={celula}
          equipeNome={eq.nome}
          previa={previa.get(celula.chave) ?? null}
          realcada={alvoAtual === celula.chave && !recusaAtual}
          recusada={alvoAtual === celula.chave && recusaAtual != null}
          filhos={celula.itens.map((item) => (
            <CartaoServico
              key={item.id}
              item={item}
              origem={celula.chave}
              fantasma={item.id === emVoo}
              selecionado={item.id === selecionado}
              salvando={salvandoIds.has(item.id)}
              desfazer={desfazerDe(item.id)}
              aoPegar={aoPegar}
              aoTeclar={aoTeclar}
              aoAbrir={aoAbrir}
              engolirClique={engolirClique}
              refCartao={refCartao(item.id)}
            />
          ))}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos e lint**

Run: `cd web && npm run tipos && npm run lint`
Expected: nenhum erro em `quadro/`. O `textoServico` importado e não usado precisa sair do import — o lint vai apontar.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/agenda/_componentes/quadro/quadro-semana.tsx
git commit -m "feat(agenda): quadro da semana amarrando grade, arrasto e anuncios"
```

---

### Task 8: Ligar na página e remover o que sai

**Files:**
- Modify: `web/src/app/agenda/_componentes/planejamento.tsx`
- Modify: `web/src/app/agenda/_componentes/controles.tsx`
- Modify: `web/src/app/agenda/_componentes/resumo.tsx`
- Modify: `web/src/app/agenda/_componentes/painel-agendamento.tsx`
- Delete: `web/src/app/agenda/_componentes/linha-do-tempo.tsx`
- Delete: `web/src/app/agenda/_componentes/fila-decisao.tsx`

**Interfaces:**
- Consumes: `QuadroSemana`, `montarGrade`, `montarJanela`, `resumo28`, `alocarAgendamento`, `devolverParaFila`, `desfazerAlocacao`.
- Produces: nada novo para tarefas seguintes.

- [ ] **Step 1: Reescrever `planejamento.tsx`**

Mudanças, todas com razão:

```ts
// A semana é estado de URL, como todo filtro do painel. `shallow: true` (padrão
// do nuqs): com `dynamic = "force-dynamic"` no layout, um shallow:false refaria
// `listarTrechos()` duas vezes por clique — uma no Shell, outra na página.
const [semana, setSemana] = useQueryState("semana", parseAsString.withDefault(""));
const ancora = semana || chaveDia(inicioDaSemana(hoje));
const janela = useMemo(() => montarJanela(ancora), [ancora]);

// O filtro de equipe deixa de ESCONDER e passa a DESTACAR: filtrar removeria
// células que precisam existir como destino de solta.
const visiveis = useMemo(
  () => itens.filter((item) => status.includes(item.status)),
  [itens, status],
);

const grade = useMemo(
  () => montarGrade({ itens: visiveis, equipes, janela, hoje }),
  [visiveis, equipes, janela, hoje],
);

const resumo28dias = useMemo(() => resumo28(itens, ancora), [itens, ancora]);
```

`pendente` deixa de travar a tela inteira. Em vez de um booleano global, um conjunto de ids:

```ts
const [salvandoIds, setSalvandoIds] = useState<ReadonlySet<number>>(new Set());
const [desfazerPorId, setDesfazerPorId] = useState<ReadonlyMap<number, () => void>>(new Map());

function alocar(item: ItemAgenda, dia: string, equipe: Equipe) {
  const anterior = { data: item.data, equipeId: item.equipeId };

  executar(
    { id: item.id, data_sugerida: dia, equipe: { id: equipe.id, nome: equipe.nome, base_uf: equipe.base_uf } },
    () => alocarAgendamento(item.id, dia, equipe.id),
    item.id,
    // Silencioso: o movimento do cartão já é a confirmação, e a região aria-live
    // narra o desfecho. Dois canais contando o mesmo evento é ruído.
    { silencioso: true },
  );

  // O desfazer mora no cartão por 8 s, não no toast: com MAXIMO = 4 na pilha de
  // notificações, esvaziar a fila em rajada comeria o botão.
  const acao = () => {
    executar(
      { id: item.id, data_sugerida: anterior.data, equipe: null },
      () => desfazerAlocacao(item.id, anterior.data, anterior.equipeId),
      item.id,
      { silencioso: false },
    );
    limparDesfazer(item.id);
  };
  setDesfazerPorId((atual) => new Map(atual).set(item.id, acao));
  setTimeout(() => limparDesfazer(item.id), 8000);
}
```

Substituir o bloco de `<LinhaDoTempo>` + `<FilaDecisao>` por:

```tsx
<QuadroSemana
  grade={grade}
  itens={itens}
  equipes={equipes}
  hoje={hoje}
  semana={ancora}
  selecionado={selecionado}
  salvandoIds={salvandoIds}
  desfazerPorId={desfazerPorId}
  resumo28dias={resumo28dias}
  aoNavegar={(nova) => setSemana(nova === chaveDia(inicioDaSemana(hoje)) ? null : nova)}
  aoSelecionar={(id) => setSelecionado(id)}
  aoAlocar={alocar}
  aoDevolver={devolver}
/>
```

E remover: o `<Aviso>` de vencidas e de sobrecarga (o sinal passa a viver no quadro), o estado
`periodo`, e o `porPeriodo`.

- [ ] **Step 2: Ajustar `controles.tsx`**

Remover o `<Segmentado>` de período e as props `periodo`, `aoMudarPeriodo`, `porPeriodo`. Remover
o `<option value="sem">` do seletor de equipe — o trilho já é a visão de quem não tem equipe. O
seletor passa a se chamar "Destacar equipe" e a prop, `equipeEmFoco`.

- [ ] **Step 3: Ajustar `resumo.tsx`**

Trocar a `<section>` de 4 cartões por uma faixa fina de uma linha, mantendo os mesmos 4 números e
o link de "Críticos sem data" para `/malha`. Remover a prop `periodo` (não há mais período) e
manter `janela`.

- [ ] **Step 4: Ajustar `painel-agendamento.tsx`**

Trocar `import { textoServico } from "./linha-do-tempo";` por `from "./dados";`.

- [ ] **Step 5: Remover os arquivos que saem**

```bash
git rm web/src/app/agenda/_componentes/linha-do-tempo.tsx web/src/app/agenda/_componentes/fila-decisao.tsx
```

- [ ] **Step 6: Verificação completa**

Run: `cd web && npm run verificar`
Expected: PASS em tipos, lint, testes, fumaça e build. Nenhum resquício de `LinhaDoTempo`,
`FilaDecisao`, `montarRaias`, `LARGURA_DIA` ou `PERIODOS` — confirme com
`grep -rn "LinhaDoTempo\|FilaDecisao\|montarRaias\|LARGURA_DIA\|PERIODOS" web/src`, que deve
voltar vazio.

- [ ] **Step 7: Commit**

```bash
git add -A web/src
git commit -m "feat(agenda): quadro da semana substitui a regua e a coluna da fila"
```

---

### Task 9: Doca no estreito, e verificação no navegador

**Files:**
- Modify: `web/src/app/agenda/_componentes/quadro/quadro-semana.tsx`
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: A doca**

Abaixo de `lg` (1024px) o trilho sai da linha e vira doca `fixed` num portal para `document.body`
— `sticky` não entrega "sempre visível" numa página que empilha cabeçalho, faixa de 28 dias e
navegação antes do quadro. Um componente só, duas montagens.

A escolha vem de `matchMedia` por `useSyncExternalStore`, o mesmo padrão de `barra-lateral.tsx`,
e não de `@container`: só em JS a doca sabe que a `NavegacaoMovel` existe e precisa da folga de
`calc(4.5rem + env(safe-area-inset-bottom))`.

Colapsada, a lista recebe `inert` — `transform` sozinho deixaria 62 cartões focáveis fora da tela.

- [ ] **Step 2: Subir a aplicação e medir**

```bash
cd web && npm run dev
```

Abrir `http://localhost:3000/agenda` e conferir, nesta ordem:

1. **Larguras** — 2560, 1600, 1280, 1024, 1023, 768, 430 px. Em cada uma: quantas colunas de dia
   aparecem, o quadro não rola na horizontal na página (só na pista), a calha das turmas continua
   grudada, e o trilho está presente como coluna ou como doca.
2. **Arrasto com mouse** — pegar pela alça no trilho, sobrevoar uma célula (a barra de capacidade
   daquela célula precisa mudar antes de soltar), soltar. O cartão aparece na célula, o toast não
   aparece, o "Desfazer" aparece no cartão por 8 s.
3. **Recusa** — arrastar para um dia anterior a hoje: borda neutra, motivo em texto, e soltar não
   grava nada.
4. **Clique** — clicar no cartão (sem arrastar) abre a gaveta de detalhe. Arrastar e soltar
   **não** abre a gaveta.
5. **Toque** — no DevTools em modo dispositivo: rolar o trilho com o dedo funciona; segurar a alça
   por 250 ms pega o cartão; arrastar até a borda da pista rola sozinho.
6. **Teclado só** — Tab até um cartão, Espaço, setas, Enter. O foco continua no cartão depois do
   movimento. Esc cancela.
7. **Leitor de tela** — com o Narrador do Windows ligado, confirmar que cada passo é anunciado uma
   vez só, e que o desfecho não é anunciado duas vezes.
8. **Casos que quebram** — navegar para uma semana sem nenhum serviço (a grade continua desenhada,
   com as 7 colunas e as 10 linhas); o trilho com 62 itens; uma célula acima da capacidade.
9. **Tema** — repetir 2 e 3 no tema escuro.
10. **Movimento reduzido** — com `prefers-reduced-motion` ligado no DevTools, o arrasto continua
    funcionando e nada anima.

- [ ] **Step 3: Verificação final e commit**

Run: `cd web && npm run verificar`
Expected: PASS.

```bash
git add -A
git commit -m "feat(agenda): doca da fila no estreito e ajustes da verificacao"
```

---

## Auto-revisão do plano

**Cobertura da spec.** §1 modelo → Tarefa 1 e 7. §2 grade e capacidade → Tarefa 1 e 5. §3 motor →
Tarefa 3. §4 escrita → Tarefa 2 e 8. §5 acessibilidade → Tarefa 3, 4 e 7. §6 movimento → Tarefa 4
e 5. §7 layout → Tarefa 5 e 9. §8 controles → Tarefa 8. §9 arquivos → tabela no topo. §11
verificação → Tarefa 9.

**Consistência de tipos.** `ChaveCelula` é `string` em `dados.tsx` e `Alvo = ChaveCelula | "fila"`
em `navegacao.ts`; `usar-arrasto.ts` reexporta `Alvo` para os componentes não importarem de dois
lugares. `Ocupacao` tem os mesmos três campos em `previaDoMovimento` e em `CelulaEquipe`.
`ResumoDia` é o mesmo tipo no `CabecalhoDia` e no `MiniMapa`.

**Onde o plano é mais frágil.** A Tarefa 3 (`usar-arrasto.ts`) é a única sem teste automatizado —
Pointer Events, captura e hit-test não existem fora de um navegador de verdade, e montar jsdom
para simulá-los testaria a simulação, não o comportamento. A parte testável foi extraída para
`navegacao.ts`, que tem sete testes; o resto depende do roteiro de navegador da Tarefa 9, e os
itens 2 a 6 dele existem exatamente para cobrir esse buraco.
