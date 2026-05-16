import './env.ts';
import express from 'express';
import { connectToWhatsApp } from './whatsapp.ts';
import { connectDB } from './db.ts';
import router from './routes.ts';
import { createOidcMiddleware } from './auth.ts';

const PORT = process.env.PORT ?? 3000;

const app = express();
app.use(express.json());
app.use(createOidcMiddleware());
app.use('/', router);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

connectDB()
  .then(() => connectToWhatsApp())
  .catch(console.error);
