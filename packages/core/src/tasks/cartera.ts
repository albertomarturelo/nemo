// Cartera (portfolio) read surface. First module: cash movements over a date range,
// each row classified from its description, plus per-nemotécnico aggregates (the input
// for dividend-yield analysis). Ported from nemo-cli `portfolio/movements.py`; see
// docs/vector-contract/cartera.md for the wire shape and the classification rules.
// Later reads are appended to this module, each in its own section below:
// `carteraSummary` (holdings + P&L) and `carteraSaldo` (cash balance per caja).
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

function asOptionalStr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalDate(value: unknown): string | null {
  // The portal sends `fechaConsulta` as an ISO timestamp; keep only the date, or
  // null if the field is missing (a holdings row may predate the field).
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null;
}

// ── Summary (holdings + P&L) ────────────────────────────────────────────────
// Current holdings with a computed profit/loss and totals grouped by
// classification. Ported from nemo-cli `portfolio/summary.py`; wire shape +
// field mapping in docs/vector-contract/cartera.md. The endpoint returns each
// holding already valued in the requested currency (`codMonedaSld`); P&L and the
// totals are pure client-side math over `valorPresenteCompra/MercadoMonDflt`.

/** One holding, valued in the queried currency, with computed P&L. */
export interface Holding {
  account: string;
  accountName: string;
  classification: string;
  subClassification: string;
  instrumentId: number;
  nemotecnico: string;
  description: string;
  instrumentSubclass: string;
  series: string | null;
  currency: string;
  quantity: number;
  avgBuyPrice: number;
  marketPrice: number;
  costBasis: number;
  marketValue: number;
  pnl: number;
  /** Fraction, not percent: 0.1 = +10 %. `0` when `costBasis <= 0`. */
  pnlPct: number;
  queryDate: string | null;
}

export interface ClassificationTotal {
  classification: string;
  costBasis: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
}

export interface SummaryTotals {
  costBasis: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
}

/** The summary envelope — the integration contract a consumer parses. */
export interface SummaryResult {
  currency: string;
  queryDate: string | null;
  holdings: Holding[];
  totalsByClassification: ClassificationTotal[];
  totals: SummaryTotals;
}

export interface SummaryQuery {
  /** Account id to filter on; 0 = all accounts (the default). */
  accountId?: number;
  /** Valuation currency for `codMonedaSld` (e.g. `CLP`, `USD`). Default `CLP`. */
  currency?: string;
  /** Fold accrued dividends into the valuation (`conDividendos`). Default `true`. */
  withDividends?: boolean;
}

/** Fetch current holdings valued in `currency`, each with a computed P&L, plus
 *  totals grouped by classification and a grand total. */
export async function carteraSummary(
  rt: Runtime,
  query: SummaryQuery = {},
): Promise<SummaryResult> {
  const accountId = query.accountId ?? 0;
  const currency = query.currency ?? 'CLP';
  const withDividends = query.withDividends ?? true;

  return audited(
    rt,
    'cartera.summary',
    async () => {
      const res = await request(rt, {
        method: 'GET',
        path: ENDPOINTS.carteraSummary,
        params: {
          id: accountId,
          tipo: 'Cuenta',
          codMonedaSld: currency,
          conDividendos: withDividends ? 'true' : 'false',
        },
      });
      if (res.status >= 400) {
        throw new ApiError(
          res.status,
          `Failed to load cartera summary (${res.status} ${res.statusText}): ${await res.text()}`,
        );
      }

      const payload: unknown = await res.json();
      if (!Array.isArray(payload)) {
        throw new ContractError('Cartera summary response was not a JSON array.');
      }

      const holdings = payload
        .filter((h): h is Record<string, unknown> => typeof h === 'object' && h !== null)
        .map(toHolding);
      return {
        currency,
        queryDate: latestQueryDate(holdings),
        holdings,
        ...summarizeHoldings(holdings),
      };
    },
    { accountId, currency, withDividends },
  );
}

function toHolding(raw: Record<string, unknown>): Holding {
  const costBasis = asFloat(raw.valorPresenteCompraMonDflt);
  const marketValue = asFloat(raw.valorPresenteMercadoMonDflt);
  const { pnl, pnlPct } = computePnl(costBasis, marketValue);
  return {
    // `cuenta` and `numCuenta` carry the same value; keep the alias-tolerance the
    // Python port used in case one is ever blank.
    account: asStr(raw.cuenta) || asStr(raw.numCuenta),
    accountName: asStr(raw.dscCuenta),
    classification: asStr(raw.clasificacion),
    subClassification: asStr(raw.subClasificacion),
    instrumentId: asInt(raw.idInstrumento),
    nemotecnico: asStr(raw.nemotecnico),
    description: asStr(raw.dscInstrumento),
    instrumentSubclass: asStr(raw.codSubClaseInstrumento),
    // `serie` arrives space-padded (e.g. "A         "); trim, null when blank.
    series: asOptionalStr(raw.serie),
    currency: asStr(raw.codMonedaDflt),
    quantity: asFloat(raw.cantidad),
    avgBuyPrice: asFloat(raw.tasaPrecioCompra),
    marketPrice: asFloat(raw.tasaPrecio),
    costBasis,
    marketValue,
    pnl,
    pnlPct,
    queryDate: asOptionalDate(raw.fechaConsulta),
  };
}

/** Profit/loss for a cost/market pair. `pnlPct` is a fraction and is `0` when the
 *  cost basis is non-positive (avoids divide-by-zero on a fully-divested row).
 *  Exported for unit testing; not part of the public barrel. */
export function computePnl(
  costBasis: number,
  marketValue: number,
): { pnl: number; pnlPct: number } {
  const pnl = marketValue - costBasis;
  const pnlPct = costBasis > 0 ? pnl / costBasis : 0;
  return { pnl, pnlPct };
}

/** Aggregate holdings into per-classification totals (sorted by classification)
 *  and a grand total. Exported for unit testing; not part of the public barrel. */
export function summarizeHoldings(holdings: readonly Holding[]): {
  totalsByClassification: ClassificationTotal[];
  totals: SummaryTotals;
} {
  const byClass = new Map<string, { costBasis: number; marketValue: number }>();
  for (const h of holdings) {
    const entry = byClass.get(h.classification) ?? { costBasis: 0, marketValue: 0 };
    entry.costBasis += h.costBasis;
    entry.marketValue += h.marketValue;
    byClass.set(h.classification, entry);
  }

  const totalsByClassification = [...byClass.entries()]
    .map(([classification, { costBasis, marketValue }]) => ({
      classification,
      costBasis,
      marketValue,
      ...computePnl(costBasis, marketValue),
    }))
    .sort((a, b) => a.classification.localeCompare(b.classification));

  const costBasis = holdings.reduce((acc, h) => acc + h.costBasis, 0);
  const marketValue = holdings.reduce((acc, h) => acc + h.marketValue, 0);
  const totals = { costBasis, marketValue, ...computePnl(costBasis, marketValue) };

  return { totalsByClassification, totals };
}

function latestQueryDate(holdings: readonly Holding[]): string | null {
  const dates = holdings.map((h) => h.queryDate).filter((d): d is string => d !== null);
  return dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
}

// ── Saldo caja (cash balance) ───────────────────────────────────────────────
// The cash balance of every caja as of a date, valued in the requested currency.
// This is the standing balance, not the flows `carteraMovements` reports (whose
// per-row `balance` is a running total, never surfaced as a result of its own).
// Observed at /frontoffice/shared/Dashboard/ResumenSaldoCaja on 2026-07-31; wire
// shape + field mapping in docs/vector-contract/cartera.md.

/** One caja's cash balance. */
export interface CashBalance {
  bucketId: number;
  account: string;
  /** The portal's own key for the caja, e.g. the account number dash-separated. */
  identifier: string;
  /** The caja's OWN currency — not necessarily the queried one. */
  currency: string;
  /** Market code the caja belongs to (e.g. `N` national). */
  market: string;
  /** Balance in the caja's own `currency`. */
  amount: number;
  /** The same balance in the QUERIED currency — the only cross-caja summable field. */
  amountConverted: number;
}

/** The saldo envelope — the integration contract a consumer parses. */
export interface SaldoResult {
  currency: string;
  fecha: string;
  balances: CashBalance[];
  /** Sum of `amountConverted`, in `currency`. */
  total: number;
}

export interface SaldoQuery {
  /** Account id to filter on; 0 = all accounts (the default). */
  accountId?: number;
  /** Valuation currency for `codMonedaSld` (e.g. `CLP`, `USD`). Default `CLP`. */
  currency?: string;
  /** Balance date `YYYY-MM-DD`. Default: today (from the Clock seam). */
  fecha?: string;
}

/** Fetch the cash balance of every caja as of `fecha`, each valued in `currency`,
 *  plus a grand total. The default date comes from the Clock seam so it is testable. */
export async function carteraSaldo(rt: Runtime, query: SaldoQuery = {}): Promise<SaldoResult> {
  const accountId = query.accountId ?? 0;
  const currency = query.currency ?? 'CLP';
  const fecha = query.fecha ?? isoDate(rt.clock.now());

  return audited(
    rt,
    'cartera.saldo',
    async () => {
      const res = await request(rt, {
        method: 'GET',
        path: ENDPOINTS.carteraSaldo,
        params: { id: accountId, tipo: 'Cuenta', codMonedaSld: currency, fecha },
      });
      if (res.status >= 400) {
        throw new ApiError(
          res.status,
          `Failed to load cartera saldo (${res.status} ${res.statusText}): ${await res.text()}`,
        );
      }

      const payload: unknown = await res.json();
      if (!Array.isArray(payload)) {
        throw new ContractError('Cartera saldo response was not a JSON array.');
      }

      const balances = payload
        .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
        .map(toCashBalance);
      // Only `amountConverted` shares a currency across cajas, so it is what totals.
      return { currency, fecha, balances, total: sum(balances.map((b) => b.amountConverted)) };
    },
    { accountId, currency, fecha },
  );
}

function toCashBalance(raw: Record<string, unknown>): CashBalance {
  return {
    bucketId: asInt(raw.idCajaCuenta),
    account: asStr(raw.numCuenta),
    identifier: asStr(raw.identificador),
    currency: asStr(raw.codMoneda),
    market: asStr(raw.codMercado),
    amount: asFloat(raw.monto),
    amountConverted: asFloat(raw.montoConvertido),
  };
}
