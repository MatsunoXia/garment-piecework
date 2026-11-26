import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

export class CreateSettlementDto {
  @IsUUID('4')
  employeeId!: string;

  @IsUUID('4')
  styleId!: string;

  @IsIn(['cash', 'wechat_transfer', 'other'])
  paymentMethod!: 'cash' | 'wechat_transfer' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class UpdateSettlementDto {
  @IsOptional()
  @IsIn(['cash', 'wechat_transfer', 'other'])
  paymentMethod?: 'cash' | 'wechat_transfer' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,3})?$/, {
    message: '修正金额最多三位小数且不能为负数',
  })
  totalAmount?: string;

  @IsString()
  @Length(2, 200, { message: '请填写修正原因（至少 2 个字）' })
  reason!: string;
}

export class ListSettlementsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  styleId?: string;

  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @IsOptional()
  @IsIn(['cash', 'wechat_transfer', 'other'])
  paymentMethod?: 'cash' | 'wechat_transfer' | 'other';

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

export class SettlementHistoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  styleId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === true || value === 'true' || value === 1 || value === '1';
  })
  settled?: boolean;
}
