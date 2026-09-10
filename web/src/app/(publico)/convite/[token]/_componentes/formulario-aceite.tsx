"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { aceitarConvite } from "@/lib/auth/acoes-convite";
import { SENHA_MINIMA, erroDaSenha } from "@/lib/auth/tokens";

export function FormularioAceite({
  token,
  email,
  cargoRotulo,
  equipeNome,
  convidadorNome,
}: {
  token: string;
  email: string;
  cargoRotulo: string;
  equipeNome: string | null;
  convidadorNome: string | null;
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const local =
      nome.trim().length < 2
        ? "Escreva seu nome como a equipe conhece você."
        : (erroDaSenha(senha) ?? (senha !== confirmacao ? "As duas senhas não são iguais." : null));
    setErro(local);
    if (local) return;

    iniciar(async () => {
      const resultado = await aceitarConvite({ token, nome, senha, confirmacao });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      // `replace` + `refresh`: o destino precisa ler o cookie novo, e o link do
      // convite nao deve voltar pelo botao "voltar" depois de virar conta.
      router.replace(resultado.dados.destino);
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-ink">Crie seu acesso</h1>
        <p className="mt-1 text-sm text-ink-3">
          {convidadorNome ?? "Um administrador"} convidou você como {cargoRotulo}
          {equipeNome ? `, líder da ${equipeNome}` : ""}.
        </p>
      </div>

      {erro ? <Aviso tom="critical" titulo={erro} /> : null}

      <Campo rotulo="E-mail">
        {/* Fixo: o convite vale para este endereco e para nenhum outro. */}
        <Entrada type="email" value={email} readOnly autoComplete="username" />
      </Campo>

      <Campo rotulo="Seu nome" obrigatorio>
        <Entrada
          type="text"
          autoComplete="name"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </Campo>

      <Campo
        rotulo="Senha"
        dica={`Pelo menos ${SENHA_MINIMA} caracteres, com letras e números.`}
        obrigatorio
      >
        <Entrada
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
      </Campo>

      <Campo rotulo="Repita a senha" obrigatorio>
        <Entrada
          type="password"
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />
      </Campo>

      <Botao
        type="submit"
        variante="primario"
        className="w-full"
        carregando={pendente}
        iconeEsquerda={<UserPlus />}
      >
        Criar acesso e entrar
      </Botao>
    </form>
  );
}
