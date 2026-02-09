import fp from 'fastify-plugin';
import cors from '@fastify/cors';

async function corsPlugin(fastify) {
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });
}

export default fp(corsPlugin, { name: 'cors' });
