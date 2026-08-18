import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { UiLocale } from '@/features/preferences/contracts';
import { colors, radius, spacing, typography } from './theme';

export type DramaDestination = 'home' | 'create' | 'library' | 'settings';

export function DramaNavigationDock({
  active,
  locale,
  onNavigate,
}: {
  active: DramaDestination;
  locale: UiLocale;
  onNavigate: (destination: DramaDestination) => void;
}) {
  const vi = locale === 'vi';
  const items: readonly { key: DramaDestination; glyph: string; en: string; vi: string }[] = [
    { key: 'home', glyph: '◈', en: 'Home', vi: 'Trang chủ' },
    { key: 'create', glyph: '+', en: 'Create', vi: 'Tạo' },
    { key: 'library', glyph: '▤', en: 'Library', vi: 'Thư viện' },
    { key: 'settings', glyph: '○', en: 'Settings', vi: 'Cài đặt' },
  ];

  return (
    <View style={styles.dock} accessibilityRole="tablist">
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={vi ? item.vi : item.en}
            onPress={() => onNavigate(item.key)}
            style={({ pressed }) => [styles.item, selected && styles.itemSelected, pressed && styles.itemPressed]}
          >
            <Text style={[styles.glyph, selected && styles.glyphSelected]}>{item.glyph}</Text>
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {vi ? item.vi : item.en}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 2,
    padding: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceQuiet,
  },
  item: {
    minHeight: 52,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
  },
  itemSelected: {
    backgroundColor: colors.surfaceWarmDeep,
  },
  itemPressed: {
    opacity: 0.76,
  },
  glyph: {
    color: colors.quietInk,
    fontFamily: typography.mono,
    fontSize: 14,
    fontWeight: '900',
  },
  glyphSelected: {
    color: colors.accentStrong,
  },
  label: {
    color: colors.quietInk,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  labelSelected: {
    color: colors.ink,
  },
});
