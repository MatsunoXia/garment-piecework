import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

export class CreateBundleDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  size?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '捆号数量必须大于 0' })
  @Max(1000000)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class BatchCreateBundlesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBundleDto)
  items!: CreateBundleDto[];
}

export class UpdateBundleDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  size?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class ListBundlesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  reported?: number;
}

export class ImportBundleRowDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bundleNo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  size?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '数量必须大于 0' })
  @Max(1000000)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class ConfirmImportBundlesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportBundleRowDto)
  rows!: ImportBundleRowDto[];
}
