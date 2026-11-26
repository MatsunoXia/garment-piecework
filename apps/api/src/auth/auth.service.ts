import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';

import { AccessService } from '../common/auth/access.service.js';
import { BusinessException } from '../common/http/business.exception.js';
import { OperationLogService } from '../common/logging/operation-log.service.js';
import { hashPassword, verifyPassword } from '../common/utils/token.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser, IdentityOption } from './interfaces/auth-user.interface.js';

interface WechatSessionResponse {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

export interface LoginResult {
  accessToken?: string;
  tokenType?: 'Bearer';
  role?: string;
  user?: {
    id: string;
    name: string | null;
    companyId: string | null;
    companyName?: string | null;
  };
  requiresIdentitySelection?: boolean;
  selectionToken?: string;
  identities?: IdentityOption[];
  needsJoin?: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly access: AccessService,
    private readonly operationLog: OperationLogService,
  ) {}

  private get accessTokenTtl(): string {
    return this.config.get<string>('JWT_EXPIRES_IN') || '7d';
  }

  private async signToken(user: AuthUser, expiresIn?: string): Promise<string> {
    return this.jwt.signAsync(user, {
      expiresIn: (expiresIn ?? this.accessTokenTtl) as JwtSignOptions['expiresIn'],
    });
  }

  /** 查询该 OpenID 当前可用的全部业务身份（管理员优先） */
  private async resolveIdentities(openid: string): Promise<IdentityOption[]> {
    const identities: IdentityOption[] = [];

    const admin = await this.prisma.admins.findFirst({
      where: {
        openid,
        status: 'active',
        companies: { status: 'active' },
      },
      select: {
        id: true,
        company_id: true,
        name: true,
        companies: { select: { name: true } },
      },
    });

    if (admin) {
      identities.push({
        role: 'admin',
        id: admin.id,
        companyId: admin.company_id,
        companyName: admin.companies.name,
        name: admin.name,
        description: `${admin.companies.name} · 管理员`,
      });
    }

    const binding = await this.prisma.employee_wechat_bindings.findFirst({
      where: {
        openid,
        employees: {
          status: 'active',
          companies: { status: 'active' },
        },
      },
      select: {
        employees: {
          select: {
            id: true,
            name: true,
            employee_no: true,
            company_id: true,
            companies: { select: { name: true } },
          },
        },
      },
    });

    if (binding) {
      const employee = binding.employees;
      identities.push({
        role: 'employee',
        id: employee.id,
        companyId: employee.company_id,
        companyName: employee.companies.name,
        name: employee.name,
        description: `${employee.companies.name} · 员工 ${employee.employee_no}`,
      });
    }

    return identities;
  }

  private async issueIdentity(
    identity: IdentityOption,
    openid: string,
  ): Promise<LoginResult> {
    const user: AuthUser = {
      sub: identity.id,
      role: identity.role,
      companyId: identity.companyId,
      openid,
      name: identity.name,
    };

    const accessToken = await this.signToken(user);

    return {
      accessToken,
      tokenType: 'Bearer',
      role: identity.role,
      user: {
        id: identity.id,
        name: identity.name,
        companyId: identity.companyId,
        companyName: identity.companyName,
      },
    };
  }

  private async buildLoginResult(openid: string): Promise<LoginResult> {
    const identities = await this.resolveIdentities(openid);

    if (identities.length === 0) {
      const accessToken = await this.signToken(
        { sub: openid, role: 'pending', openid },
        '30m',
      );

      return {
        accessToken,
        tokenType: 'Bearer',
        role: 'pending',
        needsJoin: true,
        user: { id: openid, name: null, companyId: null },
      };
    }

    if (identities.length === 1) {
      return this.issueIdentity(identities[0], openid);
    }

    // 同一微信存在多个身份时，必须由用户明确选择，不能擅自决定上下文
    const selectionToken = await this.signToken(
      { sub: openid, role: 'pending', openid, purpose: 'identity_selection' },
      '10m',
    );

    return {
      requiresIdentitySelection: true,
      selectionToken,
      role: 'pending',
      identities,
    };
  }

  private async exchangeWechatCode(code: string): Promise<string> {
    const appId =
      this.config.get<string>('WECHAT_MINI_APP_ID') ??
      this.config.get<string>('WECHAT_MINIPROGRAM_APPID');
    const appSecret =
      this.config.get<string>('WECHAT_MINI_APP_SECRET') ??
      this.config.get<string>('WECHAT_MINIPROGRAM_SECRET');

    if (!appId || !appSecret) {
      throw new BusinessException(
        'WECHAT_NOT_CONFIGURED',
        '服务端尚未配置微信小程序 AppID / AppSecret，请使用本地开发登录，或联系系统管理员配置后重试',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const params = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    });

    let result: WechatSessionResponse;

    try {
      const response = await fetch(
        `https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`,
        { signal: AbortSignal.timeout(8000) },
      );

      if (!response.ok) {
        throw new Error(`微信接口 HTTP ${response.status}`);
      }

      result = (await response.json()) as WechatSessionResponse;
    } catch (error) {
      this.logger.error(
        `调用微信登录接口失败：${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new BusinessException(
        'WECHAT_UNAVAILABLE',
        '暂时无法连接微信服务器，请稍后重试',
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!result.openid || result.errcode) {
      this.logger.warn(
        `微信 code2session 失败：errcode=${result.errcode ?? 'none'} errmsg=${result.errmsg ?? 'none'}`,
      );
      throw new BusinessException(
        'WECHAT_CODE_INVALID',
        `${result.errmsg || '微信登录凭证无效或已过期'}（errcode ${result.errcode ?? 'unknown'}）`,
        HttpStatus.UNAUTHORIZED,
        { errcode: result.errcode, errmsg: result.errmsg },
      );
    }

    return result.openid;
  }

  async wechatLogin(code: string): Promise<LoginResult> {
    const openid = await this.exchangeWechatCode(code);
    return this.buildLoginResult(openid);
  }

  /** 小程序端用于判断微信登录是否已配置（不返回任何密钥） */
  wechatLoginConfigured(): boolean {
    const appId =
      this.config.get<string>('WECHAT_MINI_APP_ID') ??
      this.config.get<string>('WECHAT_MINIPROGRAM_APPID');
    const appSecret =
      this.config.get<string>('WECHAT_MINI_APP_SECRET') ??
      this.config.get<string>('WECHAT_MINIPROGRAM_SECRET');
    return Boolean(appId && appSecret);
  }

  /**
   * 本地开发登录：跳过微信 code 换取，直接使用 OpenID。
   * 仅在 ENABLE_DEV_LOGIN=true 且非 production 环境可用。
   */
  async devLogin(openid: string): Promise<LoginResult> {
    const enabled = this.config.get<string>('ENABLE_DEV_LOGIN') === 'true';
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    if (!enabled || isProduction) {
      throw BusinessException.notFound(
        'DEV_LOGIN_DISABLED',
        '开发登录未开启。请在 apps/api/.env 中设置 ENABLE_DEV_LOGIN=true 后重启服务。',
      );
    }

    return this.buildLoginResult(openid);
  }

  async selectIdentity(
    selectionToken: string,
    role: 'admin' | 'employee',
    id: string,
  ): Promise<LoginResult> {
    let payload: AuthUser;

    try {
      payload = await this.jwt.verifyAsync<AuthUser>(selectionToken);
    } catch {
      throw BusinessException.unauthorized(
        'INVALID_SELECTION_TOKEN',
        '身份选择凭证已过期，请重新登录',
      );
    }

    if (payload.purpose !== 'identity_selection') {
      throw BusinessException.badRequest(
        'INVALID_SELECTION_TOKEN',
        '身份选择凭证无效，请重新登录',
      );
    }

    const identities = await this.resolveIdentities(payload.openid);
    const target = identities.find(
      (identity) => identity.role === role && identity.id === id,
    );

    if (!target) {
      throw BusinessException.forbidden(
        'IDENTITY_NOT_AVAILABLE',
        '该身份已失效或不属于当前微信，请重新登录',
      );
    }

    const result = await this.issueIdentity(target, payload.openid);

    await this.operationLog.record({
      companyId: target.companyId,
      operatorType: target.role,
      operatorId: target.id,
      actionType: 'auth.select_identity',
      targetType: target.role,
      targetId: target.id,
      summary: `${target.name} 选择以${target.role === 'admin' ? '管理员' : '员工'}身份登录`,
    });

    return result;
  }

  async getCurrentUser(user: AuthUser) {
    if (user.role === 'pending') {
      const identities = await this.resolveIdentities(user.openid);
      return {
        role: 'pending',
        openid: user.openid,
        needsJoin: identities.length === 0,
        identities,
      };
    }

    if (user.role === 'admin') {
      const admin = await this.access.requireAdmin(user);
      return {
        id: admin.id,
        name: admin.name,
        role: 'admin',
        companyId: admin.companyId,
        companyName: admin.companyName,
        isFounder: admin.isFounder,
      };
    }

    const employee = await this.access.requireEmployee(user);
    return {
      id: employee.id,
      name: employee.name,
      employeeNo: employee.employeeNo,
      role: 'employee',
      companyId: employee.companyId,
      companyName: employee.companyName,
    };
  }

  async refresh(user: AuthUser): Promise<LoginResult> {
    if (user.role === 'pending') {
      return this.buildLoginResult(user.openid);
    }

    if (user.role === 'admin') {
      const admin = await this.access.requireAdmin(user);
      return this.issueIdentity(
        {
          role: 'admin',
          id: admin.id,
          companyId: admin.companyId,
          companyName: admin.companyName,
          name: admin.name,
          description: '',
        },
        user.openid,
      );
    }

    const employee = await this.access.requireEmployee(user);
    return this.issueIdentity(
      {
        role: 'employee',
        id: employee.id,
        companyId: employee.companyId,
        companyName: employee.companyName,
        name: employee.name,
        description: '',
      },
      user.openid,
    );
  }

  /** Web 管理后台登录：公司编号（或公司全称）+ 公司管理密码 */
  async webLogin(
    account: string,
    password: string,
    adminName?: string,
  ): Promise<LoginResult> {
    const keyword = account.trim();

    const select = {
      id: true,
      name: true,
      company_no: true,
      status: true,
      admin_password_hash: true,
    } as const;

    let company = await this.prisma.companies.findFirst({
      where: { company_no: keyword },
      select,
    });

    if (!company) {
      const matches = await this.prisma.companies.findMany({
        where: { name: keyword },
        select,
        take: 5,
      });

      if (matches.length === 0) {
        throw BusinessException.notFound(
          'COMPANY_NOT_FOUND',
          '公司不存在，请检查公司编号或名称',
        );
      }

      if (matches.length > 1) {
        throw BusinessException.conflict(
          'COMPANY_AMBIGUOUS',
          '存在多家同名公司，请改用公司编号登录',
          {
            companies: matches.map((item) => ({
              companyNo: item.company_no,
              name: item.name,
            })),
          },
        );
      }

      company = matches[0];
    }

    if (company.status !== 'active') {
      throw new BusinessException(
        'COMPANY_DISABLED',
        '该公司已停用，无法登录管理后台',
        HttpStatus.FORBIDDEN,
      );
    }

    if (!company.admin_password_hash) {
      throw BusinessException.badRequest(
        'WEB_PASSWORD_NOT_SET',
        '该公司尚未设置 Web 管理密码。请先在小程序「公司信息」中使用创始管理员账号设置密码。',
      );
    }

    if (!verifyPassword(password, company.admin_password_hash)) {
      throw BusinessException.unauthorized(
        'INVALID_CREDENTIALS',
        '公司编号或管理密码错误',
      );
    }

    const adminSelect = {
      id: true,
      name: true,
      openid: true,
    } as const;

    let admin = adminName
      ? await this.prisma.admins.findFirst({
          where: {
            company_id: company.id,
            name: adminName.trim(),
            status: 'active',
          },
          select: adminSelect,
        })
      : await this.prisma.admins.findFirst({
          where: {
            company_id: company.id,
            status: 'active',
            is_founder: true,
          },
          select: adminSelect,
        });

    admin ??= await this.prisma.admins.findFirst({
      where: { company_id: company.id, status: 'active' },
      select: adminSelect,
      orderBy: { joined_at: 'asc' },
    });

    if (!admin) {
      throw BusinessException.notFound(
        'ADMIN_NOT_FOUND',
        '该公司没有可用的管理员账号',
      );
    }

    const accessToken = await this.signToken({
      sub: admin.id,
      role: 'admin',
      companyId: company.id,
      openid: admin.openid,
      name: admin.name,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      role: 'admin',
      user: {
        id: admin.id,
        name: admin.name,
        companyId: company.id,
        companyName: company.name,
      },
    };
  }

  async setWebPassword(
    user: AuthUser,
    password: string,
  ): Promise<{ message: string }> {
    const admin = await this.access.requireAdmin(user);

    if (!admin.isFounder) {
      throw BusinessException.forbidden(
        'FOUNDER_ONLY',
        '只有创始管理员可以设置或重置 Web 管理密码',
      );
    }

    await this.prisma.companies.update({
      where: { id: admin.companyId },
      data: {
        admin_password_hash: hashPassword(password),
        updated_at: new Date(),
      },
    });

    await this.operationLog.record({
      companyId: admin.companyId,
      operatorType: 'admin',
      operatorId: admin.id,
      actionType: 'company.web_password.set',
      targetType: 'company',
      targetId: admin.companyId,
      summary: '设置 Web 管理后台登录密码',
    });

    return { message: 'Web 管理密码已更新' };
  }
}
