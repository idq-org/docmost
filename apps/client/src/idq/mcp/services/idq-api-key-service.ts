import api from "@/lib/api-client";

export interface IIdqApiKey {
  id: string;
  name: string;
  keyHint: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface IIdqApiKeyCreated extends IIdqApiKey {
  key: string;
}

export interface IIdqSettings {
  idqMcpEnabled: boolean;
}

export async function getIdqApiKeys(): Promise<IIdqApiKey[]> {
  const req = await api.post<IIdqApiKey[]>("/idq/api-keys");
  return req.data;
}

export async function createIdqApiKey(data: {
  name: string;
  expiresAt?: string;
}): Promise<IIdqApiKeyCreated> {
  const req = await api.post<IIdqApiKeyCreated>("/idq/api-keys/create", data);
  return req.data;
}

export async function revokeIdqApiKey(id: string): Promise<void> {
  await api.post("/idq/api-keys/revoke", { id });
}

export async function getIdqSettings(): Promise<IIdqSettings> {
  const req = await api.post<IIdqSettings>("/idq/settings");
  return req.data;
}

export async function updateIdqSettings(
  data: IIdqSettings,
): Promise<IIdqSettings> {
  const req = await api.post<IIdqSettings>("/idq/settings/update", data);
  return req.data;
}
