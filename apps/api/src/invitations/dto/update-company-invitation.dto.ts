import { IsIn } from 'class-validator';

export class UpdateCompanyInvitationDto {
  @IsIn(['active', 'disabled'])
  status!: 'active' | 'disabled';
}
