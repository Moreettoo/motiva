"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { definirSenha } from "@/lib/auth/acoes";
import { SENHA_MINIMA, erroDaSenha } from "@/lib/auth/tokens";

export function FormularioDefinirSenha({ nome }: { nome: string }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const local = erroDaSenha(senha) ?? (senha !== confirmacao ? "As duas senhas não são iguais." : null);
    setErro(local);
    if (local) return;
    iniciar(async () => {
      const resultado = await definirSenha({ senha, confirmacao });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      router.replace(resultado.dados.destino);
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-ink">Defina sua senha, {nome.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-ink-3">A senha provisória vale só para este primeiro acesso.</p>
      </div>
      {erro ? <Aviso tom="critical" titulo={erro} /> : null}
      <Campo rotulo="Nova senha" dica={`Pelo menos ${SENHA_MINIMA} caracteres, com letras e números.`} obrigatorio>
        <Entrada type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Campo>
      <Campo rotulo="Repita a senha" obrigatorio>
        <Entrada type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
      </Campo>
      <Botao type="submit" variante="primario" className="w-full" carregando={pendente} iconeEsquerda={<KeyRound />}>
        Guardar senha
      </Botao>
    </form>
  );
}
