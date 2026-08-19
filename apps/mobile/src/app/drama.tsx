import { Redirect, useLocalSearchParams } from 'expo-router';

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

function readParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]?.trim() || undefined;
  return value?.trim() || undefined;
}
