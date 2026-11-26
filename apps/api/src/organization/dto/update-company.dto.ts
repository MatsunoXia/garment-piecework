import { IsString, Length } from 'class-validator';

export class UpdateCompanyDto {
  @IsString()
  @Length(2, 100, { message: '公司名称长度需为 2-100 个字符' })
  name!: string;
}
