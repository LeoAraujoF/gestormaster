export function parseMessageTemplate(template: string, client: any, userMeta: any = {}) {
  let msg = template || '';

  // 1. Spintax: {Opção1|Opção2|Opção3}
  msg = msg.replace(/\{([^{}]+)\}/g, (match, contents) => {
    // Evita conflitos com variáveis de chaves únicas como {nome} se o usuário misturar
    if (!contents.includes('|')) {
      // Se não tem '|', pode ser uma variável antiga {nome} ou um erro. Vamos ignorar o spintax e devolver a chave.
      return match;
    }
    const parts = contents.split('|');
    const randomPart = parts[Math.floor(Math.random() * parts.length)];
    return randomPart.trim();
  });

  // 2. Variáveis Antigas (Legado, apenas 1 chave)
  msg = msg.replace(/\{nome\}/g, client.name || '');
  if (client.due_date) {
    const [y, m, d] = client.due_date.split('-');
    msg = msg.replace(/\{vencimento\}/g, `${d}/${m}/${y}`);
  }
  msg = msg.replace(/\{valor\}/g, client.plan_value?.toString() || '0');

  // 3. Variáveis Novas (Double Braces)
  msg = msg.replace(/\{\{client_name\}\}/g, client.name || '');
  
  const firstName = client.name ? client.name.split(' ')[0] : '';
  msg = msg.replace(/\{\{primeiro_nome\}\}/g, firstName);
  
  msg = msg.replace(/\{\{plan_value\}\}/g, client.plan_value?.toString() || '0');
  
  if (client.due_date) {
    const [y, m, d] = client.due_date.split('-');
    msg = msg.replace(/\{\{due_date\}\}/g, `${d}/${m}/${y}`);
  }

  msg = msg.replace(/\{\{empresa\}\}/g, userMeta.company_name || userMeta.empresa || '');
  msg = msg.replace(/\{\{telefone_suporte\}\}/g, userMeta.support_phone || '');
  msg = msg.replace(/\{\{pix\}\}/g, userMeta.pix_key || '');
  msg = msg.replace(/\{\{titular_pix\}\}/g, userMeta.pix_name || '');

  return msg;
}
