import { Injectable } from '@nestjs/common';
import XLSX from 'xlsx';

import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccessService } from '../common/auth/access.service.js';
import { pageResult } from '../common/dto/pagination.dto.js';
import { BusinessException } from '../common/http/business.exception.js';
import { OperationLogService } from '../common/logging/operation-log.service.js';
import { newId } from '../common/utils/token.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BatchCreateBundlesDto,
  CreateBundleDto,
  ImportBundleRowDto,
  ListBundlesQueryDto,
  UpdateBundleDto,
} from './dto/bundle.dto.js';

interface ParsedRow {
  lineNo: number;
  bundleNo: number | null;
  size: string | null;
  quantity: number | null;
  remark: string | null;
  errors: string[];
}

const MAX_IMPORT_ROWS = 2000;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const HEADER_ALIASES = {
  bundleNo: ['捆号', '捆号编号', 'bundleNo', 'bundle_no', 'no'],
  size: ['码数', '尺码', 'size'],
  quantity: ['数量', '件数', 'quantity', 'qty'],
  remark: ['备注', 'remark', 'note'],
} as const;

@Injectable()
export class BundlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operationLog: OperationLogService,
  ) {}

  /** 在款式行锁内计算最小可用正整数捆号 */
  private async allocateBundleNumbers(
    tx: Prisma.TransactionClient,
    companyId: string,
    styleId: string,
    count: number,
  ): Promise<number[]> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM styles WHERE company_id = ${companyId}::uuid AND id = ${styleId}::uuid FOR UPDATE`,
    );

    const existing = await tx.bundles.findMany({
      where: { company_id: companyId, style_id: styleId },
      select: { bundle_no: true },
      orderBy: { bundle_no: 'asc' },
    });

    const used = new Set(existing.map((row) => row.bundle_no));
    const numbers: number[] = [];
    let candidate = 1;

    while (numbers.length < count) {
      if (!used.has(candidate)) {
        numbers.push(candidate);
        used.add(candidate);
      }
      candidate += 1;
    }

    return numbers;
  }

  async createBundle(user: AuthUser, styleId: string, dto: CreateBundleDto) {
    const admin = await this.access.requireAdmin(user);
    const style = await this.access.assertStyleProduction(admin.companyId, styleId);

    const result = await this.prisma.$transaction(async (tx) => {
      const [bundleNo] = await this.allocateBundleNumbers(
        tx,
        admin.companyId,
        style.id,
        1,
      );

      const id = newId();
      await tx.bundles.create({
        data: {
          id,
          company_id: admin.companyId,
          style_id: style.id,
          bundle_no: bundleNo,
          size: dto.size?.trim() || null,
          quantity: dto.quantity,
          remark: dto.remark?.trim() || null,
        },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'bundle.create',
          targetType: 'bundle',
          targetId: id,
          summary: `款式 ${style.name} 新增捆号 ${bundleNo}（${dto.quantity} 件）`,
          detail: { styleId: style.id, bundleNo, quantity: dto.quantity },
        },
        tx,
      );

      return { id, bundleNo };
    });

    return result;
  }

  async batchCreateBundles(
    user: AuthUser,
    styleId: string,
    dto: BatchCreateBundlesDto,
  ) {
    const admin = await this.access.requireAdmin(user);
    const style = await this.access.assertStyleProduction(admin.companyId, styleId);

    if (dto.items.length === 0) {
      throw BusinessException.badRequest('EMPTY_BATCH', '请至少提交一条捆号');
    }

    if (dto.items.length > 200) {
      throw BusinessException.badRequest(
        'BATCH_TOO_LARGE',
        '单次最多提交 200 条捆号',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const numbers = await this.allocateBundleNumbers(
        tx,
        admin.companyId,
        style.id,
        dto.items.length,
      );

      await tx.bundles.createMany({
        data: dto.items.map((item, index) => ({
          id: newId(),
          company_id: admin.companyId,
          style_id: style.id,
          bundle_no: numbers[index],
          size: item.size?.trim() || null,
          quantity: item.quantity,
          remark: item.remark?.trim() || null,
        })),
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'bundle.batch_create',
          targetType: 'style',
          targetId: style.id,
          summary: `款式 ${style.name} 批量新增 ${dto.items.length} 个捆号`,
          detail: { bundleNos: numbers, count: dto.items.length },
        },
        tx,
      );

      return numbers;
    });

    return { count: created.length, bundleNos: created };
  }

  async listBundles(
    user: AuthUser,
    styleId: string,
    query: ListBundlesQueryDto,
  ) {    const admin = await this.access.requireAdmin(user);
    const style = await this.access.getStyleOrThrow(admin.companyId, styleId);

    const where: Prisma.bundlesWhereInput = {
      company_id: admin.companyId,
      style_id: style.id,
      ...(query.reported === 1
        ? { has_reported: true }
        : query.reported === 0
          ? { has_reported: false }
          : {}),
      ...(query.keyword
        ? {
            OR: [
              { size: { contains: query.keyword, mode: 'insensitive' } },
              { remark: { contains: query.keyword, mode: 'insensitive' } },
              ...(/^\d+$/.test(query.keyword)
                ? [{ bundle_no: Number(query.keyword) }]
                : []),
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bundles.findMany({
        where,
        select: {
          id: true,
          bundle_no: true,
          size: true,
          quantity: true,
          remark: true,
          has_reported: true,
          created_at: true,
          _count: { select: { reports: true } },
        },
        orderBy: { bundle_no: 'asc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.bundles.count({ where }),
    ]);

    return {
      ...pageResult(
        rows.map((row) => ({
          id: row.id,
          bundleNo: row.bundle_no,
          size: row.size,
          quantity: row.quantity,
          remark: row.remark,
          hasReported: row.has_reported,
          reportCount: row._count.reports,
          createdAt: row.created_at,
        })),
        total,
        query,
      ),
      style: { id: style.id, name: style.name, status: style.status },
    };
  }

  /** 管理员代报时查询某工序下捆号是否已被报工 */
  async listBundleAvailability(
    user: AuthUser,
    styleId: string,
    styleProcessId: string,
  ) {
    const admin = await this.access.requireAdmin(user);
    const style = await this.access.getStyleOrThrow(admin.companyId, styleId);

    const process = await this.prisma.style_processes.findFirst({
      where: {
        id: styleProcessId,
        company_id: admin.companyId,
        style_id: style.id,
      },
      select: { id: true, name: true, unit_price: true },
    });

    if (!process) {
      throw BusinessException.notFound(
        'STYLE_PROCESS_NOT_FOUND',
        '该工序不属于当前款式',
      );
    }

    const [bundles, activeReports] = await this.prisma.$transaction([
      this.prisma.bundles.findMany({
        where: { company_id: admin.companyId, style_id: style.id },
        select: {
          id: true,
          bundle_no: true,
          size: true,
          quantity: true,
          remark: true,
        },
        orderBy: { bundle_no: 'asc' },
      }),
      this.prisma.reports.findMany({
        where: {
          company_id: admin.companyId,
          style_id: style.id,
          style_process_id: styleProcessId,
          status: { in: ['pending', 'approved'] },
        },
        select: {
          id: true,
          bundle_id: true,
          status: true,
          employees: { select: { name: true } },
        },
      }),
    ]);

    const activeMap = new Map(activeReports.map((item) => [item.bundle_id, item]));

    return {
      style: { id: style.id, name: style.name, status: style.status },
      process: {
        id: process.id,
        name: process.name,
        unitPrice: process.unit_price.toFixed(3),
      },
      items: bundles.map((bundle) => {
        const active = activeMap.get(bundle.id);
        return {
          id: bundle.id,
          bundleNo: bundle.bundle_no,
          size: bundle.size,
          quantity: bundle.quantity,
          remark: bundle.remark,
          reported: Boolean(active),
          reportedByName: active?.employees.name ?? null,
          reportedStatus: active?.status ?? null,
        };
      }),
    };
  }

  async updateBundle(user: AuthUser, bundleId: string, dto: UpdateBundleDto) {
    const admin = await this.access.requireAdmin(user);

    const bundle = await this.prisma.bundles.findFirst({
      where: { id: bundleId, company_id: admin.companyId },
      select: {
        id: true,
        bundle_no: true,
        size: true,
        quantity: true,
        remark: true,
        has_reported: true,
        style_id: true,
        styles: { select: { name: true, status: true } },
      },
    });

    if (!bundle) {
      throw BusinessException.notFound('BUNDLE_NOT_FOUND', '捆号不存在');
    }

    const changingProductionData =
      (dto.size !== undefined && (dto.size.trim() || null) !== bundle.size) ||
      (dto.quantity !== undefined && dto.quantity !== bundle.quantity);

    if (changingProductionData && bundle.has_reported) {
      throw BusinessException.conflict(
        'BUNDLE_ALREADY_REPORTED',
        '该捆号已经产生报工历史，不能修改数量或码数，只能修改备注',
      );
    }

    if (changingProductionData && bundle.styles.status !== 'production') {
      throw BusinessException.conflict(
        'BUNDLE_FIELDS_LOCKED',
        '款式已完成，捆号的生产数据已锁定，仅允许修改备注',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bundles.update({
        where: { id: bundle.id },
        data: {
          ...(dto.size !== undefined ? { size: dto.size.trim() || null } : {}),
          ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
          ...(dto.remark !== undefined
            ? { remark: dto.remark.trim() || null }
            : {}),
          updated_at: new Date(),
        },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'bundle.update',
          targetType: 'bundle',
          targetId: bundle.id,
          summary: `修改捆号 ${bundle.bundle_no}：${bundle.styles.name}`,
          detail: {
            before: {
              size: bundle.size,
              quantity: bundle.quantity,
              remark: bundle.remark,
            },
            after: {
              size: dto.size !== undefined ? dto.size.trim() || null : null,
              quantity: dto.quantity ?? null,
              remark: dto.remark !== undefined ? dto.remark.trim() || null : null,
            },
          },
        },
        tx,
      );
    });

    return { message: '捆号已更新' };
  }

  async deleteBundle(user: AuthUser, bundleId: string) {
    const admin = await this.access.requireAdmin(user);

    const bundle = await this.prisma.bundles.findFirst({
      where: { id: bundleId, company_id: admin.companyId },
      select: {
        id: true,
        bundle_no: true,
        has_reported: true,
        styles: { select: { name: true, status: true } },
      },
    });

    if (!bundle) {
      throw BusinessException.notFound('BUNDLE_NOT_FOUND', '捆号不存在');
    }

    if (bundle.has_reported) {
      throw BusinessException.conflict(
        'DELETE_FORBIDDEN',
        '该捆号已经产生报工历史，永久禁止删除',
      );
    }

    if (bundle.styles.status !== 'production') {
      throw BusinessException.conflict(
        'STYLE_NOT_PRODUCTION',
        '只有生产中的款式可以删除捆号',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bundles.delete({ where: { id: bundle.id } });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'bundle.delete',
          targetType: 'bundle',
          targetId: bundle.id,
          summary: `删除捆号 ${bundle.bundle_no}：${bundle.styles.name}`,
        },
        tx,
      );
    });

    return { message: '捆号已删除' };
  }

  private parseSheet(buffer: Buffer): { rows: ParsedRow[]; errors: string[] } {
    let workbook: XLSX.WorkBook;

    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      return { rows: [], errors: ['文件无法解析，请确认是有效的 Excel 文件'] };
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      return { rows: [], errors: ['Excel 中没有可读取的工作表'] };
    }

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });

    if (raw.length === 0) {
      return { rows: [], errors: ['Excel 中没有数据行'] };
    }

    if (raw.length > MAX_IMPORT_ROWS) {
      return {
        rows: [],
        errors: [`单次最多导入 ${MAX_IMPORT_ROWS} 行，请拆分文件后重试`],
      };
    }

    const keys = Object.keys(raw[0] ?? {});
    const findKey = (aliases: readonly string[]) =>
      keys.find((key) => aliases.some((alias) => alias.toLowerCase() === key.trim().toLowerCase()));

    const bundleNoKey = findKey(HEADER_ALIASES.bundleNo);
    const sizeKey = findKey(HEADER_ALIASES.size);
    const quantityKey = findKey(HEADER_ALIASES.quantity);
    const remarkKey = findKey(HEADER_ALIASES.remark);

    if (!quantityKey) {
      return {
        rows: [],
        errors: ['缺少「数量」列。表头需包含：捆号（可选）、码数、数量、备注'],
      };
    }

    const rows: ParsedRow[] = raw.map((row, index) => {
      const errors: string[] = [];
      const lineNo = index + 2;

      const rawBundleNo = bundleNoKey ? row[bundleNoKey] : null;
      let bundleNo: number | null = null;
      if (rawBundleNo !== null && rawBundleNo !== undefined && String(rawBundleNo).trim() !== '') {
        const parsed = Number(rawBundleNo);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          errors.push('捆号必须是大于 0 的整数');
        } else {
          bundleNo = parsed;
        }
      }

      const rawQuantity = row[quantityKey];
      let quantity: number | null = null;
      const parsedQuantity = Number(rawQuantity);
      if (
        rawQuantity === null ||
        rawQuantity === undefined ||
        String(rawQuantity).trim() === ''
      ) {
        errors.push('数量不能为空');
      } else if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
        errors.push('数量必须是大于 0 的整数');
      } else if (parsedQuantity > 1000000) {
        errors.push('数量超出合理范围（最大 1000000）');
      } else {
        quantity = parsedQuantity;
      }

      const size = sizeKey ? String(row[sizeKey] ?? '').trim() || null : null;
      if (size && size.length > 30) {
        errors.push('码数长度不能超过 30 个字符');
      }

      const remark = remarkKey
        ? String(row[remarkKey] ?? '').trim() || null
        : null;
      if (remark && remark.length > 200) {
        errors.push('备注长度不能超过 200 个字符');
      }

      return { lineNo, bundleNo, size, quantity, remark, errors };
    });

    return { rows, errors: [] };
  }

  async previewImport(user: AuthUser, styleId: string, file?: Express.Multer.File) {
    const admin = await this.access.requireAdmin(user);
    const style = await this.access.assertStyleProduction(admin.companyId, styleId);

    if (!file) {
      throw BusinessException.badRequest('FILE_REQUIRED', '请选择要导入的 Excel 文件');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw BusinessException.badRequest(
        'FILE_TOO_LARGE',
        '文件不能超过 5MB，请拆分后导入',
      );
    }

    if (!/\.(xlsx|xls)$/i.test(file.originalname)) {
      throw BusinessException.badRequest(
        'INVALID_FILE_TYPE',
        '只支持 .xlsx 或 .xls 格式的 Excel 文件',
      );
    }

    const parsed = this.parseSheet(file.buffer);

    if (parsed.errors.length > 0) {
      throw BusinessException.badRequest(
        'INVALID_EXCEL',
        parsed.errors.join('；'),
        { errors: parsed.errors },
      );
    }

    const existing = await this.prisma.bundles.findMany({
      where: { company_id: admin.companyId, style_id: style.id },
      select: { bundle_no: true },
    });
    const existingSet = new Set(existing.map((row) => row.bundle_no));

    const seen = new Set<number>();
    const rows = parsed.rows.map((row) => {
      const errors = [...row.errors];
      if (row.bundleNo !== null) {
        if (existingSet.has(row.bundleNo)) {
          errors.push(`捆号 ${row.bundleNo} 在当前款式中已存在`);
        }
        if (seen.has(row.bundleNo)) {
          errors.push(`捆号 ${row.bundleNo} 在文件中重复`);
        }
        seen.add(row.bundleNo);
      }
      return { ...row, valid: errors.length === 0 };
    });

    return {
      style: { id: style.id, name: style.name, styleNo: style.style_no },
      rows,
      total: rows.length,
      validCount: rows.filter((row) => row.valid).length,
      invalidCount: rows.filter((row) => !row.valid).length,
      canImport:
        rows.length > 0 && rows.every((row) => row.valid),
    };
  }

  async confirmImport(
    user: AuthUser,
    styleId: string,
    rows: ImportBundleRowDto[],
  ) {
    const admin = await this.access.requireAdmin(user);
    const style = await this.access.assertStyleProduction(admin.companyId, styleId);

    if (rows.length === 0) {
      throw BusinessException.badRequest('EMPTY_IMPORT', '没有可导入的数据');
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      throw BusinessException.badRequest(
        'IMPORT_TOO_LARGE',
        `单次最多导入 ${MAX_IMPORT_ROWS} 行`,
      );
    }

    const providedNumbers = rows
      .map((row) => row.bundleNo)
      .filter((value): value is number => Boolean(value));

    const conflicts =
      providedNumbers.length > 0
        ? await this.prisma.bundles.findMany({
            where: {
              company_id: admin.companyId,
              style_id: style.id,
              bundle_no: { in: providedNumbers },
            },
            select: { bundle_no: true },
          })
        : [];

    const conflictNumbers = new Set(conflicts.map((row) => row.bundle_no));
    const seenNumbers = new Set<number>();
    const problems: string[] = [];

    for (const number of providedNumbers) {
      if (conflictNumbers.has(number)) {
        problems.push(`捆号 ${number} 已存在`);
      }
      if (seenNumbers.has(number)) {
        problems.push(`捆号 ${number} 重复`);
      }
      seenNumbers.add(number);
    }

    if (problems.length > 0) {
      throw BusinessException.badRequest(
        'BUNDLE_NUMBER_CONFLICT',
        problems.slice(0, 10).join('；'),
        { problems },
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM styles WHERE company_id = ${admin.companyId}::uuid AND id = ${style.id}::uuid FOR UPDATE`,
      );

      const existing = await tx.bundles.findMany({
        where: { company_id: admin.companyId, style_id: style.id },
        select: { bundle_no: true },
      });
      const used = new Set(existing.map((row) => row.bundle_no));
      for (const number of providedNumbers) used.add(number);

      let candidate = 1;
      const nextAvailable = () => {
        while (used.has(candidate)) candidate += 1;
        const value = candidate;
        used.add(value);
        return value;
      };

      const data = rows.map((row) => ({
        id: newId(),
        company_id: admin.companyId,
        style_id: style.id,
        bundle_no: row.bundleNo ?? nextAvailable(),
        size: row.size?.trim() || null,
        quantity: row.quantity,
        remark: row.remark?.trim() || null,
      }));

      await tx.bundles.createMany({ data });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'bundle.import',
          targetType: 'style',
          targetId: style.id,
          summary: `Excel 导入款式 ${style.name} 捆号 ${data.length} 条`,
          detail: {
            count: data.length,
            totalQuantity: data.reduce((sum, item) => sum + item.quantity, 0),
          },
        },
        tx,
      );

      return data;
    });

    return {
      imported: created.length,
      bundleNos: created.map((row) => row.bundle_no),
      message: `成功导入 ${created.length} 条捆号`,
    };
  }

  generateTemplate(): Buffer {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['捆号', '码数', '数量', '备注'],
      ['', 'M', 100, '捆号留空时由系统自动分配'],
      ['', 'L', 120, ''],
    ]);
    sheet['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 32 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '捆号导入');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
