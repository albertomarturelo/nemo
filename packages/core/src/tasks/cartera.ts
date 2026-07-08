// Cartera (portfolio) read surface. First module: cash movements over a date range,
// each row classified from its description, plus per-nemotécnico aggregates (the input
// for dividend-yield analysis). Ported from nemo-cli `portfolio/movements.py`; see
// docs/vector-contract/cartera.md for the wire shape and the classification rules.
// `carteraSummary` (holdings + P&L) will be appended to this module (see #3).
import { ENDPOINTS } from '../config/index.js';
import { ApiError, ContractError } from '../errors/index.js';
import { request } from '../auth/session.js';
import { audited } from '../audit/index.js';
import type { Runtime } from '../seams/index.js';

export type MovementKind =
  'dividend' | 'buy' | 'sell' | 'commission' | 'cash_in' | 'cash_out' | 'other';

export interface DividendInfo {
  exDate: string | null;
  nemotecnico: string;
  perUnitAmount: number;
}

export interface TradeInfo {
  nemotecnico: string;
  side: 'buy' | 'sell';
}

/** One classified cash movement. `credit`/`debit`/`balance` are the raw amounts;
 *  `dividend`/`trade` carry the parsed structure when the description matched. */
export interface Movement {
  bucketId: number;
  bucketName: string;
  account: string;
  sequence: number;
  date: string;
  settlementDate: string;
  description: string;
  kind: MovementKind;
  credit: number;
  debit: number;
  balance: number;
  currency: string;
  dividend: DividendInfo | null;
  trade: TradeInfo | null;
}

export interface DividendSummaryItem {
  nemotecnico: string;
  totalReceived: number;
  occurrences: number;
}

export interface TradeSummaryItem {
  nemotecnico: string;
  side: 'buy' | 'sell';
  totalAmount: number;
  occurrences: number;
}

export interface MovementsSummary {
  totalCashIn: number;
  totalCashOut: number;
  totalDividends: number;
  totalCommissions: number;
  totalBuys: number;
  totalSells: number;
  byDividend: DividendSummaryItem[];
  byTrade: TradeSummaryItem[];
}

export interface CashBucket {
  bucketId: number;
  name: string;
  movements: Movement[];
  summary: MovementsSummary;
}

/** The movements envelope — the integration contract a consumer parses. */
export interface MovementsResult {
  from: string;
  to: string;
  buckets: CashBucket[];
  summary: MovementsSummary;
}

export interface MovementsQuery {
  /** Start date YYYY-MM-DD. Default: 365 days before `hasta`. */
  desde?: string;
  /** End date YYYY-MM-DD. Default: today (from the Clock seam). */
  hasta?: string;
  /** Account id to filter on; 0 = all accounts (the default). */
  accountId?: number;
}

const DAY_MS = 86_400_000;

/** List cash movements over a date range, classified and aggregated. The default
 *  window is the last 365 days, computed from the Clock seam so it is testable. */
export async function carteraMovements(
  rt: Runtime,
  query: MovementsQuery = {},
): Promise<MovementsResult> {
  const now = rt.clock.now();
  const hasta = query.hasta ?? isoDate(now);
  const desde = query.desde ?? isoDate(now - 365 * DAY_MS);
  const accountId = query.accountId ?? 0;

  return audited(
    rt,
    'cartera.movements',
    async () => {
      // The movements endpoint is markedly slower than the rest (it can generate a
      // year of activity in one shot), so it gets a generous timeout (ported).
      const res = await request(rt, {
        method: 'GET',
        path: ENDPOINTS.carteraMovements,
        params: { id: accountId, tipo: 'Cuenta', desde, hasta },
        timeoutMs: 180_000,
      });
      if (res.status >= 400) {
        throw new ApiError(
          res.status,
          `Failed to load movements (${res.status} ${res.statusText}): ${await res.text()}`,
        );
      }

      const payload: unknown = await res.json();
      if (!Array.isArray(payload)) {
        throw new ContractError('Movements response was not a JSON array.');
      }

      const buckets = payload
        .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
        .map(toBucket);
      const grand = buckets.flatMap((b) => b.movements);
      return { from: desde, to: hasta, buckets, summary: summarizeMovements(grand) };
    },
    { desde, hasta, accountId },
  );
}

function toBucket(raw: Record<string, unknown>): CashBucket {
  const bucketId = asInt(raw.idCajaCuenta);
  const name = asStr(raw.dscCajaCuenta);
  const rawMovs = raw.movimientos;
  const movements = Array.isArray(rawMovs)
    ? rawMovs
        .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
        .map((m) => toMovement(m, bucketId, name))
    : [];
  return { bucketId, name, movements, summary: summarizeMovements(movements) };
}

function toMovement(
  raw: Record<string, unknown>,
  bucketIdDefault: number,
  bucketNameDefault: string,
): Movement {
  const description = asStr(raw.movimiento);
  const credit = asFloat(raw.abono);
  const debit = asFloat(raw.cargo);
  const { kind, dividend, trade } = classifyMovement(description, credit, debit);
  return {
    bucketId: asInt(raw.idCajaCuenta) || bucketIdDefault,
    bucketName: asStr(raw.dscCajaCuenta) || bucketNameDefault,
    account: asStr(raw.numCuenta),
    sequence: asInt(raw.orden),
    date: asDate(raw.fechaMovimiento),
    settlementDate: asDate(raw.fechaLiquidacion),
    description,
    kind,
    credit,
    debit,
    balance: asFloat(raw.saldo),
    currency: asStr(raw.codMoneda),
    dividend,
    trade,
  };
}

// Classification rules observed in the portal's movement descriptions (ported from
// nemo-cli). Each is cited by the exact shape it matches; unknown rows are `other`.
const DIVIDEND_RE = /^DIV;(\d{1,2}-\d{1,2}-\d{4});([^;]+);([\d,.]+)$/;
const TRADE_RE = /^(COMPRA|VENTA) FONDOS CB - (\S+)$/;
const COMMISSION_TEXT = 'COMISION TRANSACCIÓN BOLSA';
const RUT_RE = /^\d{1,2}(\.\d{3}){0,2}-[\dkK]$/;

/** Classify one movement from its description (+ the credit/debit signs). Exported
 *  for unit testing; not part of the public barrel. */
export function classifyMovement(
  description: string,
  credit: number,
  debit: number,
): { kind: MovementKind; dividend: DividendInfo | null; trade: TradeInfo | null } {
  const cleaned = description.trim();

  const div = DIVIDEND_RE.exec(cleaned);
  if (div) {
    const exDmy = div[1] ?? '';
    const nemo = (div[2] ?? '').trim();
    const amountStr = div[3] ?? '';
    return {
      kind: 'dividend',
      dividend: {
        exDate: toIsoFromDmy(exDmy),
        nemotecnico: nemo,
        perUnitAmount: parseAmount(amountStr),
      },
      trade: null,
    };
  }

  const trade = TRADE_RE.exec(cleaned);
  if (trade) {
    const side: 'buy' | 'sell' = trade[1] === 'COMPRA' ? 'buy' : 'sell';
    return { kind: side, dividend: null, trade: { nemotecnico: (trade[2] ?? '').trim(), side } };
  }

  if (cleaned === COMMISSION_TEXT) return { kind: 'commission', dividend: null, trade: null };

  if (RUT_RE.test(cleaned)) {
    if (credit > 0) return { kind: 'cash_in', dividend: null, trade: null };
    if (debit > 0) return { kind: 'cash_out', dividend: null, trade: null };
  }

  return { kind: 'other', dividend: null, trade: null };
}

/** Aggregate a flat list of classified movements into totals + per-instrument rows.
 *  Exported for unit testing; not part of the public barrel. */
export function summarizeMovements(movements: readonly Movement[]): MovementsSummary {
  let totalCashIn = 0;
  let totalCashOut = 0;
  let totalDividends = 0;
  let totalCommissions = 0;
  let totalBuys = 0;
  let totalSells = 0;
  const divTotals = new Map<string, number[]>();
  const tradeTotals = new Map<
    string,
    { nemotecnico: string; side: 'buy' | 'sell'; amounts: number[] }
  >();

  for (const m of movements) {
    switch (m.kind) {
      case 'cash_in':
        totalCashIn += m.credit;
        break;
      case 'cash_out':
        totalCashOut += m.debit;
        break;
      case 'commission':
        totalCommissions += m.debit;
        break;
      case 'dividend':
        totalDividends += m.credit;
        if (m.dividend) push(divTotals, m.dividend.nemotecnico, m.credit);
        break;
      case 'buy':
        totalBuys += m.debit;
        if (m.trade) pushTrade(tradeTotals, m.trade, m.debit);
        break;
      case 'sell':
        totalSells += m.credit;
        if (m.trade) pushTrade(tradeTotals, m.trade, m.credit);
        break;
      // 'other' intentionally contributes to no total.
    }
  }

  const byDividend = [...divTotals.entries()]
    .map(([nemotecnico, amounts]) => ({
      nemotecnico,
      totalReceived: sum(amounts),
      occurrences: amounts.length,
    }))
    .sort((a, b) => b.totalReceived - a.totalReceived);

  const byTrade = [...tradeTotals.values()]
    .map((t) => ({
      nemotecnico: t.nemotecnico,
      side: t.side,
      totalAmount: sum(t.amounts),
      occurrences: t.amounts.length,
    }))
    .sort((a, b) => a.nemotecnico.localeCompare(b.nemotecnico) || a.side.localeCompare(b.side));

  return {
    totalCashIn,
    totalCashOut,
    totalDividends,
    totalCommissions,
    totalBuys,
    totalSells,
    byDividend,
    byTrade,
  };
}

function push(map: Map<string, number[]>, key: string, value: number): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function pushTrade(
  map: Map<string, { nemotecnico: string; side: 'buy' | 'sell'; amounts: number[] }>,
  trade: TradeInfo,
  value: number,
): void {
  const key = `${trade.nemotecnico} ${trade.side}`;
  const entry = map.get(key);
  if (entry) entry.amounts.push(value);
  else map.set(key, { nemotecnico: trade.nemotecnico, side: trade.side, amounts: [value] });
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

function toIsoFromDmy(dmy: string): string | null {
  const parts = dmy.split('-');
  if (parts.length !== 3) return null;
  const [d, mo, y] = parts;
  if (!d || !mo || !y) return null;
  return `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseAmount(text: string): number {
  // Chilean number formatting: '.' groups thousands, ',' is the decimal separator.
  // Normalise only when a comma is present; a bare-dot value is already decimal
  // (e.g. "3.5"). So "1.234,56" → 1234.56 and "12,34" → 12.34.
  const normalised = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function asStr(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asInt(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : 0;
}

function asFloat(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function asDate(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}
