/* eslint-disable @typescript-eslint/no-explicit-any */
import { PlatformConfig, Logger } from 'homebridge';

import * as qs from 'qs';
import axios from 'axios';
import * as crypto from 'crypto';

const DEFAULT_TIMEOUT_MS = 30000;

function createHttpClient(config: PlatformConfig) {
  return axios.create({
    baseURL: config.cloud_credentials.tuya_region,
    timeout: config.advanced_settings?.connection_timeout ?? DEFAULT_TIMEOUT_MS,
  });
}

export function isTimeoutError(err: unknown): boolean {
  return axios.isAxiosError(err) && (err.code === 'ECONNABORTED' || err.code === 'ERR_CANCELED');
}

export function isConnectionRefusedError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.code === 'ECONNREFUSED';
}


export async function getTuyaToken(config: PlatformConfig, logger: Logger): Promise<string> {
  const method = 'GET';
  const timestamp = Date.now().toString();
  const signUrl = '/v1.0/token?grant_type=1';
  const contentHash = crypto.createHash('sha256').update('').digest('hex');
  const stringToSign = [method, contentHash, '', signUrl].join('\n');
  const signStr = config.cloud_credentials.tuya_access_key + timestamp + stringToSign;

  const headers = {
    t: timestamp,
    sign_method: 'HMAC-SHA256',
    client_id: config.cloud_credentials.tuya_access_key,
    sign: await encryptStr(signStr, config.cloud_credentials.tuya_secret_key),
  };

  const httpClient = createHttpClient(config);

  const { data: login } = await httpClient.get('/v1.0/token?grant_type=1', { headers });
  logger.debug(JSON.stringify(headers));
  if (!login || !login.success) {
    throw Error(`fetch failed: ${login.msg}`);
  }
  return login.result.access_token;
}


export async function getDeviceInfo(deviceId: string, config: PlatformConfig, logger: Logger) {
  const token = await getTuyaToken(config, logger);
  const query = {};
  const method = 'GET';
  const url = `/v1.0/devices/${deviceId}`;
  const reqHeaders: { [k: string]: string } = await getRequestSign(url, method, {}, query, {}, config, token);

  const httpClient = createHttpClient(config);

  const { data } = await httpClient.request({
    method,
    data: {},
    params: {},
    headers: reqHeaders,
    url: reqHeaders.path,
  });
  if (!data || !data.success) {
    throw Error(`request api failed: ${data.msg}`);
  }
  return data;
}


export async function getDeviceStatus(deviceId: string, config: PlatformConfig, logger: Logger) {
  const token = await getTuyaToken(config, logger);
  const query = {};
  const method = 'GET';
  const url = `/v1.0/devices/${deviceId}/status`;
  const reqHeaders: { [k: string]: string } = await getRequestSign(url, method, {}, query, {}, config, token);

  const httpClient = createHttpClient(config);

  const { data } = await httpClient.request({
    method,
    data: {},
    params: {},
    headers: reqHeaders,
    url: reqHeaders.path,
  });
  if (!data || !data.success) {
    throw Error(`request api failed: ${data.msg}`);
  }
  return data;
}


export async function postDeviceCommands(
  deviceId: string,
  config: PlatformConfig,
  logger: Logger,
  code: string,
  new_value: boolean | string | number,
) {
  const token = await getTuyaToken(config, logger);
  const query = {};
  const method = 'POST';
  const url = `/v1.0/devices/${deviceId}/commands`;
  const body = {
    'commands':[
      {
        'code': code,
        'value': new_value,
      },
    ],
  } ;
  const reqHeaders: { [k: string]: string } = await getRequestSign(url, method, {}, query, body, config, token);

  const httpClient = createHttpClient(config);

  const { data } = await httpClient.request({
    method,
    params: {},
    headers: reqHeaders,
    data: body,
    url: reqHeaders.path,
  });
  if (!data || !data.success) {
    throw Error(`request api failed: ${data.msg}`);
  }
  return data;
}


/**
  * HMAC-SHA256 crypto function
  */
async function encryptStr(str: string, secret: string): Promise<string> {
  return crypto.createHmac('sha256', secret).update(str, 'utf8').digest('hex').toUpperCase();
}


/**
  * request sign, save headers
  * @param path
  * @param method
  * @param headers
  * @param query
  * @param body
  */
async function getRequestSign(
  path: string,
  method: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  headers: { [k: string]: string } = {},
  query: { [k: string]: any } = {},
  body: { [k: string]: any } = {},
  config: PlatformConfig,
  token: string,
) {
  const t = Date.now().toString();
  const [uri, pathQuery] = path.split('?');
  const queryMerged = Object.assign(query, qs.parse(pathQuery));
  const sortedQuery: { [k: string]: string } = {};
  Object.keys(queryMerged)
    .sort()
    .forEach((i) => (sortedQuery[i] = query[i]));

  const querystring = decodeURIComponent(qs.stringify(sortedQuery));
  const url = querystring ? `${uri}?${querystring}` : uri;
  const contentHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const stringToSign = [method, contentHash, '', url].join('\n');
  const signStr = config.cloud_credentials.tuya_access_key + token + t + stringToSign;
  return {
    t,
    path: url,
    client_id: config.cloud_credentials.tuya_access_key,
    sign: await encryptStr(signStr, config.cloud_credentials.tuya_secret_key),
    sign_method: 'HMAC-SHA256',
    access_token: token,
  };
}