import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { summarizeMemberMap } from './idq-member-map';
import {
  IdqAdminUpdateDto,
  IdqSetMemberLocationDto,
} from './idq-member-map.controller';

describe('summarizeMemberMap', () => {
  it('counts members, provinces and regions', () => {
    const map = summarizeMemberMap(
      [
        { provinceCode: 'BO', members: 2 },
        { provinceCode: 'FC', members: 5 },
        { provinceCode: 'RM', members: 1 },
      ],
      [],
    );
    expect(map.totals).toEqual({ members: 8, provinces: 3, regions: 2 });
    // Most members first
    expect(map.provinces.map((p) => p.code)).toEqual(['FC', 'BO', 'RM']);
  });

  it('lists names only for the named members, by province', () => {
    const map = summarizeMemberMap(
      [
        { provinceCode: 'BO', members: 3 },
        { provinceCode: 'RM', members: 1 },
      ],
      [
        { provinceCode: 'BO', id: 'u1', name: 'Ada', avatarUrl: null },
        { provinceCode: 'BO', id: 'u2', name: 'Bruno', avatarUrl: 'a.png' },
      ],
    );
    const bo = map.provinces.find((p) => p.code === 'BO');
    expect(bo).toEqual({
      code: 'BO',
      members: 3,
      named: [
        { id: 'u1', name: 'Ada', avatarUrl: null },
        { id: 'u2', name: 'Bruno', avatarUrl: 'a.png' },
      ],
    });
    expect(map.provinces.find((p) => p.code === 'RM')?.named).toEqual([]);
  });

  it('leaves out codes that are no longer provinces, from the totals too', () => {
    const map = summarizeMemberMap(
      [
        { provinceCode: 'BO', members: 1 },
        { provinceCode: 'ZZ', members: 4 },
      ],
      [{ provinceCode: 'ZZ', id: 'u1', name: 'Ada', avatarUrl: null }],
    );
    expect(map.totals).toEqual({ members: 1, provinces: 1, regions: 1 });
    expect(JSON.stringify(map)).not.toContain('Ada');
  });

  it('is empty with no members', () => {
    expect(summarizeMemberMap([], [])).toEqual({
      totals: { members: 0, provinces: 0, regions: 0 },
      provinces: [],
    });
  });
});

describe('IdqSetMemberLocationDto', () => {
  async function check(body: object) {
    const dto = plainToInstance(IdqSetMemberLocationDto, body);
    const errors = await validate(dto, { whitelist: true });
    return { dto, valid: errors.length === 0 };
  }

  it('accepts a province code in any case', async () => {
    const { dto, valid } = await check({
      visibility: 'named',
      provinceCode: ' bo ',
    });
    expect(valid).toBe(true);
    expect(dto.provinceCode).toBe('BO');
  });

  it('needs a known province to be on the map', async () => {
    expect((await check({ visibility: 'count' })).valid).toBe(false);
    expect(
      (await check({ visibility: 'count', provinceCode: null })).valid,
    ).toBe(false);
    expect(
      (await check({ visibility: 'count', provinceCode: 'XX' })).valid,
    ).toBe(false);
    expect(
      (await check({ visibility: 'named', provinceCode: 'Bologna' })).valid,
    ).toBe(false);
  });

  it('needs no province to leave the map', async () => {
    expect((await check({ visibility: 'hidden' })).valid).toBe(true);
    expect(
      (await check({ visibility: 'hidden', provinceCode: 'XX' })).valid,
    ).toBe(true);
  });

  it('refuses other visibilities', async () => {
    expect(
      (await check({ visibility: 'public', provinceCode: 'BO' })).valid,
    ).toBe(false);
  });
});

describe('IdqAdminUpdateDto', () => {
  async function valid(body: object) {
    const dto = plainToInstance(IdqAdminUpdateDto, body);
    return (await validate(dto, { whitelist: true })).length === 0;
  }
  const userId = '01a1ba7f-bce4-771f-8475-06298620b82d';

  it('validates every member of the list', async () => {
    expect(
      await valid({
        members: [
          { userId, visibility: 'named', provinceCode: 'bo' },
          { userId, visibility: 'hidden' },
        ],
      }),
    ).toBe(true);
    expect(
      await valid({
        members: [{ userId, visibility: 'named', provinceCode: 'XX' }],
      }),
    ).toBe(false);
    expect(
      await valid({
        members: [{ userId: 'nope', visibility: 'hidden' }],
      }),
    ).toBe(false);
    expect(await valid({ members: 'all' })).toBe(false);
  });

  it('takes at most 1000 members at once', async () => {
    const members = Array.from({ length: 1001 }, () => ({
      userId,
      visibility: 'hidden',
    }));
    expect(await valid({ members })).toBe(false);
  });
});
