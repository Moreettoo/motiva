"use client";

import { useState, useTransition, type FormEvent } from "react";
import { parseAsString, useQueryStates } from "nuqs";
import { FlaskConical, RotateCcw } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campo";
import { ESPECIE } from "@/lib/dominio";
import { ESPECIES } from "@/lib/types";

import {
  ALTURA_MAX,
  ALTURA_MIN,
  CAPACIDADE_MAX,
  CAPACIDADE_MIN,
  DIAS_MAX,
  DIAS_MIN,
  DIAS_TREINO_MAX,
  DIAS_TREINO_MIN,
  FERTILIDADE_MAX,
  FERTILIDADE_MIN,
  PADRAO,
  ROCADA_MAX,
  ROCADA_MIN,
  type Erros,
  type ValoresFormulario,
} from "./parametros";

/**
 * Os campos do experimento.
 *
 * Eram quatro; o modelo v3.1 trouxe `dias_desde_rocada_inicio` como feature, e
 * ela nao e derivavel de coordenada nem de clima -- e a FASE da curva de
 * rebrota, e o modelo a usa para saber se a planta esta saindo do corte
 * (crescendo de reservas) ou na fase linear rapida. Sem esse campo o simulador
 * teria que chutar um numero e nao dizer qual.
 *
 * Os dois campos de solo sao opcionais de proposito. Vazio quer dizer "pergunte
 * ao SoilGrids no ponto", que e o que o lote diario faz; preenchido e para
 * quem quer ver a sensibilidade -- e ela e grande, a fertilidade sozinha move o
 * crescimento previsto em 71% entre as pontas.
 *
 * O estado dos campos e local ate a submissao, e so entao vai para a URL. Nao e
 * exceção a convencao de "estado de filtro vai para a URL": e que aqui cada
 * mudanca de URL dispara uma renderizacao de servidor que busca clima, busca
 * solo e chama a LLM. Um `useQueryState` por tecla digitada gastaria uma
 * chamada de OpenAI por caractere.
 *
 * `Campo` precisa de fronteira de cliente: ele injeta id e descritores no filho
 * com `cloneElement`, e filho vindo de Server Component nao e elemento durante o
 * SSR, o proprio arquivo do `Campo` documenta o mismatch de hidratacao.
 */
export function Formulario({
  valores,
  erros,
}: {
  valores: ValoresFormulario;
  erros: Erros;
}) {
  const [campos, setCampos] = useState(valores);
  const [pendente, iniciar] = useTransition();

  const [, setUrl] = useQueryStates(
    {
      especie: parseAsString,
      lat: parseAsString,
      lon: parseAsString,
      altura: parseAsString,
      dias: parseAsString,
      rocada: parseAsString,
      fert: parseAsString,
      solo: parseAsString,
    },
    // `shallow: false` e o que faz o servidor rodar de novo: sem ele a URL muda
    // e a simulacao continua sendo a anterior.
    { shallow: false, history: "push", startTransition: iniciar },
  );

  function mudar<C extends keyof ValoresFormulario>(campo: C, valor: ValoresFormulario[C]) {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    void setUrl({
      especie: campos.especie,
      lat: campos.latitude,
      lon: campos.longitude,
      altura: campos.altura,
      dias: campos.dias,
      rocada: campos.rocada,
      // Vazio sai da URL em vez de virar "": o link compartilhado fica limpo e
      // "sem parametro" e exatamente o significado de "automatico".
      fert: campos.fertilidade || null,
      solo: campos.capacidade || null,
    });
  }

  function limpar() {
    setCampos(PADRAO);
    void setUrl({
      especie: null, lat: null, lon: null, altura: null,
      dias: null, rocada: null, fert: null, solo: null,
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Espécie" dica={ESPECIE[campos.especie].nomeCientifico} erro={erros.especie}>
          <Selecao
            value={campos.especie}
            onChange={(e) => mudar("especie", e.target.value as ValoresFormulario["especie"])}
          >
            {ESPECIES.map((e) => (
              <option key={e} value={e}>
                {ESPECIE[e].rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>

        <Campo
          rotulo="Altura atual"
          dica={`Em centímetros, de ${ALTURA_MIN} a ${ALTURA_MAX}.`}
          erro={erros.altura}
        >
          <Entrada
            inputMode="decimal"
            value={campos.altura}
            onChange={(e) => mudar("altura", e.target.value)}
            placeholder="12"
          />
        </Campo>

        <Campo rotulo="Latitude" dica="Graus decimais. No Sudeste é negativa." erro={erros.latitude}>
          <Entrada
            inputMode="decimal"
            value={campos.latitude}
            onChange={(e) => mudar("latitude", e.target.value)}
            placeholder="-22.53"
            className="font-mono tnum"
          />
        </Campo>

        <Campo rotulo="Longitude" dica="Graus decimais. No Brasil é negativa." erro={erros.longitude}>
          <Entrada
            inputMode="decimal"
            value={campos.longitude}
            onChange={(e) => mudar("longitude", e.target.value)}
            placeholder="-47.43"
            className="font-mono tnum"
          />
        </Campo>

        <Campo
          rotulo="Dias desde a última roçada"
          dica="A fase da rebrota. Recém-cortada cresce de reservas; madura já está na fase rápida."
          erro={erros.rocada}
        >
          <Entrada
            type="number"
            min={ROCADA_MIN}
            max={ROCADA_MAX}
            step={1}
            inputMode="numeric"
            value={campos.rocada}
            onChange={(e) => mudar("rocada", e.target.value)}
            className="font-mono tnum"
          />
        </Campo>

        <Campo
          rotulo="Deixar crescendo por"
          dica={`De ${DIAS_MIN} a ${DIAS_MAX} dias, a mesma faixa que o modelo viu no treino (${DIAS_TREINO_MIN} a ${DIAS_TREINO_MAX}).`}
          erro={erros.dias}
        >
          <Entrada
            type="number"
            min={DIAS_MIN}
            max={DIAS_MAX}
            step={1}
            inputMode="numeric"
            value={campos.dias}
            onChange={(e) => mudar("dias", e.target.value)}
            className="font-mono tnum"
          />
        </Campo>
      </div>

      <fieldset className="border-t border-border pt-5">
        <legend className="sr-only">Solo</legend>
        <p className="text-sm font-medium text-ink">Solo</p>
        <p className="mt-1 max-w-prose text-xs text-ink-2">
          Deixe vazio para o painel estimar os dois do mapa de solo SoilGrids no ponto, que é o que
          o lote diário faz. Preencha para forçar um valor e ver o quanto ele move a curva — a
          fertilidade é a entrada mais sensível do modelo inteiro.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Fertilidade do solo"
            dica={`De ${FERTILIDADE_MIN} a ${FERTILIDADE_MAX}. Beira de estrada típica fica perto de 0,35.`}
            erro={erros.fertilidade}
          >
            <Entrada
              inputMode="decimal"
              value={campos.fertilidade}
              onChange={(e) => mudar("fertilidade", e.target.value)}
              placeholder="automático"
              className="font-mono tnum"
            />
          </Campo>

          <Campo
            rotulo="Água disponível no solo"
            dica={`Em milímetros na zona de raiz, de ${CAPACIDADE_MIN} a ${CAPACIDADE_MAX}.`}
            erro={erros.capacidade}
          >
            <Entrada
              inputMode="decimal"
              value={campos.capacidade}
              onChange={(e) => mudar("capacidade", e.target.value)}
              placeholder="automático"
              className="font-mono tnum"
            />
          </Campo>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" variante="primario" carregando={pendente} iconeEsquerda={<FlaskConical />}>
          {pendente ? "Simulando…" : "Simular crescimento"}
        </Botao>

        <Botao type="button" variante="fantasma" onClick={limpar} iconeEsquerda={<RotateCcw />}>
          Limpar
        </Botao>
      </div>
    </form>
  );
}
