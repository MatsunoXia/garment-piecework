import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/** 仅用于本地开发/联调，需在 .env 中显式开启 ENABLE_DEV_LOGIN=true */
export class DevLoginDto {
  @IsString()
  @Length(6, 128)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'openid 只能包含字母、数字、下划线和连字符' })
  openid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;
}
