import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

export class StyleProcessInputDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  groupName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,9}(\.\d{1,3})?$/, {
    message: '工序单价最多三位小数且不能为负数',
  })
  unitPrice?: string;

  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;
}

export class CreateStyleDto {
  @IsString()
  @Length(1, 100, { message: '款式名称长度需为 1-100 个字符' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;

  @IsOptional()
  @IsIn(['all', 'workshops'])
  productionScope?: 'all' | 'workshops';

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  workshopIds?: string[];

  @IsOptional()
  @IsUUID('4')
  templateId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StyleProcessInputDto)
  processes?: StyleProcessInputDto[];
}

export class UpdateStyleDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;

  @IsOptional()
  @IsIn(['all', 'workshops'])
  productionScope?: 'all' | 'workshops';

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  workshopIds?: string[];
}

export class ListStylesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['production', 'completed', 'settled', 'archived'])
  status?: 'production' | 'completed' | 'settled' | 'archived';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsUUID('4')
  workshopId?: string;
}
