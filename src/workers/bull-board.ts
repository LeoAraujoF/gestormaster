import '../lib/env';
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { messageQueue, webhookQueue, healthQueue, warmupQueue } from '../lib/queue';

const app = express();

// Middleware de Basic Auth para proteger a rota /admin/queues
app.use('/admin/queues', (req, res, next) => {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.BULL_BOARD_PASSWORD;

  if (!adminEmail || !adminPass) {
    return res.status(500).send('Acesso Negado: Configuração de segurança ausente no servidor.');
  }

  if (login && password && login === adminEmail && password === adminPass) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="GestorAdmin"');
  res.status(401).send('Acesso Negado: Credenciais Invalidas.');
});

// Configura o adapter do Express
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Cria o Bull Board injetando nossas filas
createBullBoard({
  queues: [
    new BullMQAdapter(messageQueue),
    new BullMQAdapter(webhookQueue),
    new BullMQAdapter(healthQueue),
    new BullMQAdapter(warmupQueue)
  ],
  serverAdapter: serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

const PORT = process.env.BULL_BOARD_PORT || 3001;

app.listen(PORT, () => {
  console.log(`📊 Bull Board UI rodando em: http://localhost:${PORT}/admin/queues`);
});
