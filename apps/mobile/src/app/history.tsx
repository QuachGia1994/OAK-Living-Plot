import { Redirect, useLocalSearchParams } from 'expo-router';
import { readParam } from '@/lib/route-params';

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

