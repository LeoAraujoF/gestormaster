import fs from 'fs';

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================
const LOGIN_GET_URL = 'https://pg.tvdc.site/login'; // Para pegar o csrf inicial
const POST_LOGIN_URL = 'https://pg.tvdc.site/login'; // Para enviar os dados
const CLIENTES_URL = 'https://pg.tvdc.site/clientes?filtro=1805268763&status=&itens=20'; // Lista de clientes

const USERNAME = 'thamyresluz';
const PASSWORD = 'MiG081826@';

// Nomes dos campos baseados na aba Payload
const FIELD_USERNAME = 'login'; 
const FIELD_PASSWORD = 'senha';
// ============================================================================

async function testarLoginEClientes() {
  console.log('1. Iniciando teste de integração com painel IPTV...');
  
  try {
    // ------------------------------------------------------------------------
    // PASSO 1: Acessar a página de Login (GET)
    // Objetivo: Pegar o csrf_token gerado pelo servidor e os cookies da sessão
    // ------------------------------------------------------------------------
    console.log(`\n-> Acessando ${LOGIN_GET_URL} para pegar tokens...`);
    const getLoginRes = await fetch(LOGIN_GET_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    const initialCookiesRaw = getLoginRes.headers.getSetCookie();
    // Ex: ['PHPSESSID=123; path=/', 'remember_me=abc; path=/']
    const initialCookies = initialCookiesRaw.map(c => c.split(';')[0]).join('; ');
    const loginHtml = await getLoginRes.text();
    
    console.log('   Cookies iniciais obtidos:', initialCookies);

    const csrfMatch = loginHtml.match(/name="csrf_token"\s+value="(.*?)"/i);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';
    console.log('   Token CSRF encontrado:', csrfToken || 'NÃO ENCONTRADO');

    // ------------------------------------------------------------------------
    // PASSO 2: Enviar as credenciais de Login (POST)
    // ------------------------------------------------------------------------
    console.log(`\n-> Enviando credenciais (POST) para ${POST_LOGIN_URL}...`);
    const loginData = new URLSearchParams();
    if (csrfToken) loginData.append('csrf_token', csrfToken);
    loginData.append(FIELD_USERNAME, USERNAME);
    loginData.append(FIELD_PASSWORD, PASSWORD);

    const postLoginRes = await fetch(POST_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': initialCookies,
        'Referer': LOGIN_GET_URL,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      body: loginData.toString(),
      redirect: 'manual' // Evita seguir o 302 automaticamente
    });

    console.log(`   Status do Login: ${postLoginRes.status}`);
    console.log(`   Redirecionando para (Location): ${postLoginRes.headers.get('location')}`);
    
    // O painel atualiza o PHPSESSID depois do login, precisamos pegar ele!
    const postCookiesRaw = postLoginRes.headers.getSetCookie();
    let authCookies = '';
    if (postCookiesRaw.length > 0) {
      authCookies = postCookiesRaw.map(c => c.split(';')[0]).join('; ');
    } else {
      authCookies = initialCookies;
    }
    
    console.log('   Cookies da Sessão Logada:', authCookies);

    // ------------------------------------------------------------------------
    // PASSO 3: Acessar a página de Clientes com a sessão logada (GET)
    // ------------------------------------------------------------------------
    console.log(`\n-> Acessando lista de clientes em ${CLIENTES_URL}...`);
    const clientesRes = await fetch(CLIENTES_URL, {
      method: 'GET',
      headers: {
        'Cookie': authCookies, // Usando os cookies que confirmam que estamos logados
        'Referer': 'https://pg.tvdc.site/dashboard',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    console.log(`   Status da página de Clientes: ${clientesRes.status}`);
    
    const htmlClientes = await clientesRes.text();
    fs.writeFileSync('clientes_debug.html', htmlClientes);
    console.log('\n✅ SUCESSO! O HTML da página de clientes foi salvo no arquivo "clientes_debug.html".');

  } catch (err) {
    console.error('\n❌ ERRO DURANTE O TESTE:', err);
  }
}

testarLoginEClientes();
