import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { config } from '@/config/env';
import { useAuthStore } from '@/store/authStore';
import type { ApiErrorBody } from '@/types/api';
import { API_CODES } from '@/types/api';

let onUnauthorized: (() => void) | null = null;
let onWarehouseNotAssigned: (() => void) | null = null;

function devLog(...args: unknown[]) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

function devError(...args: unknown[]) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.error(...args);
  }
}

export function setOnUnauthorized(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export function setOnWarehouseNotAssigned(fn: (() => void) | null) {
  onWarehouseNotAssigned = fn;
}

export interface NormalizedError {
  status: number;
  message: string;
  code?: string;
  requestId?: string;
}

function logHttpOut(method: string, url: string) {
  devLog('[HTTP OUT]', JSON.stringify({ method, url }));
}

function logHttpIn(
  method: string,
  url: string,
  status: number,
  code?: string,
  requestId?: string
) {
  const payload: Record<string, string | number> = { status };
  if (code !== undefined) payload.code = code;
  if (requestId !== undefined) payload.request_id = requestId;
  devLog('[HTTP IN]', JSON.stringify({ method, url, ...payload }));
}

const client = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((req: InternalAxiosRequestConfig) => {
  const method = (req.method ?? 'get').toUpperCase();
  const url = req.url ?? '';
  logHttpOut(method, url);
  const token = useAuthStore.getState().token;
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

client.interceptors.response.use(
  (res) => {
    const data = res.data as
      | { success?: boolean; code?: string; message?: string; request_id?: string }
      | undefined;
    const code = data?.code;
    const requestId = res.headers?.['x-request-id'] ?? data?.request_id;
    logHttpIn(
      res.config.method?.toUpperCase() ?? 'GET',
      res.config.url ?? '',
      res.status,
      code,
      requestId
    );
    return res;
  },
  (
    err: AxiosError<{
      success?: boolean;
      code?: string;
      message?: string;
      request_id?: string;
    }>
  ) => {
    const status = err.response?.status ?? 0;
    const data = err.response?.data;
    const code = data?.code ?? err.response?.headers?.['x-api-code'];
    const requestId = data?.request_id ?? err.response?.headers?.['x-request-id'];

    logHttpIn(
      err.config?.method?.toUpperCase() ?? '?',
      err.config?.url ?? '',
      status,
      code,
      requestId
    );

    if (status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    if (
      status === 403 &&
      code === API_CODES.WAREHOUSE_NOT_ASSIGNED &&
      onWarehouseNotAssigned
    ) {
      onWarehouseNotAssigned();
    }
    if (status >= 500 && !requestId) {
      devError(
        '[HTTP IN] Server error full response:',
        JSON.stringify(err.response?.data ?? err.message)
      );
    }
    return Promise.reject(err);
  }
);

export function setAuthToken(token: string | null) {
  if (token) {
    client.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete client.defaults.headers.common.Authorization;
  }
}

export function normalizeError(err: unknown): NormalizedError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const data = err.response?.data as ApiErrorBody | undefined;
    const code = data?.code;
    const requestId = data?.request_id;

    let message = data?.message;
    if (message === undefined || message === '') {
      if (status === 401) message = 'Session expired. Please log in again.';
      else if (status === 403) {
        if (code === API_CODES.WAREHOUSE_NOT_ASSIGNED) {
          message = 'Warehouse not assigned. Contact admin.';
        } else if (code === API_CODES.FORBIDDEN) {
          message = 'Not permitted.';
        } else {
          message = "You don't have access to this.";
        }
      } else if (status === 400 && code === API_CODES.VALIDATION_ERROR) {
        message = data?.message ?? 'Invalid request.';
      } else if (status >= 500) {
        message = requestId ? 'Server error. Please try again later.' : 'Server error.';
      } else {
        message = err.message || 'Something went wrong.';
      }
    }

    return {
      status,
      message,
      code,
      requestId,
    };
  }
  const message = err instanceof Error ? err.message : 'Something went wrong.';
  let status = 0;
  let code: string | undefined;
  let requestId: string | undefined;
  if (err && typeof err === 'object') {
    const e = err as { status?: number; code?: string; request_id?: string };
    if (typeof e.status === 'number') status = e.status;
    if (typeof e.code === 'string') code = e.code;
    if (typeof e.request_id === 'string') requestId = e.request_id;
  }
  return { status, message, code, requestId };
}

export default client;
