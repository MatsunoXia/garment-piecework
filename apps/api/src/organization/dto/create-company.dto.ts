import { IsOptional, IsString, Length } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @Length(2, 100)
  companyName!: string;

  @IsString()
  @Length(2, 50)
  adminName!: string;

  /** 可选：创建公司时同时设置 Web 管理密码（8-64 位） */
  @IsOptional()
  @IsString()
  @Length(8, 64, { message: 'Web 管理密码长度需为 8-64 位' })
  webPassword?: string;
}
