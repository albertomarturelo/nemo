// Single source of truth for the Vector Capital portal contract (ADR-004). No
// `NEMO_ENV` switch — production is the only target (ported from nemo-cli
// `config.py`). Never hard-code a base URL or a path anywhere else; read it here.
//
// Base URL + sub-prefixes observed at https://portalclientes.vectorcapital.cl
// (the client portal's own web UI) — see docs/vector-contract/*.md for the
// per-endpoint request/response shapes and observation dates.

export const API_BASE_URL = 'https://portalclientes.vectorcapital.cl/api';

/** Every portal path the core reaches. A caller passes the explicit sub-prefix;
 *  `/publicapi` = auth, `/shared` = local instruments, `/frontoffice` = the rest. */
export const ENDPOINTS = {
  signIn: '/publicapi/shared/auth/SignIn',
  refreshToken: '/publicapi/shared/auth/RefreshToken',
  instrumentsLocal: '/shared/Instrumentos/FiltrarInstrumentos',
  instrumentsInternational: '/frontoffice/shared/Asset',
  carteraSummary: '/frontoffice/shared/cartera/CierreCarteraResumidaOnline',
  instrumentPrices: '/frontoffice/shared/PublicadorPrecio/GetPreciosInstrumento',
  carteraMovements: '/frontoffice/shared/MovimientosCajas/Movimientos',
  carteraSaldo: '/frontoffice/shared/Dashboard/ResumenSaldoCaja',
} as const;

/** Renew a cached token this many seconds before its `exp` (proactive refresh,
 *  ADR-005). The reactive 401 path is the backstop. Ported from nemo-cli. */
export const PROACTIVE_REFRESH_SECONDS = 60;

/** Default instrument sub-classes for the local listing (observed filter set). */
export const DEFAULT_LOCAL_SUBCLASSES = ['ACC', 'ACC_INT', 'CFI', 'ETF', 'OPC'] as const;
