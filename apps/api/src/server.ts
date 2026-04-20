import { buildApp } from './app';

const start = async () => {
  try {
    const app = await buildApp();
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`API Server running on port ${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
