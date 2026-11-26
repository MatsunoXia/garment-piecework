import { IsIn } from 'class-validator';

export class UpdateAdminInvitationDto {
  @IsIn(['active', 'disabled'], { message: 'status 只能是 active 或 disabled' })
  status!: 'active' | 'disabled';
}
