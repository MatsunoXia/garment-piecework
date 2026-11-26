import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class WebLoginDto {
  /** 公司编号或公司全称 */
  @IsString()
  @Length(1, 100)
  company!: string;

  @IsString()
  @Length(6, 64)
  password!: string;

  /** 指定以哪位管理员身份登录，不填则使用创始管理员 */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  adminName?: string;
}
