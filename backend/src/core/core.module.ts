import { Global, Module } from '@nestjs/common';
import { BusService } from '../redis/bus.service';
import { ResultsService } from '../results/results.service';
import { SettingsService } from '../settings/settings.service';
import { SmsService } from '../sms/sms.service';
import { AccessService } from './access.service';
import { AuditService } from './audit.service';
import { RateLimitService } from './rate-limit.service';

/** Cross-cutting services shared by every feature module. */
@Global()
@Module({
  providers: [BusService, SettingsService, AccessService, SmsService, AuditService, RateLimitService, ResultsService],
  exports: [BusService, SettingsService, AccessService, SmsService, AuditService, RateLimitService, ResultsService],
})
export class CoreModule {}
