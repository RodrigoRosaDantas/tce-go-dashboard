# Supabase — integração operacional TCE-GO

Esta pasta versiona a camada operacional privada do dashboard. O Notion continua sendo a fonte canônica.

## Edge Function

- `functions/tce-progress/index.ts`: fonte versionada da função ativa `tce-progress`.
- `config.toml`: mantém `verify_jwt = true`.
- deploy: `.github/workflows/deploy-supabase.yml`.

## Responsabilidades

A função:
1. autentica o usuário;
2. valida Dxx;
3. resolve Sxx no Notion pelo Dia controle;
4. rejeita conflito Dxx/Sxx;
5. preserva idempotência;
6. impede replay antigo e evento concorrente supersedido;
7. cria/reencontra a sessão de auditoria por idempotency key;
8. atualiza o Dia controle no Notion;
9. só então confirma o estado ao frontend.

## Dados privados

As tabelas `tce_progress_events`, `tce_progress_state` e `tce_writeback_users` têm RLS habilitado e não são acessadas diretamente pelo navegador. A Edge Function opera server-side com service role.

As alterações de banco já estão registradas no histórico de migrações do projeto Supabase compartilhado. O workflow deste repositório publica **somente a Edge Function**; ele não executa `db push` automaticamente.

## Credenciais

GitHub Actions:
- `SUPABASE_ACCESS_TOKEN`: necessário apenas para deploy automatizado da função.

Supabase Edge runtime:
- `TCE_GO_NOTION_TOKEN`: necessário para resolver/gravar o estado canônico no Notion.

Nenhum desses secrets deve entrar no snapshot público ou no código do frontend.
