import axios, { type AxiosInstance } from 'axios';

const DEFAULT_BASE_URL = 'http://localhost:3001';
let _client: AxiosInstance | null = null;
let _baseUrl: string = DEFAULT_BASE_URL;

export function setShellMailServer(input: string | AxiosInstance): void {
  if (typeof input === 'string') {
    _baseUrl = input;
    _client = axios.create({ baseURL: input, withCredentials: true, timeout: 60_000 });
  } else {
    _client = input;
  }
}

export function getMailClient(): AxiosInstance {
  if (!_client) {
    _client = axios.create({ baseURL: _baseUrl, withCredentials: true, timeout: 60_000 });
  }
  return _client;
}

export function getMailServerBaseUrl(): string {
  return _baseUrl;
}
