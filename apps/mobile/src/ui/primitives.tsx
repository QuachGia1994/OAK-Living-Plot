import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ANDROID_MINI_NAV_METRICS, useAndroidTabBarState } from './android-tab-bar-state';
import { useAccessibilityAnnouncement } from './use-accessibility-announce';
import { classical, colors, radius, spacing, typography } from './theme';

export function Screen({
  children,
  contentStyle,
  footer,
  scrollToEndSignal,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  scrollToEndSignal?: string;
}) {
  const androidTabBar = useAndroidTabBarState();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const usesCustomTabBar = Platform.OS !== 'ios' && androidTabBar !== null;
  const androidTabOffset = usesCustomTabBar
    ? (androidTabBar.compact ? ANDROID_MINI_NAV_METRICS.compactRailHeight : ANDROID_MINI_NAV_METRICS.expandedHeight) + Math.max(insets.bottom, spacing.xs)
    : undefined;
  const androidBottomInset = androidTabOffset === undefined ? undefined : androidTabOffset + spacing.lg;

  useEffect(() => {
    if (!scrollToEndSignal) return;
    let secondFrame: number | undefined;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [scrollToEndSignal]);

  return (
    <SafeAreaView style={styles.safeArea} edges={footer && !usesCustomTabBar ? ['top', 'right', 'bottom', 'left'] : ['top', 'right', 'left']}>
      <View pointerEvents="none" style={styles.screenAtmosphere}>
        <View style={[styles.screenGlow, styles.screenGlowViolet]} />
        <View style={[styles.screenGlow, styles.screenGlowGold]} />
      </View>
      <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollViewRef}
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.screenContent,
            !footer && androidBottomInset !== undefined ? { paddingBottom: androidBottomInset } : null,
            footer ? styles.screenContentWithFooter : null,
            contentStyle,
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => Keyboard.dismiss()}
          onScroll={androidTabBar ? (event) => androidTabBar.reportScroll(readScrollOffsetY(event)) : undefined}
          scrollEventThrottle={32}
        >
          {children}
        </ScrollView>
        {footer ? <View style={[styles.footerSlot, androidTabOffset === undefined ? null : { marginBottom: androidTabOffset }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function readScrollOffsetY(event: NativeSyntheticEvent<NativeScrollEvent>): number {
  if (Platform.OS === 'web') {
    const eventTarget = (event as unknown as { target?: { scrollTop?: unknown } }).target;
    const currentTarget = event.currentTarget as unknown as { scrollTop?: unknown } | undefined;
    const nativeTarget = (event.nativeEvent as unknown as { target?: { scrollTop?: unknown } }).target;
    const scrollTop = eventTarget?.scrollTop ?? currentTarget?.scrollTop ?? nativeTarget?.scrollTop;
    if (typeof scrollTop === 'number' && Number.isFinite(scrollTop)) return scrollTop;
  }
  const nativeY = event.nativeEvent.contentOffset?.y;
  return typeof nativeY === 'number' && Number.isFinite(nativeY) ? nativeY : 0;
}

export function SectionHeader({
  title,
  meta,
  index,
}: {
  title: string;
  meta: string;
  index: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionIndex}>{index}</Text>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionMeta}>{meta}</Text>
      </View>
    </View>
  );
}

export function BrandMark({ prominent = false }: { prominent?: boolean }) {
  return (
    <View style={[styles.brandRow, prominent && styles.brandRowProminent]} accessible accessibilityRole="image" accessibilityLabel="Living Plot">
      <Image
        source={require('../../assets/brand/living-plot-monogram.png')}
        style={[styles.brandIcon, prominent && styles.brandIconProminent]}
        accessibilityIgnoresInvertColors
      />
      <View style={styles.brandCopy}>
        <Text style={[styles.brandText, prominent && styles.brandTextProminent]}>LIVING PLOT</Text>
        {prominent ? <Text style={styles.brandMotto}>WRITE · CHOOSE · CONSEQUENCE</Text> : null}
      </View>
    </View>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function OrnamentDivider({ compact = false }: { compact?: boolean }) {
  return (
    <View pointerEvents="none" style={[styles.ornamentDivider, compact && styles.ornamentDividerCompact]}>
      <View style={styles.ornamentLine} />
      <Text style={styles.ornamentDiamond}>◇</Text>
      <View style={styles.ornamentDot} />
      <Text style={styles.ornamentDiamond}>◇</Text>
      <View style={styles.ornamentLine} />
    </View>
  );
}

export function StoryFlowRail({
  steps,
  activeStep = 0,
}: {
  steps: string[];
  activeStep?: number;
}) {
  return (
    <View style={styles.flowRailShell}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.flowRail}>
        {steps.map((label, index) => {
          const step = index + 1;
          const active = step === activeStep;
          const complete = activeStep > 0 && step < activeStep;
          return (
            <View
              key={`${step}-${label}`}
              style={[styles.flowStep, active && styles.flowStepActive]}
              accessibilityLabel={`${step}/${steps.length} ${label}`}
            >
              <View style={[styles.flowNumber, complete && styles.flowNumberComplete, active && styles.flowNumberActive]}>
                <Text style={[styles.flowNumberText, (complete || active) && styles.flowNumberTextActive]}>{step}</Text>
              </View>
              <Text style={[styles.flowLabel, active && styles.flowLabelActive]} numberOfLines={2}>{label}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function ConceptStageHeader({
  number,
  kicker,
  title,
  description,
  meta,
}: {
  number: number;
  kicker: string;
  title: string;
  description: string;
  meta?: string;
}) {
  return (
    <View style={styles.stageHeader} accessibilityRole="header">
      <View style={styles.stageCopy}>
        <View style={styles.stageKickerRow}>
          <Text style={styles.stageNumber}>{String(number).padStart(2, '0')}</Text>
          <Text style={styles.stageTotal}>/ 06</Text>
          <Text style={styles.stageKicker}>{kicker}</Text>
        </View>
        <Text style={styles.stageTitle}>{title}</Text>
        <OrnamentDivider compact />
        <Text style={styles.stageDescription}>{description}</Text>
        {meta ? <Text style={styles.stageMeta}>{meta}</Text> : null}
      </View>
    </View>
  );
}

export function TaskActionDock({
  eyebrow,
  title,
  detail,
  children,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.actionDock}>
      <View pointerEvents="none" style={styles.actionDockInnerFrame} />
      <View style={styles.actionDockCopy}>
        {eyebrow ? <Text style={styles.actionDockEyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.actionDockTitle} numberOfLines={1}>{title}</Text>
        {detail ? <Text style={styles.actionDockDetail} numberOfLines={2}>{detail}</Text> : null}
      </View>
      <View style={styles.actionDockAction}>{children}</View>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' }) {
  return (
    <View style={[styles.pill, tone === 'accent' && styles.pillAccent, tone === 'success' && styles.pillSuccess]}>
      <Text style={[styles.pillText, tone === 'accent' && styles.pillTextAccent, tone === 'success' && styles.pillTextSuccess]}>
        {children}
      </Text>
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ActionButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ActionButton({
  label,
  variant = 'primary',
  busy = false,
  disabled,
  style,
  accessibilityLabel,
  accessibilityState,
  ...props
}: ActionButtonProps) {
  const isDisabled = Boolean(disabled || busy);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled, busy }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
      {...props}
    >
      {variant !== 'ghost' ? <View pointerEvents="none" style={styles.buttonInnerFrame} /> : null}
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? colors.accentInk : colors.ink} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'primary' && styles.buttonTextPrimary,
            variant === 'ghost' && styles.buttonTextGhost,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function MotionReveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(10));

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!active) return;
        if (enabled) {
          opacity.setValue(1);
          translateY.setValue(0);
          return;
        }
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 240, delay, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 280, delay, useNativeDriver: true }),
        ]).start();
      })
      .catch(() => {
        if (!active) return;
        opacity.setValue(1);
        translateY.setValue(0);
      });
    return () => { active = false; };
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  useAccessibilityAnnouncement(`${title}. ${message}`);
  return (
    <View accessibilityLiveRegion="assertive">
      <Card style={styles.errorCard}>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateBody}>{message}</Text>
        {onRetry ? <ActionButton label={retryLabel} variant="secondary" onPress={onRetry} /> : null}
      </Card>
    </View>
  );
}

export type StatusTone = 'info' | 'success' | 'danger';

export function StatusMessage({ message, tone = 'info' }: { message: string; tone?: StatusTone }) {
  useAccessibilityAnnouncement(message);
  return (
    <Text
      style={[styles.statusMessage, tone === 'success' && styles.statusSuccess, tone === 'danger' && styles.statusDanger]}
      accessibilityLiveRegion="polite"
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  screenAtmosphere: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  screenGlow: {
    position: 'absolute',
    borderRadius: 999,
  },
  screenGlowViolet: {
    width: 420,
    height: 420,
    top: -250,
    right: -190,
    backgroundColor: 'rgba(125, 88, 43, 0.09)',
  },
  screenGlowGold: {
    width: 340,
    height: 340,
    bottom: -230,
    left: -180,
    backgroundColor: 'rgba(200, 154, 85, 0.06)',
  },
  keyboardArea: {
    flex: 1,
  },
  screenContent: {
    width: '100%',
    maxWidth: 760,
    flexGrow: 1,
    alignSelf: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl + spacing.lg,
  },
  screenContentWithFooter: {
    paddingBottom: spacing.lg,
  },
  footerSlot: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: 'rgba(7, 8, 6, 0.96)',
  },
  sectionHeader: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  sectionIndex: {
    width: 28,
    flexShrink: 0,
    color: colors.accentStrong,
    fontFamily: typography.mono,
    fontSize: 9,
    lineHeight: 17,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  sectionHeaderCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    flexShrink: 1,
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
  },
  sectionMeta: {
    color: colors.quietInk,
    fontFamily: typography.mono,
    fontSize: 8,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  brandRowProminent: {
    alignSelf: 'center',
    flexDirection: 'column',
    gap: 2,
    paddingVertical: spacing.sm,
  },
  brandIcon: {
    width: 36,
    height: 36,
  },
  brandIconProminent: {
    width: 42,
    height: 42,
  },
  brandCopy: {
    alignItems: 'center',
    gap: 2,
  },
  brandText: {
    color: colors.accentStrong,
    fontFamily: typography.display,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2.1,
  },
  brandTextProminent: {
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: 4.2,
  },
  brandMotto: {
    color: colors.inkMuted,
    fontFamily: typography.display,
    fontSize: 10,
    letterSpacing: 2,
  },
  eyebrow: {
    color: colors.accentStrong,
    fontFamily: typography.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  ornamentDivider: {
    width: '100%',
    maxWidth: 280,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: spacing.xs,
  },
  ornamentDividerCompact: {
    maxWidth: 176,
    paddingVertical: 1,
  },
  ornamentLine: {
    width: 46,
    height: StyleSheet.hairlineWidth,
    backgroundColor: classical.hairline,
  },
  ornamentDiamond: {
    color: classical.gold,
    fontFamily: typography.display,
    fontSize: 10,
    lineHeight: 12,
  },
  ornamentDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: classical.goldPale,
  },
  flowRailShell: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderGlow,
    backgroundColor: colors.surfaceGlass,
    overflow: 'hidden',
  },
  flowRail: {
    gap: spacing.xs,
    padding: spacing.sm,
  },
  flowStep: {
    width: 106,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  flowStepActive: {
    borderColor: classical.goldDeep,
    backgroundColor: classical.patina,
  },
  flowNumber: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceQuiet,
  },
  flowNumberComplete: {
    borderColor: colors.accentSoft,
    backgroundColor: colors.surfaceAccentPill,
  },
  flowNumberActive: {
    borderColor: colors.accentStrong,
    backgroundColor: colors.accentSoft,
    shadowColor: colors.accentStrong,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  flowNumberText: {
    color: colors.quietInk,
    fontFamily: typography.mono,
    fontSize: 9,
    fontWeight: '900',
  },
  flowNumberTextActive: { color: colors.ink },
  flowLabel: {
    flex: 1,
    color: colors.inkMuted,
    fontFamily: typography.mono,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  flowLabelActive: { color: colors.ink },
  stageHeader: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: classical.hairlineSoft,
  },
  stageNumber: {
    color: colors.accentStrong,
    fontFamily: typography.mono,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  stageTotal: {
    color: colors.quietInk,
    fontFamily: typography.mono,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  stageCopy: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  stageKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  stageKicker: {
    color: colors.accentStrong,
    fontFamily: typography.mono,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  stageTitle: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '700',
    letterSpacing: 0.25,
    textAlign: 'center',
  },
  stageDescription: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  stageMeta: {
    paddingTop: 3,
    color: colors.quietInk,
    fontFamily: typography.mono,
    fontSize: 8,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  actionDock: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderGlow,
    backgroundColor: colors.surfaceGlass,
  },
  actionDockInnerFrame: {
    position: 'absolute',
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: classical.hairlineSoft,
    borderRadius: Math.max(1, radius.lg - 3),
  },
  actionDockCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
    paddingLeft: spacing.xs,
  },
  actionDockEyebrow: {
    color: colors.violetStrong,
    fontFamily: typography.mono,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  actionDockTitle: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  actionDockDetail: {
    color: colors.quietInk,
    fontSize: 10,
    lineHeight: 14,
  },
  actionDockAction: {
    minWidth: 138,
    maxWidth: 220,
    flexShrink: 0,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceGlass,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  pillAccent: {
    backgroundColor: colors.surfaceAccentPill,
  },
  pillSuccess: {
    backgroundColor: colors.surfaceSuccessPill,
  },
  pillText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  pillTextAccent: {
    color: colors.accentStrong,
  },
  pillTextSuccess: {
    color: colors.success,
  },
  button: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  buttonInnerFrame: {
    position: 'absolute',
    top: 3,
    right: 3,
    bottom: 3,
    left: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 235, 190, 0.42)',
    borderRadius: Math.max(1, radius.md - 2),
  },
  buttonPrimary: {
    borderColor: colors.accentStrong,
    backgroundColor: colors.accent,
    shadowColor: colors.accentStrong,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  buttonSecondary: {
    borderColor: classical.goldDeep,
    backgroundColor: colors.surfaceGlass,
  },
  buttonGhost: {
    minHeight: 44,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.46,
  },
  buttonText: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  buttonTextPrimary: {
    color: colors.accentInk,
  },
  buttonTextGhost: {
    color: colors.inkMuted,
  },
  stateTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateBody: {
    color: colors.inkMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorCard: {
    marginTop: spacing.xl,
  },
  statusMessage: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  statusSuccess: {
    color: colors.success,
  },
  statusDanger: {
    color: colors.danger,
  },
});
