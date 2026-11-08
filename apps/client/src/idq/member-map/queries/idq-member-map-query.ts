import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  getAdminMembers,
  getMemberMap,
  getMyLocation,
  setMyLocation,
  updateMembersAsAdmin,
} from "../services/idq-member-map-service";

export const memberMapKeys = {
  all: ["idq-member-map"] as const,
  map: () => [...memberMapKeys.all, "map"] as const,
  mine: () => [...memberMapKeys.all, "mine"] as const,
  admin: () => [...memberMapKeys.all, "admin"] as const,
};

export function useMemberMapQuery() {
  return useQuery({
    queryKey: memberMapKeys.map(),
    queryFn: getMemberMap,
    staleTime: 60 * 1000,
  });
}

export function useMyLocationQuery() {
  return useQuery({
    queryKey: memberMapKeys.mine(),
    queryFn: getMyLocation,
  });
}

export function useSetMyLocationMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setMyLocation,
    onSuccess: (location) => {
      queryClient.setQueryData(memberMapKeys.mine(), location);
      queryClient.invalidateQueries({ queryKey: memberMapKeys.map() });
      notifications.show({ message: t("Members map updated") });
    },
    onError: () => {
      notifications.show({
        message: t("Failed to update the members map"),
        color: "red",
      });
    },
  });
}

export function useAdminMembersQuery(enabled: boolean) {
  return useQuery({
    queryKey: memberMapKeys.admin(),
    queryFn: getAdminMembers,
    enabled,
  });
}

export function useAdminUpdateMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMembersAsAdmin,
    onSuccess: () => {
      // Everything can change: the list, the map, and the admin's own row
      queryClient.invalidateQueries({ queryKey: memberMapKeys.all });
    },
    onError: () => {
      notifications.show({
        message: t("Failed to update the members map"),
        color: "red",
      });
    },
  });
}
