import { All, Controller, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { extractBearerTokenFromHeader } from '../../common/helpers';
import { IdqApiKeyService } from '../api-keys/idq-api-key.service';
import { IdqSettingsService } from '../settings/idq-settings.service';
import { IdqMcpService } from './idq-mcp.service';
import { IdqMcpRateLimitService } from './idq-mcp-rate-limit.service';

function jsonError(
  reply: FastifyReply,
  status: number,
  message: string,
  headers: Record<string, string> = {},
) {
  reply
    .status(status)
    .headers({ 'content-type': 'application/json', ...headers })
    .send(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message },
        id: null,
      }),
    );
}

/**
 * Builds the Web Request the MCP SDK expects. Fastify has already parsed the
 * JSON body, and the SDK takes it as `parsedBody`, so the body isn't copied
 * again (nor its content-length header).
 */
function toWebRequest(req: FastifyRequest): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name === 'content-length') continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
    else headers.set(name, String(value));
  }
  const url = `${req.protocol}://${req.hostname}${req.url}`;
  return new Request(url, { method: req.method, headers });
}

/**
 * IDQ MCP endpoint: https://<instance>/mcp, Streamable HTTP, authenticated
 * with "Authorization: Bearer <IDQ API key>". main.ts already excludes this
 * path from the /api prefix.
 */
@Controller('mcp')
export class IdqMcpController {
  constructor(
    private readonly apiKeyService: IdqApiKeyService,
    private readonly settingsService: IdqSettingsService,
    private readonly rateLimit: IdqMcpRateLimitService,
    private readonly mcpService: IdqMcpService,
  ) {}

  @All()
  @SkipTransform()
  async handle(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const token = extractBearerTokenFromHeader(req);
    const principal = await this.apiKeyService.authenticate(
      token,
      (req.raw as any).workspaceId,
    );
    if (!principal) {
      return jsonError(reply, 401, 'Missing or invalid API key', {
        'www-authenticate': 'Bearer realm="idq-mcp"',
      });
    }

    // Checked before the rate limit, so calls to a disabled workspace don't
    // use up the key's quota.
    const settings = await this.settingsService.get(principal.workspace.id);
    if (!settings.idqMcpEnabled) {
      return jsonError(
        reply,
        403,
        'MCP is disabled for this workspace. An admin can enable it in Settings.',
      );
    }

    const limit = await this.rateLimit.check(
      principal.apiKeyId,
      principal.user.id,
    );
    if (!limit.allowed) {
      return jsonError(reply, 429, 'Too many requests', {
        'retry-after': String(limit.retryAfter),
      });
    }

    const response = await this.mcpService.handler.fetch(toWebRequest(req), {
      parsedBody: req.method === 'POST' ? req.body : undefined,
      authInfo: {
        token: token!,
        clientId: principal.apiKeyId,
        scopes: ['read', 'write'],
        extra: { principal },
      },
    });

    reply.status(response.status);
    response.headers.forEach((value, name) => {
      reply.header(name, value);
    });
    if (!response.body) {
      return reply.send();
    }
    return reply.send(Readable.fromWeb(response.body as any));
  }
}
