import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from './theme';

export function Screen({
  children,
  contentStyle,
  footer,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safeArea} edges={footer ? ['top', 'right', 'bottom', 'left'] : ['top', 'right', 'left']}>
      <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.screenContent, footer ? styles.screenContentWithFooter : null, contentStyle]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footerSlot}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function SectionHeader({
  title,
  eyebrow,
  meta,
  index,
}: {
  title: string;
  eyebrow?: string;
  meta?: string;
  index?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      {index ? <Text style={styles.sectionIndex}>{index}</Text> : null}
      <View style={styles.sectionHeaderCopy}>
        {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
        {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
      </View>
    </View>
  );
}

export function SettingsRow({
  label,
  value,
  onPress,
  trailing,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  const body = (
    <View style={styles.settingsRow}>
      <View style={styles.settingsRowCopy}>
        <Text style={styles.settingsRowLabel}>{label}</Text>
        {value ? <Text style={styles.settingsRowValue}>{value}</Text> : null}
      </View>
      {trailing ?? (onPress ? <Text style={styles.settingsRowChevron}>›</Text> : null)}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pressed && styles.settingsRowPressed]}>
      {body}
    </Pressable>
  );
}

export function BrandMark() {
  return (
    <View style={styles.brandRow} accessible accessibilityRole="image" accessibilityLabel="Living Plot">
      <Image
        source={require('../../assets/brand/living-plot-monogram.png')}
        style={styles.brandIcon}
        accessibilityIgnoresInvertColors
      />
      <Text style={styles.brandText}>LIVING PLOT</Text>
    </View>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
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
    backgroundColor: colors.background,
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
  sectionEyebrow: {
    color: colors.accentStrong,
    fontFamily: typography.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    flexShrink: 1,
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 25,
    lineHeight: 29,
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
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  settingsRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  settingsRowLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  settingsRowValue: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  settingsRowChevron: {
    color: colors.quietInk,
    fontSize: 22,
    fontWeight: '300',
  },
  settingsRowPressed: {
    opacity: 0.78,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  brandIcon: {
    width: 36,
    height: 36,
  },
  brandText: {
    color: colors.ink,
    fontFamily: typography.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.8,
  },
  eyebrow: {
    color: colors.accentStrong,
    fontFamily: typography.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
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
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonPrimary: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  buttonSecondary: {
    borderColor: colors.borderStrong,
    backgroundColor: 'transparent',
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
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.15,
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
});
