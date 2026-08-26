import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { UiLocale } from '@/features/preferences/contracts';
import type { Choice, DramaMood } from '@/features/drama/domain';
import { dramaVisualCopyFor } from './drama-copy';
import { buildSubtitleBeats, clampSceneBeat, moveSceneBeat } from './drama-storyboard';
import { cinematic, classical, colors, parchment, radius, spacing, typography } from './theme';

type SceneTone = (typeof cinematic.scene)[DramaMood];
const classicalFallbackArtwork = require('../../assets/living-plot-scene-fallback-classical.jpg') as ImageSourcePropType;

export function DramaPoster({
  title,
  premise,
  characterName,
  mood,
  sceneLabel,
  actionLabel,
  artwork,
  onPress,
  style,
}: {
  title: string;
  premise: string;
  characterName: string;
  mood: DramaMood;
  sceneLabel: string;
  actionLabel: string;
  artwork?: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const tone = cinematic.scene[mood];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${actionLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.poster, { backgroundColor: tone.base }, style, pressed && styles.posterPressed]}
    >
      {artwork ?? <SceneArtwork mood={mood} />}
      <View style={styles.posterTopFade} />
      <View pointerEvents="none" style={styles.posterInnerFrame} />
      <View style={styles.posterMetaRow}>
        <Text style={styles.posterMeta}>{sceneLabel}</Text>
        <View style={[styles.moodSignal, { backgroundColor: tone.rim }]} />
      </View>
      <View style={styles.posterCopy}>
        <Text style={[styles.posterCharacter, { color: tone.rim }]}>{characterName}</Text>
        <Text style={styles.posterTitle}>{title}</Text>
        <Text style={styles.posterPremise} numberOfLines={3}>{premise}</Text>
        <View style={styles.posterActionRow}>
          <Text style={styles.posterAction}>{actionLabel}</Text>
          <Text style={[styles.posterArrow, { color: tone.rim }]}>→</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function DramaCoverTile({
  title,
  premise,
  characterName,
  mood,
  sceneLabel,
  statusLabel,
  artwork,
  onPress,
  subdued = false,
  style,
}: {
  title: string;
  premise: string;
  characterName: string;
  mood: DramaMood;
  sceneLabel: string;
  statusLabel: string;
  artwork?: ReactNode;
  onPress: () => void;
  subdued?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const tone = cinematic.scene[mood];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${statusLabel}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.coverTile,
        { backgroundColor: tone.base },
        subdued && styles.coverTileSubdued,
        style,
        pressed && styles.coverTilePressed,
      ]}
    >
      {artwork ?? <SceneArtwork mood={mood} />}
      <View style={styles.coverShade} />
      <View pointerEvents="none" style={styles.coverInnerFrame} />
      <View style={styles.coverMetaRow}>
        <Text style={styles.coverScene}>{sceneLabel}</Text>
        <View style={[styles.coverSignal, { backgroundColor: tone.rim }]} />
      </View>
      <View style={styles.coverCopy}>
        <Text style={[styles.coverCharacter, { color: tone.rim }]} numberOfLines={1}>{characterName}</Text>
        <Text style={styles.coverTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.coverPremise} numberOfLines={2}>{premise}</Text>
        <Text style={[styles.coverStatus, { color: tone.rim }]} numberOfLines={1}>{statusLabel}</Text>
      </View>
    </Pressable>
  );
}

export function DramaEmptyStage({
  title,
  detail,
  locale,
  mood = 'mysterious',
}: {
  title: string;
  detail: string;
  locale: UiLocale;
  mood?: DramaMood;
}) {
  const tone = cinematic.scene[mood];
  const copy = dramaVisualCopyFor(locale);
  return (
    <View style={[styles.emptyStage, { backgroundColor: tone.base }]}>
      <SceneArtwork mood={mood} />
      <View style={styles.emptyShade} />
      <View style={styles.emptyCopy}>
        <Text style={[styles.emptyKicker, { color: tone.rim }]}>{copy.emptyKicker}</Text>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyDetail}>{detail}</Text>
      </View>
    </View>
  );
}

export function DramaComposerPreview({
  premise,
  characterName,
  mood,
  label,
  locale,
  compact = false,
}: {
  premise: string;
  characterName: string;
  mood: DramaMood;
  label: string;
  locale: UiLocale;
  compact?: boolean;
}) {
  const tone = cinematic.scene[mood];
  const copy = dramaVisualCopyFor(locale);
  const lead = characterName.trim() || copy.composerLead;
  const sceneText = premise.trim() || copy.composerFallbackScene;
  return (
    <View style={[styles.composerPreview, compact && styles.composerPreviewCompact, { backgroundColor: tone.base }]} accessibilityLabel={`${label}. ${lead}.`}>
      <SceneArtwork mood={mood} />
      <View style={styles.composerShade} />
      <View style={styles.composerMetaRow}>
        <Text style={styles.composerMeta}>{label}</Text>
        <View style={[styles.composerSignal, { backgroundColor: tone.rim }]} />
      </View>
      <View style={styles.composerCopy}>
        <Text style={[styles.composerCharacter, { color: tone.rim }]} numberOfLines={1}>{lead}</Text>
        <Text style={styles.composerPremise} numberOfLines={3}>{sceneText}</Text>
      </View>
    </View>
  );
}

export function DramaUtilityHero({
  kicker,
  title,
  detail,
  mood = 'mysterious',
  artworkSource,
}: {
  kicker: string;
  title: string;
  detail?: string;
  mood?: DramaMood;
  artworkSource?: ImageSourcePropType;
}) {
  const tone = cinematic.scene[mood];
  return (
    <View style={[styles.utilityHero, { backgroundColor: tone.base }]}>
      {artworkSource ? (
        <Image source={artworkSource} style={styles.utilityHeroImage} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <SceneArtwork mood={mood} />
      )}
      <View style={styles.utilityHeroShade} />
      <View style={styles.utilityHeroCopy}>
        <Text style={[styles.utilityHeroKicker, { color: tone.rim }]}>{kicker}</Text>
        <Text style={styles.utilityHeroTitle}>{title}</Text>
        {detail ? <Text style={styles.utilityHeroDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export function DramaRecapFrame({
  sceneNumber,
  title,
  summary,
  choiceLabel,
  consequence,
  pendingLabel,
  locale,
}: {
  sceneNumber: number;
  title: string;
  summary: string;
  choiceLabel?: string;
  consequence?: string;
  pendingLabel: string;
  locale: UiLocale;
}) {
  const tone = cinematic.scene.mysterious;
  return (
    <View style={styles.recapFrame}>
      <View style={[styles.recapVisual, { backgroundColor: tone.base }]}>
        <SceneArtwork mood="mysterious" />
        <View style={styles.recapShade} />
        <View style={styles.recapVisualMeta}>
          <Text style={styles.recapScene}>{locale === 'vi' ? 'CẢNH' : 'SCENE'} {String(sceneNumber).padStart(2, '0')}</Text>
          <View style={[styles.recapSignal, { backgroundColor: tone.rim }]} />
        </View>
        <Text style={styles.recapTitle} numberOfLines={2}>{title}</Text>
      </View>
      <View style={styles.recapCopy}>
        <Text style={styles.recapSummary}>{summary}</Text>
        {choiceLabel ? (
          <View style={styles.recapChoice}>
            <Text style={[styles.recapChoiceLabel, { color: tone.rim }]}>{choiceLabel}</Text>
            {consequence ? <Text style={styles.recapConsequence}>{consequence}</Text> : null}
          </View>
        ) : (
          <Text style={styles.recapPending}>{pendingLabel}</Text>
        )}
      </View>
    </View>
  );
}

export function DramaSceneStage({
  sceneNumber,
  title,
  body,
  characterName,
  mood,
  locale,
  consequence,
  artwork,
  onPlaybackComplete,
}: {
  sceneNumber: number;
  title: string;
  body: string;
  characterName: string;
  mood: DramaMood;
  locale: UiLocale;
  consequence?: string;
  artwork?: ReactNode;
  onPlaybackComplete?: () => void;
}) {
  const beats = useMemo(() => buildSubtitleBeats(body), [body]);
  const [beatIndex, setBeatIndex] = useState(0);
  const tone = cinematic.scene[mood];
  const copy = dramaVisualCopyFor(locale);
  const beat = beats[clampSceneBeat(beatIndex, beats.length)] ?? body;
  const hasNextBeat = beatIndex < beats.length - 1;

  const selectBeat = (targetIndex: number) => {
    const next = clampSceneBeat(targetIndex, beats.length);
    setBeatIndex(next);
    if (next >= beats.length - 1) onPlaybackComplete?.();
  };

  const advanceBeat = () => {
    setBeatIndex((current) => {
      const next = moveSceneBeat(current, 1, beats.length);
      if (next >= beats.length - 1) onPlaybackComplete?.();
      return next;
    });
  };

  useEffect(() => {
    if (consequence || beats.length > 1) return;
    const timer = setTimeout(() => onPlaybackComplete?.(), 0);
    return () => clearTimeout(timer);
  }, [beats.length, consequence, onPlaybackComplete]);

  return (
    <View style={[styles.sceneStage, { backgroundColor: tone.base }]}>
      {artwork ?? <SceneArtwork mood={mood} />}
      <View pointerEvents="none" style={styles.sceneTopShade} />
      <View pointerEvents="none" style={styles.sceneInnerFrame} />
      <View pointerEvents="box-none" style={styles.sceneHeader}>
        <View pointerEvents="none">
          <Text style={styles.sceneIndex}>{locale === 'vi' ? 'CẢNH' : 'SCENE'} {String(sceneNumber).padStart(2, '0')}</Text>
          <Text style={styles.sceneTitle} numberOfLines={2}>{title}</Text>
        </View>
        <View
          style={styles.sceneProgress}
          accessibilityRole="progressbar"
          accessibilityLabel={copy.sceneProgress(Math.min(beatIndex + 1, Math.max(beats.length, 1)), Math.max(beats.length, 1))}
          accessibilityValue={{ min: 1, max: Math.max(beats.length, 1), now: Math.min(beatIndex + 1, Math.max(beats.length, 1)) }}
        >
          {(beats.length > 0 ? beats : [body]).map((_, index) => (
            <Pressable
              key={`${sceneNumber}-beat-${index}`}
              accessibilityRole="button"
              accessibilityLabel={locale === 'vi' ? `Mở đoạn ${index + 1}` : `Open beat ${index + 1}`}
              accessibilityState={{ selected: index === beatIndex }}
              disabled={Boolean(consequence)}
              hitSlop={{ top: 12, bottom: 12 }}
              onPress={(event) => {
                event.stopPropagation();
                selectBeat(index);
              }}
              style={styles.sceneProgressSegment}
            >
              <View
                style={[
                  styles.sceneProgressSegmentBar,
                  index <= beatIndex && { backgroundColor: index === beatIndex ? tone.rim : colors.inkMuted },
                ]}
              />
            </Pressable>
          ))}
        </View>
      </View>

      {consequence ? (
        <ConsequenceOverlay consequence={consequence} tone={tone} locale={locale} />
      ) : (
        <View pointerEvents="none" style={styles.subtitleDock}>
          <View style={styles.subtitleLabelRow}>
            <Text style={[styles.subtitleSpeaker, { color: tone.rim }]}>{characterName}</Text>
            <Text style={styles.subtitleCue}>{hasNextBeat ? copy.sceneAdvanceCue : copy.sceneEndCue}</Text>
          </View>
          <SubtitleBeat key={`${sceneNumber}-${beatIndex}`} text={beat} />
        </View>
      )}

      {!consequence && beats.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${characterName}. ${beat}`}
          accessibilityHint={hasNextBeat ? copy.sceneAdvanceHint : copy.sceneFinalHint}
          accessibilityState={{ disabled: !hasNextBeat }}
          disabled={!hasNextBeat}
          onPress={advanceBeat}
          style={styles.sceneTapTarget}
        />
      ) : null}
    </View>
  );
}

export function DramaChoiceCard({
  choice,
  selected,
  disabled,
  mood: _mood,
  locale,
  onPress,
}: {
  choice: Choice;
  selected: boolean;
  disabled: boolean;
  mood: DramaMood;
  locale: UiLocale;
  onPress: () => void;
}) {
  void _mood;
  const copy = dramaVisualCopyFor(locale);
  const palette = choicePalette(choice.key);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.choiceAccessibility(choice.key, choice.label)}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceCard,
        { borderColor: palette.border, backgroundColor: palette.background },
        selected && { borderColor: palette.activeBorder, backgroundColor: palette.activeBackground },
        pressed && !disabled && styles.choicePressed,
        disabled && styles.choiceDisabled,
      ]}
    >
      <View pointerEvents="none" style={[styles.choiceInnerFrame, { borderColor: palette.innerBorder }]} />
      <View style={[styles.choiceKey, { borderColor: palette.border, backgroundColor: palette.badge }, selected && { borderColor: palette.activeBorder }]}>
        <Text style={[styles.choiceSigil, { color: palette.activeBorder }]}>{palette.sigil}</Text>
        <Text style={[styles.choiceKeyText, selected && { color: colors.ink }]}>{choice.key}</Text>
      </View>
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceLabel, selected && { color: colors.ink }]} numberOfLines={2}>{choice.label}</Text>
        <Text style={styles.choiceIntent} numberOfLines={1}>{choice.intent}</Text>
      </View>
      <Text style={[styles.choiceChevron, { color: palette.activeBorder }]} accessibilityElementsHidden>
        {selected ? '✓' : '›'}
      </Text>
    </Pressable>
  );
}

export function DramaGenerationState({
  mood,
  label,
  detail,
  locale,
}: {
  mood: DramaMood;
  label: string;
  detail: string;
  locale: UiLocale;
}) {
  const tone = cinematic.scene[mood];
  const copy = dramaVisualCopyFor(locale);
  const pulse = usePulse();
  return (
    <View style={[styles.generationCard, { backgroundColor: tone.base }]} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite">
      <SceneArtwork mood={mood} />
      <View style={styles.generationShade} />
      <View style={styles.generationCopy}>
        <Text style={[styles.generationEyebrow, { color: tone.rim }]}>{copy.generationKicker}</Text>
        <Text style={styles.generationTitle}>{label}</Text>
        <Text style={styles.generationDetail}>{detail}</Text>
        <View style={styles.generationTrack}>
          <Animated.View style={[styles.generationTrackLight, { backgroundColor: tone.rim, opacity: pulse }]} />
        </View>
      </View>
    </View>
  );
}

export function DramaLoadingStage({ label, detail, locale }: { label: string; detail?: string; locale: UiLocale }) {
  const copy = dramaVisualCopyFor(locale);
  return (
    <DramaGenerationState
      mood="mysterious"
      label={label}
      detail={detail ?? copy.loadingDefaultDetail}
      locale={locale}
    />
  );
}

function SceneArtwork({ mood }: { mood: DramaMood }) {
  const tone = cinematic.scene[mood];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={classicalFallbackArtwork} style={styles.sceneFallbackArtwork} resizeMode="cover" accessibilityIgnoresInvertColors />
      <View style={[styles.sceneImageTint, { backgroundColor: tone.deep }]} />
    </View>
  );
}

function choicePalette(key: Choice['key']) {
  if (key === 'B') {
    return {
      sigil: '✦',
      border: 'rgba(189, 175, 147, 0.6)',
      activeBorder: parchment.pale,
      innerBorder: 'rgba(243, 231, 207, 0.2)',
      background: 'rgba(26, 23, 16, 0.88)',
      activeBackground: 'rgba(48, 41, 26, 0.94)',
      badge: 'rgba(243, 231, 207, 0.08)',
    };
  }
  if (key === 'C') {
    return {
      sigil: '❧',
      border: 'rgba(143, 104, 55, 0.66)',
      activeBorder: colors.violetStrong,
      innerBorder: 'rgba(211, 162, 93, 0.22)',
      background: 'rgba(27, 17, 8, 0.88)',
      activeBackground: 'rgba(58, 40, 18, 0.94)',
      badge: 'rgba(211, 162, 93, 0.1)',
    };
  }
  return {
    sigil: '☼',
    border: classical.hairline,
    activeBorder: classical.goldPale,
    innerBorder: classical.hairlineSoft,
    background: 'rgba(35, 25, 13, 0.9)',
    activeBackground: 'rgba(69, 46, 19, 0.94)',
    badge: 'rgba(201, 154, 84, 0.1)',
  };
}

function SubtitleBeat({ text }: { text: string }) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translate] = useState(() => new Animated.Value(8));

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active || reduced) {
        opacity.setValue(1);
        translate.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: cinematic.motion.reveal, useNativeDriver: true }),
        Animated.timing(translate, { toValue: 0, duration: cinematic.motion.scene, useNativeDriver: true }),
      ]).start();
    }).catch(() => {
      opacity.setValue(1);
      translate.setValue(0);
    });
    return () => { active = false; };
  }, [opacity, translate]);

  return <Animated.Text style={[styles.subtitleText, { opacity, transform: [{ translateY: translate }] }]}>{text}</Animated.Text>;
}

function ConsequenceOverlay({ consequence, tone, locale }: { consequence: string; tone: SceneTone; locale: UiLocale }) {
  const copy = dramaVisualCopyFor(locale);
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0.98));
  const [beam] = useState(() => new Animated.Value(-220));

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active || reduced) {
        opacity.setValue(1);
        scale.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: cinematic.motion.scene, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 9, tension: 70, useNativeDriver: true }),
        Animated.timing(beam, { toValue: 640, duration: cinematic.motion.consequence, useNativeDriver: true }),
      ]).start();
    }).catch(() => {
      opacity.setValue(1);
      scale.setValue(1);
    });
    return () => { active = false; };
  }, [beam, opacity, scale]);

  return (
    <Animated.View style={[styles.consequenceOverlay, { opacity, transform: [{ scale }] }]} accessibilityLiveRegion="polite">
      <Animated.View style={[styles.consequenceBeam, { backgroundColor: tone.rim, transform: [{ translateX: beam }, { rotate: '14deg' }] }]} />
      <Text style={[styles.consequenceKicker, { color: tone.rim }]}>{copy.consequenceKicker}</Text>
      <Text style={styles.consequenceHeadline}>{copy.consequenceHeadline}</Text>
      <Text style={styles.consequenceText}>{consequence}</Text>
    </Animated.View>
  );
}

function usePulse(): Animated.AnimatedInterpolation<number> | Animated.Value {
  const [value] = useState(() => new Animated.Value(0.36));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active || reduced) {
        value.setValue(0.8);
        return;
      }
      loop = Animated.loop(Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 720, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0.36, duration: 720, useNativeDriver: true }),
      ]));
      loop.start();
    }).catch(() => value.setValue(0.8));
    return () => {
      active = false;
      loop?.stop();
    };
  }, [value]);

  return value;
}

const styles = StyleSheet.create({
  poster: {
    minHeight: 390,
    overflow: 'hidden',
    borderRadius: cinematic.radius.scene,
    borderWidth: 1,
    borderColor: classical.goldDeep,
    shadowColor: classical.gold,
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  posterPressed: { opacity: 0.93, transform: [{ scale: 0.995 }] },
  posterTopFade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: cinematic.overlay.middle },
  posterInnerFrame: {
    position: 'absolute',
    zIndex: 3,
    top: 5,
    right: 5,
    bottom: 5,
    left: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: classical.hairline,
    borderRadius: Math.max(1, cinematic.radius.scene - 4),
  },
  posterMetaRow: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  posterMeta: { ...cinematic.artworkText, color: colors.accentStrong, fontFamily: typography.mono, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  moodSignal: { width: 28, height: 3, borderRadius: radius.pill },
  posterCopy: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.sm,
    padding: spacing.lg,
    paddingTop: spacing.xxxl,
    backgroundColor: cinematic.overlay.strong,
  },
  posterCharacter: { ...cinematic.artworkText, fontFamily: typography.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.7, textTransform: 'uppercase' },
  posterTitle: { ...cinematic.artworkText, color: parchment.pale, fontFamily: typography.display, fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.5 },
  posterPremise: { ...cinematic.artworkText, color: parchment.fog, fontSize: 14, lineHeight: 21 },
  posterActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xs },
  posterAction: { ...cinematic.artworkText, color: colors.accentStrong, fontSize: 15, fontWeight: '900' },
  posterArrow: { fontSize: 24, fontWeight: '400' },
  coverTile: {
    minHeight: 210,
    overflow: 'hidden',
    borderRadius: cinematic.radius.choice,
    borderWidth: 1,
    borderColor: classical.goldDeep,
    backgroundColor: colors.surfaceGlass,
  },
  coverTileSubdued: { opacity: 0.68 },
  coverTilePressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  coverShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(2,2,2,0.18)' },
  coverInnerFrame: {
    position: 'absolute',
    zIndex: 3,
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: classical.hairline,
    borderRadius: Math.max(1, cinematic.radius.choice - 3),
  },
  coverMetaRow: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  coverScene: { ...cinematic.artworkText, color: parchment.pale, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  coverSignal: { width: 22, height: 2, borderRadius: radius.pill },
  coverCopy: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 5,
    padding: spacing.md,
    paddingTop: spacing.xxl,
    backgroundColor: cinematic.overlay.strong,
  },
  coverCharacter: { ...cinematic.artworkText, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  coverTitle: { ...cinematic.artworkText, color: parchment.pale, fontFamily: typography.display, fontSize: 18, lineHeight: 22, fontWeight: '700', letterSpacing: -0.3 },
  coverPremise: { ...cinematic.artworkText, color: parchment.ash, fontSize: 11, lineHeight: 16 },
  coverStatus: { ...cinematic.artworkText, paddingTop: 3, fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 0.75, textTransform: 'uppercase' },
  emptyStage: {
    minHeight: 330,
    overflow: 'hidden',
    borderRadius: cinematic.radius.scene,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderGlow,
    backgroundColor: colors.surfaceGlass,
  },
  emptyShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.32)' },
  emptyCopy: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: spacing.sm },
  emptyKicker: { fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  emptyTitle: { color: parchment.pale, fontFamily: typography.display, fontSize: 30, lineHeight: 34, fontWeight: '700' },
  emptyDetail: { color: parchment.haze, fontSize: 13, lineHeight: 20 },
  composerPreview: {
    minHeight: 300,
    overflow: 'hidden',
    borderRadius: cinematic.radius.scene,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderGlow,
    shadowColor: colors.violetStrong,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  composerPreviewCompact: { minHeight: 210 },
  composerShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.22)' },
  composerMetaRow: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  composerMeta: { ...cinematic.artworkText, color: parchment.pale, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  composerSignal: { width: 28, height: 2, borderRadius: radius.pill },
  composerCopy: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cinematic.overlay.violetHairline,
    backgroundColor: cinematic.overlay.glass,
  },
  composerCharacter: { ...cinematic.artworkText, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
  composerPremise: { ...cinematic.artworkText, color: parchment.pale, fontFamily: typography.display, fontSize: 20, lineHeight: 27, fontWeight: '700' },
  utilityHero: {
    minHeight: 340,
    overflow: 'hidden',
    borderRadius: cinematic.radius.scene,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderGlow,
    shadowColor: colors.violetStrong,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  utilityHeroImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  utilityHeroShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.3)' },
  utilityHeroCopy: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cinematic.overlay.violetHairline,
    backgroundColor: cinematic.overlay.glass,
  },
  utilityHeroKicker: { ...cinematic.artworkText, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
  utilityHeroTitle: { ...cinematic.artworkText, color: parchment.pale, fontFamily: typography.display, fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.5 },
  utilityHeroDetail: { ...cinematic.artworkText, color: parchment.smoke, fontSize: 13, lineHeight: 20 },
  recapFrame: {
    overflow: 'hidden',
    borderRadius: cinematic.radius.choice,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderGlow,
    backgroundColor: colors.surfaceGlass,
  },
  recapVisual: { minHeight: 230, overflow: 'hidden' },
  recapShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.24)' },
  recapVisualMeta: { position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  recapScene: { ...cinematic.artworkText, color: parchment.pale, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  recapSignal: { width: 24, height: 2, borderRadius: radius.pill },
  recapTitle: { ...cinematic.artworkText, position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md, color: parchment.pale, fontFamily: typography.display, fontSize: 25, lineHeight: 29, fontWeight: '700', letterSpacing: -0.45 },
  recapCopy: { gap: spacing.md, padding: spacing.md },
  recapSummary: { color: colors.narrativeInk, fontSize: 14, lineHeight: 22 },
  recapChoice: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  recapChoiceLabel: { fontFamily: typography.display, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  recapConsequence: { color: colors.ink, fontFamily: typography.display, fontSize: 15, lineHeight: 23 },
  recapPending: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 9, lineHeight: 15, fontWeight: '800', letterSpacing: 0.55, textTransform: 'uppercase' },
  sceneStage: {
    minHeight: 440,
    maxHeight: 560,
    overflow: 'hidden',
    borderRadius: cinematic.radius.scene,
    borderWidth: 1,
    borderColor: classical.goldDeep,
  },
  sceneTapTarget: {
    position: 'absolute',
    zIndex: 1,
    top: 132,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sceneFallbackArtwork: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  sceneImageTint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.2 },
  sceneTopShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: cinematic.overlay.top },
  sceneInnerFrame: {
    position: 'absolute',
    zIndex: 3,
    top: 5,
    right: 5,
    bottom: 5,
    left: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: classical.hairline,
    borderRadius: Math.max(1, cinematic.radius.scene - 4),
  },
  sceneHeader: { position: 'absolute', zIndex: 2, top: spacing.lg, left: spacing.lg, right: spacing.lg, gap: spacing.md },
  sceneIndex: { ...cinematic.artworkText, color: parchment.pale, fontFamily: typography.mono, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  sceneTitle: { ...cinematic.artworkText, maxWidth: 300, color: parchment.pale, fontFamily: typography.display, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.5 },
  sceneProgress: { flexDirection: 'row', gap: 5 },
  sceneProgressSegment: { flex: 1, minHeight: 20, justifyContent: 'center' },
  sceneProgressSegmentBar: { height: 2, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)' },
  subtitleDock: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    minHeight: 144,
    justifyContent: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cinematic.overlay.violetHairline,
    backgroundColor: cinematic.overlay.glass,
  },
  subtitleLabelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  subtitleSpeaker: { ...cinematic.artworkText, fontFamily: typography.mono, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase' },
  subtitleCue: { ...cinematic.artworkText, color: parchment.dusk, fontFamily: typography.mono, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  subtitleText: { ...cinematic.artworkText, color: parchment.pale, fontSize: 18, lineHeight: 27, fontWeight: '700' },
  choiceCard: {
    position: 'relative',
    minHeight: 78,
    maxHeight: 104,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceGlass,
  },
  choicePressed: { opacity: 0.88, transform: [{ scale: 0.995 }] },
  choiceDisabled: { opacity: 0.5 },
  choiceInnerFrame: {
    position: 'absolute',
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Math.max(1, radius.lg - 3),
  },
  choiceKey: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceQuiet,
  },
  choiceSigil: { fontFamily: typography.display, fontSize: 16, lineHeight: 18 },
  choiceKeyText: { color: colors.ink, fontFamily: typography.mono, fontSize: 8, lineHeight: 10, fontWeight: '900' },
  choiceCopy: { flex: 1, minWidth: 0, gap: 2 },
  choiceIntent: {
    color: colors.quietInk,
    fontFamily: typography.mono,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  choiceLabel: {
    color: colors.narrativeInk,
    fontFamily: typography.display,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
  },
  choiceChevron: {
    color: colors.quietInk,
    fontSize: 18,
    fontWeight: '600',
    paddingLeft: spacing.xs,
  },
  consequenceOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    minHeight: 220,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.violetSoft,
    backgroundColor: cinematic.overlay.strong,
  },
  consequenceBeam: { position: 'absolute', top: -80, bottom: -80, width: 120, opacity: 0.16 },
  consequenceKicker: { ...cinematic.artworkText, fontFamily: typography.mono, fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  consequenceHeadline: { ...cinematic.artworkText, color: parchment.pale, fontFamily: typography.display, fontSize: 27, lineHeight: 31, fontWeight: '700' },
  consequenceText: { ...cinematic.artworkText, color: parchment.mist, fontSize: 15, lineHeight: 23 },
  generationCard: {
    minHeight: 360,
    overflow: 'hidden',
    borderRadius: cinematic.radius.scene,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderGlow,
  },
  generationShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.34)' },
  generationCopy: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: spacing.sm },
  generationEyebrow: { ...cinematic.artworkText, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  generationTitle: { ...cinematic.artworkText, color: parchment.pale, fontFamily: typography.display, fontSize: 31, lineHeight: 35, fontWeight: '700' },
  generationDetail: { ...cinematic.artworkText, color: parchment.haze, fontSize: 14, lineHeight: 21 },
  generationTrack: { height: 3, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.14)' },
  generationTrackLight: { width: '42%', height: '100%', borderRadius: radius.pill },
});
