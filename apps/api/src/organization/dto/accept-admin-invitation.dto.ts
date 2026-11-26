import { IsString, Length } from 'class-validator';

export class AcceptAdminInvitationDto {
  @IsString()
  @Length(20, 200)
  token!: string;

  @IsString()
  @Length(2, 50)
  name!: string;
}
