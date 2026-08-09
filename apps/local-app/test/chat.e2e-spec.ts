import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { setupTestDb, teardownTestDb } from './helpers/test-db';

process.env.SKIP_PREFLIGHT = '1';

describe('Retired Chat API (E2E)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    setupTestDb();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    teardownTestDb();
  });

  it.each([
    { method: 'GET' as const, url: '/api/chat/threads' },
    { method: 'POST' as const, url: '/api/chat/threads/direct' },
    { method: 'GET' as const, url: '/api/chat/settings' },
    { method: 'PUT' as const, url: '/api/chat/settings' },
  ])('does not register $method $url', async ({ method, url }) => {
    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(404);
  });
});
