# DGGASH Architecture Review — Scaling to 500,000 Customers

## Executive Summary

DGGASH is architecturally sound for an ISP with 10,000-50,000 customers. To scale to 500K+, several critical bottlenecks must be addressed across database, caching, background processing, file storage, API design, WebSocket, queue, and deployment. This review identifies each bottleneck with specific remediation steps.

---

## 1. DATABASE

### Current State
- PostgreSQL via Prisma ORM with 50+ models
- No read replicas, no connection pooling config, no partitioning
- Raw SQL queries (`$queryRaw`) in inventory low-stock and customer timeline
- UUID primary keys on all tables (correct for distributed, but slower for B-tree indexes)
- GIN indexes on arrays (technician skills) and full-text search

### Bottlenecks at 500K Customers

| Issue | Impact | Severity |
|-------|--------|----------|
| **Connection exhaustion** — Each NestJS instance opens its own connection pool. At 500K customers with 4+ API instances, connection limits (default 100) will be hit under load | High | CRITICAL |
| **Slow aggregate queries** — `DashboardService.getKPIs()` runs 10 parallel COUNT/AGGREGATE queries. At 500K customers × 500K subscriptions, each takes 2-5s | High | CRITICAL |
| **No read/write splitting** — All queries hit primary. Dashboard analytics compete with transactional writes | Medium | HIGH |
| **UUID index fragmentation** — Random UUIDs cause B-tree page splits on insert, degrading write performance over time | Low | MEDIUM |
| **No table partitioning** — `audit_logs`, `bandwidth_logs`, `notification_logs`, `payments` will grow to billions of rows | High | CRITICAL |
| **N+1 in Prisma includes** — Customer timeline uses multiple `findMany` with `include` causing hidden JOINs | Medium | HIGH |

### Recommendations

1. **Connection Pooling**: Deploy PgBouncer in front of PostgreSQL. Configure Prisma `connection_limit=20` per instance. Target: 100 total connections across all instances.

2. **Read Replicas**: Add 2-3 read replicas for PostgreSQL. Route all dashboard/analytics queries to replicas. Use Prisma's `datasource` replication or a proxy like PgPool-II.

3. **Table Partitioning**: Partition by time for high-volume tables:
   - `audit_logs` → Range partition by `createdAt` (monthly)
   - `bandwidth_logs` → Range partition by `timestamp` (daily)
   - `notification_logs` → Range partition by `createdAt` (monthly)
   - `payments` → Range partition by `receivedAt` (monthly)
   - `background_jobs` → Range partition by `createdAt` (weekly)

4. **Materialized Views**: For dashboard KPIs, create materialized views refreshed every 5 minutes:
   ```sql
   CREATE MATERIALIZED VIEW mv_dashboard_kpis AS
   SELECT ... (pre-computed counts, sums)
   ```
   This replaces 10 separate queries with a single fast read.

5. **ULID or Timestamp-based UUIDs**: Switch from `uuid()` to `gen_random_uuid()` with ULID suffix or use sequential IDs for high-write tables to reduce index fragmentation.

6. **Query Optimization**: Replace Prisma `include` chains with explicit `JOIN` queries via `$queryRaw` for complex reads like customer timeline.

---

## 2. CACHING STRATEGY

### Current State
- No caching layer exists
- Adapter cache is in-memory (`Map<string, NetworkAdapter>`) — lost on restart
- Every API request hits the database directly
- Dashboard KPIs recomputed on every request

### Bottlenecks at 500K Customers

| Issue | Impact | Severity |
|-------|--------|----------|
| **No response caching** — Every dashboard load runs 10+ DB queries | High | CRITICAL |
| **No query caching** — Same customer search runs against DB every time | Medium | HIGH |
| **In-memory adapter cache** — Lost on service restart, no shared state across instances | Medium | HIGH |
| **No rate-limit state** — Throttler is in-memory, resets on restart, not shared | Low | MEDIUM |

### Recommendations

1. **Redis Caching Layer**:
   - Dashboard KPIs: Cache for 60s (`key: dashboard:kpis`)
   - Customer search: Cache for 30s (`key: search:customers:{query_hash}`)
   - Plan list: Cache for 5 minutes
   - Network device status: Cache for 10s (needs near-real-time)
   - Use `CacheModule` from `@nestjs/cache-manager` with Redis store

2. **Session/Token Store**: Move JWT blacklist and refresh tokens to Redis

3. **Distributed Adapter Cache**: Replace `Map<string, NetworkAdapter>` with Redis-backed cache using device connection pool

4. **Rate Limiting**: Use `@nestjs/throttler` with Redis store for distributed rate limiting

5. **Cache Invalidation**: Implement cache invalidation on write operations (TTL-based for most, event-based for critical paths)

---

## 3. BACKGROUND JOBS

### Current State
- `@nestjs/schedule` Cron for billing, WhatsApp reminders, automation
- In-memory job tracking via `BackgroundJob` model (DB-persisted but not queue-based)
- No retry logic, no dead-letter queue, no concurrency control
- All jobs run in the same process as API

### Bottlenecks at 500K Customers

| Issue | Impact | Severity |
|-------|--------|----------|
| **Single-process scheduling** — Only one instance runs cron jobs, creates race conditions | High | CRITICAL |
| **No job queue** — Billing renewal for 500K customers in one cron = timeout | Critical | CRITICAL |
| **No concurrency control** — Multiple cron runs could overlap | High | HIGH |
| **No retry/backoff** — Failed WhatsApp messages never retried properly | Medium | HIGH |
| **Cron runs in API process** — Heavy billing computation blocks API responses | High | HIGH |

### Recommendations

1. **BullMQ with Redis**: Replace all `@nestjs/schedule` cron jobs with BullMQ queues:
   - `billing-renewal` queue — Process subscriptions in batches of 100
   - `whatsapp-send` queue — With rate limiting (Meta API limits: 80 msg/sec for business)
   - `notification` queue — For email/SMS/push
   - `automation` queue — For workflow step processing
   - `network-sync` queue — For device health polling
   - `backup` queue — For database backups

2. **Worker Separation**: Run BullMQ workers in separate processes (or even separate containers). This decouples job processing from API serving.

3. **Job Prioritization**: Define priority levels:
   - CRITICAL: Payment processing, subscription activation
   - HIGH: WhatsApp delivery, network suspension
   - NORMAL: Renewal reminders, report generation
   - LOW: Analytics aggregation, cleanup jobs

4. **Dead Letter Queue**: Jobs that fail after max retries go to DLQ for manual inspection.

5. **Batch Processing**: For 500K customer billing renewal:
   ```
   Cron trigger → Create batch jobs (5000 customers each) → 
   Each batch runs as separate BullMQ job → Process 100 at a time
   ```

6. **Scheduler Redundancy**: Use BullMQ's built-in distributed locking to prevent duplicate job execution across instances.

---

## 4. FILE STORAGE

### Current State
- No file storage service
- Signatures stored as base64 in DB (`Installation.signature`)
- Photos stored as JSON arrays (`Installation.photos`)
- Backup files referenced by path on local disk

### Bottlenecks at 500K Customers

| Issue | Impact | Severity |
|-------|--------|----------|
| **Base64 in DB** — 500K installations × 50KB signatures = 25GB in PostgreSQL | High | CRITICAL |
| **No CDN** — All files served from API, no edge caching | Medium | HIGH |
| **Local file storage** — Not shareable across instances, lost on container restart | Critical | CRITICAL |
| **No file cleanup** — Orphaned files accumulate | Low | MEDIUM |

### Recommendations

1. **Object Storage**: Deploy MinIO (self-hosted S3-compatible) or use AWS S3/Azure Blob:
   - Signatures: Upload to S3, store URL in DB
   - Installation photos: Upload to S3, store URL array in DB
   - Backups: Store in S3 with lifecycle policies
   - Customer documents: Upload to S3

2. **Presigned URLs**: Generate presigned URLs for direct client upload/download, bypassing API for large files.

3. **Image Processing**: Use Sharp (Node.js) for thumbnail generation on upload.

4. **CDN**: Put Cloudflare or CloudFront in front of object storage for global low-latency access.

5. **Migration Plan**: For existing base64 data, create a one-time migration script to extract, upload to S3, and update DB references.

---

## 5. API DESIGN

### Current State
- REST API with versioning (not yet implemented)
- No pagination cursor support (offset-based only)
- No response compression
- No field selection (returns full objects)
- No ETag/caching headers
- Throttling at 100 req/min globally

### Bottlenecks at 500K Customers

| Issue | Impact | Severity |
|-------|--------|----------|
| **Offset pagination degrades** — `OFFSET 100000` scans 100K rows then discards | High | CRITICAL |
| **No field selection** — Returning full customer objects with all includes = 10x bandwidth waste | Medium | HIGH |
| **No response compression** — Large JSON responses uncompressed | Medium | HIGH |
| **No API versioning** — Breaking changes affect all clients | Medium | HIGH |
| **No rate limiting per endpoint** — Login endpoint has same limits as read endpoints | Medium | HIGH |

### Recommendations

1. **Cursor-based Pagination**: Replace offset with cursor pagination for all list endpoints:
   ```json
   { "data": [...], "nextCursor": "eyJpZCI6IjEyMzQifQ==", "hasMore": true }
   ```

2. **GraphQL or Sparse Fieldsets**: For mobile/portal clients, implement field selection via `?fields=id,name,status` or migrate to GraphQL for flexible queries.

3. **Response Compression**: Enable gzip/brotli compression in NestJS:
   ```typescript
   app.use(compression());
   ```

4. **API Versioning**: Implement URI versioning: `/api/v1/customers`, `/api/v2/customers`. Use NestJS `VersioningModule`.

5. **Per-endpoint Rate Limiting**: Different limits for different operations:
   - Auth: 5 req/min
   - Reads: 100 req/min
   - Writes: 30 req/min
   - Reports: 10 req/min

6. **Bulk Operations**: Add bulk endpoints for batch operations (bulk status change, bulk notification, bulk export).

7. **Idempotency Keys**: For payment and subscription operations, require idempotency keys to prevent double-processing.

---

## 6. WEBSOCKET / REAL-TIME

### Current State
- No WebSocket implementation
- Frontend uses polling (React Query with refetch intervals)
- NOC dashboard polls every 5s
- No real-time notifications to admin users

### Bottlenecks at 500K Customers

| Issue | Impact | Severity |
|-------|--------|----------|
| **No live updates** — NOC dashboard, job dashboard require manual refresh | Medium | HIGH |
| **Polling waste** — 50 admin users polling NOC every 5s = 10 req/s wasted | Medium | HIGH |
| **No real-time alerts** — Network outages not pushed to admin screens | Medium | HIGH |

### Recommendations

1. **Socket.IO**: Implement WebSocket via `@nestjs/websockets` with Socket.IO:
   - NOC channel: Real-time device status, alerts, bandwidth
   - Dashboard channel: KPI updates, recent activity
   - Notification channel: Push notifications to admin screens
   - Customer portal: Payment confirmation, ticket updates

2. **Redis Adapter for Socket.IO**: Use `@socket.io/redis-adapter` for multi-instance WebSocket support.

3. **Room-based Broadcasting**: Use Socket.IO rooms for scoped events:
   - `noc:alerts` — All NOC operators
   - `user:{userId}` — Individual user notifications
   - `customer:{customerId}` — Customer portal updates

4. **Heartbeat/Health**: WebSocket connections should include heartbeat for connection quality monitoring.

---

## 7. QUEUE PROCESSING (Event-Driven Architecture)

### Current State
- EventEmitter2 for in-process events
- No external message broker
- Automation engine processes events synchronously in the same process
- WhatsApp messages queued in DB, polled every 5 minutes

### Bottlenecks at 500K Customers

| Issue | Impact | Severity |
|-------|--------|----------|
| **In-process events** — Lost on crash, not shared across instances | Critical | CRITICAL |
| **Synchronous event processing** — Blocks event emitter while processing | High | HIGH |
| **DB-polled queues** — WhatsApp "queue" is a DB table polled every 5 min. At 500K customers, 100K messages/day means massive table scans | High | CRITICAL |

### Recommendations

1. **External Message Broker**: Deploy Redis Streams or Apache Kafka:
   - Replace EventEmitter2 with Redis Streams for cross-instance events
   - Each event type gets its own stream with consumer groups
   - Enable event replay for debugging

2. **Event Sourcing**: For critical business events (payments, subscription changes), implement event sourcing:
   - All state changes produce immutable events
   - Current state is derived from event log
   - Enables full audit trail and time-travel debugging

3. **CQRS (Command Query Responsibility Segregation)**:
   - Separate write models (optimized for transactions)
   - Separate read models (optimized for queries, possibly denormalized)
   - Use events to synchronize write → read models

4. **Dead Letter Queues**: For failed event processing, route to DLQ for inspection and retry.

---

## 8. DEPLOYMENT ARCHITECTURE

### Current State
- Single docker-compose with postgres, redis, api, web, nginx
- Single API instance
- Single PostgreSQL instance
- Local file storage
- No horizontal scaling configuration

### Recommended Production Architecture (500K Customers)

```
                    ┌─────────────┐
                    │   Cloudflare │ (CDN + WAF + DDoS)
                    │   (CDN/WAF)  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │     NGINX   │ (Load Balancer)
                    │   (L4/L7)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐┌────▼────┐┌─────▼─────┐
        │  API #1   ││  API #2 ││  API #3   │ (3-5 instances)
        │ (NestJS)  ││ (NestJS)││ (NestJS)  │
        └─────┬─────┘└────┬────┘└─────┬─────┘
              │            │            │
              └────────────┼────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
  ┌─────▼─────┐    ┌──────▼──────┐    ┌─────▼─────┐
  │ PostgreSQL │    │    Redis     │    │   MinIO    │
  │  Primary   │    │  (Cluster)  │    │  (S3)     │
  │ + 2 Replicas│   │  3 nodes    │    │           │
  └───────────┘    └─────────────┘    └───────────┘
        │
  ┌─────▼─────┐
  │  PgBouncer │ (Connection Pooling)
  └───────────┘

  Separate Worker Containers:
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ BullMQ Worker│  │ BullMQ Worker│  │ BullMQ Worker│
  │ (Billing)    │  │ (WhatsApp)   │  │ (Automation) │
  └──────────────┘  └──────────────┘  └──────────────┘

  Separate Services:
  ┌──────────────┐  ┌──────────────┐
  │ WebSocket    │  │ Cron         │
  │ Server       │  │ Scheduler    │
  │ (Socket.IO)  │  │ (BullMQ)    │
  └──────────────┘  └──────────────┘
```

### Infrastructure Requirements

| Component | Spec | Quantity | Purpose |
|-----------|------|----------|---------|
| API Servers | 4 vCPU, 8GB RAM | 3-5 | NestJS API instances |
| PostgreSQL Primary | 8 vCPU, 32GB RAM, 500GB SSD | 1 | Write operations |
| PostgreSQL Replica | 4 vCPU, 16GB RAM, 500GB SSD | 2 | Read operations |
| PgBouncer | 2 vCPU, 4GB RAM | 1 | Connection pooling |
| Redis Cluster | 4 vCPU, 16GB RAM | 3 | Cache + queues + pub/sub |
| MinIO/S3 | 2 vCPU, 4GB RAM, 2TB | 3 | Object storage |
| BullMQ Workers | 4 vCPU, 8GB RAM | 3 | Background job processing |
| WebSocket Server | 2 vCPU, 4GB RAM | 2 | Real-time updates |
| NGINX | 2 vCPU, 2GB RAM | 2 | Load balancing |
| Monitoring | 4 vCPU, 16GB RAM | 1 | Prometheus + Grafana |

### Key Deployment Practices

1. **Blue-Green Deployments**: Zero-downtime deploys via NGINX upstream switching
2. **Database Migrations**: Use `prisma migrate deploy` with lock file to prevent concurrent migrations
3. **Health Checks**: Every API instance exposes `/system-health` for load balancer health checks
4. **Auto-scaling**: Horizontal pod autoscaler based on CPU (70%) and request rate
5. **Log Aggregation**: ELK Stack or Loki for centralized logging
6. **Distributed Tracing**: OpenTelemetry for request tracing across services

---

## 9. SECURITY AT SCALE

### Current State
- JWT auth with global guards
- RBAC with role-based permissions
- CSRF protection
- Account lockout
- Helmet headers

### Additional Security at 500K Scale

1. **API Gateway**: Deploy Kong or Traefik as API gateway for centralized auth, rate limiting, and logging
2. **Secrets Management**: Use HashiCorp Vault or AWS Secrets Manager instead of env vars
3. **WAF Rules**: Cloudflare WAF rules for SQL injection, XSS, and bot protection
4. **Audit Log Rotation**: Archive audit logs to cold storage after 90 days
5. **Penetration Testing**: Quarterly penetration tests
6. **SOC 2 Compliance**: If selling as SaaS, implement SOC 2 controls

---

## 10. MONITORING & OBSERVABILITY

### Current State
- Basic SystemHealth module checking services
- No metrics collection
- No distributed tracing
- No alerting

### Required Observability Stack

1. **Metrics (Prometheus + Grafana)**:
   - API: Request rate, latency p50/p95/p99, error rate
   - Database: Query duration, connection pool usage, replication lag
   - Redis: Memory usage, hit rate, queue depth
   - Business: Revenue/hour, new customers/day, active sessions

2. **Logging (ELK or Loki)**:
   - Structured JSON logging from all services
   - Correlation IDs for request tracing
   - Log levels: ERROR for alerts, WARN for anomalies, INFO for business events

3. **Tracing (OpenTelemetry)**:
   - Distributed traces across API → Database → Redis → External services
   - Sampling: 100% for errors, 10% for normal requests

4. **Alerting (PagerDuty/OpsGenie)**:
   - Database connection pool > 80%
   - API error rate > 1%
   - Queue depth > 10,000
   - Disk usage > 85%
   - SSL certificate expiry < 30 days

---

## PRIORITY ROADMAP

### Phase 1: Foundation (Week 1-2)
- [ ] Deploy Redis + configure caching for dashboard KPIs
- [ ] Add PgBouncer for connection pooling
- [ ] Enable response compression
- [ ] Add cursor-based pagination for customer lists

### Phase 2: Job Processing (Week 3-4)
- [ ] Deploy BullMQ with Redis
- [ ] Migrate all cron jobs to BullMQ queues
- [ ] Separate worker processes from API
- [ ] Implement batch billing renewal

### Phase 3: Data Layer (Week 5-6)
- [ ] Deploy PostgreSQL read replicas
- [ ] Implement table partitioning for high-volume tables
- [ ] Create materialized views for dashboard
- [ ] Migrate file storage to MinIO/S3

### Phase 4: Real-time (Week 7-8)
- [ ] Implement WebSocket with Socket.IO
- [ ] Real-time NOC dashboard updates
- [ ] Push notifications to admin screens

### Phase 5: Production Hardening (Week 9-10)
- [ ] Deploy Prometheus + Grafana monitoring
- [ ] Implement distributed tracing
- [ ] Set up alerting
- [ ] Load testing with 500K simulated customers
- [ ] Security audit

### Phase 6: Advanced (Week 11-12)
- [ ] Event sourcing for critical paths
- [ ] CQRS for read-heavy operations
- [ ] API versioning
- [ ] GraphQL for flexible queries

---

## CONCLUSION

DGGASH has a solid architectural foundation. The main gaps are:
1. **No caching** — Easy fix with Redis
2. **No job queue** — Critical for billing at scale, fix with BullMQ
3. **No read replicas** — Essential for analytics queries
4. **No table partitioning** — Required for audit/bandwidth logs
5. **No file storage service** — Base64 in DB won't scale

With the 12-week roadmap above, DGGASH can be production-ready for 500K+ customers with enterprise-grade reliability, performance, and observability.
