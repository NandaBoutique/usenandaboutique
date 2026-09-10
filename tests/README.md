# Verificação da Nanda Boutique

Execute na raiz do projeto, com Node.js 24:

```powershell
node --check script.js
node tests/local-regression.cjs
node tests/browser-regression.cjs
```

A suíte local usa as funções reais do `script.js` sem disparar a interface ou alterar o armazenamento. Verifica normalização de produtos, mídias e caminhos, tamanhos, sacola por variante, bloqueio de pagamento, mensagem do WhatsApp, e-mail, formato de CPF, avaliações, credenciais administrativas estritas, conteúdo tratado como texto e reprodução manual de vídeos.

A suíte de navegador requer Chrome ou Edge. Se necessário, informe o caminho do executável em `CHROME_PATH`. Ela inicia um servidor local em porta disponível e um navegador headless com perfil temporário separado. Não exige dependências npm nem usa o perfil pessoal. Não clica em links válidos do WhatsApp e não envia mensagens.

Fluxos verificados:

- Abertura direta, seis âncoras de navegação, login/cadastro e entrada anônima.
- Cards com nomes, descrição, preços e tamanhos; bloqueio de compra sem tamanho e consulta para opções indisponíveis.
- Sacola com variantes distintas, quantidades, remoção, persistência e pagamento obrigatório por clique/teclado.
- Login estrito de administrador, persistência do papel, lápis, edição de história/contatos e gestão de produtos.
- Cadastro local, login posterior e ausência de senha e CPF brutos no armazenamento.
- Avaliações privadas, uma por e-mail, persistência e exclusão restrita à autoria local.
- Vídeos com controles e `playsinline`, sem autoplay, e carrossel operável por teclado.
- Quatro borboletas com cargas, pétalas, entrega da foto do produto, cinco emojis no rastro e movimento reduzido.
- Controles clicáveis e página/diálogos sem rolagem horizontal em 320, 390, 768, 1024, 1440 e 1920 px.
- Funcionamento da sacola com armazenamento bloqueado e ausência de erros de JavaScript ou recursos locais.

`artifacts/` recebe capturas e `resultado.json` com data e falhas da execução. O navegador de teste fecha ao terminar; seu perfil fica no diretório temporário do sistema. Capturas de execuções anteriores podem continuar na pasta e não representam aprovação automática da versão atual.

As contas e avaliações são demonstrações locais. Esses testes verificam a interface e suas regras; não comprovam autenticação de servidor, validação real de CPF, compartilhamento de dados ou processamento de pagamentos.
