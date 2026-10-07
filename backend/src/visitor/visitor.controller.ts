import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { config } from '../config/config';
import { AppError } from '../common/http-error';
import { ClientIp, VisitorId } from '../auth/decorators';
import { VisitorGuard } from '../auth/guards';
import { SessionService } from '../auth/session.service';
import { RateLimitService } from '../core/rate-limit.service';
import { AccessCheckDto, CastVoteDto, RequestOtpDto, VerifyOtpDto } from './visitor.dto';
import { VisitorService } from './visitor.service';

@Controller('api/public')
export class VisitorController {
  constructor(private readonly svc: VisitorService, private readonly sessions: SessionService, private readonly limits: RateLimitService) {}

  /** Everything the visitor page needs in one round trip. */
  @Get('state')
  @Header('Cache-Control', 'no-store')
  state(@Req() req: Request, @ClientIp() ip: string) {
    const tok = this.sessions.read(req, 'mc_v', 'visitor');
    return this.svc.state(ip, tok ? String(tok.sub) : null);
  }

  /** Re-evaluate on-site access with a browser-reported location. */
  @Post('access-check')
  @HttpCode(200)
  async accessCheck(@ClientIp() ip: string, @Body() body: AccessCheckDto) {
    await this.limits.checkIp('access', ip, 60, 6000, 60);
    return this.svc.accessCheck(ip, VisitorService.loc(body.location));
  }

  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(@ClientIp() ip: string, @Body() body: RequestOtpDto) {
    await this.limits.checkIp('otp-ip', ip, 20, 5000, 600); // venue Wi-Fi NAT gets a large budget
    return this.svc.requestOtp(ip, body);
  }

  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(@ClientIp() ip: string, @Body() body: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    await this.limits.checkIp('otp-verify-ip', ip, 60, 10000, 600);
    const visitorId = await this.svc.verifyOtp(body.challengeId, body.code);
    this.sessions.set(res, 'mc_v', { sub: visitorId, typ: 'visitor' }, config.sessions.visitorTtl);
    return { ok: true, session: await this.svc.session(visitorId) };
  }

  @Get('me')
  @UseGuards(VisitorGuard)
  @Header('Cache-Control', 'no-store')
  async me(@VisitorId() visitorId: string, @Res({ passthrough: true }) res: Response) {
    const session = await this.svc.session(visitorId);
    if (!session) { this.sessions.clear(res, 'mc_v'); throw new AppError(401, 'not_verified', 'Session expired.'); }
    return { session };
  }

  @Post('votes')
  @UseGuards(VisitorGuard)
  async vote(@VisitorId() visitorId: string, @ClientIp() ip: string, @Body() body: CastVoteDto, @Res({ passthrough: true }) res: Response) {
    await this.limits.check('vote', visitorId, 30, 60);
    const r = await this.svc.castVote(visitorId, ip, body.categoryId, body.exhibitorId, VisitorService.loc(body.location));
    res.status(201);
    return { ok: true, session: r.session };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    this.sessions.clear(res, 'mc_v');
    return { ok: true };
  }
}
