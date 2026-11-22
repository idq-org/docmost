import { hashApiKey, IdqApiKeyService } from './idq-api-key.service';

const KEY = 'idq_' + 'a'.repeat(43);

/**
 * A Kysely stand-in: every builder method returns the same chain, and the
 * execute methods resolve to the given result.
 */
function chain(result: unknown, calls: string[] = []) {
  const proxy: any = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (prop === 'then') return undefined;
        if (prop.startsWith('execute')) return async () => result;
        return (...args: unknown[]) => {
          calls.push(`${prop}(${JSON.stringify(args)})`);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

function setup(row: Record<string, unknown> | undefined) {
  const updates: string[] = [];
  const selects: string[] = [];
  const db = {
    selectFrom: () => chain(row, selects),
    updateTable: (table: string) => {
      updates.push(table);
      return chain({ numUpdatedRows: 1n });
    },
  };
  const user = { id: 'user-1', deactivatedAt: null, deletedAt: null };
  const workspace = { id: 'workspace-1' };
  const userRepo = { findById: jest.fn().mockResolvedValue(user) };
  const workspaceRepo = { findById: jest.fn().mockResolvedValue(workspace) };
  const service = new IdqApiKeyService(
    db as any,
    userRepo as any,
    workspaceRepo as any,
  );
  return { service, userRepo, updates, selects, user, workspace };
}

const validRow = () => ({
  id: 'key-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  expiresAt: null,
  lastUsedAt: new Date(),
});

describe('IdqApiKeyService.authenticate', () => {
  it('returns the principal of a valid key, looked up by its hash', async () => {
    const { service, user, workspace, selects } = setup(validRow());
    const principal = await service.authenticate(KEY, 'workspace-1');
    expect(principal).toEqual({ apiKeyId: 'key-1', user, workspace });
    expect(selects.join()).toContain(hashApiKey(KEY));
  });

  it('refuses a key of another workspace', async () => {
    const { service, userRepo } = setup(validRow());
    expect(await service.authenticate(KEY, 'workspace-2')).toBeNull();
    expect(userRepo.findById).not.toHaveBeenCalled();
  });

  it('refuses a request without a workspace', async () => {
    const { service } = setup(validRow());
    expect(await service.authenticate(KEY, undefined)).toBeNull();
    expect(await service.authenticate(KEY, null)).toBeNull();
  });

  it('refuses an expired key', async () => {
    const { service } = setup({
      ...validRow(),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await service.authenticate(KEY, 'workspace-1')).toBeNull();
  });

  it('refuses unknown keys and malformed ones without a query', async () => {
    const { service, selects } = setup(undefined);
    expect(await service.authenticate(KEY, 'workspace-1')).toBeNull();
    selects.length = 0;
    expect(await service.authenticate('wrong', 'workspace-1')).toBeNull();
    expect(await service.authenticate(undefined, 'workspace-1')).toBeNull();
    expect(selects).toHaveLength(0);
  });

  it('refuses and revokes the keys of a deactivated user', async () => {
    const { service, user, updates } = setup(validRow());
    (user as any).deactivatedAt = new Date();
    expect(await service.authenticate(KEY, 'workspace-1')).toBeNull();
    expect(updates).toEqual(['idqApiKeys']);
  });
});
