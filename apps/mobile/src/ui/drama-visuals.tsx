import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { UiLocale } from '@/features/preferences/contracts';
import type { StoryChoice, StoryMood } from '@/features/story/contracts';
import { dramaVisualCopyFor } from './drama-copy';
import { buildSubtitleBeats, clampSceneBeat, sceneMotifForText, type SceneMotif } from './drama-storyboard';
import { cinematic, colors, radius, spacing, typography } from './theme';

type SceneTone = (typeof cinematic.scene)[StoryMood];

export function DramaPoster({
  title,
  premise,
  characterName,
  mood,
  episodeLabel,
  actionLabel,
  onPress,
  style,
}: {
  title: string;
  premise: string;
  characterName: string;
  mood: StoryMood;
  episodeLabel: string;
  actionLabel: string;
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
      <SceneArtwork mood={mood} characterName={characterName} sceneText={`${title} ${premise}`} />
      <View style={styles.posterTopFade} />
      <View style={styles.posterMetaRow}>
        <Text style={styles.posterMeta}>{episodeLabel}</Text>
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
  episodeLabel,
  statusLabel,
  onPress,
  subdued = false,
  style,
}: {
  title: string;
  premise: string;
  characterName: string;
  mood: StoryMood;
  episodeLabel: string;
  statusLabel: string;
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
      <SceneArtwork mood={mood} characterName={characterName} sceneText={`${title} ${premise}`} compact />
      <View style={styles.coverShade} />
      <View style={styles.coverMetaRow}>
        <Text style={styles.coverEpisode}>{episodeLabel}</Text>
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
  mood?: StoryMood;
}) {
  const tone = cinematic.scene[mood];
  const copy = dramaVisualCopyFor(locale);
  return (
    <View style={[styles.emptyStage, { backgroundColor: tone.base }]}>
      <SceneArtwork mood={mood} characterName="Lead" sceneText={detail} compact />
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
}: {
  premise: string;
  characterName: string;
  mood: StoryMood;
  label: string;
  locale: UiLocale;
}) {
  const tone = cinematic.scene[mood];
  const copy = dramaVisualCopyFor(locale);
  const lead = characterName.trim() || copy.composerLead;
  const sceneText = premise.trim() || copy.composerFallbackScene;
  return (
    <View style={[styles.composerPreview, { backgroundColor: tone.base }]} accessibilityLabel={`${label}. ${lead}.`}>
      <SceneArtwork mood={mood} characterName={lead} sceneText={sceneText} compact />
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

export function DramaMoodSwatch({
  mood,
  label,
  description,
  selected,
  locale,
  onPress,
}: {
  mood: StoryMood;
  label: string;
  description: string;
  selected: boolean;
  locale: UiLocale;
  onPress: () => void;
}) {
  const tone = cinematic.scene[mood];
  const copy = dramaVisualCopyFor(locale);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${description}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.moodSwatch,
        { backgroundColor: tone.deep, borderColor: selected ? tone.rim : cinematic.overlay.hairline },
        pressed && styles.moodSwatchPressed,
      ]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.moodSwatchGlow, { backgroundColor: tone.glow }]} />
        <View style={[styles.moodSwatchRim, { backgroundColor: tone.rim }]} />
        <View style={styles.moodSwatchSilhouette} />
        <View style={styles.moodSwatchShade} />
      </View>
      <View style={styles.moodSwatchTopRow}>
        <Text style={styles.moodSwatchState}>{selected ? copy.moodSelected : copy.moodKicker}</Text>
        <View style={[styles.moodSwatchSignal, { backgroundColor: tone.rim }]} />
      </View>
      <View style={styles.moodSwatchCopy}>
        <Text style={[styles.moodSwatchLabel, selected && { color: tone.rim }]}>{label}</Text>
        <Text style={styles.moodSwatchDescription} numberOfLines={2}>{description}</Text>
      </View>
    </Pressable>
  );
}

export function DramaCastingPreview({
  characterName,
  mood,
  premise,
  label,
  locale,
}: {
  characterName: string;
  mood: StoryMood;
  premise: string;
  label: string;
  locale: UiLocale;
}) {
  const tone = cinematic.scene[mood];
  const copy = dramaVisualCopyFor(locale);
  const lead = characterName.trim() || copy.castingUncast;
  return (
    <View style={[styles.castingPreview, { backgroundColor: tone.base }]}>
      <SceneArtwork mood={mood} characterName={lead} sceneText={premise} compact />
      <View style={styles.castingShade} />
      <View style={styles.castingCopy}>
        <Text style={[styles.castingKicker, { color: tone.rim }]}>{label}</Text>
        <Text style={styles.castingName} numberOfLines={1}>{lead}</Text>
        <Text style={styles.castingMeta}>{characterName.trim() ? copy.castingLocked : copy.castingPrompt}</Text>
      </View>
    </View>
  );
}

export function DramaUtilityHero({
  kicker,
  title,
  detail,
  mood = 'mysterious',
  characterName = 'Living Plot',
}: {
  kicker: string;
  title: string;
  detail?: string;
  mood?: StoryMood;
  characterName?: string;
}) {
  const tone = cinematic.scene[mood];
  return (
    <View style={[styles.utilityHero, { backgroundColor: tone.base }]}>
      <SceneArtwork mood={mood} characterName={characterName} sceneText={`${title} ${detail ?? ''}`} compact />
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
  episodeNumber,
  title,
  summary,
  choiceLabel,
  consequence,
  pendingLabel,
}: {
  episodeNumber: number;
  title: string;
  summary: string;
  choiceLabel?: string;
  consequence?: string;
  pendingLabel: string;
}) {
  const tone = cinematic.scene.mysterious;
  const sceneText = `${title} ${summary} ${consequence ?? ''}`;
  return (
    <View style={styles.recapFrame}>
      <View style={[styles.recapVisual, { backgroundColor: tone.base }]}>
        <SceneArtwork mood="mysterious" characterName={`EP ${episodeNumber}`} sceneText={sceneText} compact />
        <View style={styles.recapShade} />
        <View style={styles.recapVisualMeta}>
          <Text style={styles.recapEpisode}>EP {String(episodeNumber).padStart(2, '0')}</Text>
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
  episodeNumber,
  title,
  body,
  characterName,
  mood,
  locale,
  consequence,
}: {
  episodeNumber: number;
  title: string;
  body: string;
  characterName: string;
  mood: StoryMood;
  locale: UiLocale;
  consequence?: string;
}) {
  const beats = useMemo(() => buildSubtitleBeats(body), [body]);
  const [beatIndex, setBeatIndex] = useState(0);
  const tone = cinematic.scene[mood];
  const copy = dramaVisualCopyFor(locale);
  const beat = beats[clampSceneBeat(beatIndex, beats.length)] ?? body;
  const hasNextBeat = beatIndex < beats.length - 1;

  return (
    <Pressable
      accessibilityRole={consequence ? undefined : 'button'}
      accessibilityLabel={consequence ? undefined : `${characterName}. ${beat}`}
      accessibilityHint={consequence ? undefined : hasNextBeat ? copy.sceneAdvanceHint : copy.sceneFinalHint}
      disabled={Boolean(consequence) || !hasNextBeat}
      onPress={() => hasNextBeat && setBeatIndex((current) => current + 1)}
      style={[styles.sceneStage, { backgroundColor: tone.base }]}
    >
      <SceneArtwork mood={mood} characterName={characterName} sceneText={`${title} ${body}`} />
      <View style={styles.sceneTopShade} />
      <View style={styles.sceneHeader}>
        <View>
          <Text style={styles.sceneEpisode}>EP {String(episodeNumber).padStart(2, '0')}</Text>
          <Text style={styles.sceneTitle} numberOfLines={2}>{title}</Text>
        </View>
        <View
          style={styles.sceneProgress}
          accessibilityRole="progressbar"
          accessibilityLabel={copy.sceneProgress(Math.min(beatIndex + 1, Math.max(beats.length, 1)), Math.max(beats.length, 1))}
          accessibilityValue={{ min: 1, max: Math.max(beats.length, 1), now: Math.min(beatIndex + 1, Math.max(beats.length, 1)) }}
        >
          {(beats.length > 0 ? beats : [body]).map((_, index) => (
            <View
              key={`${episodeNumber}-beat-${index}`}
              style={[
                styles.sceneProgressSegment,
                index <= beatIndex && { backgroundColor: index === beatIndex ? tone.rim : colors.inkMuted },
              ]}
            />
          ))}
        </View>
      </View>

      {consequence ? (
        <ConsequenceOverlay consequence={consequence} tone={tone} locale={locale} />
      ) : (
        <View style={styles.subtitleDock}>
          <View style={styles.subtitleLabelRow}>
            <Text style={[styles.subtitleSpeaker, { color: tone.rim }]}>{characterName}</Text>
            <Text style={styles.subtitleCue}>{hasNextBeat ? copy.sceneAdvanceCue : copy.sceneEndCue}</Text>
          </View>
          <SubtitleBeat key={`${episodeNumber}-${beatIndex}`} text={beat} />
        </View>
      )}
    </Pressable>
  );
}

export function DramaChoiceCard({
  choice,
  selected,
  disabled,
  mood,
  locale,
  onPress,
}: {
  choice: StoryChoice;
  selected: boolean;
  disabled: boolean;
  mood: StoryMood;
  locale: UiLocale;
  onPress: () => void;
}) {
  const tone = cinematic.scene[mood];
  const copy = dramaVisualCopyFor(locale);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.choiceAccessibility(choice.key, choice.label)}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceCard,
        selected && { borderColor: tone.rim, backgroundColor: tone.haze },
        pressed && !disabled && styles.choicePressed,
        disabled && styles.choiceDisabled,
      ]}
    >
      <View style={styles.choiceTopRow}>
        <View style={[styles.choiceKey, selected && { borderColor: tone.rim, backgroundColor: tone.rim }]}> 
          <Text style={[styles.choiceKeyText, selected && { color: tone.deep }]}>{choice.key}</Text>
        </View>
        <Text style={styles.choiceIntent}>{choice.intent}</Text>
      </View>
      <Text style={[styles.choiceLabel, selected && { color: colors.ink }]}>{choice.label}</Text>
      <View style={styles.choiceBottomRow}>
        <View style={[styles.choiceLight, { backgroundColor: selected ? tone.rim : tone.glow }]} />
        <Text style={[styles.choiceState, selected && { color: tone.rim }]}>{selected ? copy.choiceSelected : copy.choicePrompt}</Text>
      </View>
    </Pressable>
  );
}

export function DramaGenerationState({
  characterName,
  mood,
  label,
  detail,
  locale,
}: {
  characterName: string;
  mood: StoryMood;
  label: string;
  detail: string;
  locale: UiLocale;
}) {
  const tone = cinematic.scene[mood];
  const copy = dramaVisualCopyFor(locale);
  const pulse = usePulse();
  return (
    <View style={[styles.generationCard, { backgroundColor: tone.base }]} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite">
      <SceneArtwork mood={mood} characterName={characterName || 'Lead'} compact />
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
      characterName="Lead"
      mood="mysterious"
      label={label}
      detail={detail ?? copy.loadingDefaultDetail}
      locale={locale}
    />
  );
}

function SceneArtwork({
  mood,
  characterName,
  sceneText = '',
  compact = false,
}: {
  mood: StoryMood;
  characterName: string;
  sceneText?: string;
  compact?: boolean;
}) {
  const tone = cinematic.scene[mood];
  const alignRight = characterName.length % 2 === 0;
  const motif = sceneMotifForText(sceneText);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.sceneBase, { backgroundColor: tone.deep }]} />
      <View style={[styles.lightOrb, styles.lightOrbPrimary, { backgroundColor: tone.glow, opacity: compact ? 0.48 : 0.62 }]} />
      <View style={[styles.lightOrb, styles.lightOrbSecondary, { backgroundColor: tone.rim, opacity: compact ? 0.11 : 0.16 }]} />
      <View style={[styles.horizonGlow, { backgroundColor: tone.haze }]} />
      <View style={[styles.characterRig, alignRight ? styles.characterRight : styles.characterLeft, compact && styles.characterRigCompact]}>
        <View style={[styles.characterRimBody, { backgroundColor: tone.rim }]} />
        <View style={styles.characterBody} />
        <View style={[styles.characterRimHead, { backgroundColor: tone.rim }]} />
        <View style={styles.characterHead} />
      </View>
      <SceneMotifLayer motif={motif} tone={tone} />
      <View style={[styles.setPanel, styles.setPanelOne, { borderColor: tone.rim }]} />
      <View style={[styles.setPanel, styles.setPanelTwo, { borderColor: tone.glow }]} />
      <View style={styles.floorShadow} />
    </View>
  );
}

function SceneMotifLayer({ motif, tone }: { motif: SceneMotif; tone: SceneTone }) {
  if (motif === 'signal') {
    return (
      <View style={styles.signalRig}>
        <View style={[styles.signalHalo, { backgroundColor: tone.rim }]} />
        <View style={[styles.signalDevice, { borderColor: tone.rim }]}>
          <View style={[styles.signalLine, { backgroundColor: tone.rim }]} />
          <View style={styles.signalLineMuted} />
          <View style={styles.signalLineMutedShort} />
        </View>
      </View>
    );
  }
  if (motif === 'threshold') {
    return (
      <View style={styles.thresholdRig}>
        <View style={[styles.thresholdFrame, { borderColor: tone.rim }]} />
        <View style={[styles.thresholdGap, { backgroundColor: tone.glow }]} />
      </View>
    );
  }
  if (motif === 'table') {
    return (
      <View style={styles.tableRig}>
        <View style={[styles.tableLampGlow, { backgroundColor: tone.rim }]} />
        <View style={styles.tableTop} />
        <View style={styles.tableStem} />
      </View>
    );
  }
  if (motif === 'street') {
    return (
      <View style={styles.streetRig}>
        <View style={[styles.streetLight, { backgroundColor: tone.rim }]} />
        <View style={styles.streetLine} />
        <View style={styles.streetLineTwo} />
        <View style={styles.streetLineThree} />
      </View>
    );
  }
  return <View style={[styles.interiorWindow, { borderColor: tone.rim }]} />;
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
    minHeight: 500,
    overflow: 'hidden',
    borderRadius: cinematic.radius.scene,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cinematic.overlay.hairline,
  },
  posterPressed: { opacity: 0.93, transform: [{ scale: 0.995 }] },
  posterTopFade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: cinematic.overlay.middle },
  posterMetaRow: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  posterMeta: { color: colors.ink, fontFamily: typography.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
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
  posterCharacter: { fontFamily: typography.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.7, textTransform: 'uppercase' },
  posterTitle: { color: '#FFF9EF', fontFamily: typography.display, fontSize: 37, lineHeight: 41, fontWeight: '700', letterSpacing: -1 },
  posterPremise: { color: '#DDD5CA', fontSize: 14, lineHeight: 21 },
  posterActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xs },
  posterAction: { color: '#FFF9EF', fontSize: 15, fontWeight: '900' },
  posterArrow: { fontSize: 24, fontWeight: '400' },
  coverTile: {
    minHeight: 310,
    overflow: 'hidden',
    borderRadius: cinematic.radius.choice,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cinematic.overlay.hairline,
  },
  coverTileSubdued: { opacity: 0.68 },
  coverTilePressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  coverShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(2,2,2,0.18)' },
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
  coverEpisode: { color: '#FFF9EF', fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
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
  coverCharacter: { fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  coverTitle: { color: '#FFF9EF', fontFamily: typography.display, fontSize: 21, lineHeight: 24, fontWeight: '700', letterSpacing: -0.35 },
  coverPremise: { color: '#CFC7BC', fontSize: 11, lineHeight: 16 },
  coverStatus: { paddingTop: 3, fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 0.75, textTransform: 'uppercase' },
  emptyStage: {
    minHeight: 330,
    overflow: 'hidden',
    borderRadius: cinematic.radius.scene,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cinematic.overlay.hairline,
  },
  emptyShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.32)' },
  emptyCopy: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: spacing.sm },
  emptyKicker: { fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  emptyTitle: { color: '#FFF9EF', fontFamily: typography.display, fontSize: 30, lineHeight: 34, fontWeight: '700' },
  emptyDetail: { color: '#D6CEC3', fontSize: 13, lineHeight: 20 },
  composerPreview: {
    minHeight: 360,
    overflow: 'hidden',
    borderRadius: cinematic.radius.scene,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cinematic.overlay.hairline,
  },
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
  composerMeta: { color: '#FFF9EF', fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
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
    borderColor: cinematic.overlay.hairline,
    backgroundColor: cinematic.overlay.subtitle,
  },
  composerCharacter: { fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
  composerPremise: { color: '#FFF9EF', fontFamily: typography.display, fontSize: 20, lineHeight: 27, fontWeight: '700' },
  moodSwatch: {
    minWidth: 145,
    minHeight: 180,
    flex: 1,
    flexBasis: '46%',
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: cinematic.radius.choice,
    borderWidth: StyleSheet.hairlineWidth,
  },
  moodSwatchPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  moodSwatchGlow: { position: 'absolute', width: 190, height: 190, top: -90, right: -72, borderRadius: 95, opacity: 0.6 },
  moodSwatchRim: { position: 'absolute', width: 52, height: 52, top: 49, right: 30, borderRadius: 26, opacity: 0.34 },
  moodSwatchSilhouette: { position: 'absolute', width: 66, height: 116, right: 24, bottom: 32, borderTopLeftRadius: 38, borderTopRightRadius: 38, backgroundColor: '#050505', opacity: 0.94 },
  moodSwatchShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.18)' },
  moodSwatchTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  moodSwatchState: { color: '#BDB5AA', fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  moodSwatchSignal: { width: 22, height: 2, borderRadius: radius.pill },
  moodSwatchCopy: { gap: 5, paddingTop: spacing.xxl },
  moodSwatchLabel: { color: '#FFF9EF', fontFamily: typography.display, fontSize: 22, lineHeight: 26, fontWeight: '700' },
  moodSwatchDescription: { color: '#C8C0B5', fontSize: 11, lineHeight: 16 },
  castingPreview: {
    minHeight: 290,
    overflow: 'hidden',
    borderRadius: cinematic.radius.scene,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cinematic.overlay.hairline,
  },
  castingShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  castingCopy: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: 5 },
  castingKicker: { fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  castingName: { color: '#FFF9EF', fontFamily: typography.display, fontSize: 34, lineHeight: 38, fontWeight: '700' },
  castingMeta: { color: '#BDB5AA', fontFamily: typography.mono, fontSize: 8, lineHeight: 14, fontWeight: '900', letterSpacing: 0.8 },
  utilityHero: {
    minHeight: 330,
    overflow: 'hidden',
    borderRadius: cinematic.radius.scene,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cinematic.overlay.hairline,
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
    borderColor: cinematic.overlay.hairline,
    backgroundColor: cinematic.overlay.subtitle,
  },
  utilityHeroKicker: { fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
  utilityHeroTitle: { color: '#FFF9EF', fontFamily: typography.display, fontSize: 30, lineHeight: 35, fontWeight: '700', letterSpacing: -0.6 },
  utilityHeroDetail: { color: '#D3CBC0', fontSize: 13, lineHeight: 20 },
  recapFrame: {
    overflow: 'hidden',
    borderRadius: cinematic.radius.choice,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cinematic.overlay.hairline,
    backgroundColor: colors.surfaceQuiet,
  },
  recapVisual: { minHeight: 230, overflow: 'hidden' },
  recapShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.24)' },
  recapVisualMeta: { position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  recapEpisode: { color: '#FFF9EF', fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  recapSignal: { width: 24, height: 2, borderRadius: radius.pill },
  recapTitle: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md, color: '#FFF9EF', fontFamily: typography.display, fontSize: 25, lineHeight: 29, fontWeight: '700', letterSpacing: -0.45 },
  recapCopy: { gap: spacing.md, padding: spacing.md },
  recapSummary: { color: colors.storyInk, fontSize: 14, lineHeight: 22 },
  recapChoice: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  recapChoiceLabel: { fontFamily: typography.display, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  recapConsequence: { color: colors.ink, fontFamily: typography.display, fontSize: 15, lineHeight: 23 },
  recapPending: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 9, lineHeight: 15, fontWeight: '800', letterSpacing: 0.55, textTransform: 'uppercase' },
  sceneStage: {
    minHeight: 560,
    overflow: 'hidden',
    borderBottomLeftRadius: cinematic.radius.scene,
    borderBottomRightRadius: cinematic.radius.scene,
  },
  sceneBase: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  lightOrb: { position: 'absolute', borderRadius: radius.pill },
  lightOrbPrimary: { width: 430, height: 430, top: -105, right: -145 },
  lightOrbSecondary: { width: 320, height: 320, top: 150, left: -150 },
  horizonGlow: { position: 'absolute', left: -80, right: -80, bottom: 120, height: 170, opacity: 0.42, borderRadius: radius.pill },
  characterRig: { position: 'absolute', bottom: 128, width: 190, height: 330, alignItems: 'center' },
  characterRigCompact: { bottom: 54, transform: [{ scale: 0.72 }] },
  characterLeft: { left: 18 },
  characterRight: { right: 18 },
  characterRimBody: { position: 'absolute', bottom: -2, width: 154, height: 250, borderTopLeftRadius: 82, borderTopRightRadius: 82, opacity: 0.5 },
  characterBody: { position: 'absolute', bottom: 0, width: 146, height: 248, borderTopLeftRadius: 78, borderTopRightRadius: 78, backgroundColor: '#070707' },
  characterRimHead: { position: 'absolute', top: 0, width: 94, height: 94, borderRadius: 47, opacity: 0.56 },
  characterHead: { position: 'absolute', top: 4, width: 88, height: 88, borderRadius: 44, backgroundColor: '#060606' },
  signalRig: { position: 'absolute', top: 170, right: 38, width: 96, height: 168, alignItems: 'center', justifyContent: 'center' },
  signalHalo: { position: 'absolute', width: 132, height: 132, borderRadius: 66, opacity: 0.14 },
  signalDevice: { width: 72, height: 132, gap: 10, paddingHorizontal: 12, paddingTop: 24, borderRadius: 16, borderWidth: 1, backgroundColor: 'rgba(3,3,3,0.72)' },
  signalLine: { width: '68%', height: 3, borderRadius: radius.pill, opacity: 0.8 },
  signalLineMuted: { width: '100%', height: 2, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.22)' },
  signalLineMutedShort: { width: '56%', height: 2, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)' },
  thresholdRig: { position: 'absolute', top: 92, right: 24, width: 150, height: 300 },
  thresholdFrame: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 2, opacity: 0.34 },
  thresholdGap: { position: 'absolute', top: 18, right: 18, bottom: 0, width: 22, opacity: 0.22 },
  tableRig: { position: 'absolute', left: 34, right: 34, bottom: 144, height: 126, alignItems: 'center' },
  tableLampGlow: { width: 96, height: 96, borderRadius: 48, opacity: 0.12 },
  tableTop: { position: 'absolute', left: 0, right: 0, bottom: 28, height: 18, borderRadius: 9, backgroundColor: '#080808' },
  tableStem: { position: 'absolute', bottom: -8, width: 18, height: 42, backgroundColor: '#080808' },
  streetRig: { position: 'absolute', top: 100, right: 16, width: 150, height: 300 },
  streetLight: { position: 'absolute', top: 22, right: 28, width: 64, height: 64, borderRadius: 32, opacity: 0.13 },
  streetLine: { position: 'absolute', left: 18, bottom: 0, width: 2, height: 250, backgroundColor: 'rgba(255,255,255,0.16)' },
  streetLineTwo: { position: 'absolute', left: 64, bottom: 0, width: 2, height: 210, backgroundColor: 'rgba(255,255,255,0.11)' },
  streetLineThree: { position: 'absolute', right: 20, bottom: 0, width: 2, height: 270, backgroundColor: 'rgba(255,255,255,0.08)' },
  interiorWindow: { position: 'absolute', top: 120, right: 28, width: 132, height: 198, borderWidth: StyleSheet.hairlineWidth, opacity: 0.2 },
  setPanel: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, opacity: 0.18 },
  setPanelOne: { width: 180, height: 290, top: 70, right: -55, transform: [{ rotate: '8deg' }] },
  setPanelTwo: { width: 130, height: 220, top: 150, left: -35, transform: [{ rotate: '-7deg' }] },
  floorShadow: { position: 'absolute', left: -40, right: -40, bottom: -70, height: 210, borderRadius: radius.pill, backgroundColor: '#030303', opacity: 0.88 },
  sceneTopShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: cinematic.overlay.top },
  sceneHeader: { position: 'absolute', top: spacing.lg, left: spacing.lg, right: spacing.lg, gap: spacing.md },
  sceneEpisode: { color: '#FFF9EF', fontFamily: typography.mono, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  sceneTitle: { maxWidth: 280, color: '#FFF9EF', fontFamily: typography.display, fontSize: 27, lineHeight: 31, fontWeight: '700', letterSpacing: -0.6 },
  sceneProgress: { flexDirection: 'row', gap: 5 },
  sceneProgressSegment: { flex: 1, height: 2, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)' },
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
    borderColor: cinematic.overlay.hairline,
    backgroundColor: cinematic.overlay.subtitle,
  },
  subtitleLabelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  subtitleSpeaker: { fontFamily: typography.mono, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase' },
  subtitleCue: { color: '#918B83', fontFamily: typography.mono, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  subtitleText: { color: '#FFF9EF', fontSize: 18, lineHeight: 27, fontWeight: '700' },
  choiceCard: {
    minHeight: 128,
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: cinematic.radius.choice,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  choicePressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  choiceDisabled: { opacity: 0.46 },
  choiceTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  choiceKey: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  choiceKeyText: { color: colors.ink, fontFamily: typography.mono, fontSize: 13, fontWeight: '900' },
  choiceIntent: { color: colors.inkMuted, fontFamily: typography.mono, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  choiceLabel: { color: colors.storyInk, fontFamily: typography.display, fontSize: 21, lineHeight: 26, fontWeight: '700' },
  choiceBottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  choiceLight: { width: 34, height: 2, borderRadius: radius.pill, opacity: 0.82 },
  choiceState: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  consequenceOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    minHeight: 210,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cinematic.overlay.hairline,
    backgroundColor: cinematic.overlay.strong,
  },
  consequenceBeam: { position: 'absolute', top: -80, bottom: -80, width: 120, opacity: 0.16 },
  consequenceKicker: { fontFamily: typography.mono, fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  consequenceHeadline: { color: '#FFF9EF', fontFamily: typography.display, fontSize: 27, lineHeight: 31, fontWeight: '700' },
  consequenceText: { color: '#E7DFD4', fontSize: 15, lineHeight: 23 },
  generationCard: {
    minHeight: 360,
    overflow: 'hidden',
    borderRadius: cinematic.radius.scene,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cinematic.overlay.hairline,
  },
  generationShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.34)' },
  generationCopy: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: spacing.sm },
  generationEyebrow: { fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  generationTitle: { color: '#FFF9EF', fontFamily: typography.display, fontSize: 31, lineHeight: 35, fontWeight: '700' },
  generationDetail: { color: '#D6CEC3', fontSize: 14, lineHeight: 21 },
  generationTrack: { height: 3, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.14)' },
  generationTrackLight: { width: '42%', height: '100%', borderRadius: radius.pill },
});
