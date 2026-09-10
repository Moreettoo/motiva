"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Send } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { solicitarRedefinicaoSenha } from "@/lib/auth/acoes-senha";

export function FormularioEsqueci() {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  /** `null` = ainda não pediu. Depois do pedido guarda o aviso do correio (ou nada). */
  const [enviado, setEnviado] = useState<{ aviso: string | null } | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    iniciar(async () => {
      const resultado = await solicitarRedefinicaoSenha({ email });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setEnviado({ aviso: resultado.dados.aviso });
    });
  }

  const voltar = (
    <p className="text-center text-sm">
      <Link href="/entrar" className="text-ink-2 underline-offset-4 hover:underline">
        Voltar para entrar
      </Link>
    </p>
  );

  // A resposta é a MESMA para e-mail com e sem conta: a tela não pode virar
  // um verificador de quem trabalha na Motiva.
  if (enviado) {
    return (
      <div className="space-y-5">
        <Aviso tom="good" titulo="Se este e-mail tiver conta, mandamos um link que vale 1 hora">
          <p>Confira a caixa de entrada e o spam. O link abre a tela de senha nova e funciona uma vez só.</p>
        </Aviso>
        {enviado.aviso ? <Aviso tom="info" titulo={enviado.aviso} /> : null}
        {voltar}
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-ink">Esqueci a senha</h1>
        <p className="mt-1 text-sm text-ink-3">Informe o e-mail do seu acesso e mandamos um link para criar outra.</p>
      </div>

      {erro ? <Aviso tom="critical" titulo={erro} /> : null}

      <Campo rotulo="E-mail" obrigatorio>
        <Entrada
          type="email"
          inputMode="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Campo>

      <Botao
        type="submit"
        variante="primario"
        className="w-full"
        carregando={pendente}
        iconeEsquerda={<Send />}
      >
        Enviar link
      </Botao>

      {voltar}
    </form>
  );
}
