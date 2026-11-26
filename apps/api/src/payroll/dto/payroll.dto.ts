import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === 1 || value === '1';
};

export class StyleEmployeesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  keyword?: string;
}

export class EmployeePayrollQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  styleId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  settled?: boolean;
}

export class StylePayrollQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  settled?: boolean;
}
