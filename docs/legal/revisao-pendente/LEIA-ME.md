# Propostas de texto com revisão jurídica pendente — NÃO PUBLICADO

Nada nesta pasta está no ar. As páginas públicas (`/privacidade`, `/termos`), a Política de Uso gerada pelo produto e
a tela de encerramento continuam nas versões aprovadas (registro em `../aprovacao-juridica.md`, seções 1 a 7).

| Arquivo | O que propõe |
|---|---|
| `politica-de-privacidade.md` | 10.2/10.4/11/19: cópias do disco do Render "a cada 24 horas, por pelo menos 7 dias, sem prazo máximo publicado" (remove "até 15 dias" e "até 38 dias", que somavam um máximo que o provedor não publica); nova cláusula 6.6 (pesquisa na internet e geração de imagem) |
| `termos-de-uso.md` | 16.2: cópias do disco seguem o prazo do provedor |
| `textos-do-produto.diff` | Política de Uso (`src/politica.js`) e tela de encerramento (`public/encerramento.js`) remetendo aos prazos da Política de Privacidade |
| `registro-secoes-8-e-9.md` | Texto das notas técnicas a acrescentar a `aprovacao-juridica.md` |
| `pendencias-legais.md` | Lista de pendências atualizada |

Atenção para a revisão: o texto **publicado** ainda diz que a cópia do disco do provedor fica "7 dias após a captura"
e soma "até 15 dias"/"até 38 dias"; a documentação do Render só garante "pelo menos 7 dias". Os textos entram em
vigor em 30/11/2026.

Para publicar depois da aprovação: copiar os `.md` para `docs/legal/`, aplicar o diff, rodar
`node scripts/gerar-legais.js`, registrar a aprovação e os novos SHA-256 em `aprovacao-juridica.md` e
`medicao-lp.json`, e rodar `npm test`.
