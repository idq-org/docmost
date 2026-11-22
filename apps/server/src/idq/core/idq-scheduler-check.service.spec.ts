import { Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  IDQ_INTERVALS,
  IdqSchedulerCheck,
} from './idq-scheduler-check.service';

describe('IdqSchedulerCheck', () => {
  let errors: jest.SpyInstance;

  beforeEach(() => {
    errors = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs an error when ScheduleModule is not registered', () => {
    const moduleRef = {
      get: () => {
        throw new Error('Nest could not find SchedulerRegistry');
      },
    };
    new IdqSchedulerCheck(moduleRef as any).onApplicationBootstrap();
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0][0]).toContain('ScheduleModule');
  });

  it('logs the IDQ intervals that are not scheduled', () => {
    const registry = new SchedulerRegistry();
    const check = new IdqSchedulerCheck({} as any);

    expect(check.checkIntervals(registry)).toEqual(IDQ_INTERVALS);
    expect(errors).toHaveBeenCalledTimes(1);

    errors.mockClear();
    const timers = IDQ_INTERVALS.map((name) => {
      const timer = setInterval(() => undefined, 60_000);
      registry.addInterval(name, timer);
      return timer;
    });
    expect(check.checkIntervals(registry)).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    timers.forEach(clearInterval);
  });
});
