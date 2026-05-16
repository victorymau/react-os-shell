import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { config } from './config';
import { errorHandler, notFound } from './errors';
import { startSessionSweeper } from './session';
import { authRouter } from './routes/auth';
import { mailRouter } from './routes/mail';
import { calendarRouter } from './routes/calendar';

const app = express();

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use('/api/auth', authRouter);
app.use('/api/mail', mailRouter);
app.use('/api/calendar', calendarRouter);

app.use(notFound);
app.use(errorHandler);

startSessionSweeper();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[react-os-shell server] listening on http://localhost:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`[react-os-shell server] CORS origin: ${config.corsOrigin}`);
});
