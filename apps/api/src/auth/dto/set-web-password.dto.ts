import { IsString, Length } from 'class-validator';

export class SetWebPasswordDto {
  @IsString()
  @Length(8, 64, { message: '管理密码长度需为 8-64 位' })
  password!: string;
}
