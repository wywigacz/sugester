import { buildApp } from './app.js';
import { config } from './config/index.js';

const start = async () => {
  const app = await buildApp({
    prettyLog: config.NODE_ENV === 'development',
  });

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`Sugester API running on http://localhost:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
