import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

export class CreateReportDto {
  @IsUUID('4')
  styleId!: string;

  @IsUUID('4')
  styleProcessId!: string;

  @IsUUID('4')
  bundleId!: string;
}

export class BatchCreateReportsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateReportDto)
  items!: CreateReportDto[];
}

export class AdminProxyReportDto extends CreateReportDto {
  @IsUUID('4')
  employeeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class AdminProxyBatchDto {
  @IsUUID('4')
  employeeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateReportDto)
  items!: CreateReportDto[];
}

export class RejectReportDto {
  @IsString()
  @Length(2, 200, { message: '驳回原因至少 2 个字，最多 200 个字' })
  reason!: string;
}

export class BatchReviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsIn(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @Length(2, 200)
  reason?: string;
}

export class ListReportsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  styleId?: string;

  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  keyword?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

export class MyReportsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';

  @IsOptional()
  @IsUUID('4')
  styleId?: string;
}
