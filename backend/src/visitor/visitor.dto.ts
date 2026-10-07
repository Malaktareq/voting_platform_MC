import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MaxLength, ValidateIf, ValidateNested } from 'class-validator';

export class LocationDto {
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
  @ValidateIf((_, value) => value !== undefined) @IsNumber() @Min(0) accuracy?: number;
}

export class AccessCheckDto {
  @IsOptional() @ValidateNested() @Type(() => LocationDto) location?: LocationDto;
}

export class RequestOtpDto {
  @IsString() @MaxLength(200) name: string;
  @IsString() @MaxLength(40) phone: string;
  @IsOptional() @IsBoolean() consent?: boolean;
  @IsOptional() @ValidateNested() @Type(() => LocationDto) location?: LocationDto;
}

export class VerifyOtpDto {
  @IsUUID() challengeId: string;
  @IsString() @MaxLength(20) code: string;
}

export class CastVoteDto {
  @IsInt() categoryId: number;
  @IsInt() exhibitorId: number;
  @IsOptional() @ValidateNested() @Type(() => LocationDto) location?: LocationDto;
}
