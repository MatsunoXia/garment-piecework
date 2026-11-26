import { HttpStatus, Injectable } from '@nestjs/common';

import { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BusinessException } from '../http/business.exception.js';

export interface AdminContext {
  id: string;
  companyId: string;
  name: string;
  openid: string;
  isFounder: boolean;
  companyName: string;
  companyStatus: string;
}

export interface EmployeeContext {
  id: string;
  companyId: string;
  name: string;
  employeeNo: string;
  status: string;
  companyName: string;
  companyStatus: string;
}

/**
 * 统一身份与公司上下文校验。
 * 不信任前端传入的 companyId / role，一律以数据库中的有效关系为准。
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireAdmin(user: AuthUser): Promise<AdminContext> {
    if (user.role !== 'admin' || !user.companyId) {
      throw BusinessException.forbidden('FORBIDDEN', '仅管理员可以执行该操作');
    }

    const admin = await this.prisma.admins.findFirst({
      where: {
        id: user.sub,
        company_id: user.companyId,
        openid: user.openid,
        status: 'active',
      },
      select: {
        id: true,
        company_id: true,
        name: true,
        openid: true,
        is_founder: true,
        companies: { select: { name: true, status: true } },
      },
    });

    if (!admin) {
      throw BusinessException.unauthorized(
        'UNAUTHORIZED',
        '管理员身份已失效，请重新登录',
      );
    }

    this.assertCompanyActive(admin.companies.status, admin.companies.name);

    return {
      id: admin.id,
      companyId: admin.company_id,
      name: admin.name,
      openid: admin.openid,
      isFounder: admin.is_founder,
      companyName: admin.companies.name,
      companyStatus: admin.companies.status,
    };
  }

  async requireEmployee(user: AuthUser): Promise<EmployeeContext> {
    if (user.role !== 'employee' || !user.companyId) {
      throw BusinessException.forbidden('FORBIDDEN', '仅员工可以执行该操作');
    }

    const employee = await this.prisma.employees.findFirst({
      where: {
        id: user.sub,
        company_id: user.companyId,
        status: 'active',
        employee_wechat_bindings: { some: { openid: user.openid } },
      },
      select: {
        id: true,
        company_id: true,
        name: true,
        employee_no: true,
        status: true,
        companies: { select: { name: true, status: true } },
      },
    });

    if (!employee) {
      throw BusinessException.unauthorized(
        'UNAUTHORIZED',
        '员工身份已失效或微信绑定已变更，请重新登录',
      );
    }

    this.assertCompanyActive(employee.companies.status, employee.companies.name);

    return {
      id: employee.id,
      companyId: employee.company_id,
      name: employee.name,
      employeeNo: employee.employee_no,
      status: employee.status,
      companyName: employee.companies.name,
      companyStatus: employee.companies.status,
    };
  }

  /** 管理员和员工都可以使用的身份（例如查询自己的信息） */
  async requireAny(user: AuthUser): Promise<{
    role: 'admin' | 'employee';
    companyId: string;
    id: string;
    name: string;
  }> {
    if (user.role === 'admin') {
      const admin = await this.requireAdmin(user);
      return {
        role: 'admin',
        companyId: admin.companyId,
        id: admin.id,
        name: admin.name,
      };
    }
    const employee = await this.requireEmployee(user);
    return {
      role: 'employee',
      companyId: employee.companyId,
      id: employee.id,
      name: employee.name,
    };
  }

  assertCompanyActive(status: string, companyName: string): void {
    if (status !== 'active') {
      throw new BusinessException(
        'COMPANY_DISABLED',
        `公司「${companyName}」已停用，禁止业务操作，请联系平台管理员`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async getCompanyOrThrow(companyId: string) {
    const company = await this.prisma.companies.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, status: true, company_no: true },
    });

    if (!company) {
      throw BusinessException.notFound('COMPANY_NOT_FOUND', '公司不存在');
    }

    return company;
  }

  async getEmployeeOrThrow(companyId: string, employeeId: string) {
    const employee = await this.prisma.employees.findFirst({
      where: { id: employeeId, company_id: companyId },
      select: {
        id: true,
        company_id: true,
        name: true,
        employee_no: true,
        status: true,
        remark: true,
      },
    });

    if (!employee) {
      throw BusinessException.notFound('EMPLOYEE_NOT_FOUND', '员工不存在');
    }

    return employee;
  }

  async getStyleOrThrow(companyId: string, styleId: string) {
    const style = await this.prisma.styles.findFirst({
      where: { id: styleId, company_id: companyId },
      select: {
        id: true,
        company_id: true,
        style_no: true,
        name: true,
        status: true,
        production_scope: true,
        remark: true,
      },
    });

    if (!style) {
      throw BusinessException.notFound('STYLE_NOT_FOUND', '款式不存在');
    }

    return style;
  }

  async assertStyleProduction(companyId: string, styleId: string) {
    const style = await this.getStyleOrThrow(companyId, styleId);
    if (style.status !== 'production') {
      throw BusinessException.conflict(
        'STYLE_NOT_PRODUCTION',
        `款式「${style.name}」当前状态不允许该操作（仅生产中的款式可执行）`,
      );
    }
    return style;
  }

  async getWorkshopOrThrow(companyId: string, workshopId: string) {
    const workshop = await this.prisma.workshops.findFirst({
      where: { id: workshopId, company_id: companyId },
      select: { id: true, name: true, status: true },
    });

    if (!workshop) {
      throw BusinessException.notFound('WORKSHOP_NOT_FOUND', '车间不存在');
    }

    return workshop;
  }
}
