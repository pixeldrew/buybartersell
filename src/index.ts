import dotenvFlow from 'dotenv-flow';
dotenvFlow.config();

import express from 'express';
import { connectToWhatsApp } from './whatsapp';
import { connectDB } from './db';
import router from './routes';

const PORT = process.env.PORT ?? 3000;

const app = express();
app.use(express.json());
app.use('/', router);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

connectDB()
  .then(() => connectToWhatsApp())
  .catch(console.error);
