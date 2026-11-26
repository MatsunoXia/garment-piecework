import { Injectable } from '@nestjs/common';

import { AccessService } from '../common/auth/access.service.js';
import { BusinessException } from '../common/http/business.exception.js';
import { OperationLogService } from '../common/logging/operation-log.service.js';
import {
  hashPassword,
  hashToken,
  newId,
  randomInviteCode,
  randomToken,
} from '../common/utils/token.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operationLog: OperationLogService,
  ) {}

  private async generateCompanyNo(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `C${randomToken(6)
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 8)
        .toUpperCase()}`;

      const exists = await this.prisma.companies.findUnique({
        where: { company_no: candidate },
        select: { id: true },
      });

      if (!exists) return candidate;
    }

    throw BusinessException.conflict(
      'COMPANY_NO_GENERATE_FAILED',
      '公司编号生成失败，请重试',
    );
  }

  /** 待加入用户创建公司，创建者成为创始管理员 */
  async createCompany(
    user: AuthUser,
    companyName: string,
    adminName: string,
    webPassword?: string,
  ) {
    if (user.role !== 'pending' || !user.openid) {
      throw BusinessException.forbidden(
        'FORBIDDEN',
        '当前身份不能创建公司，请使用未加入公司的微信账号',
      );
    }

    const existingAdmin = await this.prisma.admins.findFirst({
      where: { openid: user.openid, status: 'active' },
      select: { id: true },
    });

    if (existingAdmin) {
      throw BusinessException.conflict(
        'ALREADY_ADMIN',
        '当前微信已经是某公司的管理员，不能重复创建公司',
      );
    }

    const companyId = newId();
    const adminId = newId();
    const invitationId = newId();
    const companyNo = await this.generateCompanyNo();
    const inviteCode = randomInviteCode(8);
    const name = companyName.trim();

    await this.prisma.$transaction(async (tx) => {
      await tx.companies.create({
        data: {
          id: companyId,
          company_no: companyNo,
          name,
          status: 'active',
          ...(webPassword
            ? { admin_password_hash: hashPassword(webPassword) }
            : {}),
        },
      });

      await tx.admins.create({
        data: {
          id: adminId,
          company_id: companyId,
          openid: user.openid,
          name: adminName.trim(),
          status: 'active',
          is_founder: true,
        },
      });

      // 自动创建一个员工邀请码，方便管理员立刻分享给员工
      await tx.company_invitation_codes.create({
        data: {
          id: invitationId,
          company_id: companyId,
          code: inviteCode,
          status: 'active',
          created_by_admin_id: adminId,
        },
      });

      await this.operationLog.record(
        {
          companyId,
          operatorType: 'admin',
          operatorId: adminId,
          actionType: 'company.create',
          targetType: 'company',
          targetId: companyId,
          summary: `创建公司：${name}（编号 ${companyNo}）`,
          detail: { companyName: name, companyNo, adminName: adminName.trim() },
        },
        tx,
      );
    });

    return {
      companyId,
      companyNo,
      companyName: name,
      adminId,
      adminName: adminName.trim(),
      inviteCode,
    };
  }

  async getCurrentCompany(user: AuthUser) {
    const admin = await this.access.requireAdmin(user);

    const company = await this.prisma.companies.findUnique({
      where: { id: admin.companyId },
      select: {
        id: true,
        company_no: true,
        name: true,
        status: true,
        created_at: true,
        admin_password_hash: true,
      },
    });

    if (!company) {
      throw BusinessException.notFound('COMPANY_NOT_FOUND', '公司不存在');
    }

    return {
      id: company.id,
      companyNo: company.company_no,
      name: company.name,
      status: company.status,
      createdAt: company.created_at,
      webPasswordConfigured: Boolean(company.admin_password_hash),
      isFounder: admin.isFounder,
      adminName: admin.name,
    };
  }

  async updateCurrentCompany(user: AuthUser, name: string) {
    const admin = await this.access.requireAdmin(user);
    const trimmed = name.trim();

    const before = await this.prisma.companies.findUniqueOrThrow({
      where: { id: admin.companyId },
      select: { name: true },
    });

    if (before.name === trimmed) return { message: '公司名称未发生变化' };

    await this.prisma.$transaction(async (tx) => {
      await tx.companies.update({
        where: { id: admin.companyId },
        data: { name: trimmed, updated_at: new Date() },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'company.update',
          targetType: 'company',
          targetId: admin.companyId,
          summary: `修改公司名称：${before.name} → ${trimmed}`,
          detail: { before: before.name, after: trimmed },
        },
        tx,
      );
    });

    return { message: '公司信息已更新' };
  }

  async disableCurrentCompany(user: AuthUser) {
    const admin = await this.access.requireAdmin(user);

    if (!admin.isFounder) {
      throw BusinessException.forbidden(
        'FOUNDER_ONLY',
        '只有创始管理员可以停用公司',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.companies.update({
        where: { id: admin.companyId },
        data: { status: 'disabled', updated_at: new Date() },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'company.disable',
          targetType: 'company',
          targetId: admin.companyId,
          summary: `停用公司：${admin.companyName}`,
        },
        tx,
      );
    });

    return {
      message: '公司已停用。停用后不能继续报工、审核和结算，历史数据保留。',
    };
  }

  async createAdminInvitation(user: AuthUser, expiresInDays?: number) {
    const admin = await this.access.requireAdmin(user);
    const token = randomToken(32);
    const expiresAt =
      expiresInDays && expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 86400000)
        : null;
    const invitationId = newId();

    await this.prisma.$transaction(async (tx) => {
      await tx.admin_invitations.create({
        data: {
          id: invitationId,
          company_id: admin.companyId,
          token_hash: hashToken(token),
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
          actionType: 'admin_invitation.create',
          targetType: 'admin_invitation',
          targetId: invitationId,
          summary: `创建管理员邀请${expiresAt ? `，有效期至 ${expiresAt.toLocaleString('zh-CN')}` : ''}`,
          detail: { expiresAt },
        },
        tx,
      );
    });

    return {
      invitationId,
      invitationToken: token,
      expiresAt,
      notice:
        '同一邀请可被多人使用，每次使用都会留下记录。请通过安全渠道发送给需要加入的管理员。',
    };
  }

  async listAdminInvitations(user: AuthUser) {
    const admin = await this.access.requireAdmin(user);

    const rows = await this.prisma.admin_invitations.findMany({
      where: { company_id: admin.companyId },
      select: {
        id: true,
        status: true,
        expires_at: true,
        created_at: true,
        admins: { select: { name: true } },
        _count: { select: { admin_invitation_uses: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      status:
        row.status === 'active' &&
        row.expires_at &&
        row.expires_at.getTime() < Date.now()
          ? 'expired'
          : row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      createdBy: row.admins?.name ?? null,
      usedCount: row._count.admin_invitation_uses,
    }));
  }

  async updateAdminInvitation(
    user: AuthUser,
    invitationId: string,
    status: 'active' | 'disabled',
  ) {
    const admin = await this.access.requireAdmin(user);
    const invitation = await this.prisma.admin_invitations.findFirst({
      where: { id: invitationId, company_id: admin.companyId },
      select: { id: true, status: true },
    });

    if (!invitation) {
      throw BusinessException.notFound(
        'INVITATION_NOT_FOUND',
        '管理员邀请不存在',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.admin_invitations.update({
        where: { id: invitation.id },
        data: { status, updated_at: new Date() },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'admin_invitation.update',
          targetType: 'admin_invitation',
          targetId: invitation.id,
          summary: `${status === 'disabled' ? '停用' : '启用'}管理员邀请`,
        },
        tx,
      );
    });

    return { message: status === 'disabled' ? '邀请已停用' : '邀请已启用' };
  }

  async acceptAdminInvitation(user: AuthUser, token: string, name: string) {
    if (user.role !== 'pending' || !user.openid) {
      throw BusinessException.forbidden(
        'FORBIDDEN',
        '当前身份不能使用管理员邀请',
      );
    }

    const invitation = await this.prisma.admin_invitations.findFirst({
      where: {
        token_hash: hashToken(token),
        status: 'active',
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
      select: {
        id: true,
        company_id: true,
        companies: { select: { name: true, status: true } },
      },
    });

    if (!invitation) {
      throw BusinessException.notFound(
        'INVITATION_INVALID',
        '邀请不存在、已停用或已过期',
      );
    }

    this.access.assertCompanyActive(
      invitation.companies.status,
      invitation.companies.name,
    );

    const existingAdmin = await this.prisma.admins.findFirst({
      where: { openid: user.openid, status: 'active' },
      select: { id: true },
    });

    if (existingAdmin) {
      throw BusinessException.conflict(
        'ALREADY_ADMIN',
        '当前微信已经是管理员，不能重复加入',
      );
    }

    const adminId = newId();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.admins.create({
          data: {
            id: adminId,
            company_id: invitation.company_id,
            openid: user.openid,
            name: name.trim(),
            status: 'active',
            is_founder: false,
          },
        });

        await tx.admin_invitation_uses.create({
          data: {
            id: newId(),
            company_id: invitation.company_id,
            invitation_id: invitation.id,
            admin_id: adminId,
          },
        });

        await this.operationLog.record(
          {
            companyId: invitation.company_id,
            operatorType: 'admin',
            operatorId: adminId,
            actionType: 'admin_invitation.accept',
            targetType: 'admin',
            targetId: adminId,
            summary: `${name.trim()} 通过邀请加入公司成为管理员`,
          },
          tx,
        );
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw BusinessException.conflict(
          'ALREADY_ADMIN',
          '该微信已加入公司，或此邀请已被当前微信使用',
        );
      }
      throw error;
    }

    return {
      adminId,
      companyId: invitation.company_id,
      companyName: invitation.companies.name,
      role: 'admin',
      message: '已成功加入公司，请重新登录获取管理员身份',
    };
  }

  async listAdmins(user: AuthUser) {
    const admin = await this.access.requireAdmin(user);

    return this.prisma.admins.findMany({
      where: { company_id: admin.companyId, status: 'active' },
      select: {
        id: true,
        name: true,
        status: true,
        is_founder: true,
        joined_at: true,
      },
      orderBy: [{ is_founder: 'desc' }, { joined_at: 'asc' }],
    });
  }

  async deactivateAdmin(user: AuthUser, adminId: string) {
    const actor = await this.access.requireAdmin(user);

    if (actor.id === adminId) {
      throw BusinessException.badRequest(
        'CANNOT_REMOVE_SELF',
        '不能停用自己的管理员账号',
      );
    }

    const target = await this.prisma.admins.findFirst({
      where: { id: adminId, company_id: actor.companyId },
      select: { id: true, name: true, is_founder: true, status: true },
    });

    if (!target) {
      throw BusinessException.notFound('ADMIN_NOT_FOUND', '管理员不存在');
    }

    if (target.is_founder) {
      throw BusinessException.forbidden(
        'FOUNDER_PROTECTED',
        '创始管理员不能被停用',
      );
    }

    if (target.status !== 'active') {
      return { message: '该管理员已经停用' };
    }

    await this.prisma.$transaction(async (tx) => {
      // 锁定公司行，避免并发停用导致最后一名管理员被移除
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${actor.companyId}::uuid FOR UPDATE`;

      const activeCount = await tx.admins.count({
        where: { company_id: actor.companyId, status: 'active' },
      });

      if (activeCount <= 1) {
        throw BusinessException.conflict(
          'LAST_ADMIN_PROTECTED',
          '公司至少需要保留一名有效管理员，不能停用最后一名管理员',
        );
      }

      await tx.admins.update({
        where: { id: target.id },
        data: { status: 'removed', updated_at: new Date() },
      });

      await this.operationLog.record(
        {
          companyId: actor.companyId,
          operatorType: 'admin',
          operatorId: actor.id,
          actionType: 'admin.deactivate',
          targetType: 'admin',
          targetId: target.id,
          summary: `停用管理员：${target.name}`,
        },
        tx,
      );
    });

    return { message: '管理员已停用' };
  }
}
