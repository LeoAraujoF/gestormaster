import * as cheerio from 'cheerio';

// Define the structure for the extracted clients
export interface TVdeCasaClient {
  externalId: string;
  loginIptv: string;
  passwordIptv: string;
  expirationDate: string;
  maxConnections: number;
  status: 'Ativo' | 'Suspenso';
  nameNotes: string;
}

export class TVdeCasaAdapter {
  private panelUrl = 'https://pg.tvdc.site';

  /**
   * Faz o login e retorna a string de cookies autenticados.
   */
  async authenticate(username: string, password: string): Promise<string> {
    // 1. Pegar CSRF e Cookie Inicial
    const getRes = await fetch(`${this.panelUrl}/login`, {
      method: 'GET',
      headers: { 'User-Agent': 'Gestor-Integration-Bot' },
    });

    const initialCookiesRaw = getRes.headers.getSetCookie();
    const initialCookies = initialCookiesRaw.map(c => c.split(';')[0]).join('; ');
    const html = await getRes.text();
    
    const csrfMatch = html.match(/name="csrf_token"\s+value="(.*?)"/i);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    // 2. Enviar POST do Login
    const loginData = new URLSearchParams();
    if (csrfToken) loginData.append('csrf_token', csrfToken);
    loginData.append('login', username);
    loginData.append('senha', password);

    const postRes = await fetch(`${this.panelUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': initialCookies,
        'Referer': `${this.panelUrl}/login`,
        'User-Agent': 'Gestor-Integration-Bot'
      },
      body: loginData.toString(),
      redirect: 'manual'
    });

    // Se o POST retornar um novo Set-Cookie, o painel atualizou a sessão
    const postCookiesRaw = postRes.headers.getSetCookie();
    let authCookies = initialCookies;
    
    if (postCookiesRaw.length > 0) {
      authCookies = postCookiesRaw.map(c => c.split(';')[0]).join('; ');
    }
    
    // Validando se logou (normalmente 302 com redirect pro dashboard)
    if (postRes.status !== 302 && postRes.status !== 200) {
      throw new Error(`Falha de autenticação. Status: ${postRes.status}`);
    }

    return authCookies;
  }

  /**
   * Puxa e faz o parse da lista de clientes
   */
  async fetchClients(authCookies: string): Promise<TVdeCasaClient[]> {
    const clients: TVdeCasaClient[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore && page < 20) { // Limite de 20 páginas por segurança
      const clientsUrl = `${this.panelUrl}/clientes?pagina=${page}&itens=100&filtro=&status=`;

      const res = await fetch(clientsUrl, {
        method: 'GET',
        headers: {
          'Cookie': authCookies,
          'User-Agent': 'Gestor-Integration-Bot'
        }
      });

      if (res.status !== 200) {
        throw new Error(`Falha ao acessar lista de clientes na página ${page}.`);
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      
      const elements = $('button[data-cliente-id]');
      if (elements.length === 0) {
        hasMore = false;
        break;
      }

      elements.each((_, el) => {
        const $btn = $(el);
        
        const isTrial = $btn.attr('data-is-trial');
        if (isTrial === '1') {
          return; // Pula todos os Testes
        }
        
        const externalId = $btn.attr('data-cliente-id');
        const loginIptv = $btn.attr('data-username');
        const passwordIptv = $btn.attr('data-password');
        const expirationDate = $btn.attr('data-vencimento');
        const enabled = $btn.attr('data-enabled');
        const maxConnections = parseInt($btn.attr('data-max-connections') || '1', 10);
        
        const $tr = $btn.closest('tr');
        const nameNotes = $tr.find('td:first-child small.text-muted').text().trim();

        if (externalId && loginIptv) {
          clients.push({
            externalId,
            loginIptv,
            passwordIptv: passwordIptv || '',
            expirationDate: expirationDate || '',
            maxConnections,
            status: enabled === '1' ? 'Ativo' : 'Suspenso',
            nameNotes
          });
        }
      });

      page++;
    }

    return clients;
  }
}
