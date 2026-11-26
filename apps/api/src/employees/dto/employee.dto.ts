import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class JoinEmployeeDto {
  @IsString()
  @Length(4, 32)
  inviteCode!: string;

  @IsString()
  @Length(1, 50)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  workshopIds?: string[];
}

export class PreviewInviteDto {
  @IsString()
  @Length(4, 32)
  inviteCode!: string;
}

export class CreateEmployeeDto {
  @IsString()
  @Length(1, 50)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  workshopIds?: string[];
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class SetEmployeeWorkshopsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  workshopIds!: string[];
}

export class CreateRebindTokenDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([10, 30, 60, 120, 1440])
  expiresInMinutes?: number;
}

export class RebindWechatDto {
  @IsString()
  @Length(20, 200)
  token!: string;
}

export class ListEmployeesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  keyword?: string;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';

  @IsOptional()
  @IsUUID('4')
  workshopId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  bound?: number;
}
