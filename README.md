# TCE-GO Dashboard

Camada pública derivada do Notion canônico do projeto TCE-GO.

## Contrato

`Notion → extração server-side → normalização → validação → sanitização → snapshot JSON → quality → GitHub Pages/PWA`.

- D001–D100 são a identidade canônica.
- `Ordem` é a única sequência usada pelo frontend.
- S01–S47 é metadado visual dos 47 dias ativos.
- 53 dias protegidos permanecem no calendário e não recebem Sxx.
- Apenas `Pronto para estudo = sim` aparece como sessão liberada.
- Dados pessoais de execução não entram no snapshot público.

## Desenvolvimento

Requer Node 22.

```bash
npm ci
npm run quality
```

Base path de produção: `/tce-go-dashboard/`.

## Sincronização

O workflow usa:

- secret: `TCE_GO_NOTION_TOKEN`
- optional variable override: `TCE_GO_DAYS_DATA_SOURCE_ID`
- Notion API version: `2026-03-11`

Nenhum token é enviado ao navegador ou gravado no snapshot.

O sincronizador usa as relações do próprio D001–D100 para localizar **Material canônico e Qxx**. Assim, não é necessário publicar IDs internos adicionais de bancos no repositório. Material é extraído e sanitizado server-side; Qxx externo é publicado por metadados/referência, sem republicação massiva de questões de terceiros.

## GitHub Pages

A implantação usa GitHub Actions e o base path `/tce-go-dashboard/`.

No primeiro uso do repositório, habilite em **Settings → Pages → Build and deployment → Source → GitHub Actions**. Enquanto o Pages não estiver habilitado, o workflow de deploy faz um preflight seguro, emite aviso e não tenta publicar.

## Configuração server-side do Notion

Em **Settings → Secrets and variables → Actions**:

- Secret obrigatório: `TCE_GO_NOTION_TOKEN`
- Variable opcional: `TCE_GO_DAYS_DATA_SOURCE_ID` — somente como override. Sem ela, o sincronizador descobre o data source canônico pelo título `Estudo dia a dia — D001 a D100 | TCE-GO`.

Sem o secret, o workflow periódico continua instalado, mas fica inativo com aviso. O snapshot público versionado permanece utilizável e nenhuma credencial é enviada ao navegador.

<!-- QA final: validação do sync completo e contrato de privacidade. -->
