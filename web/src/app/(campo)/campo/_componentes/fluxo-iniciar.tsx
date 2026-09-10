"use client";

import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";

import type { ChamadoCampo, FotoLocal } from "@/lib/campo/contratos";
import { fmt } from "@/lib/format";

import { ALVO, BotaoCampo, ESCALA, Rotulo } from "./base";
import { AdicionarExtra, CapturaFoto, type QuadroFoto } from "./captura-foto";
import { TelaRevisao } from "./tela-revisao";
import { useFotosDoEvento } from "./usar-fotos";

/**
 * Registrar o inicio da rocada: duas fotos com nome, extras opcionais, revisao.
 *
 * As duas obrigatorias nao sao burocracia: `ia.registrar_evento_chamado` conta
 * `medida` e `extensao` com o mesmo `evento_id` antes de aceitar `iniciado`, e
 * sem elas o evento volta recusado depois, quando a equipe ja saiu do trecho.
 * Por isso "Revisar" so acende com as duas.
 */

const QUADROS: QuadroFoto[] = [
  { papel: "medida", titulo: "Medida do mato, com a régua encostada", dica: "A régua em pé no capim, os números legíveis." },
  { papel: "extensao", titulo: "Extensão do trecho", dica: "De longe, mostrando a faixa inteira." },
];

export function FluxoIniciar({
  chamado,
  aoVoltar,
  aoRegistrar,
}: {
  chamado: ChamadoCampo;
  aoVoltar: () => void;
  aoRegistrar: (fotos: FotoLocal[], eventoId: string, ocorridoEm: string) => Promise<void>;
}) {
  const { eventoId, fotos, extras, definir, adicionarExtra, removerExtra, obrigatoriasProntas, todas } = useFotosDoEvento(QUADROS);
  const [revisando, setRevisando] = useState(false);

  const consequencia = useMemo(
    () =>
      "Ao confirmar, o chamado passa a Em andamento. Sem sinal, fica guardado no aparelho e é enviado sozinho quando a rede voltar.",
    [],
  );

  if (revisando) {
    return (
      <TelaRevisao
        titulo="Conferir antes de registrar"
        consequencia={consequencia}
        fotos={todas}
        rotuloConfirmar="Registrar início"
        rotuloGravando="Guardando no aparelho…"
        aoVoltar={() => setRevisando(false)}
        aoConfirmar={() => aoRegistrar(todas, eventoId, new Date().toISOString())}
      >
        <Rotulo>Trecho</Rotulo>
        <p className={`${ESCALA.corpo} tnum mt-1`}>
          {chamado.trecho.rodovia}, {fmt.faixaKm(chamado.trecho.km_inicio, chamado.trecho.km_fim)}
        </p>
      </TelaRevisao>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={aoVoltar}
        className={`${ESCALA.corpo} ${ALVO} -ml-3 inline-flex cursor-pointer items-center gap-1 rounded-md pr-3 pl-2 font-medium text-ink-2 active:bg-surface-3`}
      >
        <ChevronLeft aria-hidden="true" className="size-6" />
        Voltar
      </button>

      <div>
        <h1 className={ESCALA.tela}>Iniciar roçada</h1>
        <p className={`${ESCALA.corpo} mt-1 text-ink-2`}>Duas fotos são obrigatórias. Fotografe antes de começar a cortar.</p>
      </div>

      {QUADROS.map((q) => (
        <CapturaFoto
          key={q.papel}
          quadro={q}
          etapa="inicio"
          chamadoId={chamado.id}
          eventoId={eventoId}
          foto={fotos[q.papel] ?? null}
          aoTrocar={(f) => definir(q.papel, f)}
        />
      ))}

      {extras.map((extra, i) => (
        <CapturaFoto
          key={extra.chave}
          quadro={{ papel: "extra", titulo: `Foto extra ${i + 1}`, dica: "Qualquer coisa que o gestor precise ver." }}
          etapa="inicio"
          chamadoId={chamado.id}
          eventoId={eventoId}
          foto={extra.foto}
          aoTrocar={(f) => definir("extra", f, extra.chave)}
          aoRemover={() => removerExtra(extra.chave)}
        />
      ))}

      <AdicionarExtra quantidade={extras.length} aoAdicionar={adicionarExtra} />

      <BotaoCampo variante="primario" disabled={!obrigatoriasProntas} onClick={() => setRevisando(true)}>
        {obrigatoriasProntas ? "Revisar" : "Faltam as duas fotos"}
      </BotaoCampo>
    </div>
  );
}
