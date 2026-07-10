# Núcleo IPCVT Planner

Painel visual para organizar integrantes do Núcleo IPCVT por áreas e funções.

## Versão 0.2

- Sincronização online pelo Cloud Firestore.
- Documento utilizado: `app_ipcvt/planner_dados`.
- Atualizações em tempo real entre aparelhos.
- Cópia local mantida como segurança caso a internet falhe.

## Executar localmente

```bash
npm install
npm run dev
```

## Publicação

O projeto está preparado para Vite e pode ser publicado na Vercel.

## Atenção

A conexão online depende das regras do Cloud Firestore permitirem leitura e escrita no documento `app_ipcvt/planner_dados`. A versão inicial ainda não possui autenticação de usuários; adicione login e regras restritas antes de compartilhar o painel amplamente.

## Versão 0.3.0
- Tela de acesso por senha compartilhada.
- Importação manual de integrantes do documento `app_ipcvt/escala_geral_dados`.
- A importação adiciona somente nomes novos ao Planner e não altera a escala original.
