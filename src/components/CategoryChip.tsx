import { View } from 'react-native';

import { colorFor, withAlpha } from '@/lib/categoryColor';
import type { CategoryTree } from '@/lib/categoryTree';
import { categoryLabel } from '@/lib/categoryTree';
import { Sans } from './base';

/**
 * `category` is nullable on the wire — a row can sit mid-pipeline or fall
 * through categorisation entirely, so this has to render an honest
 * "Uncategorised" state rather than an empty chip.
 */
export function CategoryChip({
  category,
  tree,
}: {
  category: string | null;
  tree?: CategoryTree;
}) {
  const color = colorFor(category, tree);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 3,
        backgroundColor: withAlpha(color, 0.12),
      }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Sans size={11} style={{ color }} numberOfLines={1}>
        {categoryLabel(category)}
      </Sans>
    </View>
  );
}
