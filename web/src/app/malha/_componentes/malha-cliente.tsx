"use client";

import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { Search } from "lucide-react";

import { FaixaRodovia } from "@/components/malha/faixa-rodovia";
import { MapaMalha } from "@/components/malha/mapa-malha";
import { Botao } from "@/components/ui/botao";
import { Cartao } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/vazio";
import { ESPECIE, ORDEM_RISCO, RISCO } from "@/lib/dominio";
import { fmt, parseData } from "@/lib/format";
import { ESPECIES, UFS } from "@/lib/types";
import type { Risco, TrechoStatus, ZonaClima } from "@/lib/types";

import { BlocoAgrupamento, detectarAgrupamentos } from "./agrupamento";
import {
  BarraFiltros,
  agruparPorRodovia,
  filtrarTrechos,
  montarIndiceBusca,
  paramBusca,
  paramEspecie,
  paramOrdenar,
  paramRisco,
  paramSentido,
  paramTrecho,
  paramUf,
  paramVisao,
  zonaDoTrecho,
  alternarEm,
  type Ordenacao,
  type Visao,
} from "./filtros";
import { PainelTrecho } from "./painel-trecho";
import { TabelaTrechos, ordenarTrechos } from "./tabela-trechos";

const TITULO_VISAO: Record<Visao, string> = {
  faixa: "Rodovias em régua de km",
  mapa: "Dispersão geográfica",
  tabela: "Trechos em tabela",
};

export function MalhaCliente({
  trechos,
  zonas,
  hoje,
}: {
  trechos: TrechoStatus[];
  zonas: ZonaClima[];
  hoje: string;
}) {
  const [busca, setBusca] = useQueryState("busca", paramBusca);
  const [riscos, setRiscos] = useQueryState("risco", paramRisco);
  const [ufs, setUfs] = useQueryState("uf", paramUf);
  const [especies, setEspecies] = useQueryState("especie", paramEspecie);
  const [visao, setVisao] = useQueryState("visao", paramVisao);
  const [ordenar, setOrdenar] = useQueryState("ordenar", paramOrdenar);
  const [sentido, setSentido] = useQueryState("sentido", paramSentido);
  const [trechoId, setTrechoId] = useQueryState("trecho", paramTrecho);

  const indice = useMemo(() => montarIndiceBusca(trechos, zonas), [trechos, zonas]);

  const visiveis = useMemo(
    () => filtrarTrechos(trechos, { busca, riscos, ufs, especies }, indice),
    [trechos, busca, riscos, ufs, especies, indice],
  );

  const grupos = useMemo(() => agruparPorRodovia(visiveis), [visiveis]);
  const agrupamentos = useMemo(
    () => detectarAgrupamentos(visiveis, parseData(hoje)),
    [visiveis, hoje],
  );
  const ordenados = useMemo(
    () => ordenarTrechos(visiveis, ordenar, sentido),
    [visiveis, ordenar, sentido],
  );

  const contagemRisco = useMemo(() => {
    const base: Record<Risco, number> = { critica: 0, alta: 0, media: 0, baixa: 0 };
    for (const t of trechos) base[t.risco] += 1;
    return base;
  }, [trechos]);

  // A seleção sai da lista completa, não da filtrada: um link compartilhado com
  // ?trecho= precisa abrir mesmo que o destinatário chegue com outro filtro.
  const selecionado = useMemo(
    () => (trechoId == null ? null : (trechos.find((t) => t.id === trechoId) ?? null)),
    [trechos, trechoId],
  );

  // Guarda o último trecho aberto para o painel poder animar a saída: sem isso
  // ele desmontaria no mesmo quadro do clique em "fechar" e sumiria seco.
  // Ajuste durante o render, não em efeito — o conteúdo precisa estar correto já
  // na primeira pintura do fechamento, e um efeito só rodaria depois dela.
  const [ultimoAberto, setUltimoAberto] = useState<TrechoStatus | null>(selecionado);
  const [idAnterior, setIdAnterior] = useState<number | null>(trechoId);

  if (trechoId !== idAnterior) {
    setIdAnterior(trechoId);
    if (selecionado) setUltimoAberto(selecionado);
  }

  const trechoDoPainel = selecionado ?? ultimoAberto;
  const zonaDoPainel = useMemo(
    () => (trechoDoPainel ? zonaDoTrecho(trechoDoPainel, zonas) : null),
    [trechoDoPainel, zonas],
  );

  const temFiltro =
    busca.trim() !== "" || riscos.length > 0 || ufs.length > 0 || especies.length > 0;

  const resumoFiltros = [
    busca.trim() ? `busca “${busca.trim()}”` : null,
    riscos.length ? `risco ${riscos.map((r) => RISCO[r].rotulo).join(", ")}` : null,
    ufs.length ? `UF ${ufs.join(", ")}` : null,
    especies.length ? `espécie ${especies.map((e) => ESPECIE[e].rotulo).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function limpar() {
    setBusca(null);
    setRiscos(null);
    setUfs(null);
    setEspecies(null);
  }

  function ordenarPor(chave: Ordenacao) {
    if (chave === ordenar) {
      setSentido(sentido === "asc" ? "desc" : "asc");
      return;
    }
    setOrdenar(chave);
    setSentido("asc");
  }

  const legenda =
    visao === "faixa"
      ? `${fmt.n(grupos.length)} ${grupos.length === 1 ? "rodovia" : "rodovias"} · ${fmt.n(visiveis.length)} ${visiveis.length === 1 ? "trecho" : "trechos"}`
      : `${fmt.n(visiveis.length)} ${visiveis.length === 1 ? "trecho" : "trechos"}`;

  return (
    <>
      <BarraFiltros
        busca={busca}
        aoBuscar={(valor) => setBusca(valor || null)}
        riscos={riscos}
        aoAlternarRisco={(risco) => setRiscos((atual) => alternarEm(atual, risco, ORDEM_RISCO))}
        ufs={ufs}
        aoAlternarUf={(uf) => setUfs((atual) => alternarEm(atual, uf, UFS))}
        especies={especies}
        aoAlternarEspecie={(especie) =>
          setEspecies((atual) => alternarEm(atual, especie, ESPECIES))
        }
        visao={visao}
        aoMudarVisao={setVisao}
        contagemRisco={contagemRisco}
        visiveis={visiveis.length}
        total={trechos.length}
        temFiltro={temFiltro}
        aoLimpar={limpar}
      />

      <BlocoAgrupamento
        agrupamentos={agrupamentos}
        selecionado={trechoId}
        aoSelecionar={(id) => setTrechoId(id)}
      />

      <section aria-labelledby="titulo-visao" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="titulo-visao" className="text-base font-medium text-ink">
            {TITULO_VISAO[visao]}
          </h2>
          <p className="tnum font-mono text-xs text-ink-3">{legenda}</p>
        </div>

        {visiveis.length === 0 ? (
          <EstadoVazio
            icone={<Search />}
            titulo="Nenhum trecho corresponde ao filtro"
            descricao={
              resumoFiltros
                ? `Filtro aplicado: ${resumoFiltros}. Solte um dos critérios para voltar a enxergar a malha.`
                : "A malha está vazia. Rode a análise em lote para popular previsões e agendamentos."
            }
            acao={
              temFiltro ? (
                <Botao variante="secundario" onClick={limpar}>
                  Limpar filtros
                </Botao>
              ) : null
            }
          />
        ) : visao === "faixa" ? (
          <Cartao className="pr-4">
            {grupos.map((grupo, i) => (
              <FaixaRodovia
                key={grupo.chave}
                rodovia={grupo.rodovia}
                uf={grupo.uf}
                extensao={grupo.extensao}
                criticos={grupo.criticos}
                piorRisco={grupo.piorRisco}
                trechos={grupo.trechos}
                altura="detalhada"
                selecionado={trechoId}
                aoSelecionar={(id) => setTrechoId(id)}
                indice={Math.min(i, 12)}
              />
            ))}
          </Cartao>
        ) : visao === "mapa" ? (
          <MapaMalha
            trechos={visiveis}
            selecionado={trechoId}
            aoSelecionar={(id) => setTrechoId(id)}
            altura={520}
          />
        ) : (
          <TabelaTrechos
            trechos={ordenados}
            ordenar={ordenar}
            sentido={sentido}
            aoOrdenar={ordenarPor}
            selecionado={trechoId}
          />
        )}
      </section>

      <PainelTrecho
        trecho={trechoDoPainel}
        zona={zonaDoPainel}
        aberto={selecionado != null}
        aoFechar={() => setTrechoId(null)}
      />
    </>
  );
}
