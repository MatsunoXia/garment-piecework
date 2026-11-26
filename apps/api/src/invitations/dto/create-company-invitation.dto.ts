import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateCompanyInvitationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;
}
