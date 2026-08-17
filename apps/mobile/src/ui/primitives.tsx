import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
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
import { colors, radius, spacing } from './theme';

export function Screen({ children, contentStyle }: { children: ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.screenContent, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function BrandMark() {
  return (
    <View style={styles.brandRow}>
      <View style={styles.brandDot} />
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

export function LoadingState({ label = 'Loading your story…', detail }: { label?: string; detail?: string }) {
  return (
    <View style={styles.stateWrap} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.stateTitle}>{label}</Text>
      {detail ? <Text style={styles.stateBody}>{detail}</Text> : null}
    </View>
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
  screenContent: {
    flexGrow: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  brandText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.2,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  buttonPrimary: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  buttonSecondary: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
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
    fontSize: 16,
    fontWeight: '800',
  },
  buttonTextPrimary: {
    color: colors.accentInk,
  },
  buttonTextGhost: {
    color: colors.inkMuted,
  },
  stateWrap: {
    flex: 1,
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
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
