"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Ruler } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { useNotificacao } from "@/components/ui/notificacoes";
import { registrarMedicao } from "@/lib/acoes";
import { fmt } from "@/lib/format";

const MAXIMO_CM = 300;

/** Aceita 12,5 e 12.5: o teclado do celular em pt-BR entrega vírgula. */
function paraNumero(texto: string): number {
  return Number(texto.trim().replace(",", "."));
}

export function RegistrarMedicao({ trechoId, hojeIso }: { trechoId: number; hojeIso: string }) {
  const { mostrar } = useNotificacao();
  const [altura, setAltura] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const texto = altura.trim();
    const valor = paraNumero(texto);

    if (!texto) {
      setErro("Informe a altura medida em campo, em centímetros.");
      entrada.current?.focus();
      return;
    }

    if (!Number.isFinite(valor) || valor < 0 || valor > MAXIMO_CM) {
      setErro(`Use um número entre 0 e ${MAXIMO_CM} cm — foi o que o campo consegue medir.`);
      entrada.current?.focus();
      return;
    }

    setErro(null);

    iniciar(async () => {
      const resultado = await registrarMedicao(trechoId, valor);

      if (resultado.ok) {
        setAltura("");
        mostrar({
          tom: "good",
          titulo: "Medição registrada",
          descricao: `${fmt.cm(valor)} em ${fmt.dataMedia(hojeIso)}. O gráfico e o prazo já usam esta leitura.`,
        });
      } else {
        setErro(resultado.erro);
        entrada.current?.focus();
        mostrar({ tom: "critical", titulo: "Não foi possível registrar", descricao: resultado.erro });
      }
    });
  }

  return (
    <Cartao>
      <CartaoCabecalho
        como="h2"
        icone={<Ruler />}
        titulo="Registrar medição"
        descricao="A altura medida hoje em campo. Entra no histórico e corrige a extrapolação."
      />

      <CartaoCorpo>
        <form onSubmit={enviar} noValidate className="space-y-4">
          <Campo
            rotulo="Altura medida (cm)"
            dica={`Entra com a data de hoje, ${fmt.dataMedia(hojeIso)}.`}
            erro={erro ?? undefined}
            obrigatorio
          >
            <Entrada
              ref={entrada}
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={MAXIMO_CM}
              placeholder="ex.: 18,5"
              autoComplete="off"
              value={altura}
              onChange={(evento) => {
                setAltura(evento.target.value);
                if (erro) setErro(null);
              }}
            />
          </Campo>

          {/* O botão só sai do ar depois que o request começa: validação inline
              não pode travar quem ainda está digitando. */}
          <div className="flex justify-end">
            <Botao type="submit" variante="secundario" carregando={pendente}>
              Registrar Medição
            </Botao>
          </div>
        </form>
      </CartaoCorpo>
    </Cartao>
  );
}
