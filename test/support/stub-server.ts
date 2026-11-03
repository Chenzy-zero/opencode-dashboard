import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export type StubRequest = {
  method: string | undefined
  url: string | undefined
  headers: IncomingMessage['headers']
}

export type StubServer = {
  /** Base URL, e.g. http://127.0.0.1:53123 */
  url: string
  requests: StubRequest[]
  close: () => Promise<void>
}

/**
 * Starts a throwaway HTTP server on a random loopback port. Tests use it as the
 * "local OpenCode service" so the adapter is exercised over a real socket.
 */
export async function startStubServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<StubServer> {
  const requests: StubRequest[] = []
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, headers: req.headers })
    handler(req, res)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  }
}
