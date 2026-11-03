import assert from 'node:assert/strict'
import { test } from 'node:test'

import { startStubServer } from './support/stub-server.ts'
import { writeTempService } from './support/temp-service.ts'
import { readUsage } from '../src/core/usage.ts'

const NORMAL_BODY = {
  location: { directory: '/workspace' },
  data: {
    workspace: { id: 'ws_1', name: 'Default', usageURL: 'https://opencode.ai/console' },
    go: {
      rolling: { percent: 13, limited: false, resetsAt: 1_793_618_267_000 },
      weekly: { percent: 40, limited: false, resetsAt: 1_794_000_000_000 },
      monthly: { percent: 62, limited: true, resetsAt: 1_795_000_000_000 },
    },
    budgets: [],
  },
}

test('sends Basic auth as opencode and parses a normal response', async () => {
  const stub = await startStubServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(NORMAL_BODY))
  })

  try {
    const service = await writeTempService(stub.url)
    const result = await readUsage({
      serviceFile: service.serviceFile,
      now: () => 1_700_000_000_000,
    })

    const [request] = stub.requests
    assert.ok(request, 'adapter made one HTTP request')
    assert.equal(request.method, 'GET')
    assert.equal(request.url, '/api/experimental/usage/limits')
    const expectedAuth = `Basic ${Buffer.from(`opencode:${service.password}`).toString('base64')}`
    assert.equal(request.headers.authorization, expectedAuth)

    assert.deepEqual(result, {
      status: 'online',
      fetchedAt: 1_700_000_000_000,
      snapshot: {
        rolling: { percent: 13, limited: false, resetsAt: 1_793_618_267_000 },
        weekly: { percent: 40, limited: false, resetsAt: 1_794_000_000_000 },
        monthly: { percent: 62, limited: true, resetsAt: 1_795_000_000_000 },
      },
    })
  } finally {
    await stub.close()
  }
})

test('classifies data: null as "not signed in"', async () => {
  const stub = await startStubServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ location: { directory: '/workspace' }, data: null, budgets: [] }))
  })

  try {
    const service = await writeTempService(stub.url)
    const result = await readUsage({ serviceFile: service.serviceFile })

    assert.deepEqual(result, { status: 'unauthenticated' })
  } finally {
    await stub.close()
  }
})

test('classifies unparseable JSON as "error"', async () => {
  const stub = await startStubServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"data": {"go": {"rolling":')
  })

  try {
    const service = await writeTempService(stub.url)
    const result = await readUsage({ serviceFile: service.serviceFile })

    assert.deepEqual(result, { status: 'error' })
  } finally {
    await stub.close()
  }
})

test('classifies a response with missing window fields as "error"', async () => {
  const stub = await startStubServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        data: {
          go: {
            rolling: { limited: false, resetsAt: 1_793_618_267_000 },
            weekly: { percent: 40, limited: false, resetsAt: 1_794_000_000_000 },
            monthly: { percent: 62, limited: true, resetsAt: 1_795_000_000_000 },
          },
        },
      }),
    )
  })

  try {
    const service = await writeTempService(stub.url)
    const result = await readUsage({ serviceFile: service.serviceFile })

    assert.deepEqual(result, { status: 'error' })
  } finally {
    await stub.close()
  }
})

test('classifies a request timeout as "error"', async () => {
  const stub = await startStubServer(() => {
    // Intentionally never respond.
  })

  try {
    const service = await writeTempService(stub.url)
    const startedAt = performance.now()
    const result = await readUsage({ serviceFile: service.serviceFile, timeoutMs: 120 })
    const elapsed = performance.now() - startedAt

    assert.deepEqual(result, { status: 'error' })
    assert.ok(elapsed < 2_000, `gave up in ${Math.round(elapsed)}ms`)
  } finally {
    await stub.close()
  }
})

test('classifies connection refused as "offline"', async () => {
  // Port 1 on loopback has no listener, so connect() is refused immediately.
  const service = await writeTempService('http://127.0.0.1:1')
  const result = await readUsage({ serviceFile: service.serviceFile, timeoutMs: 2_000 })

  assert.deepEqual(result, { status: 'offline' })
})

test('classifies a missing service file as "offline"', async () => {
  const result = await readUsage({
    serviceFile: '/nonexistent/opencode-dashboard/service.json',
  })

  assert.deepEqual(result, { status: 'offline' })
})

test('failure results never contain the service password', async () => {
  const stub = await startStubServer((_req, res) => {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end('{"error":"boom"}')
  })

  try {
    const service = await writeTempService(stub.url)
    const results = await Promise.all([
      readUsage({ serviceFile: service.serviceFile }),
      readUsage({ serviceFile: '/nonexistent/opencode-dashboard/service.json' }),
    ])

    for (const result of results) {
      assert.ok(!JSON.stringify(result).includes(service.password))
    }
  } finally {
    await stub.close()
  }
})

test('classifies a 401 as "not signed in"', async () => {
  const stub = await startStubServer((_req, res) => {
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'unauthorized' }))
  })

  try {
    const service = await writeTempService(stub.url)
    const result = await readUsage({ serviceFile: service.serviceFile })

    assert.deepEqual(result, { status: 'unauthenticated' })
  } finally {
    await stub.close()
  }
})
