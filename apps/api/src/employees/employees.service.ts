import { Injectable } from '@nestjs/common';

import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccessService } from '../common/auth/access.service.js';
import { pageResult } from '../common/dto/pagination.dto.js';
import { BusinessException } from '../common/http/business.exception.js';
import { OperationLogService } from '../common/logging/operation-log.service.js';
import {
  hashToken,
  newId,
  randomToken,
} from '../common/utils/token.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateEmployeeDto,
  ListEmployeesQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto.js';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operationLog: OperationLogService,
  ) {}

  private maskOpenid(openid: string): string {
    if (openid.length <= 8) return `${openid.slice(0, 2)}****`;
    return `${openid.slice(0, 4)}****${openid.slice(-4)}`;
  }

  /** 在事务内原子分配员工编号（公司内从 1 递增，行级锁避免并发重复） */
  private async nextEmployeeNo(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ last_number: number }>>(
      Prisma.sql`
        INSERT INTO employee_number_counters (id, company_id, last_number)
        VALUES (${newId()}::uuid, ${companyId}::uuid, 1)
        ON CONFLICT (company_id)
        DO UPDATE SET last_number = employee_number_counters.last_number + 1
        RETURNING last_number
      `,
    );

    const value = rows[0]?.last_number;
    if (!value) {
      throw BusinessException.conflict(
        'EMPLOYEE_NO_GENERATE_FAILED',
        '员工编号分配失败，请重试',
      );
    }

    return String(value).padStart(4, '0');
  }

  private async resolveWorkshops(companyId: string, workshopIds: string[]) {
    if (workshopIds.length === 0) return [];

    const workshops = await this.prisma.workshops.findMany({
      where: { company_id: companyId, id: { in: workshopIds } },
      select: { id: true, name: true, status: true },
    });

    if (workshops.length !== workshopIds.length) {
      throw BusinessException.badRequest(
        'WORKSHOP_NOT_FOUND',
        '部分车间不存在或不属于当前公司',
      );
    }

    return workshops;
  }

  async previewInvitation(inviteCode: string) {
    const invitation = await this.prisma.company_invitation_codes.findUnique({
      where: { code: inviteCode.trim().toUpperCase() },
      select: {
        status: true,
        expires_at: true,
        companies: { select: { name: true, status: true } },
      },
    });

    if (!invitation) {
      throw BusinessException.notFound(
        'INVITE_CODE_INVALID',
        '公司NO不存在或已失效，请向老板确认',
      );
    }

    if (invitation.status !== 'active') {
      throw BusinessException.conflict('INVITE_CODE_DISABLED', '该公司NO已停用');
    }

    if (invitation.expires_at && invitation.expires_at.getTime() < Date.now()) {
      throw BusinessException.conflict('INVITE_CODE_EXPIRED', '该公司NO已过期');
    }

    if (invitation.companies.status !== 'active') {
      throw BusinessException.conflict(
        'COMPANY_DISABLED',
        '该公司已停用，无法加入',
      );
    }

    return { companyName: invitation.companies.name };
  }

  /** 员工通过公司NO加入公司 */
  async joinByInvitation(
    user: AuthUser,
    inviteCode: string,
    name: string,
    workshopIds: string[] = [],
  ) {
    if (user.role !== 'pending' || !user.openid) {
      throw BusinessException.forbidden(
        'FORBIDDEN',
        '当前身份不能加入新公司，请使用未绑定员工身份的微信账号',
      );
    }

    const invitation = await this.prisma.company_invitation_codes.findUnique({
      where: { code: inviteCode.trim().toUpperCase() },
      select: {
        id: true,
        code: true,
        company_id: true,
        status: true,
        expires_at: true,
        companies: { select: { name: true, status: true } },
      },
    });

    if (!invitation) {
      throw BusinessException.notFound(
        'INVITE_CODE_INVALID',
        '公司NO不存在或已失效，请向老板确认',
      );
    }

    if (invitation.status !== 'active') {
      throw BusinessException.conflict('INVITE_CODE_DISABLED', '该公司NO已停用');
    }

    if (invitation.expires_at && invitation.expires_at.getTime() < Date.now()) {
      throw BusinessException.conflict('INVITE_CODE_EXPIRED', '该公司NO已过期');
    }

    this.access.assertCompanyActive(
      invitation.companies.status,
      invitation.companies.name,
    );

    const existingBinding =
      await this.prisma.employee_wechat_bindings.findUnique({
        where: { openid: user.openid },
        select: {
          employee_id: true,
          employees: { select: { name: true, employee_no: true } },
        },
      });

    if (existingBinding) {
      throw BusinessException.conflict(
        'WECHAT_ALREADY_BOUND',
        `当前微信已绑定员工「${existingBinding.employees.name}（${existingBinding.employees.employee_no}）」，不能重复加入。如需更换绑定，请联系管理员生成重新绑定口令。`,
      );
    }

    const workshops = await this.resolveWorkshops(
      invitation.company_id,
      workshopIds,
    );
    const employeeId = newId();
    const trimmedName = name.trim();

    const employee = await this.prisma.$transaction(async (tx) => {
      const employeeNo = await this.nextEmployeeNo(tx, invitation.company_id);

      await tx.employees.create({
        data: {
          id: employeeId,
          company_id: invitation.company_id,
          employee_no: employeeNo,
          name: trimmedName,
          status: 'active',
        },
      });

      await tx.employee_wechat_bindings.create({
        data: {
          id: newId(),
          company_id: invitation.company_id,
          employee_id: employeeId,
          openid: user.openid,
        },
      });

      if (workshops.length > 0) {
        await tx.employee_workshops.createMany({
          data: workshops.map((workshop) => ({
            id: newId(),
            company_id: invitation.company_id,
            employee_id: employeeId,
            workshop_id: workshop.id,
          })),
        });
      }

      await this.operationLog.record(
        {
          companyId: invitation.company_id,
          operatorType: 'employee',
          operatorId: employeeId,
          actionType: 'employee.join',
          targetType: 'employee',
          targetId: employeeId,
          summary: `员工 ${trimmedName}（${employeeNo}）通过公司NO加入公司`,
          detail: {
            inviteCode: invitation.code ?? undefined,
            workshops: workshops.map((item) => item.name),
          },
        },
        tx,
      );

      return { id: employeeId, employeeNo, name: trimmedName };
    });

    return {
      ...employee,
      companyId: invitation.company_id,
      companyName: invitation.companies.name,
      message: '已成功加入公司，请刷新登录状态',
    };
  }

  /** 管理员直接创建员工（不含微信绑定，可后续生成重新绑定口令） */
  async createEmployee(user: AuthUser, dto: CreateEmployeeDto) {
    const admin = await this.access.requireAdmin(user);
    const workshops = await this.resolveWorkshops(
      admin.companyId,
      dto.workshopIds ?? [],
    );
    const employeeId = newId();
    const trimmedName = dto.name.trim();

    const employee = await this.prisma.$transaction(async (tx) => {
      const employeeNo = await this.nextEmployeeNo(tx, admin.companyId);

      await tx.employees.create({
        data: {
          id: employeeId,
          company_id: admin.companyId,
          employee_no: employeeNo,
          name: trimmedName,
          remark: dto.remark?.trim() || null,
          status: 'active',
        },
      });

      if (workshops.length > 0) {
        await tx.employee_workshops.createMany({
          data: workshops.map((workshop) => ({
            id: newId(),
            company_id: admin.companyId,
            employee_id: employeeId,
            workshop_id: workshop.id,
          })),
        });
      }

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'employee.create',
          targetType: 'employee',
          targetId: employeeId,
          summary: `创建员工：${trimmedName}（${employeeNo}）`,
          detail: { workshops: workshops.map((item) => item.name) },
        },
        tx,
      );

      return { id: employeeId, employeeNo, name: trimmedName };
    });

    return employee;
  }

  async listEmployees(user: AuthUser, query: ListEmployeesQueryDto) {
    const admin = await this.access.requireAdmin(user);

    const where: Prisma.employeesWhereInput = {
      company_id: admin.companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { employee_no: { contains: query.keyword } },
            ],
          }
        : {}),
      ...(query.workshopId
        ? { employee_workshops: { some: { workshop_id: query.workshopId } } }
        : {}),
    };

    if (query.bound !== undefined) {
      where.employee_wechat_bindings =
        query.bound === 1 ? { some: {} } : { none: {} };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employees.findMany({
        where,
        select: {
          id: true,
          employee_no: true,
          name: true,
          status: true,
          remark: true,
          created_at: true,
          employee_wechat_bindings: {
            select: { openid: true, bound_at: true },
          },
          employee_workshops: {
            select: { workshops: { select: { id: true, name: true } } },
          },
          _count: { select: { reports: true } },
        },
        orderBy: [{ created_at: 'desc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.employees.count({ where }),
    ]);

    return pageResult(
      rows.map((row) => {
        const binding = row.employee_wechat_bindings[0];
        return {
          id: row.id,
          employeeNo: row.employee_no,
          name: row.name,
          status: row.status,
          remark: row.remark,
          createdAt: row.created_at,
          isBound: Boolean(binding),
          wechat: binding ? this.maskOpenid(binding.openid) : null,
          boundAt: binding?.bound_at ?? null,
          workshops: row.employee_workshops.map((item) => item.workshops),
          reportCount: row._count.reports,
        };
      }),
      total,
      query,
    );
  }

  async getEmployee(user: AuthUser, employeeId: string) {
    const admin = await this.access.requireAdmin(user);

    const employee = await this.prisma.employees.findFirst({
      where: { id: employeeId, company_id: admin.companyId },
      select: {
        id: true,
        employee_no: true,
        name: true,
        status: true,
        remark: true,
        created_at: true,
        employee_wechat_bindings: {
          select: { openid: true, bound_at: true },
        },
        employee_workshops: {
          select: { workshops: { select: { id: true, name: true, status: true } } },
        },
      },
    });

    if (!employee) {
      throw BusinessException.notFound('EMPLOYEE_NOT_FOUND', '员工不存在');
    }

    const [reportCounts, settlements] = await this.prisma.$transaction([
      this.prisma.reports.groupBy({
        by: ['status'],
        where: { company_id: admin.companyId, employee_id: employeeId },
        _count: { _all: true },
      }),
      this.prisma.settlements.findMany({
        where: { company_id: admin.companyId, employee_id: employeeId },
        select: {
          id: true,
          total_amount: true,
          settled_at: true,
          styles: { select: { name: true, style_no: true } },
        },
        orderBy: { settled_at: 'desc' },
        take: 5,
      }),
    ]);

    const binding = employee.employee_wechat_bindings[0];

    return {
      id: employee.id,
      employeeNo: employee.employee_no,
      name: employee.name,
      status: employee.status,
      remark: employee.remark,
      createdAt: employee.created_at,
      isBound: Boolean(binding),
      wechat: binding ? this.maskOpenid(binding.openid) : null,
      boundAt: binding?.bound_at ?? null,
      workshops: employee.employee_workshops.map((item) => item.workshops),
      reportCounts: Object.fromEntries(
        reportCounts.map((row) => [row.status, row._count._all]),
      ),
      recentSettlements: settlements.map((row) => ({
        id: row.id,
        totalAmount: row.total_amount.toFixed(2),
        settledAt: row.settled_at,
        styleName: row.styles.name,
        styleNo: row.styles.style_no,
      })),
    };
  }

  async updateEmployee(
    user: AuthUser,
    employeeId: string,
    dto: UpdateEmployeeDto,
  ) {
    const admin = await this.access.requireAdmin(user);
    const employee = await this.access.getEmployeeOrThrow(
      admin.companyId,
      employeeId,
    );

    const before = { name: employee.name, remark: employee.remark };
    const data: Prisma.employeesUpdateInput = { updated_at: new Date() };

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.remark !== undefined) data.remark = dto.remark.trim() || null;

    await this.prisma.$transaction(async (tx) => {
      await tx.employees.update({ where: { id: employee.id }, data });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'employee.update',
          targetType: 'employee',
          targetId: employee.id,
          summary: `修改员工信息：${employee.name}（${employee.employee_no}）`,
          detail: {
            before,
            after: {
              name: dto.name?.trim() ?? before.name,
              remark:
                dto.remark !== undefined
                  ? dto.remark.trim() || null
                  : before.remark,
            },
          },
        },
        tx,
      );
    });

    return { message: '员工信息已更新' };
  }

  async setEmployeeStatus(
    user: AuthUser,
    employeeId: string,
    status: 'active' | 'disabled',
  ) {
    const admin = await this.access.requireAdmin(user);
    const employee = await this.access.getEmployeeOrThrow(
      admin.companyId,
      employeeId,
    );

    if (employee.status === status) {
      return { message: status === 'active' ? '员工已是正常状态' : '员工已停用' };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employees.update({
        where: { id: employee.id },
        data: { status, updated_at: new Date() },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: status === 'active' ? 'employee.enable' : 'employee.disable',
          targetType: 'employee',
          targetId: employee.id,
          summary: `${status === 'active' ? '启用' : '停用'}员工：${employee.name}（${employee.employee_no}）`,
        },
        tx,
      );
    });

    return {
      message:
        status === 'active'
          ? '员工已启用'
          : '员工已停用，停用后不能继续提交报工',
    };
  }

  async setEmployeeWorkshops(
    user: AuthUser,
    employeeId: string,
    workshopIds: string[],
  ) {
    const admin = await this.access.requireAdmin(user);
    const employee = await this.access.getEmployeeOrThrow(
      admin.companyId,
      employeeId,
    );
    const workshops = await this.resolveWorkshops(admin.companyId, workshopIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.employee_workshops.deleteMany({
        where: { company_id: admin.companyId, employee_id: employee.id },
      });

      if (workshops.length > 0) {
        await tx.employee_workshops.createMany({
          data: workshops.map((workshop) => ({
            id: newId(),
            company_id: admin.companyId,
            employee_id: employee.id,
            workshop_id: workshop.id,
          })),
        });
      }

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'employee.workshops.set',
          targetType: 'employee',
          targetId: employee.id,
          summary: `设置员工车间：${employee.name} → ${workshops.map((item) => item.name).join('、') || '无'}`,
          detail: { workshopIds: workshops.map((item) => item.id) },
        },
        tx,
      );
    });

    return {
      workshops: workshops.map((item) => ({ id: item.id, name: item.name })),
      message: '员工车间已更新',
    };
  }

  async createRebindToken(
    user: AuthUser,
    employeeId: string,
    expiresInMinutes = 30,
  ) {
    const admin = await this.access.requireAdmin(user);
    const employee = await this.access.getEmployeeOrThrow(
      admin.companyId,
      employeeId,
    );

    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60000);
    const tokenId = newId();

    await this.prisma.$transaction(async (tx) => {
      // 同一员工只保留一个有效令牌
      await tx.employee_rebind_tokens.updateMany({
        where: {
          company_id: admin.companyId,
          employee_id: employee.id,
          status: 'active',
        },
        data: { status: 'revoked' },
      });

      await tx.employee_rebind_tokens.create({
        data: {
          id: tokenId,
          company_id: admin.companyId,
          employee_id: employee.id,
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
          actionType: 'employee.rebind_token.create',
          targetType: 'employee',
          targetId: employee.id,
          summary: `为员工 ${employee.name}（${employee.employee_no}）生成微信重新绑定令牌`,
          detail: { expiresAt },
        },
        tx,
      );
    });

    return {
      token,
      expiresAt,
      employee: {
        id: employee.id,
        name: employee.name,
        employeeNo: employee.employee_no,
      },
      notice:
        '该令牌只能使用一次，请在有效期内交给员工本人在新微信中打开小程序完成绑定。',
    };
  }

  /** 员工使用重新绑定令牌，将员工身份绑定到当前微信 */
  async rebindWechat(user: AuthUser, token: string) {
    if (!user.openid) {
      throw BusinessException.unauthorized('UNAUTHORIZED', '微信身份无效');
    }

    const rebindToken = await this.prisma.employee_rebind_tokens.findFirst({
      where: {
        token_hash: hashToken(token),
        status: 'active',
        expires_at: { gt: new Date() },
      },
      select: {
        id: true,
        company_id: true,
        employee_id: true,
        employees: {
          select: {
            id: true,
            name: true,
            employee_no: true,
            status: true,
          },
        },
      },
    });

    if (!rebindToken) {
      throw BusinessException.notFound(
        'REBIND_TOKEN_INVALID',
        '重新绑定口令不存在、已使用或已过期，请联系管理员重新生成',
      );
    }

    if (rebindToken.employees.status !== 'active') {
      throw BusinessException.conflict(
        'EMPLOYEE_DISABLED',
        '该员工已停用，无法重新绑定微信',
      );
    }

    const boundEmployee = await this.prisma.employee_wechat_bindings.findUnique({
      where: { openid: user.openid },
      select: { employee_id: true, company_id: true },
    });

    if (boundEmployee && boundEmployee.employee_id !== rebindToken.employee_id) {
      throw BusinessException.conflict(
        'WECHAT_ALREADY_BOUND',
        '当前微信已经绑定其他员工，不能重复绑定。请使用未绑定员工的微信操作。',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.employee_wechat_bindings.findUnique({
        where: { employee_id: rebindToken.employee_id },
        select: { id: true },
      });

      if (existing) {
        await tx.employee_wechat_bindings.update({
          where: { id: existing.id },
          data: {
            openid: user.openid,
            bound_at: new Date(),
            updated_at: new Date(),
          },
        });
      } else {
        await tx.employee_wechat_bindings.create({
          data: {
            id: newId(),
            company_id: rebindToken.company_id,
            employee_id: rebindToken.employee_id,
            openid: user.openid,
          },
        });
      }

      await tx.employee_rebind_tokens.update({
        where: { id: rebindToken.id },
        data: { status: 'used', used_at: new Date() },
      });

      await tx.employee_rebind_tokens.updateMany({
        where: {
          company_id: rebindToken.company_id,
          employee_id: rebindToken.employee_id,
          status: 'active',
          id: { not: rebindToken.id },
        },
        data: { status: 'revoked' },
      });

      await this.operationLog.record(
        {
          companyId: rebindToken.company_id,
          operatorType: 'employee',
          operatorId: rebindToken.employee_id,
          actionType: 'employee.rebind',
          targetType: 'employee',
          targetId: rebindToken.employee_id,
          summary: `员工 ${rebindToken.employees.name}（${rebindToken.employees.employee_no}）重新绑定微信`,
          detail: { newOpenid: this.maskOpenid(user.openid) },
        },
        tx,
      );
    });

    return {
      employee: {
        id: rebindToken.employees.id,
        name: rebindToken.employees.name,
        employeeNo: rebindToken.employees.employee_no,
        companyId: rebindToken.company_id,
      },
      message: '微信绑定成功，请重新登录',
    };
  }

  /** 员工查看自己的资料 */
  async getMyProfile(user: AuthUser) {
    const employee = await this.access.requireEmployee(user);

    const rows = await this.prisma.employee_workshops.findMany({
      where: { company_id: employee.companyId, employee_id: employee.id },
      select: { workshops: { select: { id: true, name: true } } },
    });

    return {
      id: employee.id,
      name: employee.name,
      employeeNo: employee.employeeNo,
      companyId: employee.companyId,
      companyName: employee.companyName,
      workshops: rows.map((row) => row.workshops),
    };
  }
}
