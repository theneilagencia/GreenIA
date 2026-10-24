# Revisão comercial da landing page

Data: 06/10/2026. Base de produção: `f70e85c`. Revisão editorial fornecida pelo cliente no arquivo Markdown colado(20261006-130707).md.

## Resultado

- Abertura com oferta, público e uma ação principal: solicitar demonstração. Metadados acompanham o novo título.
- Quick Win demonstrado logo depois da abertura, com os mesmos documentos fictícios, duas divergências, consulta simulada e aprovação pendente. A demonstração não chama sistemas externos.
- Integrações em um bloco curto; condições permanecem visíveis na demonstração e no texto. Pedido de conexão não ativa o sistema.
- Controle, comparação com contas pessoais, modelos e conhecimento simplificados. Comparação reduzida a quatro critérios.
- Implantação em uma única seção. Prumo continua separado e opcional.
- Plano sem licença por pessoa, limites, aviso e reserva explicados no corpo. Detalhes de processamento, suporte, fornecedores, retenção e créditos ficam no FAQ expansível.
- Formulário, integração, antispam, campos, estados de erro e confirmação preservados.
- Captura real da gestão de créditos em uma instância temporária, com conta e uso fictícios. O script `scripts/capturar-lp-demonstracao.js` permite refazer a captura; a conversão para WebP usa qualidade 88. Nenhum dado de produção foi usado.
- Links anteriores para conhecimento e implantação foram preservados. Âncoras recebem espaço para o cabeçalho fixo.

O corpo comercial passou de aproximadamente 1.625 para 841 palavras, excluindo FAQ, tabelas, figuras, formulário, cabeçalho e rodapé. A redução não inclui a leitura opcional das condições no FAQ. Conversão comercial não foi medida.

## Verificações

- `node --test test/claims-lp.test.js test/vendas.test.js`: 24 testes aprovados, cobrindo registro de afirmações, restrições de copy, página comercial, página de empresa e contato.
- `node --test e2e/lp-demo.test.js`: dois cenários aprovados, com animação finita, pausa, etapas, ausência de efeitos externos, movimento reduzido, telas de 320, 390, 768 e 1280 px, FAQ, imagem real carregada e formulário com erro recuperável e envio bem sucedido em banco temporário.
- Inspeção visual da abertura em desktop e celular, formulário no celular, gestão de créditos e demonstração.
- IDs únicos e links internos com destinos existentes. `git diff --check` sem erros.
- Condições materiais comparadas com o código e com a Política de Privacidade vigente no repositório. Registro `docs/claims-lp.md` atualizado; afirmações substituídas mantidas como obsoletas, sem retirar as restrições editoriais.

A publicação deve ser confirmada pelo commit implantado e pela LP pública. O formulário real não deve receber contatos fictícios durante essa confirmação.
