import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('Monitoring', () => {
    it('/api/v1/monitoring/health (GET) - should return health status without auth', () => {
      return request(app.getHttpServer())
        .get('/api/v1/monitoring/health')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/api/v1/monitoring/live (GET) - should return liveness', () => {
      return request(app.getHttpServer())
        .get('/api/v1/monitoring/live')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('alive');
        });
    });

    it('/api/v1/monitoring/ready (GET) - should return readiness', () => {
      return request(app.getHttpServer())
        .get('/api/v1/monitoring/ready')
        .expect(200);
    });
  });

  describe('Auth', () => {
    it('/api/v1/auth/login (POST) - should require credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(401);
    });
  });

  describe('Protected routes', () => {
    it('/api/v1/dashboard/kpis (GET) - should require auth', () => {
      return request(app.getHttpServer())
        .get('/api/v1/dashboard/kpis')
        .expect(401);
    });

    it('/api/v1/customers (GET) - should require auth', () => {
      return request(app.getHttpServer())
        .get('/api/v1/customers')
        .expect(401);
    });
  });
});
