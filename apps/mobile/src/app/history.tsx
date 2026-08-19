import { Redirect, useLocalSearchParams } from 'expo-router';

export default function LegacyHistoryRedirect() {
  const params = useLocalSearchParams<{ dramaId?: string | string[] }>();
  const dramaId = readParam(params.dramaId);

  return (
    <Redirect
      href={{
        pathname: '/library/history',
        params: dramaId ? { dramaId } : {},
      }}
    />
  );
}

function readParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]?.trim() || undefined;
  return value?.trim() || undefined;
}
