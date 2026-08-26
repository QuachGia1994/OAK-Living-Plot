import { Redirect, useLocalSearchParams } from 'expo-router';
import { dramaRoute } from '@/features/drama/drama-navigation';
import { readParam } from '@/lib/route-params';

export default function LegacyLibraryDramaRedirect() {
  const params = useLocalSearchParams<{ dramaId?: string | string[]; readOnly?: string | string[] }>();
  const dramaId = readParam(params.dramaId);
  const readOnly = readParam(params.readOnly) === '1';

  return dramaId ? <Redirect href={dramaRoute(dramaId, readOnly)} /> : <Redirect href="/" />;
}
