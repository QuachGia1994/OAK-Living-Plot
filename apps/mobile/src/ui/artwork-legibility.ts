/**
 * Shared contract for copy rendered directly over Scene artwork.
 *
 * Overlays preserve the illustration as the dominant surface; the text shadow
 * carries local contrast across bright and dark image regions.
 */
export const artworkLegibility = {
  overlay: {
    strong: 'rgba(7, 8, 6, 0.58)',
    glass: 'rgba(18, 18, 14, 0.34)',
  },
  textShadow: {
    textShadowColor: 'rgba(0, 0, 0, 0.94)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
} as const;
