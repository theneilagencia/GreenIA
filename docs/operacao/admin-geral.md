# Administração geral de usuários, planos e cobrança

O console continua separado do ambiente das empresas. A gestão de cadastros não abre sessões de operador nem dá acesso a conversas ou arquivos.

## Usuários

Em Usuários, pesquisar nome ou email e combinar empresa, perfil, acesso na empresa e situação da conta global. Os filtros de vínculo são aplicados à mesma empresa. A listagem é paginada no servidor, com total e 50 pessoas por página.

Cadastrar pessoa permite escolher empresa, perfil e envio de convite. Editar cadastro modifica a identidade global; trocar email encerra as sessões e invalida códigos anteriores. Editar acesso modifica apenas o vínculo selecionado. Os perfis reutilizam as permissões existentes, inclusive perfis personalizados da empresa.

O último administrador ativo não pode ser desativado, removido, rebaixado nem bloqueado globalmente. Uma conta bloqueada não conta como substituto. A reativação respeita o limite de usuários do plano.

## Planos e contratos

O editor de plano inclui condição gratuita ou paga, preço e moeda, franquia, reserva, recursos, limites e renovação padrão para novas empresas. Preço BRL fica separado da referência USD: não é somado à receita USD nem apresentado como margem em USD. Planos gratuitos não são assinaturas Stripe. O preço USD pago continua sujeito às travas econômicas existentes.

Em Empresa → Resumo → Mais ações → Forma de cobrança e vigência, escolher Sem cobrança, Cobrança externa ou Stripe. A configuração não cria nem cancela cobranças. A opção Stripe exige confirmação explícita; as outras opções funcionam mesmo com a integração desligada e não chamam sua API. Empresas novas herdam a condição e renovação do plano; contratos existentes não são alterados ao editar esses padrões.

A data de término é inclusiva. Depois dela, novas execuções de IA são pausadas, mantendo cadastro, dados e consulta ao histórico. Sem data, a vigência é indeterminada. Os ciclos mensais mantêm o calendário UTC já utilizado pela aplicação. A franquia única não se recompõe na virada do mês; os pacotes mantêm a validade original. Não trocar a regra de renovação depois de haver consumo sem conciliação.

Uma mudança de capacidade com consumo no mês deve ser agendada para o início do próximo mês. A ativação ocorre na primeira consulta/execução do novo ciclo e guarda as franquias dos meses anteriores para não recalcular pacotes já consumidos. Editar diretamente um plano em uso exige criar uma variante e agendar a troca. Salvar o contrato preserva um agendamento existente. Um plano agendado que se torne inativo não é aplicado até ser reativado.

## Stripe e limites operacionais

Checkout USD, faturas USD/BRL, PTAX e webhooks continuam no sandbox. Novas emissões exigem que a empresa tenha escolhido Stripe explicitamente e esteja dentro da vigência. Registros legados com pedidos Stripe são reconhecidos sem chamadas ao provedor.

Assinaturas, cobranças abertas e períodos pagos impedem mudanças conflitantes em planos e condições. Não há cancelamento remoto, estorno ou concessão de créditos implícitos. O painel mostra as obrigações e orienta conciliação. Uma empresa já migrada para créditos por pagamentos exige conciliação de seus períodos e saldos antes de voltar à cobrança manual; essa migração não é automatizada nesta alteração.

## Persistência e validação

Migração aditiva: `companies.faturamento`, JSON com padrões compatíveis com empresas existentes; tabelas de identidade e vínculos são reutilizadas. `plano_franquias` nos bancos das empresas preserva capacidades históricas quando há alteração. Alterações administrativas geram auditoria com autor e antes/depois. Não se armazenam chaves nesses campos.

Validação local: 100 testes aprovados em 12 arquivos, incluindo 12 cenários novos da Administração Geral e regressão de Stripe, planos, créditos, multiempresa, acesso, publicação controlada e restauração. A interface passou por verificação sintática; a validação visual e de navegação no navegador permanece pendente devido à indisponibilidade da sessão segura. Isso não representa publicação em homologação nem liberação em produção.
