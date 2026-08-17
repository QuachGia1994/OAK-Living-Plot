import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from './theme';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Deliberately do not persist error payloads or story data from a render crash.
  }

  private reset = () => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.screen} accessibilityLiveRegion="assertive">
        <Text style={styles.eyebrow}>UI recovery</Text>
        <Text style={styles.title}>Living Plot hit a display error.</Text>
        <Text style={styles.body}>
          Your canonical story, choices, quota, and purchases remain server-owned. Retrying here only rebuilds the interface.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry Living Plot interface"
          onPress={this.reset}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Retry interface</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  title: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '900' },
  body: { color: colors.inkMuted, fontSize: 15, lineHeight: 23 },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  buttonPressed: { opacity: 0.78 },
  buttonText: { color: colors.accentInk, fontSize: 16, fontWeight: '900' },
});
