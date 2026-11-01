import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createIdqApiKey,
  getIdqApiKeys,
  getIdqSettings,
  revokeIdqApiKey,
  updateIdqSettings,
} from "../services/idq-api-key-service";

const KEYS = ["idq-api-keys"];
const SETTINGS = ["idq-settings"];

function errorMessage(err: any, fallback: string) {
  return err?.response?.data?.message ?? fallback;
}

export function useIdqApiKeysQuery() {
  return useQuery({ queryKey: KEYS, queryFn: getIdqApiKeys });
}

export function useCreateIdqApiKeyMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: createIdqApiKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS }),
    onError: (err) =>
      notifications.show({
        message: errorMessage(err, t("Failed to create API key")),
        color: "red",
      }),
  });
}

export function useRevokeIdqApiKeyMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: revokeIdqApiKey,
    onSuccess: () => {
      notifications.show({ message: t("API key revoked") });
      queryClient.invalidateQueries({ queryKey: KEYS });
    },
    onError: (err) =>
      notifications.show({
        message: errorMessage(err, t("Failed to revoke API key")),
        color: "red",
      }),
  });
}

export function useIdqSettingsQuery() {
  return useQuery({ queryKey: SETTINGS, queryFn: getIdqSettings });
}

export function useUpdateIdqSettingsMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: updateIdqSettings,
    onSuccess: (data) => queryClient.setQueryData(SETTINGS, data),
    onError: (err) =>
      notifications.show({
        message: errorMessage(err, t("Failed to update settings")),
        color: "red",
      }),
  });
}
