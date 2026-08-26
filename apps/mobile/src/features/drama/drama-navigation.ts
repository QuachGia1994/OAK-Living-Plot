export function dramaRoute(dramaId: string, readOnly = false) {
  return {
    pathname: '/drama' as const,
    params: {
      dramaId,
      ...(readOnly ? { readOnly: '1' as const } : {}),
    },
  };
}
