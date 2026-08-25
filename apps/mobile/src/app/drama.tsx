import { Redirect, useLocalSearchParams } from 'expo-router';
import { readParam } from '@/lib/route-params';

export default function LegacyDramaRedirect() {
  const params = useLocalSearchParams<{ dramaId?: string | string[]; readOnly?: string | string[] }>();
  const dramaId = readParam(params.dramaId);
  const readOnly = readParam(params.readOnly);

  return (
    <Redirect
      href={{
        pathname: '/library/drama',
        params: {
          ...(dramaId ? { dramaId } : {}),
          ...(readOnly ? { readOnly } : {}),
        },
      }}
    />
  );
}

