# Claude via Amazon Bedrock com processamento no Brasil: verificação

Data da verificação: 24/09/2026. Pedido: usar o Claude no Amazon Bedrock com processamento na região do Brasil (sa-east-1) e, se possível, implementar como segundo `LlmProvider`.

## Conclusão

**Não há, hoje, opção documentada de processamento do Claude restrito ao Brasil.** Por isso o segundo provedor não foi implementado.

## O que foi verificado

1. **Endpoints existem em São Paulo.** `bedrock-runtime.sa-east-1.amazonaws.com` e `bedrock-mantle.sa-east-1.api.aws` respondem. Isso só mostra que o serviço Bedrock existe na região, não que o Claude processa lá.
2. **Documentação da Anthropic sobre o Claude no Bedrock** (`platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock`, versão "legacy" servida pelo redirecionamento):
   - Os modelos novos são servidos por inferência entre regiões (inference profiles), com prefixos `global`, `us`, `eu`, `jp` e `apac`.
   - Os endpoints regionais, que garantem o roteamento por uma geografia, estão "disponíveis para EUA, UE, Japão e Ásia-Pacífico". Não há prefixo para Brasil ou América do Sul.
   - O Claude Haiku 4.5 (`anthropic.claude-haiku-4-5-20251001-v1:0`) aparece com `global`, `us` e `eu`.
   - O perfil `global` pode ser chamado a partir de sa-east-1, mas o processamento pode acontecer em qualquer região.
3. **API da Anthropic e Claude Platform on AWS** (`platform.claude.com/docs/en/manage-claude/data-residency`): o parâmetro `inference_geo` aceita só `"global"` e `"us"`, e só em modelos Claude 4.6 ou mais novos (o Haiku 4.5 devolve 400 com o parâmetro).

## O que não foi possível conferir

A lista oficial da AWS (`docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html` e `inference-profiles-support.html`) não abriu neste ambiente, porque a rede bloqueia `docs.aws.amazon.com`. Antes de uma decisão contratual, vale conferir essa lista no console da AWS. Na conta, rode `aws bedrock list-inference-profiles --region sa-east-1` e veja se existe um perfil restrito ao Brasil para o modelo escolhido.

## Consequência para a arquitetura

- O texto enviado ao modelo é processado fora do Brasil em qualquer um dos caminhos disponíveis. Isso vai para `PENDENCIAS-SEGURANCA.md` (decisão jurídica/contratual e LGPD, transferência internacional).
- Banco, documentos, Redis e email continuam em sa-east-1.
- O `LlmProvider` fica pronto para um provedor com processamento regional, se ele passar a existir. Basta implementar a interface e acrescentar a opção no schema do tenant.
