import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

// The controller's collaborators are replaced by plain objects below; these
// mocks only keep their modules (and what they import) from loading.
jest.mock('./idq-mcp.service', () => ({ IdqMcpService: class {} }));
jest.mock('../api-keys/idq-api-key.service', () => ({
  IdqApiKeyService: class {},
}));
jest.mock('../settings/idq-settings.service', () => ({
  IdqSettingsService: class {},
}));
jest.mock('./idq-mcp-rate-limit.service', () => ({
  IdqMcpRateLimitService: class {},
}));

import { IdqMcpController } from './idq-mcp.controller';

const principal = {
  apiKeyId: 'key-1',
  user: { id: 'user-1' },
  workspace: { id: 'workspace-1' },
};

function fakeReply() {
  const reply: any = {
    statusCode: 200,
    sent: undefined as unknown,
    headersSent: {} as Record<string, string>,
    raw: Object.assign(new EventEmitter(), { writableFinished: false }),
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    headers(values: Record<string, string>) {
      Object.assign(reply.headersSent, values);
      return reply;
    },
    header(name: string, value: string) {
      reply.headersSent[name] = value;
      return reply;
    },
    send(body?: unknown) {
      reply.sent = body;
      // Drain a streamed body, as Fastify would, so no stream stays open
      if (body instanceof Readable) body.resume();
      return reply;
    },
  };
  return reply;
}

function fakeRequest() {
  return {
    method: 'POST',
    protocol: 'http',
    hostname: 'localhost',
    url: '/mcp',
    headers: {
      authorization: 'Bearer idq_test',
      'content-type': 'application/json',
    },
    body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    raw: { workspaceId: 'workspace-1' },
  } as any;
}

function controller(opts: {
  principal?: unknown;
  enabled?: boolean;
  limit?: { allowed: boolean; retryAfter: number };
}) {
  const deps = {
    apiKeys: {
      authenticate: jest.fn().mockResolvedValue(opts.principal ?? null),
    },
    settings: {
      get: jest.fn().mockResolvedValue({ idqMcpEnabled: opts.enabled ?? true }),
    },
    rateLimit: {
      check: jest
        .fn()
        .mockResolvedValue(opts.limit ?? { allowed: true, retryAfter: 0 }),
    },
    mcp: {
      handler: {
        fetch: jest.fn().mockResolvedValue(
          new Response('{"jsonrpc":"2.0","id":1,"result":{}}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      },
    },
  };
  const instance = new IdqMcpController(
    deps.apiKeys as any,
    deps.settings as any,
    deps.rateLimit as any,
    deps.mcp as any,
  );
  return { instance, deps };
}

describe('IdqMcpController', () => {
  it('answers 401 without a valid key, checking it against the workspace of the request', async () => {
    const { instance, deps } = controller({});
    const reply = fakeReply();
    await instance.handle(fakeRequest(), reply);
    expect(deps.apiKeys.authenticate).toHaveBeenCalledWith(
      'idq_test',
      'workspace-1',
    );
    expect(reply.statusCode).toBe(401);
    expect(reply.headersSent['www-authenticate']).toContain('Bearer');
    expect(deps.mcp.handler.fetch).not.toHaveBeenCalled();
  });

  it('answers 403 while MCP is disabled, without using the quota', async () => {
    const { instance, deps } = controller({ principal, enabled: false });
    const reply = fakeReply();
    await instance.handle(fakeRequest(), reply);
    expect(reply.statusCode).toBe(403);
    expect(deps.rateLimit.check).not.toHaveBeenCalled();
  });

  it('answers 429 with Retry-After over the rate limit', async () => {
    const { instance, deps } = controller({
      principal,
      limit: { allowed: false, retryAfter: 35 },
    });
    const reply = fakeReply();
    await instance.handle(fakeRequest(), reply);
    expect(deps.rateLimit.check).toHaveBeenCalledWith('key-1', 'user-1');
    expect(reply.statusCode).toBe(429);
    expect(reply.headersSent['retry-after']).toBe('35');
    expect(JSON.parse(reply.sent as string).error.message).toBe(
      'Too many requests',
    );
    expect(deps.mcp.handler.fetch).not.toHaveBeenCalled();
  });

  it('hands the request to the SDK with the principal, but not the key', async () => {
    const { instance, deps } = controller({ principal });
    const reply = fakeReply();
    await instance.handle(fakeRequest(), reply);
    expect(reply.statusCode).toBe(200);
    const [request, options] = deps.mcp.handler.fetch.mock.calls[0];
    expect(options.authInfo.extra.principal).toBe(principal);
    expect(JSON.stringify(options.authInfo)).not.toContain('idq_test');
    expect(options.parsedBody).toEqual(fakeRequest().body);

    // The request is aborted if the client goes away before the answer
    expect(request.signal.aborted).toBe(false);
    reply.raw.emit('close');
    expect(request.signal.aborted).toBe(true);
  });

  it('does not abort a request whose answer was sent', async () => {
    const { instance, deps } = controller({ principal });
    const reply = fakeReply();
    await instance.handle(fakeRequest(), reply);
    const [request] = deps.mcp.handler.fetch.mock.calls[0];
    reply.raw.writableFinished = true;
    reply.raw.emit('close');
    expect(request.signal.aborted).toBe(false);
  });
});
