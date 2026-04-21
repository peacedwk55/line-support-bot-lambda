import { register, collectDefaultMetrics, Counter, Histogram } from 'prom-client'

collectDefaultMetrics()

export const httpRequestCount = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
})

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
})

export const sseConnections = new Counter({
  name: 'sse_connections_total',
  help: 'Total number of SSE connections established',
})

export const webhookEventsTotal = new Counter({
  name: 'webhook_events_total',
  help: 'Total number of webhook events received',
  labelNames: ['result'],
})

export async function metricsPlugin(fastify) {
  fastify.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions?.url || request.url
    const labels = {
      method: request.method,
      route,
      status_code: reply.statusCode,
    }
    httpRequestCount.inc(labels)
    httpRequestDuration.observe(labels, reply.elapsedTime / 1000)
    done()
  })

  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', register.contentType)
    return register.metrics()
  })
}
