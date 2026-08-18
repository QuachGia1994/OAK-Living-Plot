import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { UiLocale } from '@/features/preferences/contracts';
import { colors, radius, spacing, typography } from './theme';

type DramaDestination = 'home' | 'create' | 'library' | 'settings';

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
    { key: 'home', glyph: '◈', en: 'Discover', vi: 'Khám phá' },
    { key: 'create', glyph: '+', en: 'Direct', vi: 'Tạo drama' },
    { key: 'library', glyph: '▤', en: 'My shelf', vi: 'Kệ của tôi' },
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
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>{vi ? item.vi : item.en}</Text>
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
    gap: 4,
    padding: 4,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceQuiet,
  },
  item: {
    minHeight: 58,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  itemSelected: { backgroundColor: colors.surfaceWarmDeep },
  itemPressed: { opacity: 0.76 },
  glyph: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 15, fontWeight: '900' },
  glyphSelected: { color: colors.accentStrong },
  label: { color: colors.quietInk, fontSize: 9, fontWeight: '800' },
  labelSelected: { color: colors.ink },
});
