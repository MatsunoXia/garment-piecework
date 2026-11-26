import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** 统一分页参数，pageSize 上限 200 防止一次拉取过多数据 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须是整数' })
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须是整数' })
  @Min(1)
  @Max(200, { message: 'pageSize 最大为 200' })
  pageSize: number = 20;

  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }

  get take(): number {
    return this.pageSize;
  }
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageResult<T>(
  items: T[],
  total: number,
  query: PaginationQueryDto,
): PageResult<T> {
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
