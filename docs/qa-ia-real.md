# QA dos Quick Wins com IA real

Dois roteiros, para rodar na máquina de quem conduz o QA (precisa de Node 22 e do Google Chrome, ou de um
Chromium indicado em `CHROMIUM=/caminho`). Os dois abrem um navegador **com janela**. Nenhum deles pede, lê ou
guarda código de acesso, cookie, CSRF ou chave do OpenRouter.

```
git checkout claude/funny-bardeen-h9tnbv && npm ci
```

## 1. Candidato (este branch) com IA real, sem tocar na produção

```
node scripts/qa-candidato.mjs
```

- Sobe a plataforma deste código na sua máquina, com banco temporário (apagado no fim) e empresa fictícia.
- Abre o console local já autenticado (conta local fictícia), na tela **Uso**. Cole a chave do OpenRouter ali e
  salve, como na aplicação. O roteiro só espera o estado "configurada" (`OPENROUTER_CREDENTIAL_CONFIGURED=true`).
- Roda: interpretação (bateria A–M e fidelidade do tipo de material), 20 pedidos surpresa, execuções reais com
  material fictício (contrato, propostas, planilha de 120 linhas, reunião, relatório, pesquisa de concorrentes com e
  sem perfil público, currículos, social media, vídeo com e sem campanha, "revise esta pesquisa"), lacunas e
  retomada, e as três classes de modelo.
- Um espião mede tipo, modelo, duração e custo de cada chamada e confere se a busca na internet levou algo interno.
- Saída: `qa-candidato-saida/<data>/relatorio.json` e um `.md` por execução.

## 2. Produção, pelo fluxo de quem usa

```
node scripts/qa-producao.mjs          # https://greenia.theneil.com.br
```

- Abre a tela de login. Entre com `vinicius@apymine.com` e o código que chega no seu e-mail.
- Confere a conta e o estado da chave (`iaConfigurada`), cria só Quick Wins **"QA - …" em rascunho** (nunca
  publicados), executa em modo de teste com material fictício e, no fim, exclui (exclusão lógica) só o que criou,
  conferindo: some do catálogo, nova execução bloqueada, histórico preservado. Depois sai da conta.
- Não altera configuração da empresa, modelos, chave, créditos, plano nem Quick Wins existentes. A produção
  (e1088fe) não tem a interpretação pela IA nem a pesquisa sanitizada do candidato: esses itens saem como
  `NAO_EXISTE_EM_PRODUCAO`.
- Saída: `qa-producao-saida/<data>/relatorio.json` e um `.md` por execução.

Os relatórios não têm segredo. Envie as pastas de saída para a análise.

`QA_AUTOTESTE=1` serve só para conferir os roteiros (OpenRouter falso, sem janela); não mede IA real.
