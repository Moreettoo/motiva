"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { entrar } from "@/lib/auth/acoes";

export function FormularioEntrar({ proximo }: { proximo: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    iniciar(async () => {
      const resultado = await entrar({ email, senha, proximo });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      // `replace` + `refresh`: a pagina de destino precisa ler o cookie novo, e
      // a de login nao deve ficar no historico do botao voltar.
      router.replace(resultado.dados.destino);
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-ink">Entrar</h1>
        <p className="mt-1 text-sm text-ink-3">Acesso por convite. Não existe cadastro.</p>
      </div>

      {erro ? <Aviso tom="critical" titulo={erro} /> : null}

      <Campo rotulo="E-mail" obrigatorio>
        <Entrada type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Campo>
      <Campo rotulo="Senha" obrigatorio>
        <Entrada type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Campo>

      <Botao type="submit" variante="primario" className="w-full" carregando={pendente} iconeEsquerda={<LogIn />}>
        Entrar
      </Botao>

      <p className="text-center text-sm">
        <Link href="/esqueci-a-senha" className="text-ink-2 underline-offset-4 hover:underline">
          Esqueci a senha
        </Link>
      </p>
    </form>
  );
}
