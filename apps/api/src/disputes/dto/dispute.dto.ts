import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

export class CreateDisputeDto {
  @IsUUID('4')
  reportId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ResolveDisputeDto {
  @IsIn(
    ['confirm_original', 'confirm_challenger', 'reject_original_report'],
    {
      message:
        'result 只能是 confirm_original、confirm_challenger 或 reject_original_report',
    },
  )
  result!:
    | 'confirm_original'
    | 'confirm_challenger'
    | 'reject_original_report';

  @IsOptional()
  @IsString()
  @Length(2, 200)
  reason?: string;
}

export class ListDisputesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['pending', 'resolved', 'terminated'])
  status?: 'pending' | 'resolved' | 'terminated';

  @IsOptional()
  @IsUUID('4')
  styleId?: string;
}
