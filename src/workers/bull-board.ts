import '../lib/env';
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { messageQueue, webhookQueue, healthQueue, warmupQueue } from '../lib/queue';

const app = express();

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
