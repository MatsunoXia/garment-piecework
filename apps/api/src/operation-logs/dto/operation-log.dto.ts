import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

export class ListOperationLogsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  actionType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  targetType?: string;

  @IsOptional()
  @IsUUID('4')
  targetId?: string;

  @IsOptional()
  @IsIn(['admin', 'employee', 'system'])
  operatorType?: 'admin' | 'employee' | 'system';

  @IsOptional()
  @IsUUID('4')
  operatorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
