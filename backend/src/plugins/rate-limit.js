import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

async function rateLimitPlugin(fastify) {
  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });
}

export default fp(rateLimitPlugin, { name: 'rate-limit' });
