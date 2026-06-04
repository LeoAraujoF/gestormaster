import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

// Força o fuso horário do Brasil para o Node.js no Docker
process.env.TZ = 'America/Sao_Paulo';
