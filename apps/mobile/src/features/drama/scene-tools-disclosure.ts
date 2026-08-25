export interface SceneToolsDisclosure {
  expanded: boolean;
  revealVersion: number;
}

export function closedSceneToolsDisclosure(): SceneToolsDisclosure {
  return { expanded: false, revealVersion: 0 };
}

export function toggleSceneToolsDisclosure(current: SceneToolsDisclosure): SceneToolsDisclosure {
  if (current.expanded) return { ...current, expanded: false };
  return { expanded: true, revealVersion: current.revealVersion + 1 };
}

export function sceneToolsRevealSignal(
  disclosure: SceneToolsDisclosure,
  sceneId: string,
): string | undefined {
  if (!disclosure.expanded || !sceneId) return undefined;
  return `${sceneId}:${disclosure.revealVersion}`;
}
