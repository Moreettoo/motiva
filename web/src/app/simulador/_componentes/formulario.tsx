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
  DIAS_MAX,
  DIAS_MIN,
  DIAS_TREINO_MAX,
  DIAS_TREINO_MIN,
  PADRAO,
  type Erros,
  type ValoresFormulario,
} from "./parametros";

/**
 * Os quatro campos do experimento.
 *
 * O estado dos campos e local ate a submissao, e so entao vai para a URL. Nao e
 * exceção a convencao de "estado de filtro vai para a URL": e que aqui cada
 * mudanca de URL dispara uma renderizacao de servidor que busca clima e chama a
 * LLM. Um `useQueryState` por tecla digitada gastaria uma chamada de OpenAI por
 * caractere.
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
    });
  }

  function limpar() {
    setCampos(PADRAO);
    void setUrl({ especie: null, lat: null, lon: null, altura: null, dias: null });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
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
          rotulo="Deixar crescendo por"
          dica={`De ${DIAS_MIN} a ${DIAS_MAX} dias. O modelo viu períodos de ${DIAS_TREINO_MIN} a ${DIAS_TREINO_MAX}: fora disso ele extrapola, e o resultado avisa.`}
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
