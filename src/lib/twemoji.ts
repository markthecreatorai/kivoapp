import { parse } from 'twemoji-parser';

/**
 * Replaces emoji characters in a string with Twemoji CDN image tags.
 * Uses Twitter/X style emojis for consistent cross-platform appearance.
 */
export function replaceEmojisWithTwemoji(text: string): string {
  const entities = parse(text, { assetType: 'svg' });
  
  if (entities.length === 0) return text;
  
  let result = '';
  let lastIndex = 0;
  
  for (const entity of entities) {
    // Add text before emoji
    result += text.slice(lastIndex, entity.indices[0]);
    // Add twemoji img tag
    result += `<img src="${entity.url}" alt="${entity.text}" class="twemoji" draggable="false" />`;
    lastIndex = entity.indices[1];
  }
  
  // Add remaining text
  result += text.slice(lastIndex);
  
  return result;
}

/**
 * Get the Twemoji URL for a single emoji character.
 */
export function getTwemojiUrl(emoji: string): string | null {
  const entities = parse(emoji, { assetType: 'svg' });
  return entities.length > 0 ? entities[0].url : null;
}
