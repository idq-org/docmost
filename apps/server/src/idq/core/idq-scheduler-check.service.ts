import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DISABLED_USERS_SWEEP_NAME } from '../api-keys/idq-api-key.service';

/**
 * The @Interval sweeps of IDQ features. Add a name here when a feature adds
 * one.
 */
export const IDQ_INTERVALS = [
  DISABLED_USERS_SWEEP_NAME,
  // IdqMemberMapService
  'idq-member-map-deleted-users',
];

/** How long after bootstrap the intervals are checked. */
const CHECK_DELAY_MS = 10_000;

/**
 * IDQ's @Interval sweeps only run if ScheduleModule.forRoot() is registered,
 * and IDQ doesn't register it: Docmost already does, in TelemetryModule, and
 * registering it twice could fire every interval twice. If an upstream
 * change drops it, the sweeps would silently stop: this check logs an error
 * at startup instead.
 */
@Injectable()
export class IdqSchedulerCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger('IdqSchedulerCheck');

  constructor(private readonly moduleRef: ModuleRef) {}

  onApplicationBootstrap() {
    let registry: SchedulerRegistry;
    try {
      registry = this.moduleRef.get(SchedulerRegistry, { strict: false });
    } catch {
      this.logger.error(
        'ScheduleModule is not registered: the IDQ sweeps ' +
          `(${IDQ_INTERVALS.join(', ')}) will not run. Docmost used to ` +
          'register it in TelemetryModule; register it once in the app.',
      );
      return;
    }
    // The intervals are started by ScheduleModule's own bootstrap hook,
    // whose order relative to this one isn't guaranteed: check a bit later.
    setTimeout(() => this.checkIntervals(registry), CHECK_DELAY_MS).unref();
  }

  /** Returns the missing interval names, after logging them. */
  checkIntervals(registry: SchedulerRegistry): string[] {
    const missing = IDQ_INTERVALS.filter(
      (name) => !registry.doesExist('interval', name),
    );
    if (missing.length > 0) {
      this.logger.error(
        `IDQ sweeps not scheduled: ${missing.join(', ')}. Check that ` +
          'ScheduleModule.forRoot() is registered once in the app.',
      );
    }
    return missing;
  }
}
