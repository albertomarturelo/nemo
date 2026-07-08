// Instruments read surface. The first ported domain task and the template every
// later read mirrors: wrap the authenticated `request()` in one audit receipt,
// validate the envelope, and project each row into a curated, JSON-serializable
// shape (no Date/Map — the library contract, ADR-007). Ported from nemo-cli
// `instruments/local.py`; see docs/vector-contract/instruments.md for the wire shape.
import { DEFAULT_LOCAL_SUBCLASSES, ENDPOINTS } from '../config/index.js';
import { ApiError, ContractError } from '../errors/index.js';
import { request } from '../auth/session.js';
import { audited } from '../audit/index.js';
import type { Runtime } from '../seams/index.js';

/** A curated local (Chilean) instrument row. */
export interface LocalInstrument {
  idInstrumento: number;
  nemotecnico: string;
  descripcion: string;
  codSubClase: string;
  codClase: string;
  codigoFamilia: string;
  codMoneda: string;
  codPais: string;
  isin: string | null;
}

/** The listing envelope every `instruments` read returns — the integration contract
 *  a downstream consumer (`nemo … --json | jq`, or an MCP client) parses. */
export interface LocalInstrumentsPage {
  market: 'local';
  page: number;
  pageSize: number;
  total: number;
  items: LocalInstrument[];
}

export interface LocalInstrumentsQuery {
  search?: string;
  subclasses?: readonly string[];
  page?: number;
  limit?: number;
}

/** List Chilean instruments matching the query. Paged; `total` is the full count. */
export async function instrumentsLocal(
  rt: Runtime,
  query: LocalInstrumentsQuery = {},
): Promise<LocalInstrumentsPage> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 30;
  const subclasses = query.subclasses ?? DEFAULT_LOCAL_SUBCLASSES;

  return audited(
    rt,
    'instruments.local',
    async () => {
      const res = await request(rt, {
        method: 'GET',
        path: ENDPOINTS.instrumentsLocal,
        params: {
          page,
          limit,
          filterNemotecnico: query.search ?? '',
          codSubClaseInstrumentos: subclasses.join(','),
        },
      });
      if (res.status >= 400) {
        throw new ApiError(
          res.status,
          `Failed to list local instruments (${res.status} ${res.statusText}): ${await res.text()}`,
        );
      }

      const payload: unknown = await res.json();
      if (typeof payload !== 'object' || payload === null) {
        throw new ContractError('Local instruments response was not a JSON object.');
      }
      const record = payload as Record<string, unknown>;
      const rawItems = record.result;
      const rawTotal = record.total;
      if (!Array.isArray(rawItems)) {
        throw new ContractError("Local instruments response missing 'result' array.");
      }
      if (typeof rawTotal !== 'number') {
        throw new ContractError("Local instruments response missing integer 'total'.");
      }

      const items = rawItems
        .filter(
          (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
        )
        .map(toInstrument);
      return { market: 'local' as const, page, pageSize: limit, total: rawTotal, items };
    },
    { search: query.search ?? '', page, limit },
  );
}

function toInstrument(item: Record<string, unknown>): LocalInstrument {
  return {
    idInstrumento: asInt(item.idInstrumento),
    nemotecnico: asStr(item.nemotecnico),
    descripcion: asStr(item.dscInstrumento),
    codSubClase: asStr(item.codSubClaseInstrumento),
    codClase: asStr(item.codClaseInstrumento),
    codigoFamilia: asStr(item.codigoFamilia),
    codMoneda: asStr(item.codMoneda),
    codPais: asStr(item.codPais),
    isin: asOptionalStr(item.isin),
  };
}

function asStr(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asOptionalStr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function asInt(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

// ── International instruments ────────────────────────────────────────────────
// US-listed assets the portal serves under `/frontoffice/shared/Asset`. Mirrors
// the local listing shape ({ market, page, pageSize, total, items }) but the wire
// envelope differs: rows live under `items` (not `result`) and the count is
// `totalCount` (not `total`). Observed at the portal's `/frontoffice/shared/Asset`
// endpoint on 2026-07-08; full request/response in docs/vector-contract/instruments.md.

/** A curated international (US-listed) instrument row. */
export interface InternationalInstrument {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  assetClass: string;
  status: string;
  tradable: boolean;
  fractionable: boolean;
  shortable: boolean;
  cusip: string | null;
}

/** The international listing envelope — same shape as the local one, so a
 *  downstream consumer parses both surfaces the same way (only `market` differs). */
export interface InternationalInstrumentsPage {
  market: 'international';
  page: number;
  pageSize: number;
  total: number;
  items: InternationalInstrument[];
}

export interface InternationalInstrumentsQuery {
  /** Free-text filter on symbol / name (portal param `search`). */
  search?: string;
  /** Exchange filter, e.g. `NASDAQ` / `NYSE` (portal param `exchangeName`). */
  exchange?: string;
  page?: number;
  pageSize?: number;
}

/** List international (US-listed) instruments matching the query. Paged; `total`
 *  is the full count. */
export async function instrumentsInternational(
  rt: Runtime,
  query: InternationalInstrumentsQuery = {},
): Promise<InternationalInstrumentsPage> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 30;

  return audited(
    rt,
    'instruments.international',
    async () => {
      const res = await request(rt, {
        method: 'GET',
        path: ENDPOINTS.instrumentsInternational,
        params: {
          page,
          pageSize,
          search: query.search ?? '',
          exchangeName: query.exchange ?? '',
        },
      });
      if (res.status >= 400) {
        throw new ApiError(
          res.status,
          `Failed to list international instruments (${res.status} ${res.statusText}): ${await res.text()}`,
        );
      }

      const payload: unknown = await res.json();
      if (typeof payload !== 'object' || payload === null) {
        throw new ContractError('International instruments response was not a JSON object.');
      }
      const record = payload as Record<string, unknown>;
      const rawItems = record.items;
      const rawTotal = record.totalCount;
      if (!Array.isArray(rawItems)) {
        throw new ContractError("International instruments response missing 'items' array.");
      }
      if (typeof rawTotal !== 'number') {
        throw new ContractError("International instruments response missing integer 'totalCount'.");
      }

      const items = rawItems
        .filter(
          (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
        )
        .map(toInternationalInstrument);
      return { market: 'international' as const, page, pageSize, total: rawTotal, items };
    },
    { search: query.search ?? '', exchange: query.exchange ?? '', page, pageSize },
  );
}

function toInternationalInstrument(item: Record<string, unknown>): InternationalInstrument {
  return {
    id: asStr(item.id),
    symbol: asStr(item.symbol),
    name: asStr(item.name),
    exchange: asStr(item.exchangeName),
    assetClass: asStr(item.assetClassName),
    status: asStr(item.status),
    tradable: asBool(item.tradable),
    fractionable: asBool(item.fractionable),
    shortable: asBool(item.shortable),
    cusip: asOptionalStr(item.cusip),
  };
}

function asBool(value: unknown): boolean {
  return value === true;
}

// ── Local price history (prices) ────────────────────────────────────────────
// ~1 year of daily prices for a LOCAL instrument, with pure summary stats and an
// ASCII sparkline for the CLI human view. Ported from nemo-cli
// `instruments/prices.py`; wire shape in docs/vector-contract/instruments.md.
// The endpoint returns a flat JSON array of daily rows; `precio` is the close,
// `fecha` an ISO timestamp we keep to the date. Local instruments only — the
// prices endpoint does not serve international assets.

/** One daily close. `date` is `YYYY-MM-DD`; `close` is the price that day. */
export interface PricePoint {
  date: string;
  close: number;
}

/** Summary statistics over the close series. `totalReturn` and `sigma` are
 *  fractions (0.1 = 10 %); `sigma` is the sample std-dev of daily simple returns. */
export interface PriceStats {
  totalReturn: number;
  sigma: number;
  min: number;
  max: number;
}

/** The price-history envelope — the integration contract a consumer parses. */
export interface PriceHistory {
  market: 'local';
  idInstrumento: number;
  points: PricePoint[];
  stats: PriceStats;
}

export interface PriceHistoryQuery {
  /** The local instrument id (`idInstrumento`, e.g. from `instruments local`). */
  id: number;
}

/** Fetch ~1 year of daily prices for a local instrument, sorted oldest-first,
 *  with computed summary stats. An empty result (unknown / non-local id) is
 *  raised as an error rather than returned silently. */
export async function instrumentPrices(
  rt: Runtime,
  query: PriceHistoryQuery,
): Promise<PriceHistory> {
  const id = query.id;

  return audited(
    rt,
    'instruments.prices',
    async () => {
      const res = await request(rt, {
        method: 'GET',
        path: ENDPOINTS.instrumentPrices,
        params: { idInstrumento: id },
      });
      if (res.status >= 400) {
        throw new ApiError(
          res.status,
          `Failed to load price history (${res.status} ${res.statusText}): ${await res.text()}`,
        );
      }

      const payload: unknown = await res.json();
      if (!Array.isArray(payload)) {
        throw new ContractError('Price history response was not a JSON array.');
      }

      // Row order is not guaranteed; sort by the ISO date string
      // (lexicographic == chronological for `YYYY-MM-DD`).
      const points = payload
        .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
        .map(toPricePoint)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (points.length === 0) {
        // The endpoint answers 200 + [] for an id it does not serve (unknown, or a
        // non-local/international instrument). Surface that plainly (ADR: no silent
        // empty result) instead of returning a zeroed envelope.
        throw new ApiError(
          res.status,
          `No price history for instrument ${id} — it may be an unknown or non-local (international) instrument id.`,
        );
      }

      return { market: 'local' as const, idInstrumento: id, points, stats: computeStats(points) };
    },
    { idInstrumento: id },
  );
}

function toPricePoint(raw: Record<string, unknown>): PricePoint {
  return { date: asDate(raw.fecha), close: asFloat(raw.precio) };
}

/** Compute summary stats over a close series. `totalReturn` is first→last; `sigma`
 *  is the sample std-dev of daily simple returns (0 for < 2 returns). Exported for
 *  unit testing; not part of the public barrel. */
export function computeStats(points: readonly PricePoint[]): PriceStats {
  const closes = points.map((p) => p.close);
  if (closes.length === 0) return { totalReturn: 0, sigma: 0, min: 0, max: 0 };

  const first = closes[0] ?? 0;
  const last = closes[closes.length - 1] ?? 0;
  const totalReturn = first > 0 ? (last - first) / first : 0;

  const dailyReturns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1] ?? 0;
    const curr = closes[i] ?? 0;
    if (prev > 0) dailyReturns.push((curr - prev) / prev);
  }

  return {
    totalReturn,
    sigma: sampleStdDev(dailyReturns),
    min: Math.min(...closes),
    max: Math.max(...closes),
  };
}

function sampleStdDev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

// Eight levels of vertical block; index 0 is the lowest value in the series.
const SPARK_BLOCKS = '▁▂▃▄▅▆▇█';

/** Render a numeric series as an ASCII block sparkline. A flat series (all equal)
 *  renders as the lowest block. Exported for the CLI human view + unit testing;
 *  not the JSON contract (the envelope carries `points` + `stats`, not this string). */
export function sparkline(values: readonly number[]): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const top = SPARK_BLOCKS.length - 1;
  const chars = values.map((v) => {
    const idx = range === 0 ? 0 : Math.round(((v - min) / range) * top);
    // idx is always in [0, top]; the literal keeps the return type `string`.
    return SPARK_BLOCKS[idx] ?? '█';
  });
  return chars.join('');
}

function asFloat(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function asDate(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}
