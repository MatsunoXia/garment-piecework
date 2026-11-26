import { IsString, Length, Matches } from 'class-validator';

export class SelectIdentityDto {
  @IsString()
  @Length(20, 4096)
  selectionToken!: string;

  @IsString()
  @Matches(/^(admin|employee)$/, { message: 'role 只能是 admin 或 employee' })
  role!: 'admin' | 'employee';

  @IsString()
  @Length(1, 64)
  id!: string;
}
