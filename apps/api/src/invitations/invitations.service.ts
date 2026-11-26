import { Injectable } from '@nestjs/common';

import { AccessService } from '../common/auth/access.service.js';
import { BusinessException } from '../common/http/business.exception.js';
import { OperationLogService } from '../common/logging/operation-log.service.js';
import { newId, randomInviteCode } from '../common/utils/token.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operationLog: OperationLogService,
  ) {}

  async listCompanyInvitations(user: AuthUser) {
    const admin = await this.access.requireAdmin(user);

    const rows = await this.prisma.company_invitation_codes.findMany({
      where: { company_id: admin.companyId },
      select: {
        id: true,
        code: true,
        status: true,
        expires_at: true,
        created_at: true,
        admins: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      status:
        row.status === 'active' &&
        row.expires_at &&
        row.expires_at.getTime() < Date.now()
          ? 'expired'
          : row.status,
      isExpired: Boolean(
        row.expires_at && row.expires_at.getTime() < Date.now(),
      ),
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      createdBy: row.admins?.name ?? null,
    }));
  }

  /** 同一公司仅允许一个有效公司NO，已存在时直接返回现有码 */
  async getOrCreateCompanyInvitation(
    user: AuthUser,
    expiresInDays?: number,
  ) {
    const admin = await this.access.requireAdmin(user);

    const active = await this.prisma.company_invitation_codes.findFirst({
      where: { company_id: admin.companyId, status: 'active' },
      select: { id: true, code: true, expires_at: true, created_at: true },
    });

    if (active) {
      return {
        id: active.id,
        code: active.code,
        expiresAt: active.expires_at,
        createdAt: active.created_at,
        created: false,
        notice: '公司已有有效公司NO，员工可直接使用',
      };
    }

    let code = '';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = randomInviteCode(8);
      const exists = await this.prisma.company_invitation_codes.findUnique({
        where: { code: candidate },
        select: { id: true },
      });
      if (!exists) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      throw BusinessException.conflict(
        'INVITE_CODE_GENERATE_FAILED',
        '公司NO生成失败，请重试',
      );
    }

    const expiresAt =
      expiresInDays && expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 86400000)
        : null;
    const id = newId();

    await this.prisma.$transaction(async (tx) => {
      await tx.company_invitation_codes.create({
        data: {
          id,
          company_id: admin.companyId,
          code,
          status: 'active',
          expires_at: expiresAt,
          created_by_admin_id: admin.id,
        },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'company_invitation.create',
          targetType: 'company_invitation',
          targetId: id,
          summary: `创建公司NO ${code}`,
          detail: { code, expiresAt },
        },
        tx,
      );
    });

    return { id, code, expiresAt, created: true };
  }

  async updateCompanyInvitation(
    user: AuthUser,
    invitationId: string,
    status: 'active' | 'disabled',
  ) {
    const admin = await this.access.requireAdmin(user);

    const invitation = await this.prisma.company_invitation_codes.findFirst({
      where: { id: invitationId, company_id: admin.companyId },
      select: { id: true, status: true, code: true },
    });

    if (!invitation) {
      throw BusinessException.notFound(
        'INVITATION_NOT_FOUND',
        '公司NO不存在',
      );
    }

    if (status === 'active') {
      const anotherActive =
        await this.prisma.company_invitation_codes.findFirst({
          where: {
            company_id: admin.companyId,
            status: 'active',
            id: { not: invitation.id },
          },
          select: { id: true },
        });

      if (anotherActive) {
        throw BusinessException.conflict(
          'INVITATION_ALREADY_ACTIVE',
          '公司已有其他有效公司NO，请先停用后再启用该码',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.company_invitation_codes.update({
        where: { id: invitation.id },
        data: { status, updated_at: new Date() },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'company_invitation.update',
          targetType: 'company_invitation',
          targetId: invitation.id,
          summary: `${status === 'disabled' ? '停用' : '启用'}公司NO ${invitation.code}`,
        },
        tx,
      );
    });

    return { message: status === 'disabled' ? '邀请码已停用' : '邀请码已启用' };
  }
}
