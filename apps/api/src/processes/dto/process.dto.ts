import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateStyleProcessDto {
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
  @IsInt()
  sortOrder?: number;
}

export class UpdateStyleProcessDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  groupName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class ChangePriceDto {
  @IsString()
  @Matches(/^\d{1,9}(\.\d{1,3})?$/, {
    message: '工价最多三位小数且不能为负数',
  })
  unitPrice!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class TemplateItemDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  groupName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class CreateProcessTemplateDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;

  @IsArray()
  @ArrayUnique((item: TemplateItemDto) => item.name)
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDto)
  items!: TemplateItemDto[];
}

export class UpdateProcessTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique((item: TemplateItemDto) => item.name)
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDto)
  items?: TemplateItemDto[];
}
