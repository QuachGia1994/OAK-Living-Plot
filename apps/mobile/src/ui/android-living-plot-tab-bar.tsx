import { useEffect, useState, type ComponentProps } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ANDROID_MINI_NAV_METRICS,
  ANDROID_TAB_GLYPHS,
  ANDROID_TAB_ROUTES,
  androidMiniRailWidth,
} from './android-tab-bar-state';
import { colors, radius, spacing, typography } from './theme';

type ExpoTabsProps = ComponentProps<typeof Tabs>;
type ExpoTabBarProps = Parameters<NonNullable<ExpoTabsProps['tabBar']>>[0];

export function AndroidLivingPlotTabBar({ compact, state, descriptors, navigation }: ExpoTabBarProps & { compact: boolean }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible();
  const bottomInset = Math.max(insets.bottom, spacing.xs);
  if (keyboardVisible) return null;

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { paddingBottom: bottomInset }]}>
      <View style={[compact ? styles.compactRail : styles.expandedRail, compact ? { width: androidMiniRailWidth(width) } : null]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const options = descriptors[route.key]?.options;
          const routeName = isAndroidTabRoute(route.name) ? route.name : null;
          if (!routeName) return null;
          const label = options?.tabBarAccessibilityLabel ?? readLabel(options?.title, routeName);

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              onLongPress={onLongPress}
              onPress={onPress}
              style={({ pressed }) => [
                styles.item,
                compact ? styles.compactItem : styles.expandedItem,
                !compact && focused && styles.expandedItemSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.iconShell, compact && focused && styles.compactSelectedIcon]}>
                <Text importantForAccessibility="no" style={[styles.glyph, focused && styles.glyphSelected]}>{ANDROID_TAB_GLYPHS[routeName]}</Text>
              </View>
              {!compact ? <Text style={[styles.label, focused && styles.labelSelected]}>{readLabel(options?.title, routeName)}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

function isAndroidTabRoute(name: string): name is (typeof ANDROID_TAB_ROUTES)[number] {
  return ANDROID_TAB_ROUTES.some((route) => route === name);
}

function readLabel(title: string | undefined, route: (typeof ANDROID_TAB_ROUTES)[number]): string {
  if (title?.trim()) return title;
  return route === 'index' ? 'Home' : route[0].toUpperCase() + route.slice(1);
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
  },
  expandedRail: {
    width: '100%',
    height: ANDROID_MINI_NAV_METRICS.expandedHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.background,
  },
  compactRail: {
    height: ANDROID_MINI_NAV_METRICS.compactRailHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedItem: {
    minHeight: 54,
    gap: 2,
    borderRadius: 18,
  },
  expandedItemSelected: {
    backgroundColor: colors.surfaceAccentPill,
  },
  compactItem: {
    minHeight: ANDROID_MINI_NAV_METRICS.minimumTapTarget,
  },
  iconShell: {
    width: 36,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  compactSelectedIcon: {
    width: 38,
    height: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentSoft,
    borderRadius: 17,
    backgroundColor: colors.surfaceAccentPill,
  },
  glyph: {
    color: colors.quietInk,
    fontFamily: typography.mono,
    fontSize: 21,
    lineHeight: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  glyphSelected: {
    color: colors.accentStrong,
  },
  label: {
    color: colors.quietInk,
    fontFamily: typography.mono,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
  },
  labelSelected: {
    color: colors.accentStrong,
  },
  pressed: {
    opacity: 0.72,
  },
});
