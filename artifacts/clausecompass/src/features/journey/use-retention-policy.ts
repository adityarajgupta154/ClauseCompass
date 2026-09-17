import { useQuery } from "@tanstack/react-query";
import { getRetentionPolicy } from "@workspace/api-client-react";

/**
 * The retention rule the API enforces, for the upload notice: the number of
 * idle minutes after which a session is deleted comes from the server, so
 * the notice cannot drift from what actually happens. Until the answer is
 * in (or if it never comes) the notice states the rule without a number.
 */
export function useRetentionPolicy(): { ttlMinutes: number | null } {
  const query = useQuery({
    queryKey: ["retention-policy"],
    queryFn: ({ signal }) => getRetentionPolicy({ signal }),
    staleTime: Infinity,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  return { ttlMinutes: query.data?.ttlMinutes ?? null };
}
