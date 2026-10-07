import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { config } from '../config/config';
import { AppError } from '../common/http-error';
import { ClientIp, VisitorId } from '../auth/decorators';
import { VisitorGuard } from '../auth/guards';
import { SessionService } from '../auth/session.service';
import { RateLimitService } from '../core/rate-limit.service';
import { AccessCheckDto, CastVoteDto, RequestOtpDto, VerifyOtpDto, VoteQrEntryDto } from './visitor.dto';
import { VisitorService } from './visitor.service';
import { VoteQrService } from '../core/vote-qr.service';

@Controller('api/public')
export class VisitorController {
  constructor(
    private readonly svc: VisitorService,
    private readonly sessions: SessionService,
    private readonly limits: RateLimitService,
    private readonly voteQr: VoteQrService,
  ) {}

  /** Everything the visitor page needs in one round trip. */
  @Get('state')
  @Header('Cache-Control', 'no-store')
  async state(@Req() req: Request, @ClientIp() ip: string) {
    const tok = this.sessions.read(req, 'mc_v', 'visitor');
    const entry = this.sessions.read(req, 'mc_q', 'vote_entry');
    return {
      ...(await this.svc.state(ip, tok ? String(tok.sub) : null)),
      qrEntryRequired: config.voteQr.entryRequired,
      qrEntryAllowed: !!entry && entry.ip === this.voteQr.ipBinding(ip),
    };
  }

  /** Re-evaluate on-site access with a browser-reported location. */
  @Post('access-check')
  @HttpCode(200)
  async accessCheck(@ClientIp() ip: string, @Body() body: AccessCheckDto) {
    await this.limits.checkIp('access', ip, 60, 6000, 60);
    return this.svc.accessCheck(ip, VisitorService.loc(body.location));
  }

  /** Exchange a rotating QR code for a short-lived, IP-bound browser grant. */
  @Post('qr-entry')
  @HttpCode(200)
  async qrEntry(@ClientIp() ip: string, @Body() body: VoteQrEntryDto, @Res({ passthrough: true }) res: Response) {
    await this.limits.checkIp('vote-qr-entry', ip, 30, 500, 60);
    if (!this.voteQr.isValid(body.token)) {
      throw new AppError(403, 'vote_qr_expired', 'This voting QR has expired. Scan the current code on the venue screen.');
    }
    this.sessions.set(res, 'mc_q', { typ: 'vote_entry', ip: this.voteQr.ipBinding(ip) }, '10m');
    return { ok: true };
  }

  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(@ClientIp() ip: string, @Req() req: Request, @Body() body: RequestOtpDto) {
    this.requireVoteQr(req, ip);
    await this.limits.checkIp('otp-ip', ip, 20, 5000, 600); // venue Wi-Fi NAT gets a large budget
    return this.svc.requestOtp(ip, body);
  }

  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(@ClientIp() ip: string, @Req() req: Request, @Body() body: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    this.requireVoteQr(req, ip);
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

  private requireVoteQr(req: Request, ip: string) {
    if (!config.voteQr.entryRequired) return;
    const grant = this.sessions.read(req, 'mc_q', 'vote_entry');
    if (!grant || grant.ip !== this.voteQr.ipBinding(ip)) {
      throw new AppError(403, 'vote_qr_required', 'Scan the current voting QR code on the venue screen before requesting a code.');
    }
  }
}
