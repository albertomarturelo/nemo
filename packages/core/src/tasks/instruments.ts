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
