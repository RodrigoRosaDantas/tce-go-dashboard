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
- variable: `TCE_GO_DAYS_DATA_SOURCE_ID`
- Notion API version: `2026-03-11`

Nenhum token é enviado ao navegador ou gravado no snapshot.
