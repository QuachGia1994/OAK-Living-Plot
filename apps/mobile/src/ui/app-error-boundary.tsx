import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { UiLocale } from '@/features/preferences/contracts';
import { colors, radius, spacing } from './theme';

interface Props {
  children: ReactNode;
  locale: UiLocale;
}

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  private reset = () => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    const vi = this.props.locale === 'vi';
    return (
      <View style={styles.screen} accessibilityLiveRegion="assertive">
        <Text style={styles.eyebrow}>{vi ? 'KHÔI PHỤC GIAO DIỆN' : 'UI RECOVERY'}</Text>
        <Text style={styles.title}>{vi ? 'Living Plot gặp lỗi hiển thị.' : 'Living Plot hit a display error.'}</Text>
        <Text style={styles.body}>
          {vi
            ? 'Drama chuẩn, lựa chọn, hạn mức và giao dịch vẫn do máy chủ sở hữu. Thử lại ở đây chỉ dựng lại giao diện.'
            : 'Your canonical drama, choices, quota, and purchases remain server-owned. Retrying here only rebuilds the interface.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={vi ? 'Thử lại giao diện Living Plot' : 'Retry Living Plot interface'}
          onPress={this.reset}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>{vi ? 'Thử lại giao diện' : 'Retry interface'}</Text>
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
