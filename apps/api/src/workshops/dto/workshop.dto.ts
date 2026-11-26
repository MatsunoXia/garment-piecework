import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateWorkshopDto {
  @IsString()
  @Length(1, 50, { message: '车间名称长度需为 1-50 个字符' })
  name!: string;
}

export class UpdateWorkshopDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}

export class ListWorkshopsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  includeDisabled?: number;
}
