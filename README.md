# Planejamento Estratégico · Núcleo IPCVT

Painel online para brainstorm de equipes e funções do Núcleo IPCVT.

## Organização de equipes

- nomes completos em chips compactos;
- banco de pessoas mais estreito e com quebra automática;
- integrantes dentro das funções em etiquetas horizontais;
- indicador por cor e contador de funções;
- clique em uma pessoa para destacar todas as aparições;
- arrastar para adicionar em novas funções;
- botão × para retirar somente daquela função;
- sincronização online pelo Cloud Firestore;
- importação de integrantes da escala geral;
- acesso pelo Google, sem senha compartilhada;
- autorização por e-mail na opção **Administrar autorizações → Planejamento Estratégico** do Portal da Comissão;
- cores alinhadas ao Planner IPCVT, com modos claro e grafite.

## Publicação pelo GitHub Pages

A ferramenta é publicada no GitHub Pages do repositório `NucleoIPCVT/Portal`,
no diretório `planejamento-estrategico/`. O cartão da Comissão aponta para
`https://nucleoipcvt.github.io/Portal/planejamento-estrategico/`.

Para atualizar os arquivos publicados depois de alterar o código-fonte:

1. Execute `npm ci` e `npm run build` neste repositório.
2. Copie o conteúdo da pasta `dist/` para `Portal/planejamento-estrategico/`.
3. Publique as mudanças na ramificação `main` do repositório `Portal`.

O `base` relativo no Vite permite servir a página em um subdiretório.
Os dados continuam no Firebase; o GitHub Pages hospeda somente a interface.

## Autorização e proteção de dados

O aplicativo usa Firebase Authentication (Google) e verifica o documento
`tatico_acessos/{email-em-minúsculas}` no Cloud Firestore. Apenas quem estiver
com `ativo: true` entra no quadro de equipes. A verificação é contínua: suspender
o cadastro retira o acesso da interface.

**Atenção:** a proteção da interface não substitui as regras de segurança do
Firestore. O documento `app_ipcvt/planner_dados` precisa exigir o mesmo login
Google e o cadastro ativo de `tatico_acessos` para leitura e gravação. O próprio
usuário deve poder consultar seu documento de autorização (`get`); a gestão dos
cadastros deve continuar restrita aos administradores da Comissão. Não deixe
`allow read, write: if true` no documento do quadro.

Exemplo da condição a incorporar às regras existentes do Firestore (sem duplicar
os blocos `match` já presentes):

```javascript
function planejamentoEstrategicoAutorizado() {
  return request.auth != null
    && request.auth.token.email_verified == true
    && request.auth.token.firebase.sign_in_provider == 'google.com'
    && exists(/databases/$(database)/documents/tatico_acessos/$(request.auth.token.email.lower()))
    && get(/databases/$(database)/documents/tatico_acessos/$(request.auth.token.email.lower())).data.ativo == true;
}

// No match /app_ipcvt/planner_dados existente:
allow read, write: if planejamentoEstrategicoAutorizado();

// No match /tatico_acessos/{email} existente, manter administração restrita
// e permitir ao usuário Google ler somente o cadastro do seu próprio e-mail:
allow get: if request.auth != null
  && request.auth.token.email_verified == true
  && request.auth.token.firebase.sign_in_provider == 'google.com'
  && request.auth.token.email.lower() == email;
```

As regras devem ser adaptadas ao conjunto completo já publicado para não
interromper outros sistemas. Confirme ainda que `nucleoipcvt.github.io` consta
em Firebase Authentication → Domínios autorizados.


## Etapa 5

- Barra lateral recolhível em formato de gaveta.
- Cabeçalho reduzido a uma faixa com o botão Pessoas.
- Área útil ampliada para o brainstorm.
