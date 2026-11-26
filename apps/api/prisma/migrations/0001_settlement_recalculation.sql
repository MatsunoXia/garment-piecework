-- =============================================================================
-- 迁移 0001：结算金额重算 / 结算修正 / 完工后调整工价
-- =============================================================================
-- 状态：尚未执行。执行前必须由项目负责人确认，并先备份数据库。
--
-- 背景（与 V1.0 数据库现状的冲突）：
--   1. settlements.total_amount 为 NUMERIC(14,2)，明细为 NUMERIC(14,3)，精度不一致。
--   2. settlements / settlement_process_items / settlement_report_items 上的
--      prevent_settlement_mutation 触发器禁止任何 UPDATE/DELETE，
--      导致「工价修改后同步更新已结算金额」和「修正结算记录」无法实现。
--   3. guard_style_process_mutation 禁止款式完成/结算后修改工序，
--      其中也包括工价字段，与「结算后仍允许改工价」的业务规则冲突。
--
-- 本迁移只做以下事情：
--   A. 结算主表金额精度统一为 NUMERIC(14,3)。
--   B. 结算主表：允许修改金额/付款方式/备注，禁止修改归属字段，禁止删除结算。
--   C. 结算明细：允许删除和重建（工价重算必需），禁止原地修改单行。
--   D. 款式工序：完工后允许只修改 unit_price，其他生产配置字段仍锁定。
--   E. 增加按员工+款式查询已审核报工的索引（工资统计性能）。
--
-- 不新增业务表。管理员人工修正通过 operation_logs 保留：
--   action_type = 'settlement.adjust'，detail 中记录 before / after / delta。
--   工价重算读取该 delta 并保留人工调整，不会静默覆盖。
--
-- 回滚：迁移末尾附有回滚脚本（需在确认无数据影响后单独执行）。
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- A. 结算主表金额精度统一为三位小数
-- -----------------------------------------------------------------------------
ALTER TABLE settlements
  ALTER COLUMN total_amount TYPE NUMERIC(14, 3)
  USING ROUND(total_amount, 3);

-- -----------------------------------------------------------------------------
-- B. 结算主表：可修正，不可删除，不可改归属
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_settlements_immutable ON settlements;

CREATE OR REPLACE FUNCTION guard_settlement_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.style_id IS DISTINCT FROM OLD.style_id
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.settled_at IS DISTINCT FROM OLD.settled_at THEN
        RAISE EXCEPTION 'Settlement identity fields cannot be changed';
    END IF;

    IF NEW.total_amount < 0 THEN
        RAISE EXCEPTION 'Settlement amount cannot be negative';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_settlements_guard_update
BEFORE UPDATE ON settlements
FOR EACH ROW EXECUTE FUNCTION guard_settlement_update();

CREATE OR REPLACE FUNCTION prevent_settlement_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'Settlement records cannot be deleted';
END;
$function$;

CREATE TRIGGER trg_settlements_guard_delete
BEFORE DELETE ON settlements
FOR EACH ROW EXECUTE FUNCTION prevent_settlement_delete();

-- -----------------------------------------------------------------------------
-- C. 结算明细：派生数据，允许删除重建，禁止原地修改
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_settlement_process_items_immutable ON settlement_process_items;
DROP TRIGGER IF EXISTS trg_settlement_report_items_immutable ON settlement_report_items;

CREATE OR REPLACE FUNCTION prevent_settlement_item_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'Settlement items are derived data; delete and rebuild them instead of updating';
END;
$function$;

CREATE TRIGGER trg_settlement_process_items_no_update
BEFORE UPDATE ON settlement_process_items
FOR EACH ROW EXECUTE FUNCTION prevent_settlement_item_update();

CREATE TRIGGER trg_settlement_report_items_no_update
BEFORE UPDATE ON settlement_report_items
FOR EACH ROW EXECUTE FUNCTION prevent_settlement_item_update();

-- -----------------------------------------------------------------------------
-- D. 款式工序：完工/结算后仅允许修改工价
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_style_process_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    v_company_id UUID;
    v_style_id UUID;
    v_status VARCHAR(20);
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.company_id IS DISTINCT FROM OLD.company_id
        OR NEW.style_id IS DISTINCT FROM OLD.style_id
    ) THEN
        RAISE EXCEPTION 'A style process cannot be moved to another company or style';
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_company_id := OLD.company_id;
        v_style_id := OLD.style_id;
    ELSE
        v_company_id := NEW.company_id;
        v_style_id := NEW.style_id;
    END IF;

    SELECT status INTO v_status
      FROM styles
     WHERE company_id = v_company_id AND id = v_style_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Style not found for style process';
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF v_status <> 'production' THEN
            RAISE EXCEPTION 'Style processes can only be deleted while the style is in production';
        END IF;
        RETURN OLD;
    END IF;

    IF v_status <> 'production' THEN
        IF TG_OP = 'INSERT' THEN
            RAISE EXCEPTION 'Style processes can only be added while the style is in production';
        END IF;

        -- 完工后只允许修改 unit_price；其他生产配置字段仍然锁定
        IF NEW.name IS DISTINCT FROM OLD.name
           OR NEW.group_name IS DISTINCT FROM OLD.group_name
           OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
           OR NEW.has_reported IS DISTINCT FROM OLD.has_reported THEN
            RAISE EXCEPTION 'Style process production data is locked after style completion';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- E. 工资统计索引（按员工 + 款式查询已审核报工）
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reports_approved_employee_style
  ON reports (company_id, employee_id, style_id)
  WHERE status = 'approved';

COMMIT;

-- =============================================================================
-- 回滚脚本（仅在确认不需要本迁移能力时执行）
-- =============================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_settlements_guard_update ON settlements;
-- DROP TRIGGER IF EXISTS trg_settlements_guard_delete ON settlements;
-- DROP TRIGGER IF EXISTS trg_settlement_process_items_no_update ON settlement_process_items;
-- DROP TRIGGER IF EXISTS trg_settlement_report_items_no_update ON settlement_report_items;
-- DROP FUNCTION IF EXISTS guard_settlement_update();
-- DROP FUNCTION IF EXISTS prevent_settlement_delete();
-- DROP FUNCTION IF EXISTS prevent_settlement_item_update();
--
-- CREATE TRIGGER trg_settlements_immutable
--   BEFORE UPDATE OR DELETE ON settlements
--   FOR EACH ROW EXECUTE FUNCTION prevent_settlement_mutation();
-- CREATE TRIGGER trg_settlement_process_items_immutable
--   BEFORE UPDATE OR DELETE ON settlement_process_items
--   FOR EACH ROW EXECUTE FUNCTION prevent_settlement_mutation();
-- CREATE TRIGGER trg_settlement_report_items_immutable
--   BEFORE UPDATE OR DELETE ON settlement_report_items
--   FOR EACH ROW EXECUTE FUNCTION prevent_settlement_mutation();
--
-- -- 工序触发器恢复为原始实现（见 docs/数据库设计与变更说明 V1.0.md）
-- ALTER TABLE settlements
--   ALTER COLUMN total_amount TYPE NUMERIC(14, 2)
--   USING ROUND(total_amount, 2);
-- DROP INDEX IF EXISTS idx_reports_approved_employee_style;
-- COMMIT;
